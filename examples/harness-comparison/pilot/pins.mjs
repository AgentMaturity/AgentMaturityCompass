// File and directory pins for the pilot's runtime configuration (Pi install, AMC build, fixture service, image).
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const fileSha256 = (path) => {
  if (!lstatSync(path).isFile()) throw new Error(`Pinned path is not a regular file: ${path}`);
  return createHash("sha256").update(readFileSync(path)).digest("hex");
};

/** One SHA-256 over every regular file under `dir` (sorted relative path and content digest); a symlink throws. */
export function dirSha256(dir) {
  const rows = [];
  const walk = (current, prefix) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const path = join(current, entry.name), name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) walk(path, `${name}/`);
      else if (entry.isFile()) rows.push(`${name}\0${fileSha256(path)}`);
      else throw new Error(`Pinned directory holds a non-regular entry: ${name}`);
    }
  };
  walk(dir, "");
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

/** Every pin in the configuration still matches; throws on the first drift. */
export function verifyPins(pins) {
  for (const pin of pins) {
    const actual = pin.kind === "dir" ? dirSha256(pin.path) : fileSha256(pin.path);
    if (actual !== pin.sha256) throw new Error(`Pinned ${pin.role} changed: ${pin.path}`);
  }
}
