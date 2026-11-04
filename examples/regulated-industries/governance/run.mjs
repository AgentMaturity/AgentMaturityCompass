#!/usr/bin/env node
// Governance example; see ../README.md.
// Usage: node run.mjs [--cli <dist/cli.js>] [--workdir <dir>] [--deny-network]
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runStation } from "../lib/runStation.mjs";

try {
  runStation(dirname(fileURLToPath(import.meta.url)));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
