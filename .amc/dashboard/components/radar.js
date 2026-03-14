export function renderRadar(canvas, layerScores) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.35;
  const points = layerScores.length;
  if (points === 0) {
    return;
  }

  // Grid rings — dark green lines
  for (let ring = 1; ring <= 5; ring += 1) {
    const r = (radius / 5) * ring;
    ctx.beginPath();
    for (let i = 0; i < points; i += 1) {
      const angle = (Math.PI * 2 * i) / points - Math.PI / 2;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.strokeStyle = "#1a3a1a";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Spoke lines
  for (let i = 0; i < points; i += 1) {
    const angle = (Math.PI * 2 * i) / points - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.strokeStyle = "#1a3a1a";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Data polygon — bright green fill
  ctx.beginPath();
  for (let i = 0; i < points; i += 1) {
    const score = layerScores[i].avgFinalLevel;
    const angle = (Math.PI * 2 * i) / points - Math.PI / 2;
    const r = (radius * score) / 5;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(0, 255, 65, 0.15)";
  ctx.strokeStyle = "#00ff41";
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  // Data points — green dots with glow
  for (let i = 0; i < points; i += 1) {
    const score = layerScores[i].avgFinalLevel;
    const angle = (Math.PI * 2 * i) / points - Math.PI / 2;
    const r = (radius * score) / 5;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#00ff41";
    ctx.fill();
  }

  // Labels — muted green
  ctx.fillStyle = "#4a7a52";
  ctx.font = "11px 'JetBrains Mono', monospace";
  for (let i = 0; i < points; i += 1) {
    const angle = (Math.PI * 2 * i) / points - Math.PI / 2;
    const x = cx + Math.cos(angle) * (radius + 18);
    const y = cy + Math.sin(angle) * (radius + 18);
    const label = layerScores[i].layerName.split(" ")[0];
    ctx.fillText(label, x - 14, y);
  }
}
