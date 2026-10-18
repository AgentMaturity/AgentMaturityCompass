// AMC setup for the pilot's AMC targets only. Every step goes through the command or the signed-file writer AMC's own
// documentation names, with a per-trial synthetic vault passphrase. The Pi targets without AMC never load this file.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { invoke } from "../codingCommon.mjs";

const failed = (result) => result.exitCode !== 0 || result.signal !== null || result.truncated || result.timedOut;

/** The tuned setup fixed in PLAN.md: READ_ONLY and WRITE_LOW at SELF_REPORTED, no minima, zero-quorum WRITE_LOW. */
const tunedPolicyScript = (dist) => {
  const module = (relative) => JSON.stringify(pathToFileURL(join(dist, relative)).href);
  return `import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultActionPolicy, initActionPolicy } from ${module("governor/actionPolicyEngine.js")};
import { defaultApprovalPolicy, initApprovalPolicy } from ${module("approvals/approvalPolicyEngine.js")};
import { defaultToolsConfig } from ${module("toolhub/toolsSchema.js")};
const tools = defaultToolsConfig();
for (const tool of tools.tools.allowedTools) if (tool.name === "fs.write" || tool.name === "fs.edit") tool.allow = { ...tool.allow, paths: ["./workspace/**"] };
writeFileSync(join(process.cwd(), ".amc", "tools.yaml"), JSON.stringify(tools, null, 2) + "\\n", { mode: 0o644 });
const policy = defaultActionPolicy();
for (const rule of policy.actions) if (rule.actionClass === "READ_ONLY" || rule.actionClass === "WRITE_LOW") {
  rule.minEffectiveQuestionLevels = {}; rule.requireTrustTierAtLeast = "SELF_REPORTED"; rule.requireAssurancePacks = {};
}
initActionPolicy(process.cwd(), policy);
const approval = defaultApprovalPolicy();
approval.approvalPolicy.actionClasses.WRITE_LOW.requiredApprovals = 0;
initApprovalPolicy(process.cwd(), approval);
process.stdout.write(JSON.stringify({ tuned: ["READ_ONLY", "WRITE_LOW"], trustTier: "SELF_REPORTED", writeLowApprovals: 0, writePaths: ["./workspace/**"] }) + "\\n");
`;
};

export function amcEnvironment(base) {
  const passphrase = randomBytes(32).toString("base64url");
  return { env: { ...base, AMC_VAULT_PASSPHRASE: passphrase }, secrets: [passphrase] };
}

async function step(setup, label, program, args, options) {
  const result = await invoke(program, args, { timeoutMs: 600_000, ...options }); // a loaded host can take minutes
  setup.push({ label, args, exitCode: result.exitCode, signal: result.signal, timedOut: result.timedOut, stderr: result.stderr.slice(-600) });
  if (failed(result)) throw new Error(`AMC setup did not complete: ${label}`);
  return result;
}

/** `amc init`, then `amc connect hooks install --provider pi --mode control` binding the Pi on PATH; tuned adds the signed policy.
 * Each step lands in `setup` (the caller's receipt) before its outcome is checked, so a failed step keeps its stderr. */
export async function prepareAmcForPi({ amc, workspace, env, control, piBin, bridgePort, tuned, rpm = 120, setup = [] }) {
  const options = { cwd: workspace, env: { ...env, PATH: `${piBin}:${env.PATH}` } };
  await step(setup, "init", amc.cli, ["init", "--trust-boundary", "isolated"], options);
  await step(setup, "hooks-install", amc.cli, ["connect", "hooks", "install", "--provider", "pi", "--mode", "control", "--agent", "default",
    "--bridge-url", `http://127.0.0.1:${bridgePort}`, "--rpm", String(rpm), "--json"], options);
  if (tuned) {
    const script = join(control, "tuned-policy.mjs");
    writeFileSync(script, tunedPolicyScript(join(amc.root, "dist")), { flag: "wx", mode: 0o600 });
    await step(setup, "tuned-policy", script, [], options);
    await step(setup, "tools-sign", amc.cli, ["tools", "sign", "--json"], options);
  }
  return setup;
}

/** The loopback Bridge Pi's extension calls; it runs in this process, with this trial's passphrase. */
export async function startBridge({ amc, workspace, port }) {
  const { startBridgeServer } = await import(pathToFileURL(join(amc.root, "dist", "bridge", "bridgeServer.js")).href);
  return startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
}

/** `amc init --coding` for coding tasks; `amc init --regulated` for regulated-document and fin-ops tasks (P1-40). */
export async function prepareAmcNative({ amc, workspace, env, domain, password, setup = [] }) {
  const options = { cwd: workspace, env: { ...env, AMC_BOOTSTRAP_OWNER_USERNAME: "pilot-owner", AMC_BOOTSTRAP_OWNER_PASSWORD: password } };
  await step(setup, "init", amc.cli, ["init", domain === "coding" ? "--coding" : "--regulated"], options);
  return { setup, preset: domain === "coding" ? [] : ["--preset", "regulated"] };
}
