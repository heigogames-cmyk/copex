import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { validateTemplate } from "../server/templates.js";
import { parseCSV, stringifyCSV } from "../shared/core.js";
import { applyRestore } from "../server/backups.js";
test("design templates preserve CSV and export format through validation", () => {
  const input = {
    name: "Dados compartilhados",
    kind: "design",
    doc: { width: 256, height: 256, elements: [] },
    datasetCsv: "titulo\nOi",
    exportFormat: "webp",
  };
  const result = validateTemplate(input);
  assert.equal(result.datasetCsv, input.datasetCsv);
  assert.equal(result.exportFormat, "webp");
  assert.throws(() => validateTemplate({ ...input, datasetCsv: {} }), /CSV/);
});
test("reviewed design rows round trip CSV with distinct columns and literal prototype-like names", () => {
  const rows = [
    { titulo: 'Olá, "mundo"', legenda: "Linha 1\nLinha 2" },
    { titulo: "Outra", constructor: "Literal" },
  ];
  const parsed = parseCSV(stringifyCSV(rows));
  assert.equal(parsed[0].titulo, rows[0].titulo);
  assert.equal(parsed[0].legenda, rows[0].legenda);
  assert.equal(parsed[1].constructor, "Literal");
  assert.equal(parsed[0].constructor, "");
});
test("backup preferences merge favorites and fail validation before mutating any record", () => {
  const db = { projects: [], preferences: { pinnedTemplates: ["reels"] } };
  applyRestore(db, {
    version: 1,
    preferences: { pinnedTemplates: ["cinema", "reels"] },
  });
  assert.deepEqual(db.preferences.pinnedTemplates, ["reels", "cinema"]);
  const before = structuredClone(db);
  assert.throws(() =>
    applyRestore(db, {
      version: 1,
      projects: [{ id: "valid", name: "Projeto", assetIds: [] }],
      preferences: { pinnedTemplates: "bad" },
    }),
  );
  assert.deepEqual(db, before);
});
async function modelScenario(code) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "copex-model-atomic-"));
  try {
    const runner = `import sys,types,runpy,pathlib\nroot=pathlib.Path(sys.argv[1]); dest=root/'whisper'\n${code}\nsys.modules['huggingface_hub']=types.SimpleNamespace(snapshot_download=download)\nsys.argv=['install-model.py','--destination',str(dest)]\ntry: runpy.run_path('scripts/install-model.py',run_name='__main__')\nexcept SystemExit as e: sys.exit(e.code)\n`;
    const r = spawnSync("python3", ["-c", runner, dir], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    return {
      code: r.status,
      files: await fs.readdir(dir),
      model: await fs
        .readFile(path.join(dir, "whisper", "model.bin"), "utf8")
        .catch(() => null),
      status: JSON.parse(
        await fs.readFile(path.join(dir, "whisper.status.json"), "utf8"),
      ),
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
test("failed official model download preserves existing working weights and reports failure", async () => {
  const r = await modelScenario(
    `dest.mkdir(); (dest/'model.bin').write_text('previous')\ndef download(**kwargs):\n p=pathlib.Path(kwargs['local_dir']);p.mkdir(exist_ok=True);(p/'model.bin').write_text('partial');raise RuntimeError('network failure')`,
  );
  assert.equal(r.code, 1);
  assert.equal(r.model, "previous");
  assert.equal(r.status.state, "failed");
});
test("complete model download is switched into place only after all files exist", async () => {
  const r = await modelScenario(
    `dest.mkdir(); (dest/'model.bin').write_text('previous')\ndef download(**kwargs):\n assert (dest/'model.bin').read_text()=='previous'\n p=pathlib.Path(kwargs['local_dir']);p.mkdir(exist_ok=True)\n for n in ['model.bin','config.json','tokenizer.json']:(p/n).write_text('downloaded')`,
  );
  assert.equal(r.code, 0);
  assert.equal(r.model, "downloaded");
  assert.equal(r.status.state, "done");
  assert.equal(
    r.files.some((f) => f.includes(".previous-")),
    false,
  );
});

test("simultaneous local connection setup uses one atomic password and rejects incomplete input", async () => {
  const { spawn } = await import("node:child_process");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "copex-local-race-"));
  const run = (value) =>
    new Promise((resolve, reject) => {
      const c = spawn("sh", ["scripts/mobile-secret.sh"], {
        env: { ...process.env, COPEX_WINDOWS_APP_DIR: dir },
      });
      let output = "";
      c.stdout.on("data", (d) => (output += d));
      c.on("error", reject);
      c.on("close", (code) => resolve({ code, output }));
      c.stdin.end(value);
    });
  try {
    const bad = await run("short");
    assert.equal(bad.code, 1);
    await assert.rejects(fs.access(path.join(dir, ".access-password")));
    const [a, b] = await Promise.all([
      run("first-long-test-password"),
      run("second-long-test-password"),
    ]);
    assert.equal(a.code, 0);
    assert.equal(b.code, 0);
    assert.equal(a.output, b.output);
    assert.equal(
      await fs.readFile(path.join(dir, ".access-password"), "utf8"),
      a.output,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("imported settings do not treat string false as enabled or retain malformed references", async () => {
  const { normalizeSettings } = await import("../server/media.js");
  const settings = normalizeSettings({
    mirror: "false",
    mute: "false",
    denoise: "false",
    watermarkId: {},
    audioId: null,
    subtitleId: ["a"],
    filter: "unsupported",
    imageFormat: "bad",
    prefix: {},
  });
  assert.equal(settings.mirror, false);
  assert.equal(settings.mute, false);
  assert.equal(settings.denoise, false);
  assert.equal(settings.watermarkId, "");
  assert.equal(settings.audioId, "");
  assert.equal(settings.subtitleId, "");
  assert.equal(settings.filter, "none");
  assert.equal(settings.imageFormat, "png");
  assert.equal(settings.prefix, "copex");
});
