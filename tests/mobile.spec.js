import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
let dir, videoFile, imageFile;
test.beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "copex-mobile-"));
  videoFile = path.join(dir, "mobile-real.mp4");
  imageFile = path.join(dir, "mobile-real.png");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=128x128:rate=24",
    "-t",
    "2",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    videoFile,
  ]);
  await sharp({
    create: { width: 200, height: 200, channels: 3, background: "#aaca87" },
  })
    .png()
    .toFile(imageFile);
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", {
      value: undefined,
      configurable: true,
    });
  });
});
const state = async (request) => (await request.get("/api/state")).json();
const zipNames = (buffer) =>
  JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        "import zipfile,sys,io,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; print(json.dumps(z.namelist()))",
      ],
      { input: buffer, encoding: "utf8" },
    ),
  );
test("phone uploads video and image, saves presets and project, renders a real batch and downloads ZIP", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#editor");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([videoFile, imageFile]);
  await expect(
    page.getByLabel("Selecionar mobile-real.mp4", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Selecionar mobile-real.png", { exact: true }),
  ).toBeChecked();
  await page.getByLabel("Nome do projeto").fill("Produção no Android");
  await page.getByLabel("Largura (px)").fill("128");
  await page.getByLabel("Altura (px)").fill("128");
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page.getByLabel("Texto sobre a mídia").fill("Criação pelo celular");
  await page.getByRole("button", { name: "Salvar como template" }).click();
  await page.getByLabel("Nome do template").fill("Preset do Android");
  await page
    .getByRole("button", { name: "Salvar template", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await state(request)).projects.some(
        (p) => p.name === "Produção no Android",
      ),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Exportar lote", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state(request)).jobs.find(
          (j) => j.name === "Produção no Android",
        )?.status,
      { timeout: 60000 },
    )
    .toBe("done");
  const card = page.locator(".job-card").filter({
    has: page.getByRole("heading", {
      name: "Produção no Android",
      exact: true,
    }),
  });
  const download = page.waitForEvent("download");
  await card.getByRole("link", { name: "Baixar ZIP", exact: true }).click();
  const result = await download;
  expect(zipNames(await fs.readFile(await result.path()))).toHaveLength(2);
  expect(errors).toEqual([]);
});
test("phone exposes every design layer and CSV control and sends real batch downloads through the Android bridge", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#templates");
  await page.getByRole("button", { name: "Criar design", exact: true }).click();
  await page
    .locator(".design-header .project-name")
    .fill("Design completo Android");
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page.getByLabel("Texto", { exact: true }).fill("{{titulo}}");
  await page.getByLabel("Família da fonte").selectOption("DejaVu Serif");
  await expect(page.locator(".design-left .layers")).toBeVisible();
  await page.getByLabel("Bloquear posição").check();
  await expect(page.getByLabel("X", { exact: true })).toBeDisabled();
  await page.getByLabel("Bloquear posição").uncheck();
  await page.getByRole("button", { name: "Duplicar", exact: true }).click();
  await expect(page.locator(".design-left .layer")).toHaveCount(2);
  await page
    .locator(".design-left .layer")
    .first()
    .getByRole("button", { name: "Alternar visibilidade" })
    .click();
  await page
    .getByRole("button", { name: "Criar em massa · CSV", exact: true })
    .click();
  await page
    .getByLabel("Dados CSV")
    .fill("titulo\nPrimeira criação\nSegunda criação");
  await expect(
    page.getByRole("button", { name: "Exportar 2 variações", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.__savedFiles = [];
    window.__nativeFiles = {};
    window.CopexFiles = {
      begin: (name, mime, size) => {
        const token = String(Object.keys(window.__nativeFiles).length);
        window.__nativeFiles[token] = { name, mime, size, chunks: [] };
        return token;
      },
      append: (token, data) => {
        window.__nativeFiles[token].chunks.push(data);
        return true;
      },
      finish: (token) => {
        window.__savedFiles.push(window.__nativeFiles[token]);
        return true;
      },
      cancel: () => {},
    };
  });
  await page.addScriptTag({
    content: await fs.readFile("android/assets/downloads.js", "utf8"),
  });
  await page
    .getByRole("button", { name: "Exportar 2 variações", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.__savedFiles.length), {
      timeout: 60000,
    })
    .toBe(1);
  const saved = await page.evaluate(() => window.__savedFiles[0]);
  const buffer = Buffer.concat(
    saved.chunks.map((b) => Buffer.from(b, "base64")),
  );
  expect(buffer.length).toBe(saved.size);
  expect(zipNames(buffer)).toEqual(["design-001.png", "design-002.png"]);
  await page
    .getByRole("button", { name: "Salvar template", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await state(request)).presets.some(
        (p) => p.name === "Design completo Android",
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/android-full-design.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
test("phone navigates all studio modules through the same menu", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of [
    "Biblioteca",
    "Templates",
    "Editor em lote",
    "Exportações",
    "Calendário",
    "Radar de conteúdo",
    "Cortes inteligentes",
    "Legendas automáticas",
    "Contas conectadas",
    "Publicação",
    "Automações",
    "Resultados",
    "Configurações",
  ]) {
    const opener = page.getByRole("button", {
      name: "Abrir menu",
      exact: true,
    });
    await opener.click();
    await page
      .locator("nav, .sidebar-bottom")
      .getByRole("button", { name: new RegExp("^" + name + "(?: |$)") })
      .click();
    await expect(page.locator(".page-heading h1").first()).toBeVisible();
  }
});

test("Android download bridge preserves large multi-chunk files and reports failed writes", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.__chunks = [];
    window.__finish = false;
    window.__cancel = false;
    window.CopexFiles = {
      begin: () => "large",
      append: (_id, data) => {
        window.__chunks.push(data);
        return true;
      },
      finish: () => {
        window.__finish = true;
        return true;
      },
      cancel: () => {
        window.__cancel = true;
      },
    };
  });
  await page.addScriptTag({
    content: await fs.readFile("android/assets/downloads.js", "utf8"),
  });
  await page.evaluate(() => {
    const bytes = new Uint8Array(1048593);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([bytes], { type: "application/octet-stream" }),
    );
    a.download = "arquivo-grande.bin";
    a.click();
  });
  await expect.poll(() => page.evaluate(() => window.__finish)).toBe(true);
  const chunks = await page.evaluate(() => window.__chunks);
  expect(chunks).toHaveLength(5);
  const bytes = Buffer.concat(chunks.map((c) => Buffer.from(c, "base64")));
  expect(bytes.length).toBe(1048593);
  const expected = Buffer.alloc(bytes.length);
  for (let i = 0; i < expected.length; i++) expected[i] = i % 251;
  expect(bytes.equals(expected)).toBe(true);
  await page.evaluate(() => {
    window.CopexFiles.append = () => false;
  });
  const alert = page.waitForEvent("dialog");
  await page.evaluate(() => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["conteudo"]));
    a.download = "falha.txt";
    a.click();
  });
  const dialog = await alert;
  expect(dialog.message()).toContain("interrompido");
  await dialog.accept();
  await expect.poll(() => page.evaluate(() => window.__cancel)).toBe(true);
});
test("phone touch gestures move design layers without needing a mouse", async ({
  page,
}) => {
  await page.goto("/#templates");
  await page.getByRole("button", { name: "Criar design", exact: true }).click();
  await page.getByRole("button", { name: "Forma", exact: true }).click();
  const before = await page.getByLabel("X", { exact: true }).inputValue();
  const layer = page.locator(".design-canvas > div").first();
  await layer.scrollIntoViewIfNeeded();
  const rect = await layer.boundingBox();
  expect(rect).toBeTruthy();
  const cdp = await page.context().newCDPSession(page);
  const x = rect.x + rect.width / 2,
    y = rect.y + rect.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x + 25, y: y + 10 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.getByLabel("X", { exact: true })).not.toHaveValue(before);
  await expect(
    page.getByRole("button", { name: "Desfazer", exact: true }),
  ).toBeEnabled();
  await cdp.detach();
});

