import { randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { VERSION, invoke, putJson, readJson, seedRepository } from "./codingCommon.mjs";
import { codingGateway } from "./codingGateway.mjs";
import { verifyInventory } from "./nativeCommon.mjs";

// No harness implementation is substituted here. All three branches launch
// their inventory-pinned installed CLI, with their own native tool/runtime path.
const [cliArg, workspaceArg, fixturePath, contextPath, inventoryPath] = process.argv.slice(2);
const receipt = { schemaVersion: VERSION, kind: "local-coding", fixtureId: null, targetId: null,
  setup: [], execution: { started: false, exitCode: null, signal: null, truncated: false, timedOut: false },
  error: null, modelRequests: 0, gateway: { requests: [] }, inventory: { beforeVerified: false, afterVerified: false } };
const cancellation = new AbortController();
let requestedSignal = null, gateway, workspace, context, inventory;
const secrets = [];
const cancel = signal => { requestedSignal ??= signal; cancellation.abort(); };
const onInt = () => cancel("SIGINT"), onTerm = () => cancel("SIGTERM");
process.on("SIGINT", onInt); process.on("SIGTERM", onTerm);
const scrub = value => {
  let text = JSON.stringify(value);
  for (const secret of secrets) if (secret) text = text.split(secret).join("[REDACTED]");
  return JSON.parse(text);
};
const failed = result => result.exitCode !== 0 || result.signal !== null || result.truncated || result.timedOut;

function isolatedEnvironment(home, temp) {
  return { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, "config"), XDG_CACHE_HOME: join(home, "cache"),
    TMPDIR: temp, TEMP: temp, TMP: temp, PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    LANG: "C", NO_COLOR: "1", CI: "1" };
}

// Used ONLY in the AMC branch and run in a separate child with its synthetic
// vault passphrase. Competitor branches neither import nor execute AMC modules.
function amcConfiguration(root, lane) {
  const module = relative => JSON.stringify(pathToFileURL(join(root, "dist", relative)).href);
  return `import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultToolsConfig } from ${module("toolhub/toolsSchema.js")};
import { defaultBudgets } from ${module("budgets/budgets.js")};
import { defaultApprovalPolicy, initApprovalPolicy } from ${module("approvals/approvalPolicyEngine.js")};
const workspace=process.cwd();
const tools=defaultToolsConfig();
tools.tools.allowedTools=tools.tools.allowedTools.filter(tool=>['fs.read','fs.write','fs.edit','glob','grep'].includes(tool.name)).map(tool=>({...tool,allow:{paths:['./repo/**']},context:{kind:'native'}}));
tools.tools.denyByDefault=true;
writeFileSync(join(workspace,'.amc/tools.yaml'),JSON.stringify(tools,null,2)+'\\n',{mode:0o600});
const budgets=defaultBudgets('default'), limits=budgets.budgets.perAgent.default;
limits.daily.maxLlmRequests=${lane.settings.maxRequests}; limits.perMinute.maxLlmRequests=${lane.settings.maxRequests};
limits.daily.maxLlmTokens=${lane.budgets.maxTokens}; limits.perMinute.maxLlmTokens=${lane.budgets.maxTokens};
limits.daily.maxToolExecutes={READ_ONLY:${lane.settings.maxRequests * 8},WRITE_LOW:${lane.settings.maxRequests * 8}};
limits.unknownTokenUsage='BLOCK';
writeFileSync(join(workspace,'.amc/budgets.yaml'),JSON.stringify(budgets,null,2)+'\\n',{mode:0o600});
const approval=defaultApprovalPolicy();
approval.approvalPolicy.actionClasses.WRITE_LOW.requiredApprovals=0;
initApprovalPolicy(workspace,approval);
process.stdout.write(JSON.stringify({kind:'explicit-disposable-coding-policy',tools:tools.tools.allowedTools.map(tool=>({name:tool.name,actionClass:tool.actionClass,paths:tool.allow.paths})),approval:{actionClass:'WRITE_LOW',requiredApprovals:0},maxRequests:limits.daily.maxLlmRequests,maxTokens:limits.daily.maxLlmTokens})+'\\n');
`;
}

