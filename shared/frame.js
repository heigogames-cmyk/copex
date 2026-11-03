// Geometry shared by the live preview and the FFmpeg compositor.
export function frameGeometry(s) {
  const bound = (v, min, max, fallback) =>
    Number.isFinite(Number(v))
      ? Math.min(max, Math.max(min, Number(v)))
      : fallback;
  const canvasWidth = Math.round(bound(s.width, 128, 3840, 1080) / 2) * 2;
  const canvasHeight = Math.round(bound(s.height, 128, 3840, 1920) / 2) * 2;
  const x = Math.min(
    canvasWidth - 2,
    Math.round((bound(s.frameX, 0, 99, 3) * canvasWidth) / 200) * 2,
  );
  const y = Math.min(
    canvasHeight - 2,
    Math.round((bound(s.frameY, 0, 99, 18) * canvasHeight) / 200) * 2,
  );
  return {
    canvasWidth,
    canvasHeight,
    x,
    y,
    width: Math.max(
      2,
      Math.min(
        canvasWidth - x,
        Math.round((bound(s.frameWidth, 1, 100, 94) * canvasWidth) / 200) * 2,
      ),
    ),
    height: Math.max(
      2,
      Math.min(
        canvasHeight - y,
        Math.round((bound(s.frameHeight, 1, 100, 79) * canvasHeight) / 200) * 2,
      ),
    ),
  };
}
