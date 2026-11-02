import { pinnedIds } from "./preferences.js";
import { validateRecord as validateStudioRecord } from "./records.js";
import { validateTemplate } from "./templates.js";
import { normalizeSettings } from "./media.js";
import { normalizeEntry, rankEntries } from "../shared/radar.js";
import { segmentsToSRT } from "../shared/captions.js";
const keys = [
  "presets",
  "plans",
  "projects",
  "automations",
  "radarReports",
  "cutAnalyses",
  "transcripts",
  "publications",
  "accounts",
];
const id = (value) => {
  if (typeof value !== "string" || !/^[-\w]{1,120}$/.test(value))
    throw Error("O backup contém um identificador inválido.");
  return value;
};
const text = (value, max = 120) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const title = (value) => {
  const name = text(value);
  if (!name) throw Error("O backup contém um item sem nome.");
  return name;
};
const stamp = (value) => {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw Error("O backup contém uma data inválida.");
  return date.toISOString();
};
const ids = (value) => {
  if (!Array.isArray(value))
    throw Error("O backup contém uma lista de arquivos inválida.");
  return [...new Set(value.map(id))];
};
const url = (value) => {
  if (!value) return "";
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password)
    throw Error("O backup contém uma URL inválida.");
  return u.toString();
};
function validateRecord(key, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw Error("Item de backup inválido.");
  const common = {
    id: id(raw.id),
    createdAt: stamp(raw.createdAt),
    updatedAt: stamp(raw.updatedAt || raw.createdAt),
  };
  if (key === "presets") return { ...validateTemplate(raw), ...common };
  if (key === "projects")
    return { ...validateStudioRecord("projects", raw), ...common };
  if (key === "plans") {
    const date = text(raw.date),
      time = text(raw.time);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date + "T12:00:00Z")) ||
      new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    )
      throw Error("Data ou horário do planejamento inválido.");
    return {
      ...common,
      title: title(raw.title),
      date,
      time,
      platform: text(raw.platform, 50),
      caption: text(raw.caption, 10000),
      assetId: raw.assetId ? id(raw.assetId) : "",
      status: raw.status === "published" ? "published" : "planned",
      ...(raw.publicationId ? { publicationId: id(raw.publicationId) } : {}),
    };
  }
  if (key === "automations") {
    if (!["video", "image"].includes(raw.type))
      throw Error("Tipo de receita inválido.");
    return {
      ...common,
      name: title(raw.name),
      type: raw.type,
      presetName: text(raw.presetName),
      settings: normalizeSettings(raw.settings),
      processed: ids(raw.processed || []),
      failed: ids(raw.failed || []),
      enabled: false,
    };
  }
  if (key === "accounts") {
    if (!["youtube", "instagram", "tiktok"].includes(raw.platform))
      throw Error("Plataforma da conta inválida.");
    return {
      ...common,
      name: title(raw.name),
      platform: raw.platform,
      remoteId: text(raw.remoteId),
      apiVersion: /^v\d+\.\d+$/.test(raw.apiVersion) ? raw.apiVersion : "v24.0",
      expiresAt: raw.expiresAt ? stamp(raw.expiresAt) : null,
      status: "unverified",
    };
  }
  if (key === "publications") {
    if (!["youtube", "instagram", "tiktok"].includes(raw.platform))
      throw Error("Plataforma de publicação inválida.");
    const media = raw.media?.assetId
      ? { assetId: id(raw.media.assetId) }
      : raw.media?.jobId
        ? {
            jobId: id(raw.media.jobId),
            outputIndex: Math.max(
              0,
              Math.floor(Number(raw.media.outputIndex) || 0),
            ),
          }
        : null;
    if (!media) throw Error("Referência de mídia inválida no backup.");
    const status = ["published", "cancelled"].includes(raw.status)
      ? raw.status
      : "draft";
    return {
      ...common,
      accountId: id(raw.accountId),
      platform: raw.platform,
      title: title(raw.title),
      caption: text(raw.caption, 10000),
      privacy: text(raw.privacy, 50),
      media,
      status,
      scheduledAt: null,
      publicMediaUrl: url(raw.publicMediaUrl),
      hostedMedia: raw.hostedMedia === true,
      remoteId: raw.remoteId ? text(raw.remoteId) : null,
      url: url(raw.url),
      publishedAt: raw.publishedAt ? stamp(raw.publishedAt) : null,
      attempts: Math.max(0, Number(raw.attempts) || 0),
      metrics: raw.metrics
        ? Object.fromEntries(
            ["views", "likes", "comments", "shares", "reach", "saved"].map(
              (key) => [
                key,
                Number.isFinite(raw.metrics[key]) && raw.metrics[key] >= 0
                  ? raw.metrics[key]
                  : null,
              ],
            ),
          )
        : undefined,
      metricsAt: raw.metricsAt ? stamp(raw.metricsAt) : null,
    };
  }
  const state = {
    ...common,
    name: title(raw.name),
    status: raw.status === "done" ? "done" : "failed",
    ...(raw.status !== "done"
      ? {
          error:
            "Operação interrompida na cópia de segurança. Execute novamente.",
        }
      : {}),
  };
  if (key === "radarReports") {
    if (!Array.isArray(raw.entries)) throw Error("Dados do radar inválidos.");
    return {
      ...state,
      source: raw.source === "profile" ? "profile" : "file",
      url: raw.url ? url(raw.url) : undefined,
      entries: rankEntries(
        raw.entries.map((e) =>
          normalizeEntry({
            ...e,
            published_at: e.publishedAt,
            view_count: e.views,
            like_count: e.likes,
            comment_count: e.comments,
            share_count: e.shares,
          }),
        ),
      ),
    };
  }
  if (key === "transcripts") {
    const segments = Array.isArray(raw.segments)
      ? raw.segments.map((s) => ({
          start: Number(s.start),
          end: Number(s.end),
          text: text(s.text, 10000),
        }))
      : [];
    if (state.status === "done") segmentsToSRT(segments);
    return {
      ...state,
      assetId: id(raw.assetId),
      subtitleId: raw.subtitleId ? id(raw.subtitleId) : undefined,
      language: text(raw.language, 10),
      segments,
      progress: state.status === "done" ? 100 : 0,
    };
  }
  if (key === "cutAnalyses") {
    if (!Array.isArray(raw.cuts)) throw Error("Trechos do backup inválidos.");
    const cuts = raw.cuts.map((c) => {
      if (
        !Number.isFinite(c.start) ||
        !Number.isFinite(c.end) ||
        c.start < 0 ||
        c.end <= c.start
      )
        throw Error("Intervalo de corte inválido no backup.");
      return {
        id: id(c.id),
        start: c.start,
        end: c.end,
        score: Number.isFinite(c.score)
          ? Math.max(0, Math.min(100, c.score))
          : 0,
        reason: text(c.reason, 300),
      };
    });
    return { ...state, assetId: id(raw.assetId), cuts };
  }
  throw Error("Coleção desconhecida.");
}
export function prepareRestore(database, input) {
  if (
    input?.version !== 1 ||
    (!keys.some((key) => input[key] !== undefined) &&
      !input.brand &&
      !input.preferences)
  )
    throw Error("Backup incompatível.");
  const prepared = {};
  let added = 0,
    ignored = 0;
  for (const key of keys) {
    if (input[key] === undefined) continue;
    if (!Array.isArray(input[key]))
      throw Error("Coleção inválida no backup: " + key);
    const validated = input[key].map((raw) => validateRecord(key, raw));
    const seen = new Set((database[key] || []).map((item) => item.id));
    prepared[key] = [];
    for (const item of validated) {
      if (seen.has(item.id)) {
        ignored++;
        continue;
      }
      seen.add(item.id);
      prepared[key].push(item);
      added++;
    }
  }
  if (input.brand) {
    const name = title(input.brand.name);
    if (!/^#[\da-f]{6}$/i.test(input.brand.color))
      throw Error("Cor de marca inválida no backup.");
    prepared.brand = { name, color: input.brand.color };
  }
  if (input.preferences !== undefined) {
    if (
      !input.preferences ||
      typeof input.preferences !== "object" ||
      Array.isArray(input.preferences)
    )
      throw Error("Preferências inválidas no backup.");
    prepared.preferences = {
      pinnedTemplates: pinnedIds(input.preferences.pinnedTemplates),
    };
  }
  return { prepared, added, ignored };
}
export function applyRestore(database, input) {
  const result = prepareRestore(database, input);
  for (const key of keys)
    if (result.prepared[key]) {
      database[key] ||= [];
      database[key].push(...result.prepared[key]);
    }
  if (result.prepared.brand) database.brand = result.prepared.brand;
  if (result.prepared.preferences)
    database.preferences = {
      pinnedTemplates: [
        ...new Set([
          ...(database.preferences?.pinnedTemplates || []),
          ...result.prepared.preferences.pinnedTemplates,
        ]),
      ],
    };
  return { added: result.added, ignored: result.ignored };
}
