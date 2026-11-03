import fs from "node:fs/promises";
import path from "node:path";
export function assetBusy(db, id, activeDesignAssets) {
  if (activeDesignAssets?.has(id)) return "exportação de design em andamento";
  if (
    db.jobs.some(
      (j) =>
        (["queued", "running"].includes(j.status) || j.stopping) &&
        (j.assetIds.includes(id) ||
          [j.settings, ...Object.values(j.overrides || {})].some((s) =>
            [s?.frameId, s?.watermarkId, s?.audioId, s?.subtitleId].includes(
              id,
            ),
          )),
    )
  )
    return "exportação em andamento";
  if (
    [...(db.cutAnalyses || []), ...(db.transcripts || [])].some(
      (t) => t.assetId === id && ["queued", "running"].includes(t.status),
    )
  )
    return "análise em andamento";
  if (
    (db.publications || []).some(
      (p) =>
        p.media?.assetId === id &&
        [
          "draft",
          "scheduled",
          "publishing",
          "processing",
          "uncertain",
        ].includes(p.status),
    )
  )
    return "publicação vinculada";
  return null;
}
export function registerLibrary({
  app,
  db,
  save,
  wrap,
  assetPath,
  DATA,
  activeDesignAssets,
}) {
  app.delete(
    "/api/assets",
    wrap(async (req, res) => {
      if (!Array.isArray(req.body.assetIds) || !req.body.assetIds.length)
        throw Error("Selecione arquivos para excluir.");
      const ids = new Set(req.body.assetIds),
        assets = db.assets.filter((a) => ids.has(a.id));
      if (assets.length !== ids.size)
        throw Error(
          "Alguns arquivos já não estão na biblioteca. Atualize a seleção.",
        );
      const busy = assets
        .map((a) => ({
          name: a.name,
          reason: assetBusy(db, a.id, activeDesignAssets),
        }))
        .filter((a) => a.reason);
      if (busy.length)
        return res.status(409).json({
          error:
            "Nenhum arquivo foi excluído. Cancele ou conclua as operações em: " +
            busy.map((a) => a.name + " (" + a.reason + ")").join(", "),
        });
      db.assets = db.assets.filter((a) => !ids.has(a.id));
      await save();
      for (const a of assets) {
        await fs.unlink(assetPath(a)).catch(() => {});
        if (a.thumb)
          await fs.unlink(path.join(DATA, "thumbs", a.thumb)).catch(() => {});
      }
      res.json({ removed: assets.length });
    }),
  );
  app.patch(
    "/api/assets",
    wrap(async (req, res) => {
      if (!Array.isArray(req.body.assetIds) || !req.body.assetIds.length)
        throw Error("Selecione arquivos para organizar.");
      const ids = new Set(req.body.assetIds);
      const tags = Array.isArray(req.body.tags)
        ? [
            ...new Set(
              req.body.tags
                .map((t) => String(t).trim().slice(0, 40))
                .filter(Boolean),
            ),
          ].slice(0, 30)
        : null;
      const assets = db.assets.filter((a) => ids.has(a.id));
      if (assets.length !== ids.size)
        throw Error("Atualize a seleção da biblioteca.");
      for (const a of assets) {
        if (tags)
          a.tags = req.body.replaceTags
            ? tags
            : [...new Set([...(a.tags || []), ...tags])].slice(0, 30);
        if (typeof req.body.favorite === "boolean")
          a.favorite = req.body.favorite;
      }
      await save();
      res.json({ updated: assets.length });
    }),
  );
}
