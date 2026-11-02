import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { run } from "./media.js";
import { analyzeCuts } from "./cuts.js";
import { readRadarData, rankEntries } from "../shared/radar.js";
import { segmentsToSRT, groupWords } from "../shared/captions.js";
const hosts = [
  "tiktok.com",
  "www.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
  "instagram.com",
  "www.instagram.com",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
];
export function mediaUrl(raw) {
  const u = new URL(String(raw));
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !hosts.includes(u.hostname) ||
    u.pathname === "/"
  )
    throw Error(
      "Use uma URL HTTPS de vídeo ou perfil do TikTok, Instagram ou YouTube.",
    );
  return u.toString();
}
export async function registerAdvanced({
  app,
  db,
  save,
  wrap,
  ROOT,
  DATA,
  ingest,
  assetPath,
  enqueue,
}) {
  for (const collection of [
    "radarReports",
    "cutAnalyses",
    "transcripts",
    "operations",
  ])
    db[collection] ||= [];
  for (const collection of [
    "radarReports",
    "cutAnalyses",
    "transcripts",
    "operations",
  ])
    for (const item of db[collection])
      if (["queued", "running"].includes(item.status)) {
        item.status = "failed";
        item.error = "O servidor reiniciou. Inicie a operação novamente.";
      }
  const python = path.join(ROOT, ".tools", "bin", "python"),
    ytdlp = path.join(ROOT, ".tools", "bin", "yt-dlp"),
    model =
      process.env.WHISPER_MODEL_PATH || path.join(DATA, "models", "whisper");
  let active = false;
  const queue = [];
  const exists = async (p) =>
    fs.access(p).then(
      () => true,
      () => false,
    );
  let engineReady = false;
  try {
    await run(python, ["-c", "import faster_whisper"]);
    engineReady = true;
  } catch {}
  const modelReady = async () => {
    const checks = await Promise.all(
      ["model.bin", "config.json", "tokenizer.json"].map((name) =>
        exists(path.join(model, name)),
      ),
    );
    return checks.every(Boolean);
  };
  async function installationStatus() {
    try {
      const info = JSON.parse(
        await fs.readFile(model + ".status.json", "utf8"),
      );
      if (info.state === "downloading") {
        let alive = true;
        try {
          process.kill(Number(info.pid), 0);
        } catch (e) {
          alive = e.code === "EPERM";
        }
        if (!alive)
          return {
            state: "failed",
            error: "A instalação foi interrompida. Tente instalar novamente.",
          };
      }
      return {
        state: info.state,
        model: info.model,
        error: info.error || null,
      };
    } catch {
      return null;
    }
  }
  async function capabilities() {
    return {
      transcription: {
        engineInstalled: engineReady,
        modelReady: await modelReady(),
        installation: await installationStatus(),
        modelSource: "Systran/faster-whisper-tiny",
        languages: ["pt", "en", "es", "auto"],
      },
      downloader: await exists(ytdlp),
    };
  }
  async function dispatch(record, fn) {
    queue.push({ record, fn });
    drain();
  }
  async function drain() {
    if (active) return;
    active = true;
    try {
      while (queue.length) {
        const { record, fn } = queue.shift();
        record.status = "running";
        record.startedAt = new Date().toISOString();
        await save();
        try {
          await fn();
          record.status = record.failures?.length
            ? record.completed
              ? "partial"
              : "failed"
            : "done";
          record.finishedAt = new Date().toISOString();
        } catch (e) {
          record.status = "failed";
          record.error = String(e.message || e).slice(-1200);
        }
        await save();
      }
    } finally {
      active = false;
    }
  }
  app.get(
    "/api/capabilities",
    wrap(async (req, res) => res.json(await capabilities())),
  );
  app.post(
    "/api/radar/import",
    wrap(async (req, res) => {
      const entries = readRadarData(
        String(req.body.content || ""),
        req.body.format,
      );
      const report = {
        id: randomUUID(),
        name: String(req.body.name || "Métricas importadas").slice(0, 120),
        source: "file",
        status: "done",
        entries: rankEntries(entries),
        createdAt: new Date().toISOString(),
      };
      db.radarReports.unshift(report);
      await save();
      res.status(201).json(report);
    }),
  );
  app.post(
    "/api/radar/analyze",
    wrap(async (req, res) => {
      const url = mediaUrl(req.body.url);
      if (!(await exists(ytdlp)))
        throw Error("Instale yt-dlp para analisar perfis públicos.");
      const limit = Math.max(
        1,
        Math.min(1000, Math.round(Number(req.body.maxResults) || 30)),
      );
      const report = {
        id: randomUUID(),
        name: String(req.body.name || url).slice(0, 120),
        url,
        source: "profile",
        status: "queued",
        entries: [],
        createdAt: new Date().toISOString(),
      };
      db.radarReports.unshift(report);
      await save();
      res.status(202).json(report);
      dispatch(report, async () => {
        let output = "";
        try {
          await run(
            ytdlp,
            [
              "--dump-json",
              "--skip-download",
              "--no-warnings",
              "--ignore-errors",
              "--playlist-end",
              String(limit),
              "--socket-timeout",
              "20",
              "--retries",
              "1",
              "--",
              url,
            ],
            (line) => {
              output += line;
            },
          );
        } catch {
          throw Error(
            "Não foi possível analisar o perfil. Verifique acesso de rede e se o perfil é público; a plataforma pode exigir autorização. Você também pode importar CSV ou JSON com métricas.",
          );
        }
        const lines = output
          .split(/\r?\n/)
          .filter((l) => l.trim().startsWith("{"));
        if (!lines.length)
          throw Error(
            "O perfil não retornou vídeos públicos. Importe métricas CSV/JSON ou tente um link de vídeo.",
          );
        report.entries = rankEntries(readRadarData(lines.join("\n")));
      });
    }),
  );
  app.delete(
    "/api/radar/:id",
    wrap(async (req, res) => {
      const report = db.radarReports.find((r) => r.id === req.params.id);
      if (report && ["queued", "running"].includes(report.status))
        throw Error("A análise ainda está em andamento.");
      db.radarReports = db.radarReports.filter((r) => r.id !== req.params.id);
      await save();
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/radar/:id/download",
    wrap(async (req, res) => {
      const report = db.radarReports.find((r) => r.id === req.params.id);
      if (!report) throw Error("Análise não encontrada.");
      const ids = new Set(req.body.entryIds || []),
        entries = report.entries.filter((e) => ids.has(e.id) && e.url);
      if (!entries.length) throw Error("Selecione vídeos com URLs válidas.");
      entries.forEach((e) => mediaUrl(e.url));
      const task = {
        id: randomUUID(),
        kind: "radar-download",
        name: "Importação do radar",
        status: "queued",
        completed: 0,
        total: entries.length,
        failures: [],
        createdAt: new Date().toISOString(),
      };
      db.operations.unshift(task);
      await save();
      res.status(202).json(task);
      dispatch(task, async () => {
        for (const entry of entries) {
          if (
            req.body.skipDuplicates !== false &&
            db.assets.some(
              (a) => a.source?.id === entry.id && a.source?.url === entry.url,
            )
          ) {
            task.completed++;
            await save();
            continue;
          }
          const dir = path.join(DATA, "tmp", randomUUID());
          await fs.mkdir(dir, { recursive: true });
          try {
            await run(ytdlp, [
              "--no-playlist",
              "--no-progress",
              "--socket-timeout",
              "20",
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
              entry.url,
            ]);
            const files = (await fs.readdir(dir)).filter(
              (f) => !f.endsWith(".part") && !f.endsWith(".ytdl"),
            );
            if (!files.length) throw Error("Nenhum arquivo recebido.");
            for (const file of files) {
              const filename = path.join(dir, file),
                a = await ingest({
                  path: filename,
                  originalname: file,
                  size: (await fs.stat(filename)).size,
                });
              a.source = entry;
            }
            task.completed++;
          } catch {
            task.failures.push({
              id: entry.id,
              title: entry.title,
              error:
                "Download indisponível. Verifique a rede e as permissões do vídeo.",
            });
          } finally {
            await fs.rm(dir, { recursive: true, force: true });
            await save();
          }
        }
      });
    }),
  );
  app.post(
    "/api/cuts/analyze",
    wrap(async (req, res) => {
      const a = db.assets.find(
        (a) => a.id === req.body.assetId && a.type === "video",
      );
      if (!a) throw Error("Selecione um vídeo da biblioteca.");
      const options = {
        minDuration: Math.max(1, Number(req.body.minDuration) || 15),
        maxDuration: Math.max(1, Number(req.body.maxDuration) || 60),
        targetDuration: Math.max(1, Number(req.body.targetDuration) || 30),
      };
      if (options.minDuration > options.maxDuration)
        throw Error("Duração mínima deve ser menor que a máxima.");
      const record = {
        id: randomUUID(),
        assetId: a.id,
        name: a.name,
        status: "queued",
        options,
        cuts: [],
        createdAt: new Date().toISOString(),
      };
      db.cutAnalyses.unshift(record);
      await save();
      res.status(202).json(record);
      dispatch(record, async () => {
        Object.assign(
          record,
          await analyzeCuts(assetPath(a), a.duration, a.hasAudio, options),
        );
      });
    }),
  );
  app.post(
    "/api/cuts/:id/export",
    wrap(async (req, res) => {
      const analysis = db.cutAnalyses.find(
        (a) => a.id === req.params.id && a.status === "done",
      );
      if (!analysis) throw Error("Análise não concluída.");
      const ids = new Set(req.body.cutIds || []),
        cuts = analysis.cuts.filter((c) => ids.has(c.id));
      if (!cuts.length) throw Error("Selecione pelo menos um trecho.");
      const job = await enqueue({
        name: "Cortes · " + analysis.name,
        assetIds: [analysis.assetId],
        settings: req.body.settings || { width: 1080, height: 1920 },
        segments: cuts.map((c) => ({
          assetId: analysis.assetId,
          start: req.body.edits?.[c.id]?.start ?? c.start,
          end: req.body.edits?.[c.id]?.end ?? c.end,
        })),
        prefix: "corte",
      });
      res.status(202).json(job);
    }),
  );
  app.post(
    "/api/transcription/model/install",
    wrap(async (req, res) => {
      if (!engineReady)
        throw Error("Instale as ferramentas Python conforme o README.");
      const existing = db.operations.find(
        (t) =>
          t.kind === "model-install" &&
          ["queued", "running"].includes(t.status),
      );
      if (existing) return res.status(202).json(existing);
      const installing = await installationStatus();
      if (installing?.state === "downloading")
        return res.status(202).json({
          kind: "model-install",
          status: "running",
          message: "O modelo já está sendo preparado.",
        });
      if (await modelReady())
        return res.json({ status: "done", message: "Modelo já disponível." });
      const task = {
        id: randomUUID(),
        kind: "model-install",
        name: "Instalação do modelo Whisper tiny",
        status: "queued",
        createdAt: new Date().toISOString(),
      };
      db.operations.unshift(task);
      await save();
      res.status(202).json(task);
      dispatch(task, async () => {
        try {
          await run(python, [
            path.join(ROOT, "scripts", "install-model.py"),
            "--destination",
            model,
          ]);
        } catch {
          throw Error(
            "O modelo não pôde ser baixado da Hugging Face. Libere huggingface.co e seus servidores de arquivos na rede ou instale o modelo manualmente conforme o README. Nenhuma transcrição foi realizada.",
          );
        }
      });
    }),
  );
  app.post(
    "/api/transcripts",
    wrap(async (req, res) => {
      const a = db.assets.find(
        (a) => a.id === req.body.assetId && ["video", "audio"].includes(a.type),
      );
      if (!a || (a.type === "video" && !a.hasAudio))
        throw Error("Selecione áudio ou um vídeo que contenha fala.");
      const cap = await capabilities();
      if (!cap.transcription.engineInstalled || !cap.transcription.modelReady)
        return res.status(409).json({
          error:
            "O modelo de voz ainda não está disponível. Instale-o na seção Legendas antes de transcrever.",
        });
      const language = ["pt", "en", "es", "auto"].includes(req.body.language)
        ? req.body.language
        : "pt";
      const record = {
        id: randomUUID(),
        assetId: a.id,
        name: a.name,
        status: "queued",
        language,
        progress: 0,
        createdAt: new Date().toISOString(),
      };
      db.transcripts.unshift(record);
      await save();
      res.status(202).json(record);
      dispatch(record, async () => {
        const output = path.join(DATA, "tmp", record.id + ".json");
        try {
          await run(
            python,
            [
              path.join(ROOT, "scripts", "transcribe.py"),
              "--input",
              assetPath(a),
              "--model",
              model,
              "--output",
              output,
              "--language",
              language,
            ],
            (line) => {
              for (const m of line.matchAll(/"end":\s*([\d.]+)/g))
                record.progress = Math.min(
                  99,
                  Math.round((Number(m[1]) / Math.max(1, a.duration)) * 100),
                );
            },
          );
          const result = JSON.parse(await fs.readFile(output, "utf8"));
          record.segments = groupWords(result.segments);
          if (!record.segments.length)
            throw Error("Nenhuma fala reconhecida neste arquivo.");
          record.language = result.language;
          const content = segmentsToSRT(record.segments),
            filename = path.join(DATA, "tmp", record.id + ".srt");
          await fs.writeFile(filename, content);
          const subtitle = await ingest({
            path: filename,
            originalname: a.name.replace(/\.[^.]+$/, "") + ".srt",
            size: Buffer.byteLength(content),
          });
          record.subtitleId = subtitle.id;
          record.progress = 100;
        } finally {
          await fs.unlink(output).catch(() => {});
        }
      });
    }),
  );
  app.get(
    "/api/transcripts/:id",
    wrap(async (req, res) => {
      const record = db.transcripts.find((t) => t.id === req.params.id);
      if (!record) return res.sendStatus(404);
      res.json(record);
    }),
  );
  app.put(
    "/api/transcripts/:id",
    wrap(async (req, res) => {
      const record = db.transcripts.find(
        (t) => t.id === req.params.id && t.status === "done",
      );
      if (!record) throw Error("Transcrição não disponível.");
      const srt = segmentsToSRT(req.body.segments);
      const subtitle = db.assets.find((a) => a.id === record.subtitleId);
      if (!subtitle) throw Error("Arquivo de legendas removido.");
      const tmp = assetPath(subtitle) + ".tmp";
      await fs.writeFile(tmp, srt);
      await fs.rename(tmp, assetPath(subtitle));
      subtitle.size = Buffer.byteLength(srt);
      record.segments = req.body.segments.map((s) => ({
        start: Number(s.start),
        end: Number(s.end),
        text: String(s.text).trim(),
      }));
      await save();
      res.json(record);
    }),
  );
  await save();
  return { capabilities };
}
