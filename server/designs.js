import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { ZipArchive } from "archiver";
import { validateTemplate } from "./templates.js";
import { templateSVG } from "../shared/core.js";
export function registerDesigns({
  app,
  db,
  wrap,
  DATA,
  assetPath,
  activeAssets,
}) {
  app.post(
    "/api/design/export",
    wrap(async (req, res) => {
      const { doc: raw, rows = [{}], format = "png" } = req.body;
      const { doc } = validateTemplate({
        kind: "design",
        name: raw?.name || "Design",
        doc: raw,
      });
      if (
        !Array.isArray(rows) ||
        !rows.length ||
        rows.some(
          (row) => !row || typeof row !== "object" || Array.isArray(row),
        )
      )
        throw Error("Dados de variações inválidos.");
      if (!["png", "jpeg", "webp"].includes(format))
        throw Error("Formato de imagem inválido.");
      const referenced = [
        ...new Set(
          doc.elements
            .filter((e) => e.type === "image" && !e.hidden && !e.dataUrl)
            .map((e) => e.assetId),
        ),
      ];
      for (const id of referenced) {
        if (!db.assets.some((a) => a.id === id && a.type === "image"))
          throw Error(
            "Uma imagem do design não está mais na biblioteca. Substitua a camada antes de exportar.",
          );
      }
      for (const id of referenced)
        activeAssets.set(id, (activeAssets.get(id) || 0) + 1);
      const dir = path.join(DATA, "tmp", "design-" + randomUUID());
      let cleanup;
      try {
        await fs.mkdir(dir, { recursive: true });
        const images = {};
        for (const element of doc.elements.filter(
          (e) => e.type === "image" && !e.hidden && e.dataUrl,
        )) {
          const buffer = Buffer.from(element.dataUrl.split(",")[1], "base64");
          const metadata = await sharp(buffer, {
            limitInputPixels: 4096 * 4096,
          }).metadata();
          if (!["png", "jpeg", "webp"].includes(metadata.format))
            throw Error("Imagem incorporada inválida.");
          const png = await sharp(buffer)
            .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
            .png()
            .toBuffer();
          element.dataUrl = "data:image/png;base64," + png.toString("base64");
        }
        for (const id of referenced) {
          const buffer = await sharp(
            assetPath(db.assets.find((a) => a.id === id)),
          )
            .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
            .png()
            .toBuffer();
          images[id] = "data:image/png;base64," + buffer.toString("base64");
        }
        for (let i = 0; i < rows.length; i++) {
          if (res.destroyed) break;
          const svg = templateSVG(doc, rows[i], images);
          await sharp(Buffer.from(svg))
            .toFormat(format)
            .toFile(
              path.join(
                dir,
                `design-${String(i + 1).padStart(3, "0")}.${format === "jpeg" ? "jpg" : format}`,
              ),
            );
        }
        if (res.destroyed) return;
        res.attachment("copex-designs.zip");
        const zip = new ZipArchive({ zlib: { level: 1 } });
        await new Promise((resolve, reject) => {
          cleanup = () => {
            zip.abort();
            resolve();
          };
          res.once("close", cleanup);
          res.once("finish", resolve);
          zip.once("error", reject);
          zip.once("warning", reject);
          zip.pipe(res);
          zip.directory(dir, false);
          zip.finalize().catch(reject);
        });
      } finally {
        if (cleanup) res.removeListener("close", cleanup);
        await fs.rm(dir, { recursive: true, force: true });
        for (const id of referenced) {
          const count = activeAssets.get(id) - 1;
          if (count > 0) activeAssets.set(id, count);
          else activeAssets.delete(id);
        }
      }
    }),
  );
}
