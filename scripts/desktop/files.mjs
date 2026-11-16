// The desktop launchers are real files in this folder with __AMC_NAME__ placeholders; the packager (and the tests)
// fill them here. A placeholder left unfilled, or a value with a character that could break out of its quotes, throws.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function desktopFile(name, values) {
  let text = readFileSync(join(here, name), "utf8");
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Za-z0-9._@+-]+$/.test(String(value))) throw new Error(`desktop launcher value ${key} has unsafe characters: ${value}`);
    text = text.replaceAll(`__AMC_${key}__`, String(value));
  }
  const left = /__AMC_[A-Z0-9_]+__/.exec(text);
  if (left) throw new Error(`${name}: ${left[0]} was not filled`);
  return text;
}

/** The lowest Node.js major the package accepts (package.json engines.node, ">=20"): the one rule every launcher uses. */
export function nodeMinMajor(pkg) {
  const match = /^>=\s*(\d+)/.exec(pkg.engines?.node ?? "");
  if (!match) throw new Error(`package.json engines.node must read ">=N", not ${JSON.stringify(pkg.engines?.node)}`);
  return Number(match[1]);
}
