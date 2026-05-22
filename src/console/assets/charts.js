export function renderLine(canvas, values, color = "#4AEF79") {
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#101010";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let y = 24; y < h; y += 28) {
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(w - 8, y);
    ctx.stroke();
  }
  if (!values || values.length === 0) {
    return;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  ctx.strokeStyle = color;
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
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

export function renderBars(canvas, values, color = "#4AEF79") {
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#101010";
  ctx.fillRect(0, 0, w, h);
  if (!values || values.length === 0) {
    return;
  }
  const max = Math.max(1, ...values);
  const gap = 4;
  const barW = (w - gap * (values.length + 1)) / values.length;
  ctx.fillStyle = color;
  values.forEach((value, idx) => {
    const barH = ((value || 0) / max) * (h - 16);
    const x = gap + idx * (barW + gap);
    const y = h - 8 - barH;
    ctx.fillRect(x, y, barW, barH);
  });
}
