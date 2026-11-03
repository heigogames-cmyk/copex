import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
test("mobile mass editor exports each selected video inside one shared gallery frame", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "copex-frame-ui-"));
  try {
    const frameBuffer = await sharp({
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
      .toBuffer();
    const upload = async (name, buffer, mimeType) =>
      (
        await (
          await request.post("/api/upload", {
            multipart: { files: { name, mimeType, buffer } },
          })
        ).json()
      ).assets[0];
    const frame = await upload("moldura-branca.png", frameBuffer, "image/png");
    const videos = [];
    for (let i = 0; i < 2; i++) {
      const file = path.join(dir, i + ".mp4");
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        `color=${i ? "lime" : "red"}:s=128x128:r=24`,
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-threads",
        "1",
        file,
      ]);
      videos.push(
        await upload(
          "moldura-video-" + i + ".mp4",
          await fs.readFile(file),
          "video/mp4",
        ),
      );
    }
    await page.goto("/#editor");
    for (const v of videos)
      await page
        .getByRole("checkbox", { name: "Selecionar " + v.name, exact: true })
        .check();
    await page.getByRole("button", { name: "Moldura", exact: true }).click();
    await page
      .getByLabel("Imagem da moldura", { exact: true })
      .selectOption(frame.id);
    await expect(page.getByAltText("Moldura do lote")).toBeVisible();
    await expect(
      page.getByRole("slider", {
        name: "Posição vertical do vídeo",
        exact: true,
      }),
    ).toHaveValue("18");
    await page
      .getByRole("button", {
        name: "Aplicar moldura ao lote inteiro",
        exact: true,
      })
      .click();
    const created = page.waitForResponse(
      (r) => r.url().endsWith("/api/jobs") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /Exportar lote/ }).click();
    const job = await (await created).json();
    expect(job.assetIds.sort()).toEqual(videos.map((v) => v.id).sort());
    expect(job.settings.frameId).toBe(frame.id);
    await expect
      .poll(
        async () =>
          (await (await request.get("/api/jobs/" + job.id)).json()).status,
        { timeout: 60000 },
      )
      .toBe("done");
    const saved = await (await request.get("/api/jobs/" + job.id)).json();
    expect(saved.outputs).toHaveLength(2);
    for (const output of saved.outputs) {
      const out = path.join(dir, output.name);
      await fs.writeFile(out, await (await request.get(output.url)).body());
      const pixels = execFileSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        out,
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
      expect(at(20, 20)[2]).toBeGreaterThan(220);
      expect(at(2, 100).every((v) => v > 230)).toBeTruthy();
      expect(at(128, 128).some((v) => v < 30)).toBeTruthy();
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
