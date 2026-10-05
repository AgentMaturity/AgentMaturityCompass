/** Preserve the existing single-page text PDF format and UTF-8 byte offsets. */
export function escapePdfText(input: string): string {
  return input.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

export function renderPdfFromLines(lines: string[], escapeText: (text: string) => string = escapePdfText): Buffer {
  const sliced = lines.map((line) => line.trimEnd()).slice(0, 110);
  const content = ["BT", "/F1 10 Tf", "40 810 Td"];
  let first = true;
  for (const line of sliced) {
    if (!first) {
      content.push("0 -13 Td");
    }
    first = false;
    content.push(`(${escapeText((line.length > 110 ? `${line.slice(0, 107)}...` : line) || " ")}) Tj`);
  }
  content.push("ET");

  const stream = content.join("\n");
  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += object;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}