async function amcBinding({ cli, root, control, env, lane, runSetup }) {
  const passphrase = randomBytes(32).toString("base64url"); secrets.push(passphrase);
  env.AMC_VAULT_PASSPHRASE = passphrase;
  env.CODING_GATEWAY_TOKEN = gateway.token;
  await runSetup("init", cli, ["init", "--trust-boundary", "isolated", "--profile", "ci"]);
  await runSetup("firewall", cli, ["firewall", "enable"]);
  await runSetup("budgets-init", cli, ["budgets", "init", "--agent", "default"]);
  await runSetup("approval-init", cli, ["policy", "approval", "init"]);
  const configScript = join(control, "configure-amc.mjs");
  writeFileSync(configScript, amcConfiguration(root, lane), { flag: "wx", mode: 0o600 });
  await runSetup("reviewed-policy", configScript, []);
  await runSetup("tools-sign", cli, ["tools", "sign", "--json"]);
  await runSetup("budgets-sign", cli, ["budgets", "sign", "--json"]);
  receipt.permissions = { tools: ["fs.read", "fs.write", "fs.edit", "glob", "grep"],
    read: "signed ./repo/** paths", write: "signed ./repo/** paths; protected AMC paths remain denied",
    approval: "explicit signed WRITE_LOW zero-quorum policy for this disposable unattended fixture",
    sandbox: "native policy checks; no OS-confinement claim", cost: "unknown local inference cost; no monetary measurement" };
  return ["agent-loop", "run", "--provider", "openai", "--model", lane.model, "--base-url", gateway.origin,
    "--credential", "CODING_GATEWAY_TOKEN", "--credentials-home", env.HOME, "--credentials-file", join(env.HOME, ".credentials.yaml"),
    "--tools", "workspace", "--max-steps", String(lane.settings.maxRequests), "--max-tokens", String(lane.settings.maxOutputTokens),
    "--approve-tools", "WRITE_LOW", "--approve-risk", "low", "--json"];
}

function piBinding({ control, env, lane }) {
  const agentDir = join(control, "pi-agent"); mkdirSync(agentDir, { mode: 0o700 });
  env.PI_CODING_AGENT_DIR = agentDir; env.PI_OFFLINE = "1"; env.PI_SKIP_VERSION_CHECK = "1";
  env.CODING_GATEWAY_TOKEN = gateway.token;
  putJson(join(agentDir, "models.json"), { providers: { "coding-local": {
    baseUrl: `${gateway.origin}/v1`, api: "openai-completions", apiKey: "$CODING_GATEWAY_TOKEN", authHeader: true,
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
    models: [{ id: lane.model, name: lane.model, reasoning: false, input: ["text"],
      contextWindow: lane.settings.contextWindow ?? 32768, maxTokens: lane.settings.maxOutputTokens }]
  } } });
  putJson(join(agentDir, "settings.json"), { defaultProvider: "coding-local", defaultModel: lane.model,
    defaultThinkingLevel: "off", enableInstallTelemetry: false, compaction: { enabled: false },
    retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0, timeoutMs: Math.min(lane.budgets.timeoutMs, 120000) } } });
  receipt.permissions = { tools: ["read", "write", "edit", "grep", "find", "ls"],
    read: "Pi native filesystem tools; no repo-only read enforcement claimed", write: "disposable workspace requested; Pi tools are not an OS sandbox",
    approval: "explicit unattended native filesystem-tool allowlist", sandbox: "none claimed",
    discovery: "offline startup; extension/skill/prompt/theme/context-file discovery disabled",
    cost: "Pi catalog pricing defaults are not measured local inference cost" };
  return ["--offline", "--print", "--mode", "json", "--provider", "coding-local", "--model", lane.model,
    "--thinking", "off", "--tools", "read,write,edit,grep,find,ls", "--no-extensions", "--no-skills",
    "--no-prompt-templates", "--no-themes", "--no-context-files", "--session-dir", join(agentDir, "sessions")];
}

