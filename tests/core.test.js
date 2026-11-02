import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCSV,
  templateSVG,
  templates,
  interpolate,
} from "../shared/core.js";
import {
  normalizeSettings,
  renderVideo,
  probe,
  run,
  parseSRT,
  retimeSRT,
} from "../server/media.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
test("CSV preserves quoted commas, multiline fields, escaped quotes and BOM", () => {
  assert.deepEqual(
    parseCSV('\uFEFFtitulo,legenda\r\n"Oi, mundo","Linha 1\nLinha ""2"""'),
    [{ titulo: "Oi, mundo", legenda: 'Linha 1\nLinha "2"' }],
  );
  assert.throws(() => parseCSV("a,a\n1,2"), /únicos/);
  assert.throws(() => parseCSV("a,b\n1"), /Linha 2/);
  assert.throws(() => parseCSV('a\n"ab'), /aspas/);
});
test("variable interpolation and SVG escaping retain literal user text", () => {
  assert.equal(
    interpolate("{{ titulo }} • {{missing}}", { titulo: "Olá" }),
    "Olá • {{missing}}",
  );
  const svg = templateSVG({
    width: 200,
    height: 200,
    background: "#fff",
    elements: [
      {
        type: "text",
        text: '<script>& "x"',
        x: 10,
        y: 10,
        width: 180,
        fontSize: 20,
        color: "#000",
      },
    ],
  });
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes("&lt;script&gt;"));
});
test("every built-in design renders at its intended resolution", async () => {
  for (const doc of templates) {
    const buffer = await sharp(
      Buffer.from(
        templateSVG(doc, {
          titulo: "Oferta",
          subtitulo: "Hoje",
          cta: "Ver mais",
        }),
      ),
    )
      .png()
      .toBuffer();
    const m = await sharp(buffer).metadata();
    assert.equal(m.width, doc.width);
    assert.equal(m.height, doc.height);
  }
});
test("settings normalize invalid and oversized numeric inputs", () => {
  const s = normalizeSettings({
    width: 99999,
    height: 351,
    speed: 0,
    textColor: "invalid",
    start: -20,
    rotation: 80,
  });
  assert.equal(s.width, 3840);
  assert.equal(s.height, 352);
  assert.equal(s.speed, 0.25);
  assert.equal(s.start, 0);
  assert.equal(s.rotation, 0);
  assert.equal(s.textColor, "#ffffff");
});
test("FFmpeg renders cut, speed, overlay, watermark, audio and fades", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "copex-render-"));
  try {
    const input = path.join(dir, "source.mp4"),
      wm = path.join(dir, "logo.png"),
      audio = path.join(dir, "audio.wav"),
      output = path.join(dir, "output.mp4");
    await run("ffmpeg", [
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
      "sine=frequency=440:sample_rate=44100",
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
      input,
    ]);
    await sharp({
      create: { width: 60, height: 40, channels: 4, background: "#ff0000" },
    })
      .png()
      .toFile(wm);
    await run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:sample_rate=44100",
      "-t",
      "1",
      audio,
    ]);
    await renderVideo({
      input,
      output,
      watermark: wm,
      audio,
      hasAudio: true,
      duration: 3,
      settings: {
        width: 240,
        height: 320,
        start: 0.5,
        end: 2.5,
        speed: 1.25,
        mirror: true,
        rotation: 90,
        text: "Olá: 'mundo' %",
        fontSize: 18,
        textPosition: "top",
        fadeIn: 0.2,
        fadeOut: 0.2,
        filter: "warm",
      },
    });
    const p = await probe(output);
    const v = p.streams.find((x) => x.codec_type === "video");
    assert.equal(v.width, 240);
    assert.equal(v.height, 320);
    assert.ok(p.streams.some((x) => x.codec_type === "audio"));
    assert.ok(Math.abs(Number(p.format.duration) - 1.6) < 0.2);
    await assert.rejects(
      renderVideo({
        input,
        output,
        hasAudio: true,
        duration: 3,
        settings: { start: 5 },
      }),
      /início/,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("SRT parsing and retiming follow source trim and speed", () => {
  const srt =
    "1\n00:00:01,000 --> 00:00:03,000\nOlá mundo\n\n2\n00:00:04,000 --> 00:00:06,000\nSegunda legenda\n";
  assert.equal(parseSRT(srt).length, 2);
  const out = retimeSRT(srt, 2, 5, 2);
  const cues = parseSRT(out);
  assert.equal(cues[0].start, 0);
  assert.equal(cues[0].end, 0.5);
  assert.equal(cues[1].start, 1);
  assert.equal(cues[1].end, 1.5);
  assert.throws(() => parseSRT("arquivo inválido"), /Nenhuma/);
});
test("subtitles and audio normalization render successfully", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "copex-subtitles-"));
  try {
    const input = path.join(dir, "input.mp4"),
      output = path.join(dir, "output.mp4"),
      subtitle = path.join(dir, "captions.srt");
    await run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:size=240x320:rate=24",
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
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      input,
    ]);
    await fs.writeFile(
      subtitle,
      "1\n00:00:00,000 --> 00:00:02,000\nUma legenda real\n",
    );
    await renderVideo({
      input,
      output,
      subtitle,
      hasAudio: true,
      duration: 2,
      settings: {
        width: 240,
        height: 320,
        normalizeAudio: true,
        denoise: true,
        sharpen: true,
      },
    });
    const result = await probe(output);
    assert.equal(
      result.streams.find((x) => x.codec_type === "video").width,
      240,
    );
    assert.ok(result.streams.some((x) => x.codec_type === "audio"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
