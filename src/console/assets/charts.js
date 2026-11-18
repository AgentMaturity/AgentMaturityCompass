// C-22: a chart with nothing to draw says so in words, and one whose values are all 0 says that, so a box is never blank.
// The charts follow the console's theme (styles.css tokens): the well, the grid lines, the words and the accent.
const BRAND_GREEN = "#4AEF79";
function themed(canvas) {
  const style = typeof getComputedStyle === "function" ? getComputedStyle(canvas) : null;
  const token = (name, fallback) => style?.getPropertyValue(name).trim() || fallback;
  return { well: token("--surface-2", "#1F2B49"), grid: token("--line", "#2C3A5C"), words: token("--muted", "#A3B0C6"), accent: token("--accent", BRAND_GREEN) };
}

// A chart is drawn once on a canvas, so a theme switch (the rail's switch or the system setting) draws each one again.
const drawn = new Map();
let watching = false;
function remember(canvas, draw) {
  if (!watching && typeof MutationObserver === "function" && typeof document !== "undefined") {
    const again = () => { for (const [shown, redraw] of drawn) { if (shown.isConnected) redraw(); else drawn.delete(shown); } };
    new MutationObserver(again).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", again);
    watching = true;
  }
  drawn.set(canvas, draw);
}

function note(ctx, text, w, h, words) {
  ctx.fillStyle = words;
  ctx.font = "14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, w / 2, h / 2);
  ctx.textAlign = "start";
}

export function renderLine(canvas, values, color = BRAND_GREEN) {
  if (!canvas) {
    return;
  }
  remember(canvas, () => renderLine(canvas, values, color));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const w = canvas.width;
  const h = canvas.height;
  const theme = themed(canvas);
  const ink = color === BRAND_GREEN ? theme.accent : color;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = theme.well;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  for (let y = 24; y < h; y += 28) {
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(w - 8, y);
    ctx.stroke();
  }
  if (!values || values.length === 0) {
    note(ctx, "No data yet", w, h, theme.words);
    return;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((value, idx) => {
    const x = (idx / Math.max(1, values.length - 1)) * (w - 16) + 8;
    const y = h - 8 - ((value - min) / range) * (h - 16);
    if (idx === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
}

export function renderBars(canvas, values, color = BRAND_GREEN) {
  if (!canvas) {
    return;
  }
  remember(canvas, () => renderBars(canvas, values, color));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const w = canvas.width;
  const h = canvas.height;
  const theme = themed(canvas);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = theme.well;
  ctx.fillRect(0, 0, w, h);
  if (!values || values.length === 0) {
    note(ctx, "No data yet", w, h, theme.words);
    return;
  }
  if (values.every((value) => !value)) {
    note(ctx, "Every value is 0 so far", w, h, theme.words);
    return;
  }
  const max = Math.max(1, ...values);
  const gap = 4;
  const barW = (w - gap * (values.length + 1)) / values.length;
  ctx.fillStyle = color === BRAND_GREEN ? theme.accent : color;
  values.forEach((value, idx) => {
    const barH = ((value || 0) / max) * (h - 16);
    const x = gap + idx * (barW + gap);
    const y = h - 8 - barH;
    ctx.fillRect(x, y, barW, barH);
  });
}
