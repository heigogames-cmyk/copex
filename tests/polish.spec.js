import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
let dir, imageId, videoId, longId;
test.beforeAll(async ({ request }) => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "copex-polish-"));
  const picture = await sharp({
    create: { width: 360, height: 240, channels: 4, background: "#d8b08a" },
  })
    .png()
    .toBuffer();
  imageId = (
    await (
      await request.post("/api/upload", {
        multipart: {
          files: { name: "polish.png", mimeType: "image/png", buffer: picture },
        },
      })
    ).json()
  ).assets[0].id;
  for (const [name, seconds] of [
    ["polish.mp4", "3"],
    ["long-polish.mp4", "30"],
  ]) {
    const file = path.join(dir, name);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=128x128:rate=24",
      "-t",
      seconds,
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "-preset",
      "ultrafast",
      file,
    ]);
    const a = (
      await (
        await request.post("/api/upload", {
          multipart: {
            files: {
              name,
              mimeType: "video/mp4",
              buffer: await fs.readFile(file),
            },
          },
        })
      ).json()
    ).assets[0];
    if (seconds === "3") videoId = a.id;
    else longId = a.id;
  }
});
const state = async (request) => (await request.get("/api/state")).json();
const waitJob = async (request, id, status) =>
  expect
    .poll(
      async () => (await state(request)).jobs.find((j) => j.id === id)?.status,
      { timeout: 60000 },
    )
    .toBe(status);

test("projects update in place, save copies deliberately and recover a draft after reload", async ({
  page,
  request,
}) => {
  await page.goto("/#editor");
  await page.getByLabel("Nome do projeto").fill("Polish projeto");
  await page.getByLabel("Largura (px)").fill("320");
  await page.getByLabel("Altura (px)").fill("320");
  await page.getByLabel("Selecionar polish.png", { exact: true }).check();
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Projeto salvo");
  let s = await state(request);
  const original = s.projects.find((p) => p.name === "Polish projeto");
  expect(original).toBeTruthy();
  await page.getByLabel("Nome do projeto").fill("Polish atualizado");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state(request)).projects.find((p) => p.id === original.id)?.name,
    )
    .toBe("Polish atualizado");
  s = await state(request);
  expect(s.projects.filter((p) => p.name.startsWith("Polish "))).toHaveLength(
    1,
  );
  await expect(
    page.getByText("Rascunho protegido neste navegador", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Nome do projeto")).toHaveValue(
    "Polish atualizado",
  );
  await expect(page.getByLabel("Largura (px)")).toHaveValue("320");
  await expect(
    page.getByLabel("Selecionar polish.png", { exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Salvar cópia", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await state(request)).projects.filter((p) =>
          p.name.startsWith("Polish "),
        ).length,
    )
    .toBe(2);
});

