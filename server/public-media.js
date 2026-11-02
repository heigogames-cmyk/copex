import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
const MAX_SECONDS = 24 * 60 * 60;
export function mediaSigner(key) {
  const digest = (p, expires) =>
    createHmac("sha256", key)
      .update(p.id + "\n" + expires + "\n" + JSON.stringify(p.media))
      .digest("hex");
  return {
    sign(p, base, now = Date.now()) {
      const url = new URL(base);
      if (url.protocol !== "https:" || url.username || url.password)
        throw Error("Configure uma base HTTPS pública válida.");
      const expires = Math.floor(now / 1000) + MAX_SECONDS;
      return (
        new URL(
          "/api/public-media/" + encodeURIComponent(p.id),
          url,
        ).toString() +
        "?expires=" +
        expires +
        "&signature=" +
        digest(p, expires)
      );
    },
    verify(p, expires, signature, now = Date.now()) {
      const time = Number(expires),
        second = Math.floor(now / 1000);
      if (
        !Number.isSafeInteger(time) ||
        time <= second ||
        time > second + MAX_SECONDS ||
        !/^[-\w]+$/.test(p.id) ||
        typeof signature !== "string" ||
        !/^[a-f0-9]{64}$/.test(signature)
      )
        return false;
      return timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(digest(p, time), "hex"),
      );
    },
  };
}
export async function registerPublicMedia({
  app,
  db,
  DATA,
  wrap,
  resolveMedia,
}) {
  const dir = path.join(DATA, "private");
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "public-media.key");
  let key;
  try {
    key = await fs.readFile(file);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    key = randomBytes(32);
    await fs.writeFile(file, key, { mode: 0o600, flag: "wx" });
  }
  if (key.length !== 32)
    throw Error("Chave de links de mídia inválida. Restaure o backup privado.");
  const signer = mediaSigner(key);
  app.get(
    "/api/public-media/:id",
    wrap(async (req, res) => {
      const p = (db.publications || []).find(
        (p) => p.id === req.params.id && p.platform === "instagram",
      );
      if (
        !p ||
        !["publishing", "processing", "uncertain", "published"].includes(
          p.status,
        ) ||
        !signer.verify(p, req.query.expires, req.query.signature)
      )
        return res
          .status(403)
          .json({ error: "Link de mídia inválido ou expirado." });
      const media = await resolveMedia(p.media);
      if (media.type !== "video" || !media.file.endsWith(".mp4"))
        return res.sendStatus(404);
      res.set("Cache-Control", "private, no-store");
      res.type("video/mp4");
      res.sendFile(media.file);
    }),
  );
  return signer.sign;
}
