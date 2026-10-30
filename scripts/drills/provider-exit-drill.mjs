#!/usr/bin/env node
/**
 * P2-26 provider exit drill:
 *   node scripts/drills/provider-exit-drill.mjs [--workspace <dir>] [--agent <id>] --provider <upstream id>
 *     [--alternate <provider>/<model>] --out <receipt.json>
 * Disables the provider at the gateway with a provider-scoped kill, checks model calls to it fail closed, records
 * whether the agent's change envelope admits the alternate, lifts the kill and writes a signed amc.drill/1 receipt.
 * Without --workspace it drills a fresh temporary workspace (no envelope, so any alternate is blocked). Exits 0 only on
 * "pass". Needs `npm run build`.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const out = arg("--out"), provider = arg("--provider");
if (!out || !provider) { console.error("usage: provider-exit-drill.mjs [--workspace <dir>] [--agent <id>] --provider <id> [--alternate <provider>/<model>] --out <receipt.json>"); process.exit(2); }
let workspace = arg("--workspace");
if (!workspace) {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "amc-provider-exit-drill-")));
  process.env.AMC_CONTROL_CHECKPOINT_DIR ??= join(scratch, "checkpoints");
  // A throwaway vault for the throwaway workspace; a real workspace uses the operator's own passphrase.
  process.env.AMC_VAULT_PASSPHRASE ??= randomBytes(24).toString("hex");
  workspace = join(scratch, "workspace");
  const { initWorkspace } = await import(pathToFileURL(join(root, "dist", "workspace.js")).href);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
}
const alternateArg = arg("--alternate");
const [altProvider, ...altModel] = (alternateArg ?? "").split("/");
const alternate = alternateArg ? { providerId: altProvider, model: altModel.join("/") } : undefined;
const { runProviderExitDrill } = await import(pathToFileURL(join(root, "dist", "runtime", "providerExit.js")).href);
const receipt = await runProviderExitDrill({ workspace: resolve(workspace), agentId: arg("--agent") ?? "default", provider, ...(alternate ? { alternate } : {}) });
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(resolve(out), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`${receipt.body.result}: ${provider} failClosed=${receipt.body.failClosed}, alternate=${receipt.body.alternate?.outcome ?? "none"} -> ${resolve(out)}`);
process.exit(receipt.body.result === "pass" ? 0 : 1);
