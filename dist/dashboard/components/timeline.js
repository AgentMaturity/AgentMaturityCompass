export function renderTimeline(canvas, trends) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  if (!trends || trends.length === 0) {
    ctx.fillStyle = "#4a7a52";
    ctx.font = "12px 'JetBrains Mono', monospace";
    ctx.fillText("No trend data", 10, 20);
    return;
  }

  const margin = 24;
  const points = trends.map((row, i) => ({
    x: margin + (i * (width - margin * 2)) / Math.max(1, trends.length - 1),
    y: height - margin - ((row.overall ?? 0) / 5) * (height - margin * 2)
  }));

  // Axis line — dark green
  ctx.strokeStyle = "#1a3a1a";
  ctx.beginPath();
  ctx.moveTo(margin, height - margin);
  ctx.lineTo(width - margin, height - margin);
  ctx.stroke();

  // Vertical axis
  ctx.beginPath();
  ctx.moveTo(margin, margin);
  ctx.lineTo(margin, height - margin);
  ctx.stroke();

  // Area fill under line
  ctx.beginPath();
  ctx.moveTo(points[0].x, height - margin);
  for (const p of points) {
    ctx.lineTo(p.x, p.y);
  }
  ctx.lineTo(points[points.length - 1].x, height - margin);
  ctx.closePath();
  ctx.fillStyle = "rgba(0, 255, 65, 0.08)";
  ctx.fill();

  // Line — bright green
  ctx.beginPath();
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (i === 0) {
      ctx.moveTo(p.x, p.y);
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.strokeStyle = "#00ff41";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Data points — green dots
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#00ff41";
    ctx.fill();
  }
}
