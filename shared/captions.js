export function timestamp(seconds) {
  const ms = Math.max(0, Math.round(Number(seconds) * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}
export function segmentsToSRT(segments) {
  if (!Array.isArray(segments) || !segments.length)
    throw Error("Nenhuma fala reconhecida.");
  let prev = -1;
  return (
    segments
      .map((s, i) => {
        const start = Number(s.start),
          end = Number(s.end),
          text = String(s.text || "").trim();
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          start < 0 ||
          end <= start ||
          start < prev ||
          !text
        )
          throw Error(
            `Legenda ${i + 1} inválida. Confira tempos, ordem e texto.`,
          );
        prev = start;
        return `${i + 1}\n${timestamp(start)} --> ${timestamp(end)}\n${text}`;
      })
      .join("\n\n") + "\n"
  );
}
export function groupWords(segments, { maxWords = 7, maxSeconds = 4 } = {}) {
  const output = [];
  for (const s of segments) {
    if (!s.words?.length) {
      output.push({ start: s.start, end: s.end, text: s.text });
      continue;
    }
    let group = [];
    const flush = () => {
      if (group.length)
        output.push({
          start: group[0].start,
          end: group.at(-1).end,
          text: group
            .map((w) => w.word)
            .join("")
            .trim(),
        });
      group = [];
    };
    for (const word of s.words) {
      if (
        group.length &&
        (group.length >= maxWords || word.end - group[0].start > maxSeconds)
      )
        flush();
      group.push(word);
      if (/[.!?]\s*$/.test(word.word)) flush();
    }
    flush();
  }
  return output;
}
