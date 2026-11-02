import sharp from "sharp";
import { validateTemplate } from "./templates.js";
import { templateSVG } from "../shared/core.js";
export function validateDesignBody(input, db) {
  const { doc: raw, rows = [{}], format = "png" } = input || {};
  const { doc } = validateTemplate({
    kind: "design",
    name: raw?.name || "Design",
    doc: raw,
  });
  if (
    !Array.isArray(rows) ||
    !rows.length ||
    rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))
  )
    throw Error("Dados de variações inválidos.");
  if (!["png", "jpeg", "webp"].includes(format))
    throw Error("Formato de imagem inválido.");
  const assetIds = new Set();
  for (const e of doc.elements.filter(
    (e) => e.type === "image" && !e.dataUrl,
  )) {
    const a = db.assets.find((a) => a.id === e.assetId && a.type === "image");
    if (!a && !e.hidden)
      throw Error(
        "Uma imagem do design não está mais na biblioteca. Substitua a camada antes de exportar.",
      );
    if (a) assetIds.add(a.id);
  }
  return { doc, rows, format, assetIds: [...assetIds] };
}
export async function freezeDesignImages(doc, db, assetPath) {
  const cache = new Map();
  for (const e of doc.elements.filter((e) => e.type === "image")) {
    const a = db.assets.find((a) => a.id === e.assetId && a.type === "image");
    if (!a && !e.dataUrl) {
      if (e.hidden) {
        delete e.assetId;
        continue;
      }
      throw Error("Imagem do design indisponível.");
    }
    const key = e.dataUrl || a.id;
    if (!cache.has(key)) {
      const input = e.dataUrl
        ? Buffer.from(e.dataUrl.split(",")[1], "base64")
        : assetPath(a);
      const metadata = await sharp(input, {
        limitInputPixels: e.dataUrl ? 4096 * 4096 : 268402689,
      }).metadata();
      if (!["png", "jpeg", "webp"].includes(metadata.format))
        throw Error("Imagem incorporada inválida.");
      const png = await sharp(input)
        .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      cache.set(key, "data:image/png;base64," + png.toString("base64"));
    }
    e.dataUrl = cache.get(key);
    if (a) e._sourceAssetId = a.id;
    delete e.assetId;
  }
  return doc;
}
export async function renderDesignRow(doc, row, format, file) {
  await sharp(Buffer.from(templateSVG(doc, row)))
    .toFormat(format)
    .toFile(file);
}
