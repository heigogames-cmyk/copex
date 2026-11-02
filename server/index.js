import { registerPublicMedia } from "./public-media.js";
import { accessControl } from "./access.js";
import { recoverJobs } from "./jobs.js";
import { validateRecord } from "./records.js";
import { registerDesigns } from "./designs.js";
import { registerLibrary, assetBusy } from "./library.js";
import { applyRestore } from "./backups.js";
import { validateTemplate, registerTemplates } from "./templates.js";
import { registerAdvanced } from "./advanced.js";
import { registerSocial } from "./social.js";
import express from "express";
import multer from "multer";
import { ZipArchive } from "archiver";
import sharp from "sharp";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  defaults,
  normalizeSettings,
  probe,
  run,
  renderVideo,
  splitVideo,
  parseSRT,
} from "./media.js";
import { templateSVG } from "../shared/core.js";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = process.env.COPEX_DATA_DIR
  ? path.resolve(process.env.COPEX_DATA_DIR)
  : path.join(ROOT, ".data");
for (const d of ["uploads", "exports", "thumbs", "tmp"])
  await fs.mkdir(path.join(DATA, d), { recursive: true });
const dbfile = path.join(DATA, "database.json");
let db;
try {
  db = JSON.parse(await fs.readFile(dbfile, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  db = {
    assets: [],
    jobs: [],
    presets: [],
    plans: [],
    projects: [],
    brand: { name: "Minha marca", color: "#d9f473" },
    automations: [],
  };
}
for (const rule of db.automations) {
  rule.processed ||= [];
  rule.failed ||= [];
  rule.enabled = !!rule.enabled;
}
recoverJobs(db.jobs);
let saving = Promise.resolve();
function save() {
  const snapshot = JSON.stringify(db, null, 2);
  saving = saving
    .catch(() => {})
    .then(async () => {
      await fs.writeFile(dbfile + ".tmp", snapshot);
      await fs.rename(dbfile + ".tmp", dbfile);
    });
  return saving;
}
const app = express();
const appVersion = JSON.parse(
  await fs.readFile(path.join(ROOT, "package.json"), "utf8"),
).version;
app.get("/api/ready", (_req, res) =>
  res.json({
    ok: true,
    app: "copex-studio",
    version: appVersion,
    androidClient: 1,
  }),
);
const createPublicMediaUrl = await registerPublicMedia({
  app,
  db,
  DATA,
  wrap: (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next),
  resolveMedia,
});
app.use(
  accessControl(process.env.COPEX_ACCESS_PASSWORD, {
    required: process.env.COPEX_REQUIRE_AUTH === "1",
  }),
);
app.use(express.json({ limit: "12mb" }));
for (const folder of ["uploads", "thumbs", "exports"])
  app.use(
    "/media/" + folder,
    express.static(path.join(DATA, folder), {
      dotfiles: "deny",
      setHeaders(res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }),
  );
app.use("/media", (req, res) =>
  res.status(404).json({ error: "Arquivo de mídia não encontrado." }),
);
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const upload = multer({
  dest: path.join(DATA, "tmp"),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});
const publicAsset = (a) => ({
  ...a,
  url: `/media/uploads/${a.file}`,
  thumbnail: a.thumb ? `/media/thumbs/${a.thumb}` : null,
});
const assetPath = (a) => path.join(DATA, "uploads", a.file);
async function ingest(file) {
  const id = randomUUID();
  if (path.extname(file.originalname).toLowerCase() === ".srt") {
    if (file.size > 5 * 1024 * 1024)
      throw Error("Arquivo de legendas muito grande.");
    const text = await fs.readFile(file.path, "utf8");
    const cues = parseSRT(text);
    const a = {
      id,
      name: path.basename(file.originalname),
      file: id + ".srt",
      type: "subtitle",
      size: file.size,
      duration: Math.max(...cues.map((cue) => cue.end)),
      width: 0,
      height: 0,
      tags: [],
      favorite: false,
      createdAt: new Date().toISOString(),
    };
    await fs.rename(file.path, assetPath(a));
    db.assets.unshift(a);
    await save();
    return a;
  }
  let meta;
  try {
    meta = await probe(file.path);
  } catch {
    throw Error("Arquivo de mídia inválido ou formato não reconhecido.");
  }
  const video = meta.streams.find(
      (s) => s.codec_type === "video" && s.disposition?.attached_pic !== 1,
    ),
    audio = meta.streams.find((s) => s.codec_type === "audio");
  const image =
    video &&
    (!Number(meta.format.duration) ||
      /image2|png_pipe|jpeg_pipe|webp_pipe/.test(meta.format.format_name));
  const type = image ? "image" : video ? "video" : audio ? "audio" : null;
  if (!type) throw Error("Use imagens, vídeos ou áudios válidos.");
  const ext = image
    ? video.codec_name === "png"
      ? ".png"
      : video.codec_name === "webp"
        ? ".webp"
        : ".jpg"
    : type === "video"
      ? path
          .extname(file.originalname)
          .toLowerCase()
          .replace(/[^.a-z0-9]/g, "")
          .slice(0, 8) || ".mp4"
      : path.extname(file.originalname).toLowerCase().slice(0, 8) || ".mp3";
  const filename = id + ext;
  await fs.rename(file.path, path.join(DATA, "uploads", filename));
  const a = {
    id,
    name: path.basename(file.originalname).slice(0, 200),
    file: filename,
    type,
    size: file.size,
    duration: type === "image" ? 0 : Number(meta.format.duration) || 0,
    width: video?.width || 0,
    height: video?.height || 0,
    hasAudio: !!audio,
    tags: [],
    favorite: false,
    createdAt: new Date().toISOString(),
  };
  if (video) {
    a.thumb = id + ".jpg";
    try {
      if (image)
        await sharp(assetPath(a))
          .resize(480, 480, { fit: "inside", withoutEnlargement: true })
          .jpeg()
          .toFile(path.join(DATA, "thumbs", a.thumb));
      else
        await run("ffmpeg", [
          "-v",
          "error",
          "-y",
          "-ss",
          "0",
          "-i",
          assetPath(a),
          "-frames:v",
          "1",
          "-vf",
          "scale=480:-2",
          "-threads",
          "1",
          path.join(DATA, "thumbs", a.thumb),
        ]);
    } catch {
      delete a.thumb;
    }
  }
  db.assets.unshift(a);
  await save();
  return a;
}
db.imports ||= [];
for (const task of db.imports)
  if (task.status === "running") {
    task.status = "failed";
    task.error = "Servidor reiniciado. Tente importar novamente.";
  }
app.post(
  "/api/import-url",
  wrap(async (req, res) => {
    const url = new URL(String(req.body.url || ""));
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      ![
        "tiktok.com",
        "www.tiktok.com",
        "vm.tiktok.com",
        "vt.tiktok.com",
        "instagram.com",
        "www.instagram.com",
        "youtube.com",
        "www.youtube.com",
        "youtu.be",
        "m.youtube.com",
      ].includes(host)
    )
      throw Error(
        "Use um link HTTPS público de um vídeo do TikTok, Instagram ou YouTube.",
      );
    if (!url.pathname || url.pathname === "/")
      throw Error(
        "Cole o link de um vídeo específico, não a página inicial ou um perfil.",
      );
    try {
      await fs.access(path.join(ROOT, ".tools", "bin", "yt-dlp"));
    } catch {
      throw Error(
        "Instale o yt-dlp conforme as instruções do README antes de importar links.",
      );
    }
    const task = {
      id: randomUUID(),
      url: url.toString(),
      status: "running",
      createdAt: new Date().toISOString(),
    };
    db.imports.unshift(task);
    await save();
    res.status(202).json(task);
    (async () => {
      const dir = path.join(DATA, "tmp", task.id);
      try {
        await fs.mkdir(dir, { recursive: true });
        await run(path.join(ROOT, ".tools", "bin", "yt-dlp"), [
          "--no-playlist",
          "--no-progress",
          "--socket-timeout",
          "25",
          "--retries",
          "1",
          "--max-filesize",
          "2G",
          "--merge-output-format",
          "mp4",
          "--restrict-filenames",
          "-o",
          path.join(dir, "%(title).100s.%(ext)s"),
          "--",
          url.toString(),
        ]);
        const files = (await fs.readdir(dir)).filter(
          (f) => !f.endsWith(".part") && !f.endsWith(".ytdl"),
        );
        if (!files.length)
          throw Error(
            "Nenhum arquivo foi baixado. O vídeo pode exigir autenticação ou exceder o espaço disponível.",
          );
        for (const file of files) {
          const filePath = path.join(dir, file);
          await ingest({
            path: filePath,
            originalname: file,
            size: (await fs.stat(filePath)).size,
          });
        }
        task.status = "done";
      } catch (e) {
        task.status = "failed";
        task.error =
          "Não foi possível importar. O vídeo precisa ser público e a rede deve permitir o site e seus servidores de mídia. Detalhes: " +
          e.message.slice(-1200);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
        await save();
      }
    })();
  }),
);
app.get(
  "/api/health",
  wrap(async (req, res) => {
    res.json({
      ok: true,
      app: "copex-studio",
      version: appVersion,
      androidClient: 1,
      ffmpeg: (await run("ffmpeg", ["-version"])).split("\n")[0],
      storage: DATA,
    });
  }),
);
app.get("/api/state", (req, res) =>
  res.json({ ...db, assets: db.assets.map(publicAsset), defaults }),
);
app.post(
  "/api/upload",
  upload.array("files"),
  wrap(async (req, res) => {
    const assets = [],
      errors = [];
    for (const f of req.files || []) {
      try {
        assets.push(publicAsset(await ingest(f)));
      } catch (e) {
        errors.push({ name: f.originalname, error: e.message });
        await fs.unlink(f.path).catch(() => {});
      }
    }
    res.status(assets.length ? 201 : 400).json({ assets, errors });
  }),
);
app.patch(
  "/api/assets/:id",
  wrap(async (req, res) => {
    const a = db.assets.find((x) => x.id === req.params.id);
    if (!a) return res.status(404).json({ error: "Arquivo não encontrado." });
    if (typeof req.body.name === "string" && req.body.name.trim())
      a.name = req.body.name.trim().slice(0, 200);
    if (Array.isArray(req.body.tags))
      a.tags = req.body.tags.map(String).slice(0, 30);
    if (typeof req.body.favorite === "boolean") a.favorite = req.body.favorite;
    await save();
    res.json(publicAsset(a));
  }),
);
app.delete(
  "/api/assets/:id",
  wrap(async (req, res) => {
    const a = db.assets.find((x) => x.id === req.params.id);
    if (!a) return res.sendStatus(404);
    if (assetBusy(db, a.id, activeDesignAssets))
      return res.status(409).json({
        error:
          "Este arquivo está em uso por uma exportação, análise ou publicação. Cancele ou conclua a operação antes de removê-lo.",
      });
    db.assets = db.assets.filter((x) => x.id !== a.id);
    await save();
    await fs.unlink(assetPath(a)).catch(() => {});
    if (a.thumb)
      await fs.unlink(path.join(DATA, "thumbs", a.thumb)).catch(() => {});
    res.json({ ok: true });
  }),
);
for (const [route, key] of [
  ["presets", "presets"],
  ["plans", "plans"],
  ["projects", "projects"],
  ["automations", "automations"],
]) {
  app.post(
    `/api/${route}`,
    wrap(async (req, res) => {
      const validated =
        route === "presets"
          ? validateTemplate(req.body)
          : validateRecord(route, req.body);
      const item = {
        ...validated,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db[key].unshift(item);
      await save();
      res.status(201).json(item);
    }),
  );
  app.put(
    `/api/${route}/:id`,
    wrap(async (req, res) => {
      const i = db[key].findIndex((x) => x.id === req.params.id);
      if (i < 0) return res.sendStatus(404);
      const existing = db[key][i];
      const input = { ...existing, ...req.body };
      const changes =
        route === "presets"
          ? validateTemplate(input)
          : validateRecord(route, input);
      db[key][i] = {
        ...existing,
        ...changes,
        id: req.params.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      await save();
      res.json(db[key][i]);
    }),
  );
  app.delete(
    `/api/${route}/:id`,
    wrap(async (req, res) => {
      db[key] = db[key].filter((x) => x.id !== req.params.id);
      await save();
      res.json({ ok: true });
    }),
  );
}
app.put(
  "/api/brand",
  wrap(async (req, res) => {
    db.brand = {
      name: String(req.body.name || "Minha marca").slice(0, 100),
      color: /^#[a-f0-9]{6}$/i.test(req.body.color)
        ? req.body.color
        : "#d9f473",
    };
    await save();
    res.json(db.brand);
  }),
);
const activeControllers = new Map();
let processing = false;
async function pump() {
  if (processing) return;
  processing = true;
  try {
    let job;
    while ((job = db.jobs.filter((j) => j.status === "queued").at(-1))) {
      job.status = "running";
      job.startedAt = new Date().toISOString();
      await save();
      try {
        await processJob(job);
        if (job.status !== "cancelled") {
          job.status = job.items?.some((item) => item.status === "failed")
            ? job.outputs.length
              ? "partial"
              : "failed"
            : "done";
          job.progress = 100;
          job.finishedAt = new Date().toISOString();
        }
      } catch (e) {
        if (job.status !== "cancelled") {
          job.status = "failed";
          job.error = e.message;
        }
      }
      if (job.recipeId) {
        const rule = db.automations.find((r) => r.id === job.recipeId);
        if (rule) {
          const succeeded = job.assetIds.filter((id) =>
            job.items
              ?.filter((item) => item.assetId === id)
              .every((item) => item.status === "done"),
          );
          const failed = job.assetIds.filter((id) => !succeeded.includes(id));
          rule.processed = [
            ...new Set([...(rule.processed || []), ...succeeded]),
          ];
          rule.failed = [
            ...new Set([
              ...(rule.failed || []).filter((id) => !succeeded.includes(id)),
              ...failed,
            ]),
          ];
          rule.lastError = failed.length
            ? job.error || "Alguns itens não foram concluídos."
            : null;
        }
      }
      await save();
    }
  } finally {
    processing = false;
  }
}
async function renderItem(job, entry, i, total, signal) {
  const dir = path.join(DATA, "exports", job.id);
  if (signal.aborted) throw Error("Processamento cancelado.");
  const a = db.assets.find((a) => a.id === entry.assetId);
  if (!a) throw Error("Arquivo de origem removido.");
  job.current = a.name;
  job.progress = Math.round((i / total) * 100);
  await save();
  const s = normalizeSettings({
    ...job.settings,
    ...job.overrides?.[a.id],
    ...(entry.start !== undefined
      ? { start: entry.start, end: entry.end }
      : {}),
  });
  for (const [key, type] of [
    ["watermarkId", "image"],
    ["audioId", "audio"],
    ["subtitleId", "subtitle"],
  ])
    if (
      s[key] &&
      !db.assets.some((asset) => asset.id === s[key] && asset.type === type)
    )
      throw Error(
        "Um arquivo usado no template não está mais disponível. Selecione novamente marca, áudio ou legenda.",
      );
  const stem = String(job.prefix || "copex")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 50);
  const base = `${stem}-${String(i + 1).padStart(3, "0")}`;
  const out = path.join(
    dir,
    base +
      (a.type === "video"
        ? ".mp4"
        : job.format === "jpeg"
          ? ".jpg"
          : job.format === "webp"
            ? ".webp"
            : ".png"),
  );
  let files;
  if (a.type === "video") {
    const wm = db.assets.find(
        (x) => x.id === s.watermarkId && x.type === "image",
      ),
      au = db.assets.find((x) => x.id === s.audioId && x.type === "audio");
    const sub = db.assets.find(
      (x) => x.id === s.subtitleId && x.type === "subtitle",
    );
    const duration = await renderVideo({
      input: assetPath(a),
      output: out,
      settings: s,
      duration: a.duration,
      hasAudio: a.hasAudio,
      watermark: wm && assetPath(wm),
      audio: au && assetPath(au),
      subtitle: sub && assetPath(sub),
      signal,
      onProgress: (p) => {
        job.progress = Math.round(((i + p / 100) / total) * 100);
      },
    });
    if (s.splitSeconds > 0 && duration > s.splitSeconds) {
      const splitDir = path.join(dir, base);
      await fs.mkdir(splitDir, { recursive: true });
      files = await splitVideo(out, splitDir, s.splitSeconds, duration, signal);
      await fs.unlink(out);
    } else files = [out];
  } else if (a.type === "image") {
    let im = sharp(assetPath(a))
      .rotate(s.rotation)
      .resize(s.width, s.height, {
        fit: s.fit === "cover" ? "cover" : "contain",
        background: "#000000",
      });
    if (s.mirror) im = im.flop();
    im = im.linear(s.contrast, 128 * (1 - s.contrast)).modulate({
      brightness: Math.max(0.05, 1 + s.brightness),
      saturation: s.saturation,
    });
    if (s.filter === "mono") im = im.grayscale();
    if (s.filter === "warm")
      im = im.recomb([
        [1.1, 0, 0],
        [0, 1, 0],
        [0, 0, 0.9],
      ]);
    if (s.filter === "cool")
      im = im.recomb([
        [0.92, 0, 0],
        [0, 1, 0],
        [0, 0, 1.12],
      ]);
    if (s.filter === "vintage")
      im = im.recomb([
        [0.393, 0.769, 0.189],
        [0.349, 0.686, 0.168],
        [0.272, 0.534, 0.131],
      ]);
    if (s.sharpen) im = im.sharpen();
    const layers = [];
    if (s.text) {
      const lines = s.text.split("\n");
      const textHeight = lines.length * s.fontSize * 1.18;
      const textWidth = Math.min(
        s.width - 40,
        Math.max(...lines.map((l) => l.length)) * s.fontSize * 0.65 + 36,
      );
      const y =
        s.textPosition === "top"
          ? s.height * 0.09
          : s.textPosition === "center"
            ? (s.height - textHeight) / 2
            : s.height * 0.84 - textHeight / 2;
      const elements = [];
      if (s.textBox)
        elements.push({
          type: "rect",
          x: (s.width - textWidth) / 2,
          y: y - 10,
          width: textWidth,
          height: textHeight + 20,
          color: "#000000",
          opacity: 0.48,
        });
      elements.push({
        type: "text",
        x: 20,
        y,
        width: s.width - 40,
        fontSize: s.fontSize,
        color: s.textColor,
        bold: true,
        align: "center",
        text: s.text,
        opacity: s.textOpacity,
      });
      layers.push({
        input: Buffer.from(
          templateSVG({
            width: s.width,
            height: s.height,
            background: "transparent",
            elements,
          }),
        ),
      });
    }
    const wm = db.assets.find(
      (x) => x.id === s.watermarkId && x.type === "image",
    );
    if (wm) {
      let b = await sharp(assetPath(wm))
        .resize({
          width: Math.round((s.width * s.watermarkSize) / 100),
          height: Math.round(s.height * 0.5),
          fit: "inside",
        })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      for (let p = 3; p < b.data.length; p += 4)
        b.data[p] = Math.round(b.data[p] * s.watermarkOpacity);
      const png = await sharp(b.data, { raw: b.info }).png().toBuffer();
      layers.push({
        input: png,
        gravity: s.watermarkPosition
          .replace("top", "north")
          .replace("bottom", "south")
          .replace("left", "west")
          .replace("right", "east")
          .replace("-", ""),
      });
    }
    if (layers.length) im = im.composite(layers);
    await im
      .toFormat(
        job.format === "jpeg" ? "jpeg" : job.format === "webp" ? "webp" : "png",
        { quality: 90 },
      )
      .toFile(out);
    files = [out];
  } else throw Error("Selecione imagens ou vídeos para exportar.");
  for (const f of files)
    job.outputs.push({
      itemIndex: i,
      name: path.relative(dir, f),
      url: `/media/exports/${job.id}/${path.relative(dir, f).split(path.sep).map(encodeURIComponent).join("/")}`,
      size: (await fs.stat(f)).size,
    });
}
async function processJob(job) {
  const dir = path.join(DATA, "exports", job.id);
  await fs.mkdir(dir, { recursive: true });
  job.outputs = [];
  const work = job.segments?.length
    ? job.segments
    : job.assetIds.map((assetId) => ({ assetId }));
  job.items = work.map((entry, index) => ({
    ...entry,
    index,
    name:
      db.assets.find((a) => a.id === entry.assetId)?.name || "Mídia removida",
    status: "queued",
  }));
  const controller = new AbortController();
  activeControllers.set(job.id, controller);
  try {
    for (let i = 0; i < work.length; i++) {
      if (job.status === "cancelled" || controller.signal.aborted) break;
      const item = job.items[i];
      item.status = "running";
      job.current = item.name;
      const previous = job.outputs.length;
      await save();
      try {
        await renderItem(job, work[i], i, work.length, controller.signal);
        if (controller.signal.aborted) throw Error("Processamento cancelado.");
        item.status = "done";
      } catch (error) {
        item.status =
          controller.signal.aborted || job.status === "cancelled"
            ? "cancelled"
            : "failed";
        item.error = error.message;
        job.outputs.splice(previous);
        const stem = String(job.prefix || "copex")
            .replace(/[^a-zA-Z0-9_-]/g, "_")
            .slice(0, 50),
          base = `${stem}-${String(i + 1).padStart(3, "0")}`;
        for (const filename of await fs.readdir(dir))
          if (filename === base || filename.startsWith(base + "."))
            await fs.rm(path.join(dir, filename), {
              recursive: true,
              force: true,
            });
      }
      job.progress = Math.round(((i + 1) / work.length) * 100);
      await save();
    }
  } finally {
    activeControllers.delete(job.id);
    job.stopping = false;
    if (job.status === "cancelled")
      for (const item of job.items)
        if (["queued", "running"].includes(item.status))
          item.status = "cancelled";
    const failed = job.items.filter((i) => i.status === "failed");
    if (failed.length)
      job.error =
        failed.length === job.items.length
          ? failed[0].error
          : `${failed.length} item(ns) não foram exportados. Os arquivos concluídos foram preservados.`;
    await save();
  }
}
async function enqueueJob(body) {
  if (
    !Array.isArray(body.assetIds) ||
    body.assetIds.some((id) => typeof id !== "string")
  )
    throw Error("Seleção de mídia inválida.");
  if (
    body.overrides !== undefined &&
    (!body.overrides ||
      typeof body.overrides !== "object" ||
      Array.isArray(body.overrides))
  )
    throw Error("Ajustes individuais inválidos.");
  const ids = [...new Set(body.assetIds)];
  if (!ids.length) throw Error("Selecione pelo menos um vídeo ou imagem.");
  if (
    ids.some(
      (id) =>
        !db.assets.some(
          (a) => a.id === id && ["video", "image"].includes(a.type),
        ),
    )
  )
    throw Error("Seleção contém mídia inválida.");
  const job = {
    id: randomUUID(),
    name: String(body.name || "Exportação em lote").slice(0, 100),
    assetIds: ids,
    settings: normalizeSettings(body.settings),
    overrides: body.overrides || {},
    format: ["png", "jpeg", "webp"].includes(body.format) ? body.format : "png",
    prefix: body.prefix || "copex",
    status: "queued",
    progress: 0,
    createdAt: new Date().toISOString(),
    outputs: [],
  };
  if (body.segments) {
    if (!Array.isArray(body.segments) || !body.segments.length)
      throw Error("Lista de trechos inválida.");
    job.segments = body.segments.map((segment) => {
      const asset = db.assets.find(
        (a) =>
          a.id === segment.assetId && ids.includes(a.id) && a.type === "video",
      );
      const start = Number(segment.start),
        end = Number(segment.end);
      if (
        !asset ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end <= start ||
        end > asset.duration + 0.05
      )
        throw Error("Intervalo de corte inválido.");
      return { assetId: asset.id, start, end };
    });
  }
  if (body.recipeId) job.recipeId = body.recipeId;
  db.jobs.unshift(job);
  await save();
  pump();
  return job;
}
app.post(
  "/api/jobs",
  wrap(async (req, res) => res.status(202).json(await enqueueJob(req.body))),
);
app.post(
  "/api/jobs/:id/cancel",
  wrap(async (req, res) => {
    const j = db.jobs.find((x) => x.id === req.params.id);
    if (!j) return res.sendStatus(404);
    if (["queued", "running"].includes(j.status)) {
      j.stopping = activeControllers.has(j.id);
      j.status = "cancelled";
      activeControllers.get(j.id)?.abort();
      await save();
    }
    res.json(j);
  }),
);
app.post(
  "/api/jobs/:id/retry-failed",
  wrap(async (req, res) => {
    const previous = db.jobs.find((j) => j.id === req.params.id);
    if (
      !previous ||
      !["partial", "failed", "cancelled"].includes(previous.status)
    )
      throw Error("Este lote não possui itens para repetir.");
    if (activeControllers.has(previous.id))
      throw Error("Aguarde a interrupção do processamento antes de repetir.");
    const pending =
      previous.items?.filter((item) => item.status !== "done") ||
      previous.assetIds.map((assetId) => ({ assetId }));
    if (!pending.length) throw Error("Todos os itens já foram concluídos.");
    const body = {
      ...previous,
      assetIds: [...new Set(pending.map((item) => item.assetId))],
      name: previous.name + " · nova tentativa",
    };
    if (previous.segments)
      body.segments = pending.map(({ assetId, start, end }) => ({
        assetId,
        start,
        end,
      }));
    else delete body.segments;
    res.status(202).json(await enqueueJob(body));
  }),
);
app.get(
  "/api/jobs/:id/download",
  wrap(async (req, res) => {
    const j = db.jobs.find((x) => x.id === req.params.id);
    if (
      !j ||
      !["done", "partial", "cancelled"].includes(j.status) ||
      !j.outputs?.length
    )
      return res.status(409).json({ error: "Exportação ainda não concluída." });
    res.attachment(`copex-${j.id.slice(0, 8)}.zip`);
    const zip = new ZipArchive({ zlib: { level: 1 } });
    zip.on("error", (e) => res.destroy(e));
    zip.pipe(res);
    for (const output of j.outputs)
      zip.file(path.join(DATA, "exports", j.id, output.name), {
        name: output.name,
      });
    await zip.finalize();
  }),
);
const activeDesignAssets = new Map();
registerDesigns({
  app,
  db,
  wrap,
  DATA,
  assetPath,
  activeAssets: activeDesignAssets,
});
app.get("/api/backup", (req, res) => {
  res.attachment("copex-configuracoes.json").json({
    version: 1,
    presets: db.presets,
    plans: db.plans,
    projects: db.projects,
    brand: db.brand,
    automations: db.automations,
    radarReports: db.radarReports,
    cutAnalyses: db.cutAnalyses,
    transcripts: db.transcripts,
    publications: db.publications,
    accounts: db.accounts,
  });
});
app.post(
  "/api/restore",
  wrap(async (req, res) => {
    const result = applyRestore(db, req.body);
    await save();
    res.json({ ok: true, ...result });
  }),
);
registerTemplates({ app, db, save, wrap, DATA, assetPath, ingest });
registerLibrary({ app, db, save, wrap, assetPath, DATA, activeDesignAssets });
async function resolveMedia(reference) {
  if (reference?.assetId) {
    const a = db.assets.find((a) => a.id === reference.assetId);
    if (!a) throw Error("Mídia não encontrada.");
    return { ...a, file: assetPath(a), url: "/media/uploads/" + a.file };
  }
  const job = db.jobs.find(
    (j) => j.id === reference?.jobId && ["done", "partial"].includes(j.status),
  );
  const output = job?.outputs[Number(reference?.outputIndex) || 0];
  if (!output) throw Error("Exportação concluída não encontrada.");
  const file = path.join(DATA, "exports", job.id, output.name);
  return {
    file,
    url: output.url,
    size: (await fs.stat(file)).size,
    type: output.name.endsWith(".mp4") ? "video" : "image",
    duration: Number((await probe(file)).format.duration) || 0,
  };
}
await registerAdvanced({
  app,
  db,
  save,
  wrap,
  ROOT,
  DATA,
  ingest,
  assetPath,
  enqueue: enqueueJob,
});
const social = await registerSocial({
  app,
  db,
  save,
  wrap,
  DATA,
  assetPath,
  resolveMedia,
  createPublicMediaUrl,
});
async function runRecipe(rule, manual = false) {
  const processed = rule.processed || [],
    failed = rule.failed || [];
  const inFlight = db.jobs
    .filter(
      (j) => j.recipeId === rule.id && ["queued", "running"].includes(j.status),
    )
    .flatMap((j) => j.assetIds);
  const ids = db.assets
    .filter(
      (a) =>
        a.type === rule.type &&
        !processed.includes(a.id) &&
        !inFlight.includes(a.id) &&
        (manual || !failed.includes(a.id)),
    )
    .map((a) => a.id);
  if (!ids.length) return null;
  const job = await enqueueJob({
    name: rule.name,
    assetIds: ids,
    settings: rule.settings,
    format: rule.settings?.imageFormat || "png",
    prefix: rule.settings?.prefix || "copex",
    recipeId: rule.id,
  });
  rule.lastRun = new Date().toISOString();
  rule.lastJobId = job.id;
  await save();
  return job;
}
app.post(
  "/api/automations/:id/run",
  wrap(async (req, res) => {
    const rule = db.automations.find((r) => r.id === req.params.id);
    if (!rule) throw Error("Receita não encontrada.");
    const job = await runRecipe(rule, true);
    res.json({
      job,
      message: job ? "Processamento iniciado." : "Nenhuma mídia nova.",
    });
  }),
);
let scanning = false;
const recipesTimer = setInterval(async () => {
  if (scanning) return;
  scanning = true;
  try {
    for (const rule of db.automations.filter((r) => r.enabled))
      await runRecipe(rule);
  } catch (e) {
    console.error("Receitas:", e.message);
  } finally {
    scanning = false;
  }
}, 10000);
recipesTimer.unref();
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Rota não encontrada." }),
);
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(ROOT, "dist")));
  app.get("/{*splat}", (req, res) =>
    res.sendFile(path.join(ROOT, "dist", "index.html")),
  );
}
app.use((err, req, res, next) => {
  console.error(err.message);
  if (res.headersSent) return res.destroy(err);
  res
    .status(err instanceof multer.MulterError ? 413 : 400)
    .json({ error: err.message || "Não foi possível concluir a operação." });
});
const server = app.listen(Number(process.env.PORT) || 3001, "0.0.0.0", () =>
  console.log("Copex API pronta na porta " + (process.env.PORT || 3001)),
);
await save();
process.on("SIGTERM", () => {
  social.close();
  clearInterval(recipesTimer);
  server.close(() => process.exit(0));
});
