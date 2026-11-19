function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(nodes, width, height) {
  const radius = Math.max(120, Math.min(width, height) * 0.35);
  const cx = width / 2;
  const cy = height / 2;
  return nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, nodes.length);
    return {
      ...node,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius
    };
  });
}

export function renderCgxViewer(container, graph) {
  if (!container) {
    return;
  }
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    container.innerHTML = `<div class="card status-bad">No context graph available.</div>`;
    return;
  }
  const width = 860;
  const height = 440;
  const nodes = layout(graph.nodes.slice(0, 36), width, height);
  const byId = new Map(nodes.map((row) => [row.id, row]));
  const edges = graph.edges.filter((edge) => byId.has(edge.from) && byId.has(edge.to)).slice(0, 80);
  const edgeSvg = edges
    .map((edge) => {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) {
        return "";
      }
      return `<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" style="stroke:var(--muted)" stroke-opacity="0.6" />`;
    })
    .join("");
  const nodeSvg = nodes
    .map((node) => {
      const short = node.id.length > 22 ? `${node.id.slice(0, 22)}…` : node.id;
      return `<g>
        <circle cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}" r="14" style="fill:var(--surface);stroke:var(--accent)" />
        <text x="${node.x.toFixed(1)}" y="${(node.y + 4).toFixed(1)}" text-anchor="middle" font-size="8" style="fill:var(--ink)">${esc(node.type[0] ?? "?")}</text>
        <title>${esc(node.type)} ${esc(node.id)}</title>
      </g>
      <text x="${(node.x + 18).toFixed(1)}" y="${(node.y + 4).toFixed(1)}" font-size="9" style="fill:var(--ink)">${esc(short)}</text>`;
    })
    .join("");
  container.innerHTML = `
    <div class="card">
      <h3>Context Graph</h3>
      <p class="muted">Nodes: ${graph.nodes.length} | Edges: ${graph.edges.length}</p>
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="440" aria-label="Context graph">
        <rect x="0" y="0" width="${width}" height="${height}" style="fill:var(--surface-2)"></rect>
        ${edgeSvg}
        ${nodeSvg}
      </svg>
    </div>
  `;
}
