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
    ctx.strokeStyle = "#d4e2da";
    ctx.stroke();
  }

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
  ctx.fillStyle = "rgba(12,123,90,0.25)";
  ctx.strokeStyle = "#0c7b5a";
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#112018";
  ctx.font = "12px IBM Plex Sans, sans-serif";
  for (let i = 0; i < points; i += 1) {
    const angle = (Math.PI * 2 * i) / points - Math.PI / 2;
    const x = cx + Math.cos(angle) * (radius + 18);
    const y = cy + Math.sin(angle) * (radius + 18);
    const label = layerScores[i].layerName.split(" ")[0];
    ctx.fillText(label, x - 14, y);
  }
}
