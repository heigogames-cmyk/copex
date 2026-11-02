import { run } from "./media.js";
export function parseSignals(log, duration) {
  const scenes = [...log.matchAll(/pts_time:([\d.]+)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n > 0 && n < duration);
  const starts = [...log.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) =>
    Number(m[1]),
  );
  const ends = [...log.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) =>
    Number(m[1]),
  );
  const silences = starts
    .map((s, i) => ({ start: s, end: ends.find((e) => e > s) ?? duration }))
    .filter((x) => x.end > x.start);
  return { scenes: [...new Set(scenes)], silences };
}
export function suggestCuts(duration, signals, options = {}) {
  const min = Math.max(1, Number(options.minDuration) || 15),
    max = Math.max(min, Number(options.maxDuration) || 60),
    target = Math.min(max, Math.max(min, Number(options.targetDuration) || 30));
  if (duration < min)
    return [
      {
        id: "cut-1",
        start: 0,
        end: duration,
        score: 0,
        reason: "Vídeo menor que a duração mínima; conteúdo completo.",
      },
    ];
  const cuts = [];
  let start = 0;
  while (start + min <= duration) {
    const lower = start + min,
      upper = Math.min(start + max, duration),
      desired = Math.min(start + target, upper);
    const candidates = [
      ...signals.silences.map((s) => (s.start + s.end) / 2),
      ...signals.scenes,
      duration,
    ].filter((t) => t >= lower && t <= upper);
    const end = candidates.length
      ? candidates.reduce((a, b) =>
          Math.abs(a - desired) < Math.abs(b - desired) ? a : b,
        )
      : desired;
    const clipSilence = signals.silences.reduce(
      (n, s) =>
        n + Math.max(0, Math.min(s.end, end) - Math.max(s.start, start)),
      0,
    );
    const density =
      signals.scenes.filter((t) => t > start && t < end).length / (end - start);
    const score = Math.round(
      100 *
        (0.7 * Math.max(0, 1 - clipSilence / (end - start)) +
          0.3 * Math.min(1, density / 0.2)),
    );
    const nearSilence = signals.silences.some(
      (s) => end >= s.start && end <= s.end,
    );
    cuts.push({
      id: `cut-${cuts.length + 1}`,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      score,
      reason: nearSilence
        ? "Corte em pausa detectada."
        : signals.scenes.some((t) => Math.abs(t - end) < 0.05)
          ? "Corte em mudança de cena."
          : "Corte por duração; sem transição próxima.",
    });
    start = end;
  }
  if (duration - start >= 1 && cuts.length) {
    const last = cuts.at(-1);
    if (duration - last.start <= max) last.end = duration;
    else
      cuts.push({
        id: `cut-${cuts.length + 1}`,
        start,
        end: duration,
        score: 0,
        reason: "Trecho final do vídeo.",
      });
  }
  return cuts;
}
export async function analyzeCuts(input, duration, hasAudio, options = {}) {
  const scene = Number(options.sceneThreshold) || 0.3;
  const args = [
    "-hide_banner",
    "-i",
    input,
    "-vf",
    `scale=320:-2,select=gt(scene\\,${Math.max(0.05, Math.min(0.9, scene))}),showinfo`,
  ];
  if (hasAudio) args.push("-af", "silencedetect=noise=-35dB:d=0.4");
  args.push("-f", "null", "-");
  let log = "";
  await run("ffmpeg", args, (line) => {
    log += line;
  });
  const signals = parseSignals(log, duration);
  return { signals, cuts: suggestCuts(duration, signals, options) };
}
