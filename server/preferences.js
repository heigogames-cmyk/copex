export function pinnedIds(value) {
  if (
    !Array.isArray(value) ||
    value.some((id) => typeof id !== "string" || !/^[-\w]{1,120}$/.test(id))
  )
    throw Error("Lista de favoritos inválida.");
  return [...new Set(value)];
}
export function registerPreferences({ app, db, save, wrap }) {
  db.preferences = {
    pinnedTemplates: pinnedIds(db.preferences?.pinnedTemplates || []),
  };
  app.put(
    "/api/preferences/pinned-templates/:id",
    wrap(async (req, res) => {
      const [id] = pinnedIds([req.params.id]);
      if (typeof req.body.pinned !== "boolean")
        throw Error("Informe o estado do favorito.");
      const values = new Set(db.preferences.pinnedTemplates);
      if (req.body.pinned) values.add(id);
      else values.delete(id);
      db.preferences.pinnedTemplates = [...values];
      await save();
      res.json(db.preferences);
    }),
  );
  app.post(
    "/api/preferences/pinned-templates",
    wrap(async (req, res) => {
      db.preferences.pinnedTemplates = [
        ...new Set([
          ...db.preferences.pinnedTemplates,
          ...pinnedIds(req.body.ids),
        ]),
      ];
      await save();
      res.json(db.preferences);
    }),
  );
}
