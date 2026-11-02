import React from "react";
export function CopexMark({ size = 36 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path d="M31 9A15 15 0 1 0 31 31" stroke="currentColor" strokeWidth="7" />
      <path d="m24 15 14 5-14 5V15Z" fill="currentColor" />
      <path d="M31 2v5M38 8l-4 3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
export function StudioSeal() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <path id="seal-ring" d="M50 12a38 38 0 1 1-.01 0" />
      </defs>
      <circle cx="50" cy="50" r="48" fill="currentColor" />
      <text fontSize="8" letterSpacing="2.1" fill="#20241d">
        <textPath href="#seal-ring">ESTÚDIO INDEPENDENTE · COPEX · </textPath>
      </text>
      <path d="m39 33 27 17-27 17V33Z" fill="#20241d" />
      <path d="M28 72h44" stroke="#20241d" />
    </svg>
  );
}
export function StudioScene({ variant = 0 }) {
  const colors = [
    ["#e8a77c", "#6c7861", "#263f35"],
    ["#c2b5dc", "#8470a9", "#342f50"],
    ["#dbb48b", "#a86f49", "#543c30"],
    ["#e1e2d7", "#aeb6a3", "#394d41"],
    ["#e6a399", "#b95f61", "#64383c"],
    ["#a8c9d5", "#668e9d", "#254858"],
  ][variant % 6];
  return (
    <svg
      className="studio-scene"
      viewBox="0 0 300 400"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={"scene-" + variant} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={colors[0]} />
          <stop offset="1" stopColor={colors[1]} />
        </linearGradient>
        <pattern
          id={"grain-" + variant}
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r=".5" fill="#fff" opacity=".12" />
        </pattern>
      </defs>
      <rect width="300" height="400" fill={"url(#scene-" + variant + ")"} />
      <circle cx="230" cy="92" r="70" fill="#f2ebcc" opacity=".75" />
      <path d="M-40 330Q150 165 350 280V450H-40Z" fill={colors[2]} />
      <path
        d="M10 400V165a88 88 0 0 1 176 0v235Z"
        fill={colors[0]}
        opacity=".75"
      />
      <path d="M34 400V176a64 64 0 0 1 128 0v224Z" fill={colors[2]} />
      <path d="m68 399 62-190 74 190Z" fill={colors[1]} />
      <path d="M0 350h300M0 370h300M0 390h300" stroke="#ebeddc" opacity=".2" />
      <rect width="300" height="400" fill={"url(#grain-" + variant + ")"} />
    </svg>
  );
}
export function StudioComposition() {
  return (
    <div className="studio-composition" aria-hidden="true">
      <div className="composition-grid" />
      <div className="contact-sheet">
        <span className="sheet-caption">COPEX / CONTATO Nº 001</span>
        <div className="sheet-frames">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <StudioScene variant={i} />
              <span>0{i + 1} — CRIAÇÃO</span>
            </div>
          ))}
        </div>
        <div className="sheet-rule">
          <i /> UM ORIGINAL. MUITAS POSSIBILIDADES. <b>↗</b>
        </div>
      </div>
      <div className="frame-ticket">
        <span>DA IDEIA AO ARQUIVO FINAL</span>
        <div>
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <b>CRIE. EDITE. REPITA.</b>
        <small>SEM MARCA D’ÁGUA DA PLATAFORMA</small>
      </div>
      <div className="composition-seal">
        <StudioSeal />
      </div>
      <div className="editorial-note">
        <span>✦</span> Seu processo,
        <br />
        <em>com a sua assinatura.</em>
      </div>
    </div>
  );
}
export function PresetPoster({ preset, index }) {
  const s = preset.settings;
  return (
    <>
      <StudioScene variant={index % 6} />
      <div className={"poster-treatment " + (s.filter || "none")} />
      <div className="poster-corner">
        <span>CPX / {String(index + 1).padStart(2, "0")}</span>
        <b>
          {s.width} × {s.height}
        </b>
      </div>
      <div
        className={
          "poster-message " +
          (s.textPosition || "bottom") +
          (!s.text ? " style-name" : "")
        }
        style={{ color: s.textColor || "#fff" }}
      >
        {s.text || preset.name}
        {!s.text && <small>SEM TEXTO CONFIGURADO</small>}
      </div>
      <div className="poster-tech">
        <span>{s.speed || 1}×</span>
        <span>{s.fps || 30} FPS</span>
        <span>
          {s.filter === "mono"
            ? "P&B"
            : s.filter === "warm"
              ? "QUENTE"
              : s.filter === "cool"
                ? "FRIO"
                : s.filter === "vintage"
                  ? "VINTAGE"
                  : "ORIGINAL"}
        </span>
      </div>
    </>
  );
}
