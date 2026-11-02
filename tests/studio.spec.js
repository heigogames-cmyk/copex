import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
const fixtureDir = "/tmp/copex-e2e-fixtures";
let videoId, imageId, audioId, jobId;
test.beforeAll(async () => {
  await fs.mkdir(fixtureDir, { recursive: true });
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x240:rate=24",
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
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    path.join(fixtureDir, "sample.mp4"),
  ]);
  await sharp({
    create: { width: 400, height: 300, channels: 4, background: "#6b8c45" },
  })
    .png()
    .toFile(path.join(fixtureDir, "sample.png"));
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880",
    "-t",
    "1",
    path.join(fixtureDir, "sample.wav"),
  ]);
});
test.beforeEach(async ({ request }, info) => {
  if (info.title.startsWith("browser:") || info.title.startsWith("design"))
    return;
  let state = await (await request.get("/api/state")).json();
  for (const [name, type] of [
    ["sample.mp4", "video"],
    ["sample.png", "image"],
    ["sample.wav", "audio"],
  ]) {
    if (!state.assets.some((a) => a.name === name)) {
      await request.post("/api/upload", {
        multipart: {
          files: {
            name,
            mimeType:
              type === "image"
                ? "image/png"
                : type === "audio"
                  ? "audio/wav"
                  : "video/mp4",
            buffer: await fs.readFile(path.join(fixtureDir, name)),
          },
        },
      });
    }
  }
  state = await (await request.get("/api/state")).json();
  videoId = state.assets.find((a) => a.name === "sample.mp4").id;
  imageId = state.assets.find((a) => a.name === "sample.png").id;
  audioId = state.assets.find((a) => a.name === "sample.wav").id;
});
test("browser: import, bulk settings, template, project and real ZIP export", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "O estúdio é seu." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page
    .locator("nav")
    .getByRole("button", { name: "Biblioteca", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([
      path.join(fixtureDir, "sample.mp4"),
      path.join(fixtureDir, "sample.png"),
      path.join(fixtureDir, "sample.wav"),
    ]);
  await expect(
    page.getByRole("heading", { name: "sample.mp4", exact: true }).first(),
  ).toBeVisible({ timeout: 30000 });
  let state = await (await request.get("/api/state")).json();
  videoId = state.assets.find((a) => a.name === "sample.mp4").id;
  imageId = state.assets.find((a) => a.name === "sample.png").id;
  audioId = state.assets.find((a) => a.name === "sample.wav").id;
  await page
    .locator("nav")
    .getByRole("button", { name: "Editor em lote" })
    .click();
  await page.getByLabel("Selecionar sample.mp4", { exact: true }).check();
  await page.getByLabel("Nome do projeto").fill("Teste de produção");
  await page.getByRole("button", { name: "Vídeo", exact: true }).count();
  await page.getByLabel("Largura (px)").fill("240");
  await page.getByLabel("Altura (px)").fill("320");
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page.getByLabel("Texto sobre a mídia").fill("Olá, mundo!");
  await page.getByRole("button", { name: "Salvar como template" }).click();
  await page.getByLabel("Nome do template").fill("Meu template E2E");
  await page
    .getByRole("button", { name: "Salvar template", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/editor-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Exportar lote" }).click();
  await expect(
    page.getByRole("heading", { name: "Central de exportações" }),
  ).toBeVisible();
  await expect(
    page.getByText("Concluída", { exact: true }).first(),
  ).toBeVisible({ timeout: 60000 });
  await expect
    .poll(
      async () => {
        const s = await (await request.get("/api/state")).json();
        return s.jobs.find((j) => j.name === "Teste de produção")?.status;
      },
      { timeout: 60000 },
    )
    .toBe("done");
  state = await (await request.get("/api/state")).json();
  const job = state.jobs.find((j) => j.name === "Teste de produção");
  jobId = job.id;
  expect(job.status).toBe("done");
  expect(job.outputs).toHaveLength(1);
  const zip = await request.get(`/api/jobs/${job.id}/download`);
  expect(zip.ok()).toBeTruthy();
  expect((await zip.body()).subarray(0, 2).toString()).toBe("PK");
  const out = await request.get(job.outputs[0].url);
  expect(out.ok()).toBeTruthy();
  expect((await out.body()).length).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});
test("image conversion, watermark and split video produce valid output", async ({
  request,
}) => {
  const submit = await request.post("/api/jobs", {
    data: {
      name: "Imagens E2E",
      assetIds: [imageId],
      settings: {
        width: 240,
        height: 240,
        watermarkId: imageId,
        watermarkPosition: "bottom-right",
        text: "Imagem",
        fontSize: 22,
      },
      format: "webp",
    },
  });
  expect(submit.ok()).toBeTruthy();
  const j = await submit.json();
  await expect
    .poll(
      async () => {
        const s = await (await request.get("/api/state")).json();
        return s.jobs.find((x) => x.id === j.id).status;
      },
      { timeout: 30000 },
    )
    .toBe("done");
  const state = await (await request.get("/api/state")).json();
  const imageJob = state.jobs.find((x) => x.id === j.id),
    res = await request.get(imageJob.outputs[0].url),
    meta = await sharp(await res.body()).metadata();
  expect(meta.format).toBe("webp");
  expect(meta.width).toBe(240);
  const split = await (
    await request.post("/api/jobs", {
      data: {
        name: "Split E2E",
        assetIds: [videoId],
        settings: {
          width: 240,
          height: 320,
          splitSeconds: 1,
          audioId,
          mute: true,
          text: "Teste",
          fontSize: 20,
        },
      },
    })
  ).json();
  await expect
    .poll(
      async () => {
        const s = await (await request.get("/api/state")).json();
        return s.jobs.find((x) => x.id === split.id).status;
      },
      { timeout: 60000 },
    )
    .toBe("done");
  const s = await (await request.get("/api/state")).json();
  expect(s.jobs.find((x) => x.id === split.id).outputs).toHaveLength(3);
});
test("design editor: layer editing, CSV variations, save and download", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByAltText("Drop da semana").click();
  await expect(
    page.getByRole("dialog", { name: "Editor de design" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Criar em massa · CSV" }).click();
  await page
    .getByLabel("Dados CSV")
    .fill(
      "titulo,subtitulo,cta\nOlá,Oferta de hoje,VER MAIS\nMundo,Outra oferta,CONFIRA",
    );
  await expect(
    page.getByRole("button", { name: "Exportar 2 variações" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/design-editor.png",
    fullPage: true,
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar 2 variações" }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe("copex-designs.zip");
  const filepath = await d.path();
  const b = await fs.readFile(filepath);
  expect(b.subarray(0, 2).toString()).toBe("PK");
  await page
    .getByRole("button", { name: "Salvar template", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Design salvo");
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
});
test("calendar, recipes, backup and responsive navigation", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: "Calendário", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Planejar conteúdo", exact: true })
    .click();
  await page.getByLabel("Título", { exact: true }).fill("Meu post E2E");
  await page.getByLabel("Legenda e hashtags").fill("Uma ideia nova. #copex");
  await page.getByRole("button", { name: "Salvar planejamento" }).click();
  await expect(
    page.getByRole("heading", { name: "Meu post E2E" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Marcar publicado" }).last().click();
  await expect(
    page.getByText("Publicado", { exact: true }).first(),
  ).toBeVisible();
  const b = await request.get("/api/backup");
  expect(b.ok()).toBeTruthy();
  const backup = await b.json();
  expect(backup.version).toBe(1);
  expect(backup.plans.some((p) => p.title === "Meu post E2E")).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Visão geral", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "O estúdio é seu." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
});
test("invalid media and bad render ranges report actionable errors", async ({
  request,
}) => {
  const r = await request.post("/api/upload", {
    multipart: {
      files: {
        name: "invalid.mp4",
        mimeType: "video/mp4",
        buffer: Buffer.from("not a video"),
      },
    },
  });
  expect(r.status()).toBe(400);
  const j = await (
    await request.post("/api/jobs", {
      data: { assetIds: [videoId], settings: { start: 99 } },
    })
  ).json();
  await expect
    .poll(async () => {
      const s = await (await request.get("/api/state")).json();
      return s.jobs.find((x) => x.id === j.id).status;
    })
    .toBe("failed");
  const invalid = await request.post("/api/import-url", {
    data: { url: "http://127.0.0.1/private" },
  });
  expect(invalid.status()).toBe(400);
});

test("design layers keep aspect ratio, move, resize and undo", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  await page.getByRole("button", { name: "Criar design", exact: true }).click();
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  const canvas = page.locator(".design-canvas");
  await expect
    .poll(async () => {
      const box = await canvas.boundingBox();
      return Math.abs(box.width / box.height - 1);
    })
    .toBeLessThan(0.02);
  const el = page.locator(".canvas-element").first();
  const before = await el.boundingBox();
  await page.mouse.move(before.x + 15, before.y + 15);
  await page.mouse.down();
  await page.mouse.move(before.x + 35, before.y + 40, { steps: 5 });
  await page.mouse.up();

  expect(
    Number(await page.getByLabel("X", { exact: true }).inputValue()),
  ).toBeGreaterThan(80);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("80");
  const handle = page.locator(".handle.br");
  const h = await handle.boundingBox();
  const oldWidth = Number(
    await page.getByLabel("Largura", { exact: true }).inputValue(),
  );
  await page.mouse.move(h.x + 3, h.y + 3);
  await page.mouse.down();
  await page.mouse.move(h.x + 23, h.y + 13, { steps: 5 });
  await page.mouse.up();
  expect(
    Number(await page.getByLabel("Largura", { exact: true }).inputValue()),
  ).toBeGreaterThan(oldWidth);
});

test("recipes enqueue real media and persist processed selection", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: "Automações", exact: true })
    .click();
  await page.getByLabel("Nome", { exact: true }).fill("Receita E2E");
  await page.getByLabel("Template", { exact: true }).selectOption("reels");
  await page
    .getByRole("button", { name: "Criar receita", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Receita E2E" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Executar receita", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("adicionado(s) à fila");
  const state = await (await request.get("/api/state")).json();
  const rule = state.automations.find((r) => r.name === "Receita E2E");
  await expect
    .poll(
      async () => {
        const s = await (await request.get("/api/state")).json();
        return s.automations.find((r) => r.id === rule.id).processed;
      },
      { timeout: 60000 },
    )
    .toContain(videoId);
  expect(state.jobs.some((j) => j.id === rule.lastJobId)).toBeTruthy();
});
