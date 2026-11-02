import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { normalizeSettings } from "./media.js";
const clamp = (value, min, max, fallback) =>
  Number.isFinite(Number(value))
    ? Math.min(max, Math.max(min, Number(value)))
    : fallback;
export function validateTemplate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Template inválido.");
  if (input.kind !== undefined && !["video", "design"].includes(input.kind))
    throw Error("Tipo de template inválido.");
  const name = String(input.name || input.doc?.name || "")
    .trim()
    .slice(0, 120);
  if (!name) throw Error("Informe o nome do template.");
  const common = {
    name,
    category: String(
      input.category || input.doc?.category || "Meus templates",
    ).slice(0, 40),
    color: /^#[\da-f]{6}$/i.test(input.color) ? input.color : "#d9f473",
  };
  if (input.kind !== "design")
    return {
      ...common,
      kind: "video",
      settings: normalizeSettings(input.settings || {}),
    };
  const doc = input.doc;
  if (!doc || !Array.isArray(doc.elements) || doc.elements.length > 500)
    throw Error("O design deve ter até 500 camadas.");
  const width = Number(doc.width),
    height = Number(doc.height);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 128 ||
    height < 128 ||
    width > 4096 ||
    height > 4096
  )
    throw Error("Dimensões do design devem estar entre 128 e 4096 px.");
  const ids = new Set();
  const elements = doc.elements.map((raw) => {
    if (
      !raw ||
      typeof raw !== "object" ||
      !["text", "rect", "image"].includes(raw.type)
    )
      throw Error("Tipo de camada não suportado.");
    let id = String(raw.id || randomUUID());
    if (ids.has(id)) id = randomUUID();
    ids.add(id);
    const e = {
      id,
      type: raw.type,
      x: clamp(raw.x, -width * 4, width * 4, 0),
      y: clamp(raw.y, -height * 4, height * 4, 0),
      width: clamp(raw.width, 1, 8192, 200),
      height: clamp(raw.height, 1, 8192, 100),
      rotation: clamp(raw.rotation, -360, 360, 0),
      opacity: clamp(raw.opacity, 0, 1, 1),
      hidden: !!raw.hidden,
      locked: !!raw.locked,
    };
    if (raw.type === "text") {
      Object.assign(e, {
        text: String(raw.text || "").slice(0, 10000),
        fontSize: clamp(raw.fontSize, 8, 500, 48),
        fontFamily: [
          "sans-serif",
          "serif",
          "monospace",
          "DejaVu Sans",
          "DejaVu Serif",
          "DejaVu Sans Mono",
        ].includes(raw.fontFamily)
          ? raw.fontFamily
          : "DejaVu Sans",
        bold: !!raw.bold,
        align: ["left", "center", "right"].includes(raw.align)
          ? raw.align
          : "left",
      });
    }
    if (raw.type !== "image") {
      e.color = /^#[\da-f]{6}$/i.test(raw.color) ? raw.color : "#25372e";
      if (raw.type === "rect") e.radius = clamp(raw.radius, 0, 4096, 0);
    } else {
      if (raw.assetId) e.assetId = String(raw.assetId);
      if (raw.dataUrl) {
        if (
          !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(
            raw.dataUrl,
          )
        )
          throw Error("A imagem incorporada deve ser PNG, JPEG ou WebP.");
        e.dataUrl = raw.dataUrl;
      }
    }
    return e;
  });
  if (
    input.datasetCsv !== undefined &&
    (typeof input.datasetCsv !== "string" ||
      input.datasetCsv.length > 2 * 1024 * 1024)
  )
    throw Error("Dados CSV do template inválidos ou maiores que 2 MB.");
  return {
    ...common,
    kind: "design",
    datasetCsv: input.datasetCsv ?? "",
    exportFormat: ["png", "jpeg", "webp"].includes(input.exportFormat)
      ? input.exportFormat
      : "png",
    doc: {
      name,
      category: common.category,
      width: Math.round(width),
      height: Math.round(height),
      background: /^#[\da-f]{6}$/i.test(doc.background)
        ? doc.background
        : "#e9e6dd",
      elements,
    },
  };
}
export function registerTemplates({
  app,
  db,
  save,
  wrap,
  DATA,
  assetPath,
  ingest,
}) {
  app.get(
    "/api/presets/:id/export",
    wrap(async (req, res) => {
      const original = db.presets.find((p) => p.id === req.params.id);
      if (!original)
        return res.status(404).json({ error: "Template não encontrado." });
      const template = validateTemplate(original),
        warnings = [];
      if (template.kind === "design") {
        for (const e of template.doc.elements.filter(
          (e) => e.type === "image",
        )) {
          const a = db.assets.find(
            (a) => a.id === e.assetId && a.type === "image",
          );
          if (a) {
            const data = await sharp(assetPath(a))
              .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
              .png()
              .toBuffer();
            e.dataUrl = "data:image/png;base64," + data.toString("base64");
            delete e.assetId;
          } else if (!e.dataUrl) {
            warnings.push("Uma imagem do design não está mais na biblioteca.");
            delete e.assetId;
          }
        }
      } else
        for (const key of ["watermarkId", "audioId", "subtitleId"])
          if (template.settings[key]) {
            warnings.push(
              "O arquivo de " +
                {
                  watermarkId: "marca d’água",
                  audioId: "áudio",
                  subtitleId: "legenda",
                }[key] +
                " deve ser selecionado novamente ao importar.",
            );
            template.settings[key] = "";
          }
      const bundle = {
        format: "copex-template",
        version: 1,
        template,
        warnings,
      };
      if (Buffer.byteLength(JSON.stringify(bundle, null, 2)) > 12 * 1024 * 1024)
        throw Error(
          "Este template excede 12 MB. Reduza as imagens ou o número de camadas antes de exportar.",
        );
      res
        .attachment(
          template.name.replace(/[^\p{L}\p{N}_-]/gu, "_") + ".copex.json",
        )
        .json(bundle);
    }),
  );
  app.post(
    "/api/presets/import",
    wrap(async (req, res) => {
      if (req.body.format !== "copex-template" || req.body.version !== 1)
        throw Error("Arquivo de template Copex inválido ou incompatível.");
      const template = validateTemplate(req.body.template),
        warnings = [
          ...(Array.isArray(req.body.warnings)
            ? req.body.warnings.slice(0, 20).map((x) => String(x).slice(0, 200))
            : []),
        ],
        prepared = new Map();
      if (template.kind === "design")
        for (const e of template.doc.elements.filter(
          (e) => e.type === "image" && e.dataUrl,
        )) {
          if (prepared.has(e.dataUrl)) continue;
          const buffer = Buffer.from(e.dataUrl.split(",")[1], "base64"),
            meta = await sharp(buffer, {
              limitInputPixels: 4096 * 4096,
            }).metadata();
          if (!["png", "jpeg", "webp"].includes(meta.format))
            throw Error("Imagem incorporada inválida.");
          prepared.set(
            e.dataUrl,
            await sharp(buffer)
              .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
              .png()
              .toBuffer(),
          );
        }
      const created = [];
      try {
        const imported = new Map();
        for (const [key, buffer] of prepared) {
          const file = path.join(DATA, "tmp", randomUUID() + ".png");
          await fs.writeFile(file, buffer);
          const asset = await ingest({
            path: file,
            originalname: template.name + " · imagem.png",
            size: buffer.length,
          });
          created.push(asset);
          imported.set(key, asset.id);
        }
        if (template.kind === "design")
          for (const e of template.doc.elements.filter(
            (e) => e.type === "image",
          )) {
            if (e.dataUrl) {
              e.assetId = imported.get(e.dataUrl);
              delete e.dataUrl;
            } else if (
              e.assetId &&
              !db.assets.some((a) => a.id === e.assetId && a.type === "image")
            ) {
              delete e.assetId;
              warnings.push("Uma imagem precisa ser substituída no design.");
            }
          }
        else
          for (const key of ["watermarkId", "audioId", "subtitleId"])
            if (
              template.settings[key] &&
              !db.assets.some(
                (a) =>
                  a.id === template.settings[key] &&
                  a.type ===
                    {
                      watermarkId: "image",
                      audioId: "audio",
                      subtitleId: "subtitle",
                    }[key],
              )
            ) {
              template.settings[key] = "";
              warnings.push(
                "Selecione novamente os arquivos de marca, áudio ou legenda.",
              );
            }
        const saved = {
          ...template,
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db.presets.unshift(saved);
        await save();
        res
          .status(201)
          .json({ template: saved, warnings: [...new Set(warnings)] });
      } catch (error) {
        for (const a of created) {
          db.assets = db.assets.filter((x) => x.id !== a.id);
          await fs.unlink(assetPath(a)).catch(() => {});
          if (a.thumb)
            await fs.unlink(path.join(DATA, "thumbs", a.thumb)).catch(() => {});
        }
        await save();
        throw error;
      }
    }),
  );
}
