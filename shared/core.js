export const sizes = [
  { name: "Instagram · Quadrado", w: 1080, h: 1080 },
  { name: "Stories / Reels", w: 1080, h: 1920 },
  { name: "Instagram · Retrato", w: 1080, h: 1350 },
  { name: "YouTube · Capa", w: 1280, h: 720 },
  { name: "Paisagem", w: 1920, h: 1080 },
];
export function uid() {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues)
    throw Error(
      "Este navegador não oferece geração segura de identificadores. Atualize o navegador ou Android System WebView.",
    );
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function escapeXml(s = "") {
  return String(s).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
}
export function interpolate(text, row = {}) {
  return String(text).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key) =>
    Object.hasOwn(row, key) ? (row[key] ?? `{{${key}}}`) : `{{${key}}}`,
  );
}
export function parseCSV(input) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  const s = String(input).replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      if (quoted && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (!field || quoted) quoted = !quoted;
      else field += c;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw Error("CSV com aspas não fechadas.");
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map((x) => x.trim());
  if (headers.some((x) => !x) || new Set(headers).size !== headers.length)
    throw Error("Use cabeçalhos únicos e preenchidos.");
  return rows.map((r, i) => {
    if (r.length !== headers.length)
      throw Error(`Linha ${i + 2}: número de colunas diferente do cabeçalho.`);
    return Object.fromEntries(headers.map((h, j) => [h, r[j]]));
  });
}
export function stringifyCSV(rows) {
  if (!Array.isArray(rows) || !rows.length) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [
    headers.map(cell).join(","),
    ...rows.map((row) =>
      headers
        .map((key) => cell(Object.hasOwn(row, key) ? row[key] : ""))
        .join(","),
    ),
  ].join("\r\n");
}
export function templateSVG(doc, row = {}, images = {}) {
  const w = Number(doc.width),
    h = Number(doc.height);
  if (
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w < 1 ||
    h < 1 ||
    w > 4096 ||
    h > 4096
  )
    throw Error("Dimensões do template devem estar entre 1 e 4096.");
  const content = doc.elements
    .filter((e) => !e.hidden)
    .map((e) => {
      const x = Number(e.x) || 0,
        y = Number(e.y) || 0,
        ew = Number(e.width) || 100,
        eh = Number(e.height) || 100;
      const transform = `rotate(${Number(e.rotation) || 0} ${x + ew / 2} ${y + eh / 2})`;
      const opacity = Math.max(0, Math.min(1, e.opacity ?? 1));
      if (e.type === "rect")
        return `<rect x="${x}" y="${y}" width="${ew}" height="${eh}" rx="${Number(e.radius) || 0}" fill="${escapeXml(e.color)}" opacity="${opacity}" transform="${transform}"/>`;
      if (e.type === "image") {
        const href = images[e.assetId] || e.dataUrl || "";
        if (!/^data:image\/(png|jpeg|webp);base64,/.test(href)) return "";
        return `<image x="${x}" y="${y}" width="${ew}" height="${eh}" href="${href}" preserveAspectRatio="xMidYMid slice" opacity="${opacity}" transform="${transform}"/>`;
      }
      const fs = Number(e.fontSize) || 64;
      const lines = interpolate(e.text, row).split("\n");
      const align = e.align || "left";
      const tx =
        align === "center" ? x + ew / 2 : align === "right" ? x + ew : x;
      return `<text fill="${escapeXml(e.color)}" font-family="${escapeXml(e.fontFamily || "DejaVu Sans")}" font-size="${fs}" font-weight="${e.bold ? 700 : 400}" text-anchor="${align === "center" ? "middle" : align === "right" ? "end" : "start"}" opacity="${opacity}" transform="${transform}">${lines.map((line, i) => `<tspan x="${tx}" y="${y + fs + i * fs * 1.18}">${escapeXml(line)}</tspan>`).join("")}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${escapeXml(doc.background || "#ffffff")}"/>${content}</svg>`;
}
const text = (id, value, x, y, width, fontSize, color, bold = false) => ({
  id,
  type: "text",
  text: value,
  x,
  y,
  width,
  height: fontSize * 2.5,
  fontSize,
  color,
  bold,
  opacity: 1,
});
const rect = (id, x, y, width, height, color, radius = 0) => ({
  id,
  type: "rect",
  x,
  y,
  width,
  height,
  color,
  radius,
  opacity: 1,
});
export const templates = [
  {
    id: "editorial",
    name: "Essencial editorial",
    category: "Social",
    width: 1080,
    height: 1080,
    background: "#e9e6dd",
    elements: [
      rect("a", 60, 60, 90, 8, "#333a2d"),
      text("b", "SUA MARCA / EST. 2026", 60, 95, 850, 24, "#333a2d"),
      text(
        "c",
        "Menos ruído.\nMais essência.",
        60,
        300,
        950,
        116,
        "#333a2d",
        true,
      ),
      text(
        "d",
        "Uma nova perspectiva para o seu dia.",
        65,
        720,
        900,
        32,
        "#555c4e",
      ),
      rect("e", 60, 900, 960, 2, "#a9ae9f"),
      text("f", "DESCUBRA O EXTRAORDINÁRIO →", 60, 940, 900, 25, "#333a2d"),
    ],
  },
  {
    id: "sale",
    name: "Drop da semana",
    category: "Promoção",
    width: 1080,
    height: 1080,
    background: "#d9f473",
    elements: [
      rect("a", 650, -80, 550, 550, "#bacf5e", 275),
      text("b", "OFERTA ESPECIAL", 70, 70, 850, 30, "#1a2518", true),
      text("c", "{{titulo}}", 65, 300, 950, 128, "#1a2518", true),
      text("d", "{{subtitulo}}", 75, 610, 900, 40, "#364331"),
      rect("e", 70, 850, 550, 105, "#1a2518", 52),
      text("f", "{{cta}}", 100, 873, 490, 34, "#d9f473", true),
    ],
  },
  {
    id: "story",
    name: "Seu próximo capítulo",
    category: "Stories",
    width: 1080,
    height: 1920,
    background: "#202b27",
    elements: [
      rect("a", 60, 60, 960, 1800, "#303e34", 35),
      text("b", "UM NOVO COMEÇO", 120, 180, 850, 30, "#d9f473"),
      text(
        "c",
        "Ideias que\nmerecem\no mundo.",
        110,
        550,
        900,
        128,
        "#f5f1e8",
        true,
      ),
      rect("d", 120, 1380, 840, 3, "#d9f473"),
      text("e", "Crie. Compartilhe. Inspire.", 120, 1480, 840, 42, "#f5f1e8"),
      text("f", "ARRASTE PARA DESCOBRIR ↑", 120, 1670, 850, 26, "#d9f473"),
    ],
  },
  {
    id: "quote",
    name: "Palavras que ficam",
    category: "Social",
    width: 1080,
    height: 1080,
    background: "#e9b7a8",
    elements: [
      text("a", "“", 80, 40, 800, 230, "#672d30"),
      text(
        "b",
        "A criatividade\né a inteligência\nse divertindo.",
        90,
        320,
        910,
        82,
        "#672d30",
        true,
      ),
      rect("c", 95, 790, 100, 5, "#672d30"),
      text("d", "SUA DOSE DIÁRIA DE INSPIRAÇÃO", 95, 865, 900, 25, "#672d30"),
    ],
  },
  {
    id: "youtube",
    name: "Além do óbvio",
    category: "Vídeo",
    width: 1280,
    height: 720,
    background: "#22232b",
    elements: [
      rect("a", 850, -100, 520, 920, "#ab9ef4", 80),
      text("b", "GUIA COMPLETO", 70, 65, 900, 28, "#ab9ef4", true),
      text("c", "Pense fora\ndo formato.", 65, 200, 1150, 105, "#ffffff", true),
      rect("d", 70, 580, 500, 65, "#d9f473", 32),
      text("e", "COMECE POR AQUI →", 100, 590, 450, 29, "#22232b", true),
    ],
  },
  {
    id: "launch",
    name: "Feito para o amanhã",
    category: "Promoção",
    width: 1080,
    height: 1350,
    background: "#eeeeeb",
    elements: [
      rect("a", 80, 180, 920, 720, "#ced4cb", 460),
      text("b", "NOVA COLEÇÃO / 2026", 70, 60, 940, 27, "#25372e"),
      text("c", "Feito para\no amanhã.", 65, 420, 950, 115, "#25372e", true),
      text(
        "d",
        "Design que acompanha o seu ritmo.",
        75,
        980,
        920,
        36,
        "#25372e",
      ),
      rect("e", 70, 1130, 940, 100, "#25372e", 50),
      text("f", "CONHEÇA A COLEÇÃO →", 130, 1150, 820, 32, "#eeeeeb", true),
    ],
  },
];
