import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { detectFromContent, type DetectionResult } from "./autoDetect.js";
import { formatMaturityOrdinal } from "../score/maturityTaxonomy.js";

const SCAN_EXTENSIONS = new Set([".ts", ".js", ".py", ".yaml", ".yml", ".json", ".toml", ".cfg", ".md"]);
const MAX_FILE_SIZE = 512 * 1024; // 512KB
const MAX_FILES = 200;

export interface LocalScanResult {
  path: string;
  filesScanned: number;
  detection: DetectionResult;
  preliminaryScore: { level: number; label: string; confidence: number };
}

function collectFiles(dir: string, files: string[] = [], depth = 0): string[] {
  if (depth > 5 || files.length >= MAX_FILES) return files;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith(".") || entry === "node_modules" || entry === "__pycache__" || entry === "dist" || entry === "build") continue;
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) { collectFiles(full, files, depth + 1); }
        else if (stat.isFile() && SCAN_EXTENSIONS.has(extname(entry)) && stat.size <= MAX_FILE_SIZE) {
          files.push(full);
        }
      } catch { /* skip inaccessible */ }
      if (files.length >= MAX_FILES) break;
    }
  } catch { /* skip inaccessible */ }
  return files;
}

export function scanLocal(localPath: string): LocalScanResult {
  const filePaths = collectFiles(localPath);
  const files = filePaths.map(p => {
    try { return { path: p, content: readFileSync(p, "utf-8") }; }
    catch { return { path: p, content: "" }; }
  });
  const detection = detectFromContent(files);

  // Preliminary score based on detection
  let level = files.length > 0 ? 1 : 0;
  if (detection.governanceArtifacts.length >= 3) level = 3;
  else if (detection.governanceArtifacts.length >= 1) level = 2;
  if (detection.securityPosture === "strong") level = Math.min(level + 1, 3);
  if (detection.securityPosture === "weak") level = Math.max(level - 1, 0);

  return {
    path: localPath,
    filesScanned: files.length,
    detection,
    preliminaryScore: { level, label: formatMaturityOrdinal(level), confidence: detection.confidence },
  };
}
