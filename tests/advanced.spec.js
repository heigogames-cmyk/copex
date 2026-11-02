import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
let dir, assetId;
test.beforeAll(async ({ request }) => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "copex-new-features-"));
  const file = path.join(dir, "advanced.mp4");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=240x320:rate=24",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440",
    "-t",
    "3",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    "-c:a",
    "aac",
    file,
  ]);
  const res = await request.post("/api/upload", {
    multipart: {
      files: {
        name: "advanced.mp4",
        mimeType: "video/mp4",
        buffer: await fs.readFile(file),
      },
    },
  });
  assetId = (await res.json()).assets[0].id;
});

test("radar imports real supplied values, filters unavailable metrics and exports CSV", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: "Radar de conteúdo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Importar métricas", exact: true })
    .click();
  await page.getByLabel("Nome da análise").fill("Radar E2E");
  await page
    .getByLabel("Dados", { exact: true })
    .fill(
      "id,titulo,url,visualizacoes,curtidas,comentarios,compartilhamentos,duracao\na,Primeiro,https://youtu.be/aaa,10000,800,100,100,30\nb,Segundo,https://youtu.be/bbb,100,10,,,15\nc,Sem métricas,https://youtu.be/ccc,,,,,",
    );
  await page
    .getByRole("button", { name: "Analisar dados", exact: true })
    .click();
  await expect(
    page.getByText("3 vídeos encontrados", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("table")).toContainText("Primeiro");
  await expect(page.locator("table")).toContainText("Sem métricas");
  await page.getByLabel("Visualizações mínimas").fill("1000");
  await expect(
    page.getByText("1 vídeos encontrados", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody")).not.toContainText("Sem métricas");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("copex-radar.csv");
  const state = await (await request.get("/api/state")).json();
  expect(
    state.radarReports
      .find((r) => r.name === "Radar E2E")
      .entries.find((e) => e.id === "c").views,
  ).toBeNull();
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/radar.png", fullPage: true });
});

test("smart cuts export one batch with multiple independently timed MP4 files", async ({
  page,
  request,
}) => {
  const preset = await (
    await request.post("/api/presets", {
      data: {
        name: "Cortes compactos E2E",
        kind: "video",
        settings: { width: 240, height: 320 },
      },
    })
  ).json();
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: "Cortes inteligentes", exact: true })
    .click();
  await page.getByLabel("Vídeo de origem").selectOption(assetId);
  await page.getByLabel("Mínimo (s)").fill("1");
  await page.getByLabel("Alvo (s)").fill("1");
  await page.getByLabel("Máximo (s)").fill("1");
  await page
    .getByRole("button", { name: "Encontrar cortes", exact: true })
    .click();
  await expect(
    page.getByText("3 trechos sugeridos", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByLabel("Fim do trecho").fill("0.8");
  await page.getByLabel("Template dos cortes").selectOption(preset.id);
  await page.screenshot({
    path: "test-results/smart-cuts.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Exportar 3 cortes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Central de exportações" }),
  ).toBeVisible();
  await expect
    .poll(
      async () => {
        const s = await (await request.get("/api/state")).json();
        return s.jobs.find((j) => j.name === "Cortes · advanced.mp4")?.status;
      },
      { timeout: 60000 },
    )
    .toBe("done");
  const s = await (await request.get("/api/state")).json(),
    job = s.jobs.find((j) => j.name === "Cortes · advanced.mp4");
  expect(job.outputs).toHaveLength(3);
  const res = await request.get(job.outputs[0].url),
    out = path.join(dir, "cut.mp4");
  await fs.writeFile(out, await res.body());
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", out],
      { encoding: "utf8" },
    ),
  );
  expect(Number(probe.format.duration)).toBeLessThan(1);
  expect(probe.streams.find((s) => s.codec_type === "video").width).toBe(240);
  const invalid = await request.post("/api/jobs", {
    data: { assetIds: [assetId], segments: [{ assetId, start: 0, end: 100 }] },
  });
  expect(invalid.status()).toBe(400);
});

test("caption page reports missing model explicitly and prevents false transcription success", async ({
  page,
  request,
}) => {
  const cap = await (await request.get("/api/capabilities")).json();
  expect(cap.transcription.engineInstalled).toBe(true);
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: "Legendas automáticas", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Legendas automáticas", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Áudio ou vídeo com fala").selectOption(assetId);
  if (!cap.transcription.modelReady) {
    await expect(
      page.getByText("Modelo de voz ainda não instalado", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Gerar legendas", exact: true }),
    ).toBeDisabled();
    expect(
      (await request.post("/api/transcripts", { data: { assetId } })).status(),
    ).toBe(409);
  } else {
    await expect(
      page.getByText("Modelo de voz disponível neste ambiente", {
        exact: true,
      }),
    ).toBeVisible();
  }
  await page.screenshot({ path: "test-results/captions.png", fullPage: true });
});

test("account and publication screens expose configuration without leaking credentials or claiming connection", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: "Contas conectadas", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Conectar conta", exact: true })
    .click();
  await expect(page.getByLabel("Token de acesso da API")).toHaveAttribute(
    "type",
    "password",
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Publicação", exact: true })
    .click();
  await expect(
    page.getByText("Conecte e verifique uma conta para publicar.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nova publicação", exact: true }),
  ).toBeDisabled();
  const blocked = await request.post("/api/publications", {
    data: {
      accountId: "not-connected",
      title: "Não publicar",
      media: { assetId },
    },
  });
  expect(blocked.status()).toBe(400);
  const settings = await request.put("/api/social-settings", {
    data: { publicBaseUrl: "http://localhost:3001" },
  });
  expect(settings.status()).toBe(400);
  expect((await request.get("/media/private/vault.key")).status()).toBe(404);
  await page.screenshot({
    path: "test-results/publication.png",
    fullPage: true,
  });
});

test("automatic recipes process new imported files and mark success only after encoding", async ({
  request,
}) => {
  const rule = await (
    await request.post("/api/automations", {
      data: {
        name: "Automática E2E",
        type: "image",
        enabled: true,
        processed: [],
        settings: { width: 240, height: 240 },
      },
    })
  ).json();
  const buffer = await sharp({
    create: { width: 300, height: 200, channels: 3, background: "#225588" },
  })
    .png()
    .toBuffer();
  const imported = await (
    await request.post("/api/upload", {
      multipart: {
        files: { name: "new-auto.png", mimeType: "image/png", buffer },
      },
    })
  ).json();
  const id = imported.assets[0].id;
  await expect
    .poll(
      async () => {
        const s = await (await request.get("/api/state")).json();
        return s.automations.find((r) => r.id === rule.id).processed;
      },
      { timeout: 30000 },
    )
    .toContain(id);
  const s = await (await request.get("/api/state")).json(),
    r = s.automations.find((r) => r.id === rule.id);
  expect(s.jobs.find((j) => j.id === r.lastJobId).status).toBe("done");
  await request.delete("/api/automations/" + rule.id);
});
