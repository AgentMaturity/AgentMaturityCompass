import { readdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { pathExists } from "./fs.js";

export function cleanupDir(path: string): void {
  if (pathExists(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

export function collectFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(relative(root, full).replace(/\\/g, "/"));
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}
