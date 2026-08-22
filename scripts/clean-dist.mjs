#!/usr/bin/env node
/**
 * Removes dist/ reliably.
 *
 * `rm -rf dist` fails intermittently on macOS with
 * `rm: dist: Directory not empty`. The cause is not the build: Spotlight
 * recreates `dist/.DS_Store` while rm is walking the tree, so the final rmdir
 * sees a non-empty directory. It reproduces when a slow step runs first —
 * `npm run typecheck && npm run build` fails where `npm run build` alone does
 * not, because the ~30s typecheck gives the indexer time to touch dist.
 *
 * When it fires, prebuild leaves no dist/cli.js and six release-gate checks
 * fail for a reason that has nothing to do with any of them.
 *
 * fs.rmSync retries ENOTEMPTY/EBUSY with backoff, which is exactly this case.
 */
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve(process.cwd(), process.argv[2] ?? "dist");

try {
  rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
} catch (error) {
  console.error(`clean: could not remove ${target}: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
