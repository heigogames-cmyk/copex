export function zonedLocalToISO(value, zone = "America/Sao_Paulo") {
  const match = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/,
  );
  if (!match) throw Error("Informe data e horário completos.");
  const [, y, m, d, h, min] = match.map(Number),
    local = Date.UTC(y, m - 1, d, h, min);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = (t) =>
    Object.fromEntries(
      formatter.formatToParts(new Date(t)).map((x) => [x.type, x.value]),
    );
  let utc = local;
  for (let i = 0; i < 3; i++) {
    const p = parts(utc),
      represented = Date.UTC(
        Number(p.year),
        Number(p.month) - 1,
        Number(p.day),
        Number(p.hour),
        Number(p.minute),
        Number(p.second),
      );
    utc = local - (represented - utc);
  }
  const p = parts(utc);
  if (
    Number(p.year) !== y ||
    Number(p.month) !== m ||
    Number(p.day) !== d ||
    Number(p.hour) !== h ||
    Number(p.minute) !== min
  )
    throw Error("Horário inválido neste fuso. Escolha outro horário.");
  return new Date(utc).toISOString();
}
