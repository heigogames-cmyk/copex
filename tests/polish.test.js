import test from "node:test";
import assert from "node:assert/strict";
import { validateTemplate } from "../server/templates.js";
import { applyRestore } from "../server/backups.js";
import { normalizeSettings, run } from "../server/media.js";
import { readDraft, writeDraft } from "../src/drafts.js";
test("template schema validates document boundaries and preserves supported fonts and image references", () => {
  const p = validateTemplate({
    name: "Editorial",
    kind: "design",
    doc: {
      width: 1080,
      height: 1080,
      background: "#ffffff",
      elements: [
        {
          id: "a",
          type: "text",
          text: "Uma ideia",
          fontFamily: "DejaVu Serif",
          fontSize: 60,
          color: "#123456",
        },
        { id: "a", type: "rect", width: 90, height: 90, color: "#abcdef" },
        {
          id: "image",
          type: "image",
          assetId: "asset-1",
          width: 300,
          height: 200,
        },
      ],
    },
  });
  assert.equal(p.doc.elements[0].fontFamily, "DejaVu Serif");
  assert.equal(new Set(p.doc.elements.map((e) => e.id)).size, 3);
  assert.equal(p.doc.elements[2].assetId, "asset-1");
  assert.throws(
    () =>
      validateTemplate({
        kind: "design",
        name: "Ruim",
        doc: { width: 10000, height: 1000, elements: [] },
      }),
    /Dimensões/,
  );
  assert.throws(
    () =>
      validateTemplate({
        name: "Ruim",
        kind: "design",
        doc: {
          width: 500,
          height: 500,
          elements: [{ type: "image", dataUrl: "https://example.com/img.png" }],
        },
      }),
    /incorporada/,
  );
  assert.throws(() => validateTemplate({ name: "" }), /nome/);
});
test("backup restore validates everything before mutation and never restores active external actions or secrets", () => {
  const database = {
    presets: [],
    projects: [],
    plans: [],
    automations: [],
    accounts: [],
    publications: [],
    brand: { name: "Minha marca", color: "#d9f473" },
  };
  const before = JSON.stringify(database);
  assert.throws(
    () =>
      applyRestore(database, {
        version: 1,
        presets: [{ id: "p1", name: "Bom", settings: {} }],
        brand: { name: "Inválida", color: "bad" },
      }),
    /Cor/,
  );
  assert.equal(JSON.stringify(database), before);
  const result = applyRestore(database, {
    version: 1,
    accounts: [
      {
        id: "a1",
        name: "Canal",
        platform: "youtube",
        accessToken: "do-not-store",
        status: "ready",
      },
    ],
    automations: [
      {
        id: "r1",
        name: "Receita",
        type: "video",
        enabled: true,
        processed: [],
      },
    ],
    publications: [
      {
        id: "u1",
        accountId: "a1",
        platform: "youtube",
        title: "Agendado",
        status: "scheduled",
        scheduledAt: "2030-01-01",
        media: { assetId: "v1" },
      },
    ],
  });
  assert.equal(result.added, 3);
  assert.equal(database.accounts[0].status, "unverified");
  assert.equal(database.automations[0].enabled, false);
  assert.equal(database.publications[0].status, "draft");
  assert.equal(database.publications[0].scheduledAt, null);
  assert.ok(!JSON.stringify(database).includes("do-not-store"));
  assert.throws(() =>
    applyRestore(database, {
      version: 1,
      plans: [{ id: "p1", title: "Erro", date: "2026-02-30", time: "30:00" }],
    }),
  );
});
test("restore preserves existing records, counts duplicates and rejects wrong file types", () => {
  const db = { presets: [{ id: "p1", name: "Original" }] };
  const result = applyRestore(db, {
    version: 1,
    presets: [
      { id: "p1", name: "Alterado", settings: {} },
      { id: "p2", name: "Novo", settings: {} },
    ],
  });
  assert.deepEqual(result, { added: 1, ignored: 1 });
  assert.equal(db.presets[0].name, "Original");
  assert.throws(
    () =>
      applyRestore(db, {
        format: "copex-template",
        version: 1,
        template: { name: "Template" },
      }),
    /incompatível/,
  );
});
test("unsupported settings do not carry unrelated private fields into templates", () => {
  const value = normalizeSettings({
    accessToken: "not-a-real-token",
    password: "not-a-secret",
    text: "Texto",
    imageFormat: "webp",
    prefix: "marca",
  });
  assert.equal(value.accessToken, undefined);
  assert.equal(value.password, undefined);
  assert.equal(value.imageFormat, "webp");
  assert.equal(value.text, "Texto");
});
test("draft storage handles corrupt data and full browser storage without claiming success", () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => "{broken",
    setItem: () => {
      throw Error("quota");
    },
    removeItem: () => {},
  };
  try {
    assert.deepEqual(readDraft("key", {}), {});
    assert.equal(writeDraft("key", { a: 1 }), false);
    globalThis.localStorage.getItem = () => '{"wrong":"shape"}';
    assert.deepEqual(readDraft("pins", []), []);
    globalThis.localStorage.getItem = () => "null";
    assert.deepEqual(readDraft("editor", {}), {});
  } finally {
    globalThis.localStorage = original;
  }
});
test("cancellation stops an actual running FFmpeg process instead of waiting for the source duration", async () => {
  const controller = new AbortController(),
    start = Date.now();
  const timer = setTimeout(() => controller.abort(), 300);
  try {
    await assert.rejects(
      run(
        "ffmpeg",
        [
          "-v",
          "error",
          "-re",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=128x128:rate=30",
          "-t",
          "30",
          "-f",
          "null",
          "-",
        ],
        undefined,
        { signal: controller.signal },
      ),
      (e) => e.name === "AbortError",
    );
    assert.ok(Date.now() - start < 3000);
  } finally {
    clearTimeout(timer);
  }
});

test("library protects source media and template dependencies while operations are active", async () => {
  const { assetBusy } = await import("../server/library.js");
  const db = {
    jobs: [
      {
        status: "running",
        assetIds: ["video"],
        settings: { watermarkId: "logo" },
        overrides: { video: { audioId: "audio" } },
      },
    ],
    cutAnalyses: [],
    transcripts: [],
    publications: [],
  };
  assert.ok(assetBusy(db, "video"));
  assert.ok(assetBusy(db, "logo"));
  assert.ok(assetBusy(db, "audio"));
  assert.equal(assetBusy(db, "free"), null);
  db.jobs[0].status = "done";
  assert.equal(assetBusy(db, "logo"), null);
  db.publications.push({ status: "scheduled", media: { assetId: "video" } });
  assert.ok(assetBusy(db, "video"));
});
