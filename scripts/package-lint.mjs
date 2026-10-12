#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publint } from "publint";
import { isEntrypoint } from "./lib/entrypoint.mjs";

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

if (isEntrypoint(import.meta.url)) {
  const { messages } = await lintPackage();
  const errors = messages.filter(message => message.type === "error");
  console.log(JSON.stringify({ status: errors.length ? "failed" : "passed", messages }, null, 2));
  if (errors.length) process.exitCode = 1;
}
