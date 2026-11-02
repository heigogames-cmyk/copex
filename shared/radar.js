import { parseCSV } from "./core.js";
const numeric = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
export function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw Error("Registro de vídeo inválido nos dados do radar.");
  const value = (...keys) => {
    for (const k of keys)
      if (raw[k] !== undefined && raw[k] !== null && raw[k] !== "")
        return raw[k];
    return null;
  };
  const id = String(value("id", "video_id") || ""),
    url = value("webpage_url", "original_url", "url", "link");
  let safeUrl = null;
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol === "https:" && !u.username && !u.password)
        safeUrl = u.toString();
    } catch {}
  }
  const ts = value("timestamp", "release_timestamp"),
    uploaded = value("upload_date", "published_at", "date", "data");
  let publishedAt = null;
  if (ts !== null && Number.isFinite(Number(ts))) {
    const d = new Date(Number(ts) * 1000);
    if (Number.isFinite(d.getTime())) publishedAt = d.toISOString();
  }
  if (!publishedAt && uploaded) {
    const str = String(uploaded);
    const compact = /^\d{8}$/.test(str);
    const dateOnly = compact
      ? `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`
      : str;
    const d = new Date(compact ? dateOnly + "T12:00:00Z" : str);
    if (
      Number.isFinite(d.getTime()) &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ||
        d.toISOString().slice(0, 10) === dateOnly)
    )
      publishedAt = d.toISOString();
  }
  return {
    id: id || safeUrl || String(value("title", "titulo") || "sem-id"),
    url: safeUrl,
    title: String(
      value("title", "titulo", "description", "video_description") ||
        "Sem título",
    ).slice(0, 500),
    author: String(value("uploader", "channel", "author", "perfil") || ""),
    views: numeric(value("view_count", "views", "visualizacoes")),
    likes: numeric(value("like_count", "likes", "curtidas")),
    comments: numeric(value("comment_count", "comments", "comentarios")),
    shares: numeric(
      value("repost_count", "share_count", "shares", "compartilhamentos"),
    ),
    duration: numeric(value("duration", "duracao")),
    publishedAt,
    thumbnail:
      typeof raw.thumbnail === "string" && raw.thumbnail.startsWith("https://")
        ? raw.thumbnail
        : null,
  };
}
export function rankEntries(entries, now = Date.now()) {
  const maxViews = entries.reduce((max, e) => Math.max(max, e.views ?? 0), 1);
  return entries
    .map((e) => {
      const interactions = [e.likes, e.comments, e.shares];
      const known = interactions.filter((v) => v !== null);
      const engagement =
        e.views > 0 && known.length === 3
          ? known.reduce((s, n) => s + n, 0) / e.views
          : null;
      const ageHours = e.publishedAt
        ? Math.max(1, (now - new Date(e.publishedAt).getTime()) / 3600000)
        : null;
      const velocity = e.views !== null && ageHours ? e.views / ageHours : null;
      const components = [];
      if (e.views !== null)
        components.push({
          weight: 0.5,
          value: Math.log1p(e.views) / Math.log1p(maxViews),
        });
      if (engagement !== null)
        components.push({ weight: 0.3, value: Math.min(1, engagement / 0.1) });
      if (ageHours !== null)
        components.push({ weight: 0.2, value: Math.exp(-ageHours / 168) });
      const weight = components.reduce((s, c) => s + c.weight, 0);
      const score = weight
        ? Math.round(
            (100 * components.reduce((s, c) => s + c.value * c.weight, 0)) /
              weight,
          )
        : null;
      return {
        ...e,
        engagement,
        velocity,
        score,
        coverage: {
          views: e.views !== null,
          interactions: known.length === 3,
          date: !!e.publishedAt,
        },
      };
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
export function readRadarData(text, format = "json") {
  let rows;
  if (format === "csv") rows = parseCSV(text);
  else {
    try {
      const parsed = JSON.parse(text);
      rows = Array.isArray(parsed)
        ? parsed
        : parsed.entries || parsed.videos || parsed.data?.videos || [parsed];
    } catch {
      rows = String(text)
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }
  }
  if (!Array.isArray(rows) || !rows.length)
    throw Error("Nenhum vídeo encontrado nos dados.");
  const entries = rows.filter(Boolean).map(normalizeEntry);
  if (!entries.length) throw Error("Nenhum vídeo encontrado nos dados.");
  return [...new Map(entries.map((e) => [e.id, e])).values()];
}
export function filterEntries(entries, filters = {}) {
  return entries.filter((e) => {
    const required = (key, bound, test) =>
      bound === undefined ||
      bound === null ||
      bound === "" ||
      Number(bound) === 0 ||
      (e[key] !== null && test(e[key], Number(bound)));
    return (
      required("views", filters.minViews, (a, b) => a >= b) &&
      required("views", filters.maxViews, (a, b) => a <= b) &&
      required("likes", filters.minLikes, (a, b) => a >= b) &&
      required("duration", filters.maxDuration, (a, b) => a <= b) &&
      required("score", filters.minScore, (a, b) => a >= b) &&
      (!filters.query ||
        e.title.toLowerCase().includes(filters.query.toLowerCase()))
    );
  });
}
