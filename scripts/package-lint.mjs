#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publint } from "publint";

/** Check the actual npm publish file set without running package lifecycle scripts. */
export async function lintPackage(root = process.cwd()) {
  const scratch = mkdtempSync(join(tmpdir(), "amc-package-lint-"));
  const previousCache = process.env.npm_config_cache;
  try {
    process.env.npm_config_cache = join(scratch, "cache");
    return await publint({ pkgDir: root, pack: "npm", strict: true });
  } finally {
    if (previousCache === undefined) delete process.env.npm_config_cache;
    else process.env.npm_config_cache = previousCache;
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { messages } = await lintPackage();
  const errors = messages.filter(message => message.type === "error");
  console.log(JSON.stringify({ status: errors.length ? "failed" : "passed", messages }, null, 2));
  if (errors.length) process.exitCode = 1;
}
