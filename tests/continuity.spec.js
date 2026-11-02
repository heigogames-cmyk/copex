import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
const getState = async (r) => (await r.get("/api/state")).json();
const doc = (elements = []) => ({
  name: "Continuidade",
  width: 256,
  height: 256,
  background: "#ffffff",
  elements,
});
const submit = async (r, body) => {
  const response = await r.post("/api/design/jobs", { data: body });
  expect(response.status()).toBe(202);
  return response.json();
};
const waitJob = async (r, id, status) =>
  expect
    .poll(async () => (await (await r.get("/api/jobs/" + id)).json()).status, {
      timeout: 60000,
    })
    .toBe(status);
const names = (buffer) =>
  JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        "import sys,io,zipfile,json;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));assert z.testzip() is None;print(json.dumps(z.namelist()))",
      ],
      { input: buffer, encoding: "utf8" },
    ),
  );
test("design queue persists work independently of the page and retains completed PNG files", async ({
  request,
  page,
}) => {
  const job = await submit(request, {
    doc: doc(),
    rows: Array.from({ length: 8 }, (_, i) => ({ titulo: "Linha " + i })),
  });
  await page.goto("/#exports");
  await page.close();
  await waitJob(request, job.id, "done");
  const result = await (await request.get("/api/jobs/" + job.id)).json();
  expect(result.outputs).toHaveLength(8);
  const zip = await request.get("/api/jobs/" + job.id + "/download");
  expect(names(await zip.body())).toHaveLength(8);
  expect(
    (
      await sharp(
        await (await request.get(result.outputs[0].url)).body(),
      ).metadata()
    ).width,
  ).toBe(256);
});
test("failed design rows preserve good outputs and retry only failed variants", async ({
  request,
}) => {
  const d = doc([
    {
      id: "text",
      type: "text",
      text: "{{titulo}}",
      fontSize: 20,
      x: 10,
      y: 10,
      width: 220,
      height: 100,
      color: "#111111",
    },
  ]);
  const job = await submit(request, {
    doc: d,
    rows: [{ titulo: "Correta" }, { titulo: "Texto\u0000inválido" }],
  });
  await waitJob(request, job.id, "partial");
  let result = await (await request.get("/api/jobs/" + job.id)).json();
  expect(result.outputs).toHaveLength(1);
  expect(
    names(
      await (await request.get("/api/jobs/" + job.id + "/download")).body(),
    ),
  ).toEqual(["design-001.png"]);
  const retry = await (
    await request.post("/api/jobs/" + job.id + "/retry-failed")
  ).json();
  expect(retry.rowCount).toBe(1);
  await waitJob(request, retry.id, "failed");
  const edit = await (
    await request.post("/api/design/jobs/" + job.id + "/edit")
  ).json();
  expect(edit.rows).toHaveLength(1);
  edit.rows[0].titulo = "Corrigida";
  const fixed = await submit(request, edit);
  await waitJob(request, fixed.id, "done");
});
test("design review recovers deleted source images from the job snapshot", async ({
  request,
}) => {
  const buffer = await sharp({
    create: { width: 200, height: 200, channels: 3, background: "#aa9988" },
  })
    .png()
    .toBuffer();
  const asset = (
    await (
      await request.post("/api/upload", {
        multipart: {
          files: {
            name: "snapshot-original.png",
            mimeType: "image/png",
            buffer,
          },
        },
      })
    ).json()
  ).assets[0];
  const job = await submit(request, {
    doc: doc([
      {
        id: "picture",
        type: "image",
        assetId: asset.id,
        width: 256,
        height: 256,
      },
    ]),
    rows: [{}],
  });
  await waitJob(request, job.id, "done");
  expect((await request.delete("/api/assets/" + asset.id)).status()).toBe(200);
  const reviewed = await (
    await request.post("/api/design/jobs/" + job.id + "/edit")
  ).json();
  expect(reviewed.restoredImages).toBe(1);
  expect(reviewed.doc.elements[0].assetId).not.toBe(asset.id);
  expect(reviewed.doc.elements[0].dataUrl).toBeUndefined();
  const again = await submit(request, reviewed);
  await waitJob(request, again.id, "done");
});
test("favorites are shared by independent browser contexts and included in backups", async ({
  browser,
  request,
}) => {
  const a = await browser.newPage(),
    b = await browser.newPage();
  try {
    await a.goto("/#templates");
    await b.goto("/#templates");
    const star = a.getByRole("button", {
      name: "Favoritar Reels clean",
      exact: true,
    });
    const pinned = (
      await getState(request)
    ).preferences.pinnedTemplates.includes("reels");
    await star.click();
    await expect(
      b.getByRole("button", { name: "Favoritar Reels clean", exact: true }),
    ).toHaveAttribute("aria-pressed", String(!pinned), { timeout: 10000 });
    const backup = await (await request.get("/api/backup")).json();
    expect(backup.preferences.pinnedTemplates.includes("reels")).toBe(!pinned);
  } finally {
    await a.close();
    await b.close();
  }
});
test("saved design CSV and format open on another device and travel with portable templates", async ({
  browser,
  request,
}) => {
  const preset = await (
    await request.post("/api/presets", {
      data: {
        kind: "design",
        name: "Design entre aparelhos",
        doc: doc(),
        datasetCsv: "titulo\nLinha do servidor",
        exportFormat: "webp",
      },
    })
  ).json();
  const portable = await (
    await request.get("/api/presets/" + preset.id + "/export")
  ).json();
  expect(portable.template.datasetCsv).toBe("titulo\nLinha do servidor");
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto("/#templates");
    await page.getByRole("button", { name: "Design", exact: true }).click();
    await page.getByAltText("Design entre aparelhos", { exact: true }).click();
    await expect(page.getByLabel("Formato da exportação")).toHaveValue("webp");
    await page
      .getByRole("button", { name: "Criar em massa · CSV", exact: true })
      .click();
    await expect(page.getByLabel("Dados CSV")).toHaveValue(
      "titulo\nLinha do servidor",
    );
  } finally {
    await page.close();
  }
});

