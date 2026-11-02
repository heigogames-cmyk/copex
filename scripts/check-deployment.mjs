import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
const origin = process.env.COPEX_CHECK_ORIGIN || "http://127.0.0.1:3004";
if (!process.env.COPEX_ACCESS_PASSWORD)
  throw Error("Defina COPEX_ACCESS_PASSWORD para testar o acesso privado.");
const headers = {
  Authorization:
    "Basic " +
    Buffer.from("copex:" + process.env.COPEX_ACCESS_PASSWORD).toString(
      "base64",
    ),
};
const call = (route, options = {}) =>
  fetch(origin + route, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
assert.equal((await fetch(origin + "/api/ready")).status, 200);
for (const route of ["/", "/api/state", "/media/uploads/private.png"])
  assert.equal((await fetch(origin + route)).status, 401);
const health = await (await call("/api/health")).json();
assert.equal(health.ok, true);
const { version } = JSON.parse(
  await fs.readFile(new URL("../package.json", import.meta.url), "utf8"),
);
assert.equal(health.version, version);
const cap = await (await call("/api/capabilities")).json();
assert.equal(cap.transcription.engineInstalled, true);
assert.equal(cap.downloader, true);
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "copex-deployment-"));
try {
  const video = path.join(dir, "video.mp4");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=128x128:rate=24",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440",
    "-t",
    "2",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    "-c:a",
    "aac",
    video,
  ]);
  const image = await sharp({
    create: { width: 128, height: 128, channels: 3, background: "#a2b985" },
  })
    .png()
    .toBuffer();
  const upload = async (name, type, bytes) => {
    const f = new FormData();
    f.append("files", new Blob([bytes], { type }), name);
    const r = await call("/api/upload", { method: "POST", body: f });
    assert.equal(r.status, 201);
    return (await r.json()).assets[0];
  };
  const v = await upload(
      "hosting-video.mp4",
      "video/mp4",
      await fs.readFile(video),
    ),
    im = await upload("hosting-image.png", "image/png", image),
    sub = await upload(
      "hosting.srt",
      "text/plain",
      Buffer.from("1\n00:00:00,000 --> 00:00:01,500\nLegenda na hospedagem"),
    );
  const job = await (
    await call("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Validação da hospedagem",
        assetIds: [v.id, im.id],
        settings: {
          width: 128,
          height: 128,
          text: "Copex online",
          fontSize: 12,
          watermarkId: im.id,
          watermarkSize: 10,
          subtitleId: sub.id,
        },
        format: "webp",
      }),
    })
  ).json();
  let saved;
  for (let attempt = 0; attempt < 120; attempt++) {
    saved = (await (await call("/api/state")).json()).jobs.find(
      (j) => j.id === job.id,
    );
    if (["done", "partial", "failed"].includes(saved.status)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(saved.status, "done", JSON.stringify(saved));
  assert.equal(saved.outputs.length, 2);
  const zip = await call("/api/jobs/" + job.id + "/download");
  assert.equal(zip.status, 200);
  assert.equal(
    Buffer.from(await zip.arrayBuffer())
      .subarray(0, 2)
      .toString(),
    "PK",
  );
  const design = await call("/api/design/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      doc: {
        name: "Hospedagem",
        width: 256,
        height: 256,
        background: "#ffffff",
        elements: [
          {
            id: "a",
            type: "text",
            text: "{{titulo}}",
            x: 10,
            y: 20,
            width: 230,
            height: 50,
            fontSize: 20,
            color: "#172514",
          },
        ],
      },
      rows: [{ titulo: "Celular" }, { titulo: "PC" }],
    }),
  });
  assert.equal(design.status, 202);
  const designJob = await design.json();
  let readyDesign;
  for (let attempt = 0; attempt < 120; attempt++) {
    readyDesign = await (await call("/api/jobs/" + designJob.id)).json();
    if (["done", "failed", "partial"].includes(readyDesign.status)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(readyDesign.status, "done");
  assert.equal(readyDesign.outputs.length, 2);
  const designZip = await call("/api/jobs/" + designJob.id + "/download");
  assert.equal(designZip.status, 200);
  assert.equal(
    Buffer.from(await designZip.arrayBuffer())
      .subarray(0, 2)
      .toString(),
    "PK",
  );
  const pin = await call("/api/preferences/pinned-templates/hosting-check", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned: true }),
  });
  assert.equal(pin.status, 200);
  assert.ok((await pin.json()).pinnedTemplates.includes("hosting-check"));
  const project = await (
    await call("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Projeto compartilhado PC e Android",
        assetIds: [v.id],
        settings: { width: 128, height: 128 },
      }),
    })
  ).json();
  assert.ok(project.id);
  const backup = await (await call("/api/backup")).text();
  assert.equal(backup.includes(process.env.COPEX_ACCESS_PASSWORD), false);
  await fs.writeFile(
    "/tmp/copex-deployment-proof.json",
    JSON.stringify({
      jobId: job.id,
      designJobId: designJob.id,
      assetId: v.id,
      projectId: project.id,
    }),
  );
  console.log(
    "Hospedagem: acesso privado, FFmpeg com texto/marca/SRT, WebP, ZIP, design/CSV e projeto compartilhado passaram.",
  );
  console.log(
    "Voz: motor instalado; modelo presente:",
    cap.transcription.modelReady,
  );
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
