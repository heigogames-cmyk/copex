import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { defaults } from "./media-defaults.js";
export { defaults };
export function run(bin, args, onLine, { signal, cwd } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted)
      return reject(
        Object.assign(Error("Processamento cancelado."), {
          name: "AbortError",
        }),
      );
    let output = "",
      killTimer;
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], cwd });
    const abort = () => {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 1500);
      killTimer.unref();
    };
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      clearTimeout(killTimer);
    };
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (d) => {
      output += d;
      onLine?.(String(d));
    });
    child.stderr.on("data", (d) => {
      output += d;
      if (output.length > 60000) output = output.slice(-60000);
      onLine?.(String(d));
    });
    child.on("error", (e) => {
      cleanup();
      reject(e);
    });
    child.on("close", (code) => {
      cleanup();
      if (signal?.aborted)
        return reject(
          Object.assign(Error("Processamento cancelado."), {
            name: "AbortError",
          }),
        );
      code === 0
        ? resolve(output)
        : reject(Error(`${bin}: ${output.slice(-2500)}`));
    });
  });
}
export async function probe(file) {
  return JSON.parse(
    await run("ffprobe", [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      file,
    ]),
  );
}
const bounded = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
export function normalizeSettings(raw = {}) {
  const s = {
    ...defaults,
    ...Object.fromEntries(
      Object.entries(raw || {}).filter(
        ([key]) =>
          Object.hasOwn(defaults, key) ||
          ["imageFormat", "prefix"].includes(key),
      ),
    ),
  };
  for (const [k, min, max] of [
    ["width", 128, 3840],
    ["height", 128, 3840],
    ["start", 0, 86400],
    ["end", 0, 86400],
    ["speed", 0.25, 4],
    ["brightness", -1, 1],
    ["contrast", 0.1, 3],
    ["saturation", 0, 3],
    ["volume", 0, 3],
    ["audioVolume", 0, 2],
    ["fadeIn", 0, 10],
    ["fadeOut", 0, 10],
    ["crf", 16, 35],
    ["fps", 12, 60],
    ["fontSize", 12, 240],
    ["textOpacity", 0, 1],
    ["watermarkOpacity", 0, 1],
    ["watermarkSize", 5, 60],
    ["splitSeconds", 0, 3600],
  ])
    s[k] = bounded(s[k], min, max, defaults[k]);
  s.width = Math.round(s.width / 2) * 2;
  s.height = Math.round(s.height / 2) * 2;
  s.fps = Math.round(s.fps);
  s.crf = Math.round(s.crf);
  for (const [key, value] of Object.entries(defaults))
    if (typeof value === "boolean")
      s[key] = typeof s[key] === "boolean" ? s[key] : value;
  for (const key of ["watermarkId", "audioId", "subtitleId"])
    s[key] = typeof s[key] === "string" ? s[key].trim().slice(0, 120) : "";
  s.filter = ["none", "mono", "warm", "cool", "vintage"].includes(s.filter)
    ? s.filter
    : "none";
  if (s.imageFormat !== undefined)
    s.imageFormat = ["png", "jpeg", "webp"].includes(s.imageFormat)
      ? s.imageFormat
      : "png";
  if (s.prefix !== undefined)
    s.prefix = typeof s.prefix === "string" ? s.prefix.slice(0, 50) : "copex";
  s.text = String(s.text || "").slice(0, 2000);
  s.fit = ["cover", "contain"].includes(s.fit) ? s.fit : "cover";
  s.rotation = [0, 90, 180, 270].includes(Number(s.rotation))
    ? Number(s.rotation)
    : 0;
  s.textColor = /^#[a-f0-9]{6}$/i.test(s.textColor) ? s.textColor : "#ffffff";
  s.textPosition = ["top", "center", "bottom"].includes(s.textPosition)
    ? s.textPosition
    : "bottom";
  s.watermarkPosition = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ].includes(s.watermarkPosition)
    ? s.watermarkPosition
    : "top-right";
  return s;
}
function atempo(rate) {
  const filters = [];
  while (rate > 2) {
    filters.push("atempo=2");
    rate /= 2;
  }
  while (rate < 0.5) {
    filters.push("atempo=0.5");
    rate /= 0.5;
  }
  filters.push(`atempo=${rate}`);
  return filters.join(",");
}
export async function renderVideo({
  input,
  output,
  settings,
  duration,
  hasAudio,
  watermark,
  audio,
  subtitle,
  onProgress,
  signal,
}) {
  input = path.resolve(input);
  output = path.resolve(output);
  if (watermark) watermark = path.resolve(watermark);
  if (audio) audio = path.resolve(audio);
  if (subtitle) subtitle = path.resolve(subtitle);
  const s = normalizeSettings(settings);
  const end = s.end > 0 ? Math.min(s.end, duration) : duration;
  if (s.start >= end)
    throw Error("O início do corte precisa ser menor que o fim do vídeo.");
  const outDuration = (end - s.start) / s.speed;
  const args = [
    "-hide_banner",
    "-y",
    "-ss",
    String(s.start),
    "-t",
    String(end - s.start),
    "-i",
    input,
  ];
  let index = 1,
    waterIndex,
    audioIndex;
  if (watermark) {
    waterIndex = index++;
    args.push("-i", watermark);
  }
  if (audio) {
    audioIndex = index++;
    args.push("-stream_loop", "-1", "-i", audio);
  }
  let filters = [];
  if (s.rotation === 90) filters.push("transpose=1");
  if (s.rotation === 270) filters.push("transpose=2");
  if (s.rotation === 180) filters.push("hflip", "vflip");
  if (s.mirror) filters.push("hflip");
  filters.push(
    s.fit === "cover"
      ? `scale=${s.width}:${s.height}:force_original_aspect_ratio=increase,crop=${s.width}:${s.height}`
      : `scale=${s.width}:${s.height}:force_original_aspect_ratio=decrease,pad=${s.width}:${s.height}:(ow-iw)/2:(oh-ih)/2:color=black`,
  );
  filters.push(
    "setsar=1",
    `setpts=(PTS-STARTPTS)/${s.speed}`,
    `fps=${s.fps}`,
    `eq=brightness=${s.brightness}:contrast=${s.contrast}:saturation=${s.saturation}`,
  );
  if (s.denoise) filters.push("hqdn3d=1.5:1.5:6:6");
  if (s.sharpen) filters.push("unsharp=5:5:0.6:5:5:0");
  if (s.filter === "mono") filters.push("hue=s=0");
  if (s.filter === "warm") filters.push("colorbalance=rs=.12:bs=-.1");
  if (s.filter === "cool") filters.push("colorbalance=rs=-.08:bs=.12");
  if (s.filter === "vintage") filters.push("curves=preset=vintage");
  if (s.fadeIn > 0)
    filters.push(`fade=t=in:st=0:d=${Math.min(s.fadeIn, outDuration)}`);
  if (s.fadeOut > 0)
    filters.push(
      `fade=t=out:st=${Math.max(0, outDuration - s.fadeOut)}:d=${Math.min(s.fadeOut, outDuration)}`,
    );
  let subtitleFile;
  if (subtitle) {
    subtitleFile = path.join(
      path.dirname(output),
      ".copex-" + randomUUID() + ".srt",
    );
    const retimed = retimeSRT(
      await fs.readFile(subtitle, "utf8"),
      s.start,
      end,
      s.speed,
    );
    await fs.writeFile(subtitleFile, retimed);
    if (retimed.trim())
      filters.push(
        `subtitles=filename='${path.basename(subtitleFile)}':force_style='FontName=DejaVu Sans,FontSize=20,Outline=2,Alignment=2,MarginV=25'`,
      );
  }
  let textFile;
  if (s.text) {
    textFile = path.join(
      path.dirname(output),
      ".copex-" + randomUUID() + ".txt",
    );
    await fs.writeFile(textFile, s.text);
    const y =
      s.textPosition === "top"
        ? "h*0.09"
        : s.textPosition === "center"
          ? "(h-text_h)/2"
          : "h*0.84-text_h/2";
    filters.push(
      `drawtext=textfile='${path.basename(textFile)}':expansion=none:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:fontsize=${s.fontSize}:fontcolor=${s.textColor.replace("#", "0x")}@${s.textOpacity}:x=(w-text_w)/2:y=${y}:line_spacing=12${s.textBox ? ":box=1:boxcolor=black@0.48:boxborderw=18" : ":shadowcolor=black@0.6:shadowx=2:shadowy=2"}`,
    );
  }
  let graph = `[0:v]${filters.join(",")}[base]`;
  let v = "base";
  if (watermark) {
    const ww = Math.round((s.width * s.watermarkSize) / 100);
    const x = s.watermarkPosition.endsWith("right") ? "W-w-30" : "30";
    const y = s.watermarkPosition.startsWith("bottom") ? "H-h-30" : "30";
    graph += `;[${waterIndex}:v]scale=${ww}:-1,format=rgba,colorchannelmixer=aa=${s.watermarkOpacity}[wm];[base][wm]overlay=${x}:${y}[video]`;
    v = "video";
  }
  let a = "";
  const af = `${atempo(s.speed)},volume=${s.mute ? 0 : s.volume}${s.normalizeAudio ? ",loudnorm=I=-16:TP=-1.5:LRA=11" : ""},asetpts=PTS-STARTPTS`;
  if (hasAudio && !s.mute) {
    graph += `;[0:a]${af}[original]`;
    a = "original";
  }
  if (audio) {
    graph += `;[${audioIndex}:a]volume=${s.audioVolume},atrim=duration=${outDuration},asetpts=PTS-STARTPTS[music]`;
    if (a) {
      graph +=
        ";[original][music]amix=inputs=2:duration=longest:normalize=0[mixed]";
      a = "mixed";
    } else a = "music";
  }
  args.push(
    "-filter_complex_threads",
    "1",
    "-filter_complex",
    graph,
    "-map",
    `[${v}]`,
  );
  if (a) args.push("-map", `[${a}]`, "-c:a", "aac", "-b:a", "192k");
  else args.push("-an");
  args.push(
    "-t",
    String(outDuration),
    "-c:v",
    "libx264",
    "-threads",
    "2",
    "-preset",
    "veryfast",
    "-crf",
    String(s.crf),
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    output,
  );
  try {
    await run(
      "ffmpeg",
      args,
      (line) => {
        const matches = [...line.matchAll(/out_time_us=(\d+)/g)];
        if (matches.length)
          onProgress?.(
            Math.min(
              99,
              Math.round((Number(matches.at(-1)[1]) / 1e6 / outDuration) * 100),
            ),
          );
      },
      { signal, cwd: path.dirname(output) },
    );
  } finally {
    if (textFile) await fs.unlink(textFile).catch(() => {});
    if (subtitleFile) await fs.unlink(subtitleFile).catch(() => {});
  }
  return outDuration;
}
export async function splitVideo(input, dir, seconds, duration, signal) {
  const outputs = [];
  for (let start = 0, i = 1; start < duration; start += seconds, i++) {
    const out = path.join(dir, `parte-${String(i).padStart(3, "0")}.mp4`);
    await run(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-ss",
        String(start),
        "-i",
        input,
        "-t",
        String(Math.min(seconds, duration - start)),
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        out,
      ],
      undefined,
      { signal },
    );
    outputs.push(out);
  }
  return outputs;
}