test("cancelled design batches leave no unfinished downloads and free the shared queue", async ({
  request,
}) => {
  const job = await submit(request, {
    doc: { ...doc(), width: 1024, height: 1024 },
    rows: Array.from({ length: 40 }, () => ({})),
  });
  await request.post("/api/jobs/" + job.id + "/cancel");
  await expect
    .poll(
      async () => {
        const j = await (await request.get("/api/jobs/" + job.id)).json();
        return j.status === "cancelled" && !j.stopping;
      },
      { timeout: 30000 },
    )
    .toBe(true);
  const result = await (await request.get("/api/jobs/" + job.id)).json();
  if (result.outputs.length)
    expect(
      names(
        await (await request.get("/api/jobs/" + job.id + "/download")).body(),
      ),
    ).toHaveLength(result.outputs.length);
  else
    expect(
      (await request.get("/api/jobs/" + job.id + "/download")).status(),
    ).toBe(409);
  const next = await submit(request, { doc: doc(), rows: [{}] });
  await waitJob(request, next.id, "done");
});
test("native Android user agent downloads design ZIP over HTTP instead of buffering a large blob", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, "userAgent", {
      get: () => "CopexAndroid/3.2.0",
    }),
  );
  await page.goto("/#templates");
  await page.getByRole("button", { name: "Criar design", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar design", exact: true })
    .click();
  const file = await download;
  expect(file.url()).toContain("/api/jobs/");
  expect(file.suggestedFilename()).toBe("copex-designs.zip");
  expect(names(await fs.readFile(await file.path()))).toHaveLength(1);
});
test("model availability refreshes after background installation without reopening captions", async ({
  page,
}) => {
  let calls = 0,
    ready = false;
  await page.route("**/api/capabilities", (route) => {
    calls++;
    return route.fulfill({
      json: {
        transcription: {
          engineInstalled: true,
          modelReady: ready,
          installation: ready ? { state: "done" } : { state: "downloading" },
          languages: ["pt"],
        },
        downloader: true,
      },
    });
  });
  await page.goto("/#captions");
  await expect(
    page.getByText("Preparando o modelo oficial de voz.", { exact: false }),
  ).toBeVisible();
  ready = true;
  await expect(
    page.getByText("Modelo de voz disponível neste ambiente", { exact: false }),
  ).toBeVisible({ timeout: 10000 });
});

test("image noise reduction is applied to real pixels rather than only video settings", async ({
  request,
}) => {
  const pixels = Buffer.alloc(128 * 128 * 3, 255);
  const center = (64 * 128 + 64) * 3;
  pixels.fill(0, center, center + 3);
  const buffer = await sharp(pixels, {
    raw: { width: 128, height: 128, channels: 3 },
  })
    .png()
    .toBuffer();
  const image = (
    await (
      await request.post("/api/upload", {
        multipart: {
          files: { name: "noise-check.png", mimeType: "image/png", buffer },
        },
      })
    ).json()
  ).assets[0];
  const job = await (
    await request.post("/api/jobs", {
      data: {
        name: "Denoise real",
        assetIds: [image.id],
        settings: { width: 128, height: 128, denoise: true },
        format: "png",
      },
    })
  ).json();
  await waitJob(request, job.id, "done");
  const result = await (await request.get("/api/jobs/" + job.id)).json();
  const rendered = await sharp(
    await (await request.get(result.outputs[0].url)).body(),
  )
    .removeAlpha()
    .raw()
    .toBuffer();
  expect(rendered[center]).toBeGreaterThan(240);
});

test("completed exports can be deleted to free storage without deleting source media", async ({
  request,
}) => {
  const buffer = await sharp({
    create: { width: 128, height: 128, channels: 3, background: "#aabbcc" },
  })
    .png()
    .toBuffer();
  const image = (
    await (
      await request.post("/api/upload", {
        multipart: {
          files: { name: "kept-original.png", mimeType: "image/png", buffer },
        },
      })
    ).json()
  ).assets[0];
  const job = await submit(request, {
    doc: doc([
      { id: "im", type: "image", assetId: image.id, width: 256, height: 256 },
    ]),
    rows: [{}],
  });
  await waitJob(request, job.id, "done");
  const result = await (await request.get("/api/jobs/" + job.id)).json();
  expect((await request.delete("/api/jobs/" + job.id)).status()).toBe(200);
  expect((await request.get("/api/jobs/" + job.id)).status()).toBe(404);
  expect((await request.get(result.outputs[0].url)).status()).toBe(404);
  expect((await request.get(image.url)).status()).toBe(200);
  expect(
    (await request.post("/api/design/jobs/" + job.id + "/edit")).status(),
  ).toBe(404);
});

test("export center removes an owned completed batch through an explicit confirmation", async ({
  page,
  request,
}) => {
  const job = await submit(request, {
    name: "Excluir pela interface",
    doc: doc(),
    rows: [{}],
  });
  await waitJob(request, job.id, "done");
  await page.goto("/#exports");
  const card = page.locator(".job-card").filter({
    has: page.getByRole("heading", {
      name: "Excluir pela interface",
      exact: true,
    }),
  });
  await card.getByRole("button", { name: "Excluir lote", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Excluir exportação?",
    exact: true,
  });
  await expect(dialog).toContainText("mídias originais");
  await dialog.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(card).toHaveCount(0);
  expect((await request.get("/api/jobs/" + job.id)).status()).toBe(404);
});
