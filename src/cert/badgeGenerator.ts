/**
 * Badge SVG generator for AMC Trust Certificates
 * Produces shields.io-style flat badges.
 */

function levelToColor(level: number): string {
  if (level >= 5) return "#4c1";
  if (level >= 4) return "#2ecc40";
  if (level >= 3) return "#3d9970";
  if (level >= 2) return "#ff851b";
  return "#e05d44";
}

function escapeXml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Generate a shields.io-style SVG badge showing AMC trust level + score.
 *
 * @param score  0–100 score
 * @param level  L0–L5 maturity level
 * @param agentId  agent identifier (used in title / accessibility)
 */
export function generateBadgeSvg(score: number, level: number, agentId: string): string {
  const label = "AMC";
  const value = `L${level} (${score.toFixed(1)})`;
  const color = levelToColor(level);

  // Approximate character widths for Verdana/DejaVu at 11px
  const charWidth = 6.5;
  const padding = 10;
  const labelW = Math.ceil(label.length * charWidth) + padding;
  const valueW = Math.ceil(value.length * charWidth) + padding;
  const totalW = labelW + valueW;
  const height = 20;

  const labelX = Math.floor(labelW / 2);
  const valueX = labelW + Math.floor(valueW / 2);

  const safeAgent = escapeXml(agentId);
  const safeLabel = escapeXml(label);
  const safeValue = escapeXml(value);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalW}" height="${height}" role="img" aria-label="${safeLabel}: ${safeValue}">`,
    `  <title>${safeAgent} — ${safeLabel} ${safeValue}</title>`,
    `  <linearGradient id="s" x2="0" y2="100%">`,
    `    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>`,
    `    <stop offset="1" stop-opacity=".1"/>`,
    `  </linearGradient>`,
    `  <clipPath id="r">`,
    `    <rect width="${totalW}" height="${height}" rx="3" fill="#fff"/>`,
    `  </clipPath>`,
    `  <g clip-path="url(#r)">`,
    `    <rect width="${labelW}" height="${height}" fill="#555"/>`,
    `    <rect x="${labelW}" width="${valueW}" height="${height}" fill="${color}"/>`,
    `    <rect width="${totalW}" height="${height}" fill="url(#s)"/>`,
    `  </g>`,
    `  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">`,
    `    <text aria-hidden="true" x="${labelX}" y="15" fill="#010101" fill-opacity=".3">${safeLabel}</text>`,
    `    <text x="${labelX}" y="14">${safeLabel}</text>`,
    `    <text aria-hidden="true" x="${valueX}" y="15" fill="#010101" fill-opacity=".3">${safeValue}</text>`,
    `    <text x="${valueX}" y="14">${safeValue}</text>`,
    `  </g>`,
    `</svg>`
  ].join("\n");
}

/**
 * Derive a maturity level (0–5) from a 0–100 score.
 */
export function scoreToLevel(score: number): number {
  if (score >= 90) return 5;
  if (score >= 72) return 4;
  if (score >= 54) return 3;
  if (score >= 36) return 2;
  if (score >= 18) return 1;
  return 0;
}
