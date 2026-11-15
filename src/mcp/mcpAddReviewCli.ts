/**
 * The interactive half of `amc mcp add` (mcpAddReview.ts says what is decided and why): start the server once, show its
 * tools, ask, then sign. The question is answered only by typing `yes`; anything else, end of input or Ctrl-C writes
 * nothing (an earlier file for this id stays as it was) and changes no policy. The allowlist is signed first, so a refusal there (a locked vault, an
 * unsigned tools.yaml) leaves nothing half-allowed.
 */
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { prepareFileSignatureWithAuditor } from "../org/orgSigner.js";
import { resolveNativeMcpServer, type NativeMcpConfiguration } from "../setup/nativeMcpConfig.js";
import { loadVerifiedToolsConfigSnapshot, prepareToolsConfigPair, toolsConfigPath } from "../toolhub/toolhubValidators.js";
import type { ActionClass } from "../types.js";
import { writeFileAtomic } from "../utils/fs.js";
import { allowlistWithMcpGrants, mcpAddReviewLines, reviewedMcpConfig, selectMcpTools } from "./mcpAddReview.js";
import { McpScopeError, writeScopedMcpConfig, type McpScope, type McpScopeDirs } from "./mcpScopes.js";
import { discoverNativeMcpCatalog } from "./nativeMcpClient.js";

export interface McpAddReviewInput {
  readonly workspace: string; readonly dirs: McpScopeDirs; readonly scope: McpScope; readonly config: NativeMcpConfiguration;
  readonly path: string; readonly actionClass: ActionClass; readonly only: readonly string[] | undefined;
  readonly yes: boolean; readonly json: boolean; readonly credentialsHome?: string;
}

// Called only before the reviewed file is written, so the path still holds whatever was there before this command.
const unreviewed = (input: McpAddReviewInput) => `Nothing was saved${existsSync(input.path) ? `; ${input.path} is unchanged` : ""}. `
  + `To try again: amc mcp add ${input.config.server.id} --scope ${input.scope}${existsSync(input.path) ? " --force" : ""} ...`;

async function askYes(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  const controller = new AbortController();
  rl.on("SIGINT", () => controller.abort());
  try { return (await rl.question(question, { signal: controller.signal })).trim().toLowerCase() === "yes"; }
  catch { return false; } finally { rl.close(); }
}

