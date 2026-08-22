import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Finds a package's integrity hash in the pnpm lockfile.
 *
 * The repo installs with pnpm (ADR-0001), so supply-chain pinning assertions
 * that used to read `package-lock.json`'s `packages["node_modules/x"].integrity`
 * read this instead.
 *
 * pnpm quotes scoped keys but not unscoped ones — `'@fontsource/inter@5.2.8':`
 * against `marked@18.0.6:` — which is the kind of detail worth writing once.
 */
export function pnpmIntegrityFor(name: string, version: string, root = process.cwd()): string | null {
  const lock = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
  const key = `${name}@${version}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^ {2}'?${key}'?:\\s*\\n\\s*resolution: \\{integrity: (sha512-[^}]+)\\}`, "m").exec(lock);
  return match?.[1] ?? null;
}
