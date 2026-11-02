import { normalizeSettings } from "./media.js";
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const name = (value, label) => {
  if (typeof value !== "string" || !value.trim())
    throw Error("Informe " + label + ".");
  return value.trim().slice(0, 120);
};
const ids = (value = []) => {
  if (
    !Array.isArray(value) ||
    value.some((id) => typeof id !== "string" || !/^[-\w]{1,120}$/.test(id))
  )
    throw Error("Lista de arquivos inválida.");
  return [...new Set(value)];
};
export function validateRecord(route, input) {
  if (!object(input)) throw Error("Dados inválidos.");
  if (route === "projects") {
    if (input.settings !== undefined && !object(input.settings))
      throw Error("Ajustes do projeto inválidos.");
    if (input.overrides !== undefined && !object(input.overrides))
      throw Error("Ajustes individuais inválidos.");
    const overrides = {};
    for (const [key, value] of Object.entries(input.overrides || {})) {
      ids([key]);
      if (!object(value)) throw Error("Ajustes individuais inválidos.");
      const normalized = normalizeSettings(value);
      overrides[key] = Object.fromEntries(
        Object.keys(value)
          .filter((key) => Object.hasOwn(normalized, key))
          .map((key) => [key, normalized[key]]),
      );
    }
    return {
      name: name(input.name, "o nome do projeto"),
      settings: normalizeSettings(input.settings),
      assetIds: ids(input.assetIds),
      overrides,
    };
  }
  if (route === "plans") {
    const date = input.date,
      time = input.time || "09:00";
    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date + "T12:00:00Z")) ||
      new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    )
      throw Error("Informe data e horário válidos.");
    const result = {
      title: name(input.title, "o título"),
      date,
      time,
      platform: String(input.platform || "Outra").slice(0, 50),
      caption: String(input.caption || "").slice(0, 10000),
      assetId: input.assetId ? ids([input.assetId])[0] : "",
      status: input.status === "published" ? "published" : "planned",
    };
    if (input.publicationId)
      result.publicationId = ids([input.publicationId])[0];
    return result;
  }
  if (route === "automations") {
    if (!["video", "image"].includes(input.type))
      throw Error("Tipo de receita inválido.");
    return {
      name: name(input.name, "o nome da receita"),
      type: input.type,
      presetName: String(input.presetName || "").slice(0, 120),
      settings: normalizeSettings(input.settings),
      processed: ids(input.processed),
      failed: ids(input.failed),
      enabled: input.enabled === true,
    };
  }
  throw Error("Coleção inválida.");
}
