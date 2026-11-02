import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
let pictureId, dataDir;
const state = async (request) => (await request.get("/api/state")).json();
const doc = (elements = []) => ({
  name: "Revisão",
  width: 256,
  height: 256,
  background: "#ffffff",
  elements,
});
test.beforeAll(async ({ request }) => {
  dataDir = (await (await request.get("/api/health")).json()).storage;
  const buffer = await sharp({
    create: { width: 256, height: 256, channels: 3, background: "#abcdef" },
  })
    .png()
    .toBuffer();
  pictureId = (
    await (
      await request.post("/api/upload", {
        multipart: {
          files: { name: "review.png", mimeType: "image/png", buffer },
        },
      })
    ).json()
  ).assets[0].id;
});
const temps = async () =>
  (await fs.readdir(path.join(dataDir, "tmp"))).filter((f) =>
    f.startsWith("design-"),
  );
test("invalid writes leave saved projects and calendar intact; updates retain identity", async ({
  request,
}) => {
  const before = await state(request);
  for (const [route, data] of [
    ["projects", { name: "Ruim", assetIds: "not-array" }],
    ["plans", { title: "Impossível", date: "2026-02-30", time: "10:00" }],
    ["automations", { name: "Ruim", type: "image", processed: {} }],
    ["jobs", { assetIds: "wrong" }],
  ]) {
    const r = await request.post("/api/" + route, { data });
    expect(r.status()).toBe(400);
    expect((await r.json()).error).toBeTruthy();
  }
  const after = await state(request);
  for (const key of ["projects", "plans", "automations", "jobs"])
    expect(after[key].length).toBe(before[key].length);
  const created = await (
    await request.post("/api/projects", {
      data: {
        name: "Revisão válida",
        assetIds: [pictureId],
        settings: { width: 256 },
        overrides: { [pictureId]: { speed: 2 } },
      },
    })
  ).json();
  const r = await request.put("/api/projects/" + created.id, {
    data: { name: "", createdAt: "invalid" },
  });
  expect(r.status()).toBe(400);
  const updated = await (
    await request.put("/api/projects/" + created.id, {
      data: { name: "Atualizado", createdAt: "invalid" },
    })
  ).json();
  expect(updated.createdAt).toBe(created.createdAt);
  expect(updated.overrides[pictureId]).toEqual({ speed: 2 });
});
test("design exports reject missing images and clean temporary files after rendering failures and success", async ({
  request,
}) => {
  const missing = await request.post("/api/design/export", {
    data: {
      doc: doc([
        {
          id: "image",
          type: "image",
          assetId: "missing",
          width: 256,
          height: 256,
        },
      ]),
    },
  });
  expect(missing.status()).toBe(400);
  expect((await missing.json()).error).toMatch(/imagem/);
  const broken = await request.post("/api/design/export", {
    data: {
      doc: doc([
        {
          id: "image",
          type: "image",
          dataUrl: "data:image/png;base64,YQ==",
          width: 256,
          height: 256,
        },
      ]),
    },
  });
  expect(broken.status()).toBe(400);
  expect(await temps()).toEqual([]);
  const r = await request.post("/api/design/export", {
    data: {
      doc: doc([
        {
          id: "image",
          type: "image",
          assetId: pictureId,
          width: 256,
          height: 256,
        },
      ]),
      rows: [{ title: "a" }, { title: "b" }],
      format: "webp",
    },
  });
  expect(r.status()).toBe(200);
  expect((await r.body()).subarray(0, 2).toString()).toBe("PK");
  await expect.poll(temps).toEqual([]);
});
test("disconnecting a design export releases its image lock and removes unfinished files", async ({
  request,
}) => {
  const controller = new AbortController();
  const pending = fetch("http://127.0.0.1:3002/api/design/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      doc: {
        ...doc([
          {
            id: "img",
            type: "image",
            assetId: pictureId,
            width: 1024,
            height: 1024,
          },
        ]),
        width: 1024,
        height: 1024,
      },
      rows: Array.from({ length: 100 }, () => ({})),
      format: "png",
    }),
    signal: controller.signal,
  })
    .then((r) => r.arrayBuffer())
    .catch((e) => e.name);
  try {
    await expect.poll(async () => (await temps()).length).toBe(1);
    const removal = await request.delete("/api/assets/" + pictureId);
    expect(removal.status()).toBe(409);
  } finally {
    controller.abort();
    await pending;
  }
  await expect.poll(temps, { timeout: 15000 }).toEqual([]);
  expect((await state(request)).assets.some((a) => a.id === pictureId)).toBe(
    true,
  );
});
test("SRT duration respects the longest overlapping cue and invalid uploads never enter the library", async ({
  request,
}) => {
  const upload = async (text) =>
    request.post("/api/upload", {
      multipart: {
        files: {
          name: "review.srt",
          mimeType: "text/plain",
          buffer: Buffer.from(text),
        },
      },
    });
  const good = await upload(
    "2\n00:00:04,000 --> 00:00:05,000\nDepois\n\n1\n00:00:01,000 --> 00:00:10,000\nLonga",
  );
  expect(good.status()).toBe(201);
  expect((await good.json()).assets[0].duration).toBe(10);
  const bad = await upload("1\n00:60:00,000 --> 01:01:00,000\nInválida");
  expect(bad.status()).toBe(400);
});
test("older state responses cannot replace a more recent successful refresh", async ({
  page,
  request,
}) => {
  const snapshot = await state(request);
  let first,
    requests = 0;
  await page.route("**/api/state", async (route) => {
    requests++;
    if (requests === 1) {
      first = route;
      return;
    }
    await route.fulfill({
      json: {
        ...snapshot,
        brand: { name: "Estado recente", color: "#d9f473" },
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Personalizar meu estúdio" }),
  ).toContainText("Estado recente", { timeout: 10000 });
  await first.fulfill({
    json: { ...snapshot, brand: { name: "Estado antigo", color: "#d9f473" } },
  });
  // The intercepted first request has finished before checking the DOM.
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("button", { name: "Personalizar meu estúdio" }),
  ).toContainText("Estado recente");
});

test("design draft recovers an empty CSV and selected output format", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "copex:design:v3",
      JSON.stringify({
        doc: {
          name: "Formato recuperado",
          width: 256,
          height: 256,
          background: "#ffffff",
          elements: [],
        },
        csv: "",
        format: "webp",
        open: true,
      }),
    ),
  );
  await page.reload();
  const dialog = page.getByRole("dialog", {
    name: "Editor de design",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Formato da exportação")).toHaveValue("webp");
  await dialog
    .getByRole("button", { name: "Criar em massa · CSV", exact: true })
    .click();
  await expect(dialog.getByLabel("Dados CSV")).toHaveValue("");
});

test("image recipes preserve template format and filename prefix", async ({
  request,
}) => {
  const recipe = await (
    await request.post("/api/automations", {
      data: {
        name: "Receita WebP revisão",
        type: "image",
        settings: {
          width: 128,
          height: 128,
          imageFormat: "webp",
          prefix: "review-recipe",
        },
        processed: [],
      },
    })
  ).json();
  try {
    const r = await request.post("/api/automations/" + recipe.id + "/run");
    expect(r.status()).toBe(200);
    const { job } = await r.json();
    expect(job).toBeTruthy();
    await expect
      .poll(
        async () =>
          (await state(request)).jobs.find((j) => j.id === job.id)?.status,
        { timeout: 60000 },
      )
      .toBe("done");
    const saved = (await state(request)).jobs.find((j) => j.id === job.id);
    expect(saved.outputs.length).toBeGreaterThan(0);
    for (const output of saved.outputs) {
      expect(output.name).toMatch(/^review-recipe-\d+\.webp$/);
    }
    const media = await request.get(saved.outputs[0].url);
    expect(media.status()).toBe(200);
    expect((await sharp(await media.body()).metadata()).format).toBe("webp");
  } finally {
    await request.delete("/api/automations/" + recipe.id);
  }
});
test("all remaining screens fit phone, tablet and desktop without runtime errors", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "importer",
      "radar",
      "cuts",
      "captions",
      "calendar",
      "accounts",
      "publishing",
      "automations",
      "analytics",
      "settings",
      "exports",
    ]) {
      await page.goto("/#" + route);
      await page.locator(".page-heading h1").first().waitFor();
      const dimensions = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scroll, route + " @ " + width).toBeLessThanOrEqual(
        dimensions.width + 1,
      );
    }
  }
  expect(errors).toEqual([]);
});
test("saving a design with the keyboard never saves the batch editor underneath", async ({
  page,
  request,
}) => {
  const before = await state(request);
  await page.goto("/#editor");
  await page.evaluate(() =>
    localStorage.setItem(
      "copex:design:v3",
      JSON.stringify({
        doc: {
          name: "Atalho exclusivo revisão",
          width: 256,
          height: 256,
          background: "#ffffff",
          elements: [],
        },
        csv: "",
        format: "png",
        open: true,
      }),
    ),
  );
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "Editor de design", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await state(request)).presets.filter(
          (p) => p.name === "Atalho exclusivo revisão",
        ).length,
    )
    .toBe(1);
  expect((await state(request)).projects.length).toBe(before.projects.length);
});
