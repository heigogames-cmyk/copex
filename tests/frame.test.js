import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { renderVideo, probe, normalizeSettings } from "../server/media.js";
import { frameGeometry } from "../shared/frame.js";
test("frame geometry remains inside canvas for imported invalid settings", () => {
  for (const s of [
    {},
    {
      width: 256,
      height: 256,
      frameX: 99,
      frameY: 99,
      frameWidth: 100,
      frameHeight: 100,
    },
    { width: -1, height: Infinity, frameX: -10, frameY: NaN },
  ]) {
    const r = frameGeometry(s);
    assert.ok(r.x >= 0 && r.y >= 0 && r.width >= 2 && r.height >= 2);
    assert.ok(
      r.x + r.width <= r.canvasWidth && r.y + r.height <= r.canvasHeight,
    );
  }
  assert.equal(normalizeSettings({ frameId: {}, frameX: "false" }).frameId, "");
});
test("real FFmpeg puts each video inside the same image frame and keeps audio and duration", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "copex-frame-"));
  try {
    const frame = path.join(dir, "frame.png");
    await sharp({
      create: { width: 256, height: 256, channels: 3, background: "#ffffff" },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 256,
              height: 40,
              channels: 3,
              background: "#0000ff",
            },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toFile(frame);
    for (const [index, color] of ["red", "lime"].entries()) {
      const input = path.join(dir, index + ".mp4"),
        output = path.join(dir, index + "-out.mp4");
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        `color=${color}:s=128x64:r=24`,
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440",
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-threads",
        "1",
        "-c:a",
        "aac",
        input,
      ]);
      await renderVideo({
        input,
        output,
        frame,
        settings: {
          width: 256,
          height: 256,
          frameId: "frame",
          frameX: 12.5,
          frameY: 25,
          frameWidth: 75,
          frameHeight: 62.5,
          fit: index ? "contain" : "cover",
        },
        duration: 1,
        hasAudio: true,
      });
      const metadata = await probe(output);
      assert.equal(
        metadata.streams.find((s) => s.codec_type === "video").width,
        256,
      );
      assert.ok(metadata.streams.some((s) => s.codec_type === "audio"));
      assert.ok(Math.abs(Number(metadata.format.duration) - 1) < 0.15);
      const pixels = execFileSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        output,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
      ]);
      const at = (x, y) => [
        ...pixels.subarray((y * 256 + x) * 3, (y * 256 + x) * 3 + 3),
      ];
      assert.ok(at(20, 20)[2] > 220, "blue header preserved");
      assert.ok(
        at(10, 180).every((v) => v > 230),
        "white margin preserved",
      );
      const middle = at(128, 144);
      assert.ok(
        middle[index ? 1 : 0] > 220 && middle[index ? 0 : 1] < 30,
        "video occupies configured rectangle",
      );
      if (index)
        assert.ok(
          at(128, 70).every((v) => v > 230),
          "contain preserves frame behind letterbox",
        );
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