test("gallery image imports as a saved design base on mobile and renders a real export", async ({
  page,
  request,
}) => {
  await page.goto("/#templates");
  await page
    .getByLabel("Importar template ou imagem", { exact: true })
    .setInputFiles(imageFile);
  await expect(
    page.getByRole("dialog", { name: "Editor de design", exact: true }),
  ).toBeVisible();
  const saved = (await state(request)).presets.find(
    (p) => p.kind === "design" && p.name === "mobile-real",
  );
  expect(saved.doc.elements[0].assetId).toBeTruthy();
  expect(saved.doc.width).toBe(200);
  const response = await request.post("/api/design/jobs", {
    data: { doc: saved.doc, rows: [{}], format: "png" },
  });
  expect(response.status()).toBe(202);
  const job = await response.json();
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/jobs/" + job.id)).json()).status,
    )
    .toBe("done");
  const output = (await (await request.get("/api/jobs/" + job.id)).json())
    .outputs[0];
  const pixel = await sharp(await (await request.get(output.url)).body())
    .removeAlpha()
    .raw()
    .toBuffer();
  expect([...pixel.subarray(0, 3)]).toEqual([170, 202, 135]);
});
test("gallery video imports as reusable video template with its own source selected", async ({
  page,
  request,
}) => {
  await page.goto("/#templates");
  await page
    .getByLabel("Importar template ou imagem", { exact: true })
    .setInputFiles(videoFile);
  await expect(page).toHaveURL(/#editor$/);
  const saved = (await state(request)).presets.find(
    (p) => p.kind === "video" && p.name === "mobile-real",
  );
  expect(saved.sourceAssetId).toBeTruthy();
  await expect(
    page.locator(
      'input[type="checkbox"][aria-label="Selecionar mobile-real.mp4"]:checked',
    ),
  ).toHaveCount(1);
  const backup = await (await request.get("/api/backup")).json();
  expect(backup.presets.find((p) => p.id === saved.id).sourceAssetId).toBe(
    saved.sourceAssetId,
  );
  const portable = await (
    await request.get("/api/presets/" + saved.id + "/export")
  ).json();
  expect(portable.template.sourceAssetId).toBeUndefined();
  expect(portable.warnings.join(" ")).toContain("vídeo-base");
  await page.goto("/#templates");
  await page
    .getByRole("button", { name: "Meus templates", exact: true })
    .click();
  await page
    .locator(".template-card")
    .filter({
      has: page.getByRole("heading", { name: "mobile-real", exact: true }),
    })
    .getByRole("button", { name: /Usar template/ })
    .click();
  await expect(page).toHaveURL(/#editor$/);
  await expect(
    page.locator(
      'input[type="checkbox"][aria-label="Selecionar mobile-real.mp4"]:checked',
    ),
  ).toHaveCount(1);
});