export function parseSRT(text) {
  const blocks = String(text)
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .trim()
    .split(/\n\s*\n/);
  const result = [];
  const seconds = (t) => {
    const [h, m, s] = t.replace(",", ".").split(":").map(Number);
    if (
      !Number.isFinite(h) ||
      !Number.isFinite(m) ||
      !Number.isFinite(s) ||
      m > 59 ||
      s >= 60
    )
      throw Error("Timestamp SRT inválido.");
    return h * 3600 + m * 60 + s;
  };
  for (const block of blocks) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const match = lines[i].match(
      /(\d{2,}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2,}:\d{2}:\d{2}[,.]\d{3})/,
    );
    if (!match) throw Error("Timestamp SRT inválido.");
    const start = seconds(match[1]),
      end = seconds(match[2]);
    if (end <= start) throw Error("Intervalo SRT inválido.");
    const caption = lines
      .slice(i + 1)
      .join("\n")
      .replace(/<[^>]+>/g, "");
    if (caption) result.push({ start, end, text: caption });
  }
  if (!result.length)
    throw Error("Nenhuma legenda válida encontrada no arquivo SRT.");
  return result.sort((a, b) => a.start - b.start || a.end - b.end);
}
export function retimeSRT(text, start, end, speed) {
  const stamp = (seconds) => {
    const ms = Math.max(0, Math.round(seconds * 1000));
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  return (
    parseSRT(text)
      .filter((c) => c.end > start && c.start < end)
      .map(
        (c, i) =>
          `${i + 1}\n${stamp((Math.max(c.start, start) - start) / speed)} --> ${stamp((Math.min(c.end, end) - start) / speed)}\n${c.text}`,
      )
      .join("\n\n") + "\n"
  );
}