test("design recovers text, fonts and CSV; saving again updates the same template", async ({
  page,
  request,
}) => {
  await page.goto("/#templates");
  await page.getByRole("button", { name: "Criar design", exact: true }).click();
  await page.locator(".design-header .project-name").fill("Design recuperável");
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page
    .getByLabel("Texto", { exact: true })
    .fill("Uma ideia que continua.");
  await page.getByLabel("Família da fonte").selectOption("DejaVu Serif");
  await page
    .getByRole("button", { name: "Criar em massa · CSV", exact: true })
    .click();
  await page
    .getByLabel("Dados CSV")
    .fill("titulo\nPrimeira versão\nSegunda versão");
  await expect(page.locator(".design-draft-status")).toHaveText(
    "rascunho protegido",
  );
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "Editor de design", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Texto", { exact: true })).toHaveValue(
    "Uma ideia que continua.",
  );
  await expect(page.getByLabel("Família da fonte")).toHaveValue("DejaVu Serif");
  await page
    .getByRole("button", { name: "Salvar template", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Design salvo");
  await page
    .getByLabel("Texto", { exact: true })
    .fill("Nova versão do mesmo design.");
  await page
    .getByRole("button", { name: "Salvar template", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state(request)).presets.find(
          (p) => p.name === "Design recuperável",
        )?.doc.elements[0].text,
    )
    .toBe("Nova versão do mesmo design.");
  expect(
    (await state(request)).presets.filter(
      (p) => p.name === "Design recuperável",
    ),
  ).toHaveLength(1);
  await page
    .getByRole("button", { name: "Criar em massa · CSV", exact: true })
    .click();
  await expect(page.getByLabel("Dados CSV")).toHaveValue(
    "titulo\nPrimeira versão\nSegunda versão",
  );
  await page.getByLabel("Texto", { exact: true }).fill("Rascunho para amanhã.");
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await page
    .getByRole("button", { name: "Guardar e sair", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Editor de design", exact: true }),
  ).toHaveCount(0);
  await page
    .locator("nav")
    .getByRole("button", { name: "Visão geral", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retomar design", exact: true })
    .click();
  await expect(page.getByLabel("Texto", { exact: true })).toHaveValue(
    "Rascunho para amanhã.",
  );
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await page
    .getByRole("button", { name: "Descartar e sair", exact: true })
    .click();
  expect(
    await page.evaluate(() => localStorage.getItem("copex:design:v3")),
  ).toBeNull();
});

test("portable templates embed images, import new media and support favorites, duplication and rename", async ({
  page,
  request,
}) => {
  const original = await (
    await request.post("/api/presets", {
      data: {
        kind: "design",
        name: "Template portátil",
        doc: {
          width: 500,
          height: 500,
          background: "#ffffff",
          elements: [
            {
              id: "photo",
              type: "image",
              assetId: imageId,
              x: 0,
              y: 0,
              width: 500,
              height: 333,
            },
            {
              id: "text",
              type: "text",
              text: "{{titulo}}",
              x: 30,
              y: 350,
              width: 440,
              height: 100,
              fontSize: 36,
              color: "#25372e",
              fontFamily: "DejaVu Serif",
            },
          ],
        },
      },
    })
  ).json();
  const bundle = await (
    await request.get("/api/presets/" + original.id + "/export")
  ).json();
  expect(bundle.template.doc.elements[0].dataUrl).toMatch(
    /^data:image\/png;base64,/,
  );
  expect(bundle.template.doc.elements[0].assetId).toBeUndefined();
  await page.goto("/#templates");
  await page
    .getByRole("button", { name: "Importar template", exact: true })
    .click();
  await page.locator('input[type=file][accept=".json"]').setInputFiles({
    name: "portatil.copex.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bundle)),
  });
  await expect(page.getByRole("status")).toContainText("Template importado");
  let s = await state(request);
  const imported = s.presets.find(
    (p) => p.name === "Template portátil" && p.id !== original.id,
  );
  expect(imported.doc.elements[0].assetId).not.toBe(imageId);
  expect(
    s.assets.some((a) => a.id === imported.doc.elements[0].assetId),
  ).toBeTruthy();
  expect(imported.doc.elements[1].fontFamily).toBe("DejaVu Serif");
  await page
    .getByRole("button", { name: "Favoritar Template portátil", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Favoritos", exact: true }).click();
  await expect(page.locator(".template-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Duplicar Template portátil", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Template portátil · cópia",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Renomear Template portátil · cópia",
      exact: true,
    })
    .click();
  await page.getByLabel("Nome do template").fill("Assinatura guardada");
  await page.getByRole("button", { name: "Salvar nome", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Assinatura guardada", exact: true }),
  ).toBeVisible();
});

test("a mixed batch preserves good files, retries only failures and allows correcting failed settings", async ({
  page,
  request,
}) => {
  const job = await (
    await request.post("/api/jobs", {
      data: {
        name: "Polish lote misto",
        assetIds: [videoId, imageId],
        settings: { width: 240, height: 240 },
        overrides: { [videoId]: { start: 99 } },
      },
    })
  ).json();
  await waitJob(request, job.id, "partial");
  let j = (await state(request)).jobs.find((j) => j.id === job.id);
  expect(j.items.map((i) => i.status)).toEqual(["failed", "done"]);
  expect(j.outputs).toHaveLength(1);
  const archive = await request.get("/api/jobs/" + j.id + "/download");
  expect(archive.ok()).toBeTruthy();
  const file = path.join(dir, "partial.zip");
  await fs.writeFile(file, await archive.body());
  const names = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        "import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps(z.namelist()))",
        file,
      ],
      { encoding: "utf8" },
    ),
  );
  expect(names).toEqual([j.outputs[0].name]);
  const retry = await (
    await request.post("/api/jobs/" + j.id + "/retry-failed")
  ).json();
  expect(retry.assetIds).toEqual([videoId]);
  await waitJob(request, retry.id, "failed");
  await page.goto("/#exports");
  const card = page.locator(".job-card").filter({
    has: page.getByRole("heading", {
      name: "Polish lote misto",
      exact: true,
    }),
  });
  await card
    .getByRole("button", { name: "Revisar ajustes", exact: true })
    .click();
  await expect(
    page.getByLabel("Selecionar polish.mp4", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Selecionar polish.png", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Só esta mídia", exact: true })
    .click();
  await page.getByLabel("Início", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Exportar lote" }).click();
  await expect
    .poll(
      async () =>
        (await state(request)).jobs.find(
          (j) => j.name === "Polish lote misto · ajuste",
        )?.status,
      { timeout: 30000 },
    )
    .toBe("done");
  await page.screenshot({
    path: "test-results/partial-export.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("cancelling a real encoding frees the queue and leaves no incomplete downloadable output", async ({
  request,
}) => {
  const job = await (
    await request.post("/api/jobs", {
      data: {
        name: "Cancelamento real",
        assetIds: [longId],
        settings: { width: 1920, height: 1080, fps: 60 },
      },
    })
  ).json();
  await expect
    .poll(
      async () =>
        (await state(request)).jobs.find((j) => j.id === job.id)?.status,
    )
    .toBe("running");
  const cancelled = await request.post("/api/jobs/" + job.id + "/cancel");
  expect((await cancelled.json()).status).toBe("cancelled");
  const next = await (
    await request.post("/api/jobs", {
      data: {
        name: "Após cancelamento",
        assetIds: [imageId],
        settings: { width: 240, height: 240 },
      },
    })
  ).json();
  await waitJob(request, next.id, "done");
  const final = (await state(request)).jobs.find((j) => j.id === job.id);
  expect(
    final.items.every((i) => i.status === "cancelled" || i.status === "done"),
  ).toBeTruthy();
  if (!final.outputs.length)
    expect(
      (await request.get("/api/jobs/" + job.id + "/download")).status(),
    ).toBe(409);
});

test("keyboard palette, back navigation and dialog focus work; main views fit small and wide screens", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: /Encontre no estúdio/ }).focus();
  await page.keyboard.press("Control+k");
  await expect(page.getByLabel("Buscar telas e projetos")).toBeFocused();
  await page.getByLabel("Buscar telas e projetos").fill("Biblioteca");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#library$/);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "O estúdio é seu.", exact: true }),
  ).toBeVisible();
  await page.goto("/#radar");
  const trigger = page.getByRole("button", {
    name: "Importar métricas",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "Importar métricas de conteúdo",
  });
  await dialog.getByLabel("Dados", { exact: true }).fill("id,titulo\nx,Teste");
  await dialog.getByRole("button", { name: "Fechar", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Analisar dados", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Fechar", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "dashboard",
      "templates",
      "editor",
      "library",
      "publishing",
    ]) {
      await page.goto("/#" + route);
      await page.locator(".page-heading h1").waitFor();
      const actual = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        width: window.innerWidth,
      }));
      expect(actual.scroll, route + " @ " + width).toBeLessThanOrEqual(
        actual.width + 1,
      );
    }
  }
  await page.goto("/");
  await page.screenshot({
    path: "test-results/polish-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

test("library organizes multiple files, searches tags and validates bulk removal before deleting anything", async ({
  page,
  request,
}) => {
  const buffer = await sharp({
    create: { width: 140, height: 140, channels: 3, background: "#6f8951" },
  })
    .png()
    .toBuffer();
  const ids = [];
  for (const name of ["Organizar A.png", "Organizar B.png"]) {
    const res = await (
      await request.post("/api/upload", {
        multipart: { files: { name, mimeType: "image/png", buffer } },
      })
    ).json();
    ids.push(res.assets[0].id);
  }
  await page.goto("/#library");
  await page.getByLabel("Buscar arquivos e marcadores").fill("Organizar ");
  await page
    .getByLabel("Selecionar arquivos visíveis", { exact: true })
    .check();
  await page.getByRole("button", { name: "Marcadores", exact: true }).click();
  await page
    .getByLabel("Marcadores separados por vírgula")
    .fill("campanha-outono, bastidores");
  await page
    .getByRole("button", { name: "Aplicar marcadores", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Marcadores atualizados",
  );
  await page.getByLabel("Buscar arquivos e marcadores").fill("campanha-outono");
  await expect(page.locator(".asset-card")).toHaveCount(2);
  await page.getByLabel("Ordenar biblioteca").selectOption("name");
  await expect(page.locator(".asset-card h3").first()).toHaveText(
    "Organizar A.png",
  );
  const invalid = await request.delete("/api/assets", {
    data: { assetIds: [ids[0], "does-not-exist"] },
  });
  expect(invalid.status()).toBe(400);
  expect(
    (await state(request)).assets.some((a) => a.id === ids[0]),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Excluir selecionados", exact: true })
    .click();
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await state(request)).assets.filter((a) => ids.includes(a.id)).length,
    )
    .toBe(0);
  await expect(
    page.getByText("Nada com esse nome. Ainda.", { exact: true }),
  ).toBeVisible();
});
