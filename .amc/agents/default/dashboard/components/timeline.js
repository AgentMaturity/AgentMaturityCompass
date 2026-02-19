export function renderTimeline(canvas, trends) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  if (!trends || trends.length === 0) {
    ctx.fillStyle = "#47614f";
    ctx.fillText("No trend data", 10, 20);
    return;
  }

  const margin = 24;
  const points = trends.map((row, i) => ({
    x: margin + (i * (width - margin * 2)) / Math.max(1, trends.length - 1),
    y: height - margin - ((row.overall ?? 0) / 5) * (height - margin * 2)
  }));

  ctx.strokeStyle = "#d4e2da";
  ctx.beginPath();
  ctx.moveTo(margin, height - margin);
  ctx.lineTo(width - margin, height - margin);
  ctx.stroke();

  ctx.beginPath();
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (i === 0) {
      ctx.moveTo(p.x, p.y);
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.strokeStyle = "#0c7b5a";
  ctx.lineWidth = 2;
  ctx.stroke();

  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#0c7b5a";
    ctx.fill();
  }
}
