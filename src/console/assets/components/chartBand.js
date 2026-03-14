function clamp(n) {
  if (!Number.isFinite(n)) return 0;
  return Number(n);
}

export function renderChartBand(canvas, points, forecast, color = "#4AEF79") {
  if (!canvas || typeof canvas.getContext !== "function") {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const series = Array.isArray(points)
    ? points
        .map((p) => ({
          x: clamp(p.ts),
          y: clamp(p.value)
        }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    : [];
  if (series.length === 0) {
    ctx.fillStyle = "#64748b";
    ctx.fillText("No data", 8, 18);
    return;
  }
  const extras = [];
  for (const key of ["short", "mid", "long"]) {
    const row = forecast?.[key];
    if (row && Number.isFinite(row.atTs) && Number.isFinite(row.value)) {
      extras.push({
        x: clamp(row.atTs),
        y: clamp(row.value),
        low: clamp(row.low),
        high: clamp(row.high)
      });
    }
  }
  const allX = [...series.map((p) => p.x), ...extras.map((p) => p.x)];
  const allY = [
    ...series.map((p) => p.y),
    ...extras.map((p) => p.y),
    ...extras.map((p) => p.low),
    ...extras.map((p) => p.high)
  ];
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const dx = Math.max(1, maxX - minX);
  const dy = Math.max(1e-6, maxY - minY);
  const px = (x) => ((x - minX) / dx) * (width - 20) + 10;
  const py = (y) => height - (((y - minY) / dy) * (height - 20) + 10);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  series.forEach((p, idx) => {
    const x = px(p.x);
    const y = py(p.y);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  if (extras.length > 0) {
    ctx.fillStyle = "rgba(15,118,110,0.15)";
    ctx.beginPath();
    extras.forEach((p, idx) => {
      const x = px(p.x);
      const y = py(p.high);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    for (let i = extras.length - 1; i >= 0; i -= 1) {
      const p = extras[i];
      ctx.lineTo(px(p.x), py(p.low));
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#0ea5e9";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    extras.forEach((p, idx) => {
      const x = px(p.x);
      const y = py(p.y);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