function dshBinding({ control, env, lane }) {
  const home = join(control, "dsh-home"); mkdirSync(home, { mode: 0o700 }); env.DSH_HOME = home;
  env.DSH_TOOLS_MODE = "native"; env.DSH_PERMISSION_MODE = "workspace-write";
  env.CODING_GATEWAY_TOKEN = gateway.token;
  const connection = { baseURL: `${gateway.origin}/v1`, apiKeyEnv: "CODING_GATEWAY_TOKEN", thinking: "disabled", reasoningEffort: "off",
    maxTokens: lane.settings.maxOutputTokens, defaultContextWindow: lane.settings.contextWindow ?? 32768,
    models: [{ id: lane.model, name: lane.model, contextWindow: lane.settings.contextWindow ?? 32768 }],
    streamIdleTimeoutMs: Math.min(lane.budgets.timeoutMs, 120000) };
  const selection = { provider: "deepseek-official", model: lane.model };
  const settings = join(control, "dsh-settings.json"), patch = join(control, "coding.patch.yml");
  putJson(settings, { "llm-deepseek": connection, "agent-default-model": { ...selection, reasoningEffort: "off" } });
  // Official pinned headless profile rows: remove capability providers rather
  // than claiming its tools.mode presentation setting is an execution filter.
  const disabled = ["tool-bash", "tool-pwsh", "tool-jobs", "tool-skill", "tool-subagent-control", "tool-subagent-list-agents",
    "tool-subagent", "tool-subagent-fork", "tool-workflow", "tool-todo", "tool-goal", "tool-ralph", "tool-web",
    "code-runtime", "session-title-llm", "llm-pi-ai", "plan-mode", "attachment-local"];
  putJson(patch, [{ id: "settings", config: { path: settings, watch: false } },
    { id: "llm-deepseek", config: connection }, { id: "agent-default-model", config: selection },
    { id: "tools", config: { mode: "native" } }, ...disabled.map(id => ({ id, disabled: true }))]);
  receipt.permissions = { tools: "native tool-fs and tool-fs-search; other named profile tool providers disabled", disabledProfileRows: disabled,
    read: "DSH native filesystem reads; no repo-only enforcement claimed",
    write: "DSH workspace-write pins session cwd and also allows platform temp paths; broader than AMC repo-only policy",
    approval: "native workspace-write/ask; escalation remains unavailable in unattended headless mode",
    sandbox: "native file policy, no shell tools or OS-confinement claim", cost: "unknown local inference cost" };
  return ["--profile", "headless", "--patch", patch];
}

