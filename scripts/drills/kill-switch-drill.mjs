#!/usr/bin/env node
/**
 * P2-26 kill-switch drill: `node scripts/drills/kill-switch-drill.mjs [--workspace <dir>] --out <receipt.json>`.
 * Without --workspace it drills a fresh temporary workspace, with the control checkpoint root (the kill switch's
 * mirror) and a random vault passphrase for it. Exits 0 only when the signed receipt's result is "pass". Needs `npm run build`.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const out = arg("--out");
if (!out) { console.error("usage: kill-switch-drill.mjs [--workspace <dir>] --out <receipt.json>"); process.exit(2); }
let workspace = arg("--workspace");
if (!workspace) {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "amc-kill-switch-drill-")));
  process.env.AMC_CONTROL_CHECKPOINT_DIR ??= join(scratch, "checkpoints");
  // A throwaway vault for the throwaway workspace; a real workspace uses the operator's own passphrase.
  process.env.AMC_VAULT_PASSPHRASE ??= randomBytes(24).toString("hex");
  workspace = join(scratch, "workspace");
  const { initWorkspace } = await import(pathToFileURL(join(root, "dist", "workspace.js")).href);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
}
const { runKillSwitchDrill } = await import(pathToFileURL(join(root, "dist", "runtime", "killSwitchDrill.js")).href);
const receipt = await runKillSwitchDrill({ workspace: resolve(workspace) });
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(resolve(out), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`${receipt.body.result}: ${receipt.body.actionsDenied}/${receipt.body.actionsAttempted} denied, ${receipt.body.effectsAfterActivation} effects after activation -> ${resolve(out)}`);
process.exit(receipt.body.result === "pass" ? 0 : 1);
