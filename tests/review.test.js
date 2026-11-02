import test from "node:test";
import assert from "node:assert/strict";
import { validateRecord } from "../server/records.js";
import { validateTemplate } from "../server/templates.js";
import { parseSRT } from "../server/media.js";
import { interpolate } from "../shared/core.js";
import { assetBusy } from "../server/library.js";

test("project updates validate structure, discard unrelated fields and retain partial individual overrides", () => {
  const project = validateRecord("projects", {
    name: "  Projeto  ",
    assetIds: ["a", "a"],
    settings: { width: 640 },
    overrides: { a: { speed: 2, secret: "hidden" } },
    token: "private",
  });
  assert.equal(project.name, "Projeto");
  assert.deepEqual(project.assetIds, ["a"]);
  assert.deepEqual(project.overrides, { a: { speed: 2 } });
  assert.equal(project.token, undefined);
  for (const patch of [
    { assetIds: "a" },
    { overrides: [] },
    { overrides: { a: null } },
    { settings: [] },
  ])
    assert.throws(() => validateRecord("projects", { ...project, ...patch }));
});
test("planner rejects nonexistent calendar dates and invalid hours before persisting", () => {
  for (const [date, time] of [
    ["2026-02-30", "09:00"],
    ["2026-13-01", "09:00"],
    ["2026-11-02", "24:00"],
    ["2026-11-02", "09:61"],
  ])
    assert.throws(() =>
      validateRecord("plans", { title: "Plano", date, time }),
    );
  assert.equal(
    validateRecord("plans", {
      title: "Plano",
      date: "2028-02-29",
      time: "23:59",
    }).time,
    "23:59",
  );
});
test("recipes cannot persist malformed lists or unsupported media types", () => {
  const recipe = validateRecord("automations", {
    name: "Receita",
    type: "image",
    enabled: true,
    settings: { imageFormat: "webp" },
  });
  assert.deepEqual(recipe.processed, []);
  assert.deepEqual(recipe.failed, []);
  assert.equal(recipe.enabled, true);
  assert.throws(() =>
    validateRecord("automations", { ...recipe, type: "subtitle" }),
  );
  assert.throws(() =>
    validateRecord("automations", { ...recipe, processed: "a" }),
  );
});
test("CSV variables only read actual columns, including prototype-like column names", () => {
  assert.equal(
    interpolate("{{constructor}} / {{toString}} / {{__proto__}}", {}),
    "{{constructor}} / {{toString}} / {{__proto__}}",
  );
  assert.equal(
    interpolate("{{constructor}}", JSON.parse('{"constructor":"Título"}')),
    "Título",
  );
});
test("SRT timestamps reject overflow and cues are returned in chronological order", () => {
  assert.throws(
    () => parseSRT("1\n00:60:00,000 --> 01:01:00,000\nInválida"),
    /Timestamp/,
  );
  assert.throws(
    () => parseSRT("1\n00:00:60,000 --> 00:02:00,000\nInválida"),
    /Timestamp/,
  );
  assert.deepEqual(
    parseSRT(
      "2\n00:00:04,000 --> 00:00:05,000\nDepois\n\n1\n00:00:01,000 --> 00:00:03,000\nAntes",
    ).map((c) => c.text),
    ["Antes", "Depois"],
  );
});
test("media stays protected while stopping an encoding and while a design export reads it", () => {
  const db = {
    jobs: [
      {
        status: "cancelled",
        stopping: true,
        assetIds: ["source"],
        settings: { audioId: "music" },
      },
    ],
  };
  assert.ok(assetBusy(db, "source"));
  assert.ok(assetBusy(db, "music"));
  assert.ok(assetBusy(db, "picture", new Map([["picture", 1]])));
  db.jobs[0].stopping = false;
  assert.equal(assetBusy(db, "source"), null);
});
test("template schema rejects unknown kinds and invalid layers with actionable errors", () => {
  assert.throws(
    () => validateTemplate({ name: "x", kind: "audio" }),
    /Tipo de template/,
  );
  assert.throws(
    () =>
      validateTemplate({
        name: "x",
        kind: "design",
        doc: { width: 128, height: 128, elements: [null] },
      }),
    /Tipo de camada/,
  );
});

test("restored project overrides stay partial so later global edits still apply", async () => {
  const { applyRestore } = await import("../server/backups.js");
  const db = { projects: [] };
  applyRestore(db, {
    version: 1,
    projects: [
      {
        id: "project",
        name: "Projeto",
        assetIds: ["a"],
        settings: { width: 640, height: 640 },
        overrides: { a: { speed: 2 } },
      },
    ],
  });
  assert.deepEqual(db.projects[0].overrides, { a: { speed: 2 } });
});
test("FFmpeg text and SRT overlays support storage paths containing spaces and apostrophes", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { run, renderVideo, probe } = await import("../server/media.js");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "copex editor's files-"));
  try {
    const input = path.join(dir, "input.mp4"),
      output = path.join(dir, "final editor's video.mp4"),
      subtitle = path.join(dir, "editor's captions.srt");
    await run("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=128x128:r=24",
      "-t",
      "0.5",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      input,
    ]);
    await fs.writeFile(
      subtitle,
      "1\n00:00:00,000 --> 00:00:00,500\nLegenda real",
    );
    await renderVideo({
      input,
      output,
      subtitle,
      settings: { width: 128, height: 128, text: "Texto real", fontSize: 12 },
      duration: 0.5,
      hasAudio: false,
    });
    assert.equal((await probe(output)).streams[0].width, 128);
    assert.equal(
      (await fs.readdir(dir)).some((name) => name.startsWith(".copex-")),
      false,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("radar rejects invalid records and tolerates invalid or out-of-range publication dates", async () => {
  const { normalizeEntry, readRadarData } = await import("../shared/radar.js");
  assert.equal(normalizeEntry({ id: "a", timestamp: 1e30 }).publishedAt, null);
  assert.equal(
    normalizeEntry({ id: "b", upload_date: "20260230" }).publishedAt,
    null,
  );
  assert.equal(
    normalizeEntry({ id: "c", timestamp: 0 }).publishedAt,
    "1970-01-01T00:00:00.000Z",
  );
  assert.equal(
    normalizeEntry({ id: "d", timestamp: 1e30, upload_date: "20260228" })
      .publishedAt,
    "2026-02-28T12:00:00.000Z",
  );
  assert.throws(() => readRadarData("[1]"), /inválido/);
  assert.throws(() => readRadarData("[null]"), /Nenhum vídeo/);
});

test("server restart preserves completed outputs, exposes partial downloads and marks interrupted items for retry", async () => {
  const { recoverJobs } = await import("../server/jobs.js");
  const partial = {
    status: "running",
    stopping: true,
    outputs: [{ name: "ready.mp4" }],
    items: [{ status: "done" }, { status: "running" }, { status: "queued" }],
  };
  const done = {
    status: "running",
    outputs: [{ name: "ready.png" }],
    items: [{ status: "done" }],
  };
  const pending = { status: "queued", outputs: [] };
  const cancelled = {
    status: "cancelled",
    stopping: true,
    items: [{ status: "done" }, { status: "running" }],
  };
  recoverJobs([partial, done, pending, cancelled]);
  assert.equal(partial.status, "partial");
  assert.deepEqual(
    partial.items.map((i) => i.status),
    ["done", "failed", "failed"],
  );
  assert.equal(partial.outputs[0].name, "ready.mp4");
  assert.equal(done.status, "done");
  assert.equal(pending.status, "failed");
  assert.equal(cancelled.stopping, false);
  assert.equal(cancelled.items[1].status, "cancelled");
});
