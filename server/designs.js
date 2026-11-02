import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ZipArchive } from "archiver";
import {
  validateDesignBody,
  freezeDesignImages,
  renderDesignRow,
} from "./design-render.js";
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
      const {
        doc,
        rows,
        format,
        assetIds: referenced,
      } = validateDesignBody(req.body, db);
      for (const id of referenced)
        activeAssets.set(id, (activeAssets.get(id) || 0) + 1);
      const dir = path.join(DATA, "tmp", "design-" + randomUUID());
      let cleanup;
      try {
        await fs.mkdir(dir, { recursive: true });
        await freezeDesignImages(doc, db, assetPath);
        for (let i = 0; i < rows.length; i++) {
          if (res.destroyed) break;
          await renderDesignRow(
            doc,
            rows[i],
            format,
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