export async function reviewAndAllowMcpServer(input: McpAddReviewInput): Promise<void> {
  const say = (line: string) => { if (input.json) process.stderr.write(`${line}\n`); else console.log(line); };
  const stop = (message: string, code = "mcp-add-not-allowed") => {
    if (input.json) console.log(JSON.stringify({ ok: false, code, message, path: input.path, reviewed: false }, null, 2)); else console.error(message);
    process.exitCode = 1;
  };
  const snapshot = loadVerifiedToolsConfigSnapshot(input.workspace), policy = snapshot.config;
  // The allowlist is per folder, so a user-scope server is allowed folder by folder: --force here again in the next one.
  if (!existsSync(toolsConfigPath(input.workspace))) return stop(`This folder has no AMC tool policy (.amc/tools.yaml); run amc init --coding first. ${unreviewed(input)}`);
  if (!snapshot.signatureValid || !policy) {
    return stop(`This folder's tool policy (.amc/tools.yaml) does not verify (${snapshot.reason ?? "unknown reason"}), so no tool can be added to it. ${unreviewed(input)}`);
  }
  say(`Starting the server once to read its tools: ${input.config.server.transport === "streamable-http" ? input.config.server.url : [input.config.server.command, ...(input.config.server.args ?? [])].join(" ")}`);
  let catalog;
  try {
    const server = await resolveNativeMcpServer(input.config, { workspace: input.workspace, ...(input.credentialsHome === undefined ? {} : { credentialsHome: input.credentialsHome }) });
    catalog = await discoverNativeMcpCatalog(server, input.workspace);
  } catch (error) {
    // Only AMC's own fixed messages are shown; server or network text could carry terminal controls.
    const fixed = error instanceof Error && ["NativeMcpConfigError", "NativeMcpHttpRefused", "NativeMcpProtocolRefused"].includes(error.name);
    const problem = `${fixed ? (error as Error).message : "The server could not be started or did not answer with its tools."} `;
    const details = `amc agent-loop mcp-catalog --config ${input.path} --diagnostics (an OAuth server first needs --authorize there)`;
    // A new id loses nothing by saving the unreviewed file, and the diagnostics and OAuth sign-in need it. An existing file
    // (--force) is kept: the person may still rely on it.
    if (existsSync(input.path)) {
      return stop(`${problem}${unreviewed(input)} To look closer, save the new settings unreviewed in its place (amc mcp add ${input.config.server.id} `
        + `--scope ${input.scope} --force --json ...), then run ${details}.`, "mcp-add-discovery-failed");
    }
    writeScopedMcpConfig(input.dirs, input.scope, input.config, false);
    return stop(`${problem}Saved ${input.path} unreviewed, so nothing can use it yet. Details: ${details}; then run amc mcp add `
      + `${input.config.server.id} --scope ${input.scope} --force ... again.`, "mcp-add-discovery-failed");
  }
  let selection;
  try { selection = selectMcpTools(catalog, input.only); } catch (error) { return stop(`${(error as Error).message} ${unreviewed(input)}`); }
  for (const line of mcpAddReviewLines(catalog, selection, input.actionClass)) say(line);
  if (selection.granted.length === 0) return stop(`No tool can be allowed. ${unreviewed(input)}`);
  const allowed = input.yes || await askYes(`Allow ${selection.granted.length} tool${selection.granted.length === 1 ? "" : "s"} as ${input.actionClass}? Type yes to sign, anything else to stop: `);
  if (!allowed) return stop(`${unreviewed(input)}`);
  const reviewed = reviewedMcpConfig(input.config, catalog, selection, input.actionClass);
  try {
    (await prepareToolsConfigPair(input.workspace, Buffer.from(allowlistWithMcpGrants(policy, reviewed, selection, input.actionClass)))).publish();
  } catch {
    return stop(`The tool policy could not be signed (is the vault unlocked? amc vault unlock). ${unreviewed(input)}`, "mcp-add-signing-refused");
  }
  const written = writeScopedMcpConfig(input.dirs, input.scope, reviewed, true);
  let signaturePath: string | null = null;
  if (input.scope === "project") {
    try {
      const bytes = readFileSync(written.path);
      if (bytes.toString("utf8") !== `${JSON.stringify(reviewed, null, 2)}\n`) throw new McpScopeError("changed while signing");
      const prepared = await prepareFileSignatureWithAuditor(input.workspace, written.path, bytes, "BUNDLE");
      prepared.assertCurrent();
      writeFileAtomic(`${written.path}.sig`, prepared.signatureBytes, 0o600);
      signaturePath = `${written.path}.sig`;
    } catch {
      return stop(`The tools were added to the signed tool policy, but ${written.path} could not be signed. Sign it: amc mcp sign ${input.config.server.id} --scope project --expect-digest ${written.sha256}`, "mcp-add-signing-refused");
    }
  }
  const use = `amc agent-loop chat --mcp ${input.config.server.id} --tools workspace --approve-tools ${input.actionClass}`;
  if (input.json) {
    console.log(JSON.stringify({ ok: true, id: input.config.server.id, scope: input.scope, path: written.path, sha256: written.sha256, signaturePath, reviewed: true,
      actionClass: input.actionClass, catalogDigest: catalog.digest, allowed: selection.granted, notAllowed: selection.skipped, next: use }, null, 2));
    return;
  }
  say(`Allowed ${selection.granted.length} tool${selection.granted.length === 1 ? "" : "s"}. Saved ${written.path}${signaturePath ? " and signed it" : ""}; added to the signed tool policy.`);
  if (input.scope === "user") say("The tools are allowed in this folder only. In another folder, run the same amc mcp add there with --force.");
  say(`Use it: ${use}`);
  say("If the server changes its tools, AMC refuses it until you run amc mcp add again with --force.");
}