try {
  if (process.argv.length !== 7) throw new Error("Expected CLI, workspace, fixture, context and inventory arguments");
  workspace = realpathSync(workspaceArg); const cli = realpathSync(cliArg);
  context = readJson(contextPath); const fixture = readJson(fixturePath);
  receipt.fixtureId = fixture.id; receipt.targetId = context.target?.id;
  if (context.schemaVersion !== VERSION || fixture.schemaVersion !== VERSION || !["amc", "dsh", "pi"].includes(receipt.targetId)
    || typeof fixture.id !== "string" || typeof fixture.prompt !== "string" || !fixture.prompt.trim() || Buffer.byteLength(fixture.prompt) > 32768
    || fixture.prompt.trimStart().startsWith("-") || fixture.prompt.includes("\0")) throw new Error("Invalid coding fixture or target identity");
  if (resolve(context.observationsPath) !== join(workspace, "observations.json")) throw new Error("Observations must remain in the exact comparison workspace location");
  const lane = context.lane;
  if (lane?.kind !== "local-provider" || typeof lane.model !== "string" || !lane.model || !Number.isSafeInteger(lane.budgets?.maxTokens)
    || lane.budgets.maxTokens < 1 || !Number.isSafeInteger(lane.budgets.timeoutMs) || lane.budgets.timeoutMs < 5000) throw new Error("This binding requires a finite local-model coding lane");
  inventory = verifyInventory(inventoryPath);
  if (inventory.targetId !== receipt.targetId || realpathSync(inventory.cli) !== cli || !lstatSync(cli).isFile()
    || !inventory.files.some(pin => realpathSync(pin.path) === cli)) throw new Error("CLI does not match the target's verified runtime inventory");
  const root = realpathSync(inventory.root);
  if (!cli.startsWith(root + sep)) throw new Error("CLI is outside the verified installed package root");
  receipt.inventory.beforeVerified = true;
  seedRepository(workspace, fixture);
  // Control checkpoints must be outside the governed project. The runner owns
  // the enclosing trial directory and retains this sibling through its oracle.
  const control = mkdtempSync(join(dirname(workspace), ".coding-control-"));
  const home = join(control, "home"), temp = join(control, "tmp");
  mkdirSync(home, { mode: 0o700 }); mkdirSync(temp, { mode: 0o700 });
  receipt.control = { path: control, lifetime: "retained under the runner-owned trial parent until oracle and cleanup complete" };
  const env = isolatedEnvironment(home, temp);
  const deadline = Date.now() + lane.budgets.timeoutMs - 2500;
  const remaining = () => { const value = deadline - Date.now(); if (value < 1 || cancellation.signal.aborted) throw new Error("Coding trial deadline or cancellation reached"); return value; };
  gateway = await codingGateway(lane, cancellation.signal); secrets.push(gateway.token);
  const runSetup = async (label, program, args) => {
    const result = await invoke(program, args, { cwd: workspace, env, timeoutMs: Math.min(30000, remaining()), signal: cancellation.signal });
    receipt.setup.push(scrub({ label, args, ...result }));
    if (failed(result)) throw new Error(`Coding setup did not complete: ${label}`);
  };
  const options = { cli, root, control, env, lane, runSetup };
  const args = receipt.targetId === "amc" ? await amcBinding(options) : receipt.targetId === "pi" ? piBinding(options) : dshBinding(options);
  receipt.setup.push({ label: "native-binding", args, configuration: "private per-launch files; secrets supplied only in child environment" });
  const result = await invoke(cli, [...args, fixture.prompt], { cwd: workspace, env, timeoutMs: remaining(), signal: cancellation.signal });
  receipt.execution = scrub({ started: true, ...result, requestedSignal });
  if (failed(result) || requestedSignal) receipt.error = "Native coding task did not finish successfully; independent oracle must inspect actual outputs";
} catch (error) {
  receipt.error = error instanceof Error ? error.message : "Coding adapter failed";
} finally {
  try { await gateway?.close(); } catch { receipt.error = "Coding gateway cleanup failed"; }
  if (gateway) {
    receipt.modelRequests = gateway.requests.filter(row => row.forwarded).length;
    receipt.gateway = { requests: gateway.requests, observations: gateway.observations(),
      boundary: "Only actual forwarded Chat requests are observed; this is not machine-wide traffic or a provider identity attestation" };
    try {
      // The model may have written observations.json using a competitor's broad
      // filesystem tool. Replace it atomically with the observer's own result.
      const staged = join(workspace, `.coding-observations-${randomBytes(8).toString("hex")}.json`);
      putJson(staged, gateway.observations()); renameSync(staged, context.observationsPath);
    } catch { receipt.error = "Could not publish authoritative gateway observations"; }
  }
  if (inventory) {
    try { verifyInventory(inventoryPath); receipt.inventory.afterVerified = true; }
    catch { receipt.error = "Installed runtime inventory changed during coding execution"; }
  }
  process.removeListener("SIGINT", onInt); process.removeListener("SIGTERM", onTerm);
}
receipt.execution.requestedSignal = requestedSignal;
process.stdout.write(JSON.stringify(scrub(receipt)) + "\n");
