import { claudeCliAdapter } from "../../adapters/builtins/claudeCli.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { claudeHookSettingsFindings } from "../../adapters/claudeHookProbe.js";
import { getHookIntegrationStatus } from "../../adapters/hookIntegration.js";
import { CLAUDE_MANAGED_SETTINGS_DIRS, scanClaudeHookSettings, type ClaudeHookBinding } from "../../adapters/hookProviders/claudeCode.js";
import { verifyManagedLease } from "../../adapters/managedHookLease.js";
import { detectAdapter } from "../../adapters/adapterDetection.js";
import { assembleAdapterEnv } from "../../adapters/envAssembler.js";
import { issueLeaseToken } from "../../leases/leaseSigner.js";
import { workspaceIdFromDirectory } from "../../workspaces/workspaceId.js";
import { createForeignRunner } from "../foreignSubagentRunner.js";
import type { LeaseScope } from "../../leases/leaseSchema.js";
import type { SubagentRunner } from "../subagentSpawn.js";

/**
 * Claude Code as a delegated child (plan P6.1b).
 *
 * AMC has described this CLI for a long time — `claudeCliAdapter` names how to
 * detect it, which env keys carry a base URL and an API key, and what its
 * provider family is. What it has never had is a way to RUN it as a subagent.
 * This is the wiring, and it is deliberately thin: everything that governs the
 * delegation is decided elsewhere. `spawnSubagent` mints the signed packet and
 * announces the child's session; `createForeignRunner` refuses an ungoverned,
 * hanging, crashed, silent or truncated child. This module supplies only the two
 * things the runner asks for — the argv that starts the agent on a goal, and the
 * environment that governs it.
 *
 * WHY THE GOAL GOES IN ARGV. It is the invocation AMC already documents and
 * ships for this adapter (`docs/adapters/claude-code.md`: `amc adapters run
 * ... -- claude "Analyze this codebase"`), and `commandTemplate.args` is empty,
 * so the prompt is positional. A build of the CLI that opens an interactive
 * session on that form would never answer — which is exactly what the runner's
 * deadline is for: it comes back as "timed out" rather than holding the parent's
 * turn open forever. `argsBefore` is there so an operator whose CLI needs a
 * print flag can supply one without patching this file.
 */

/**
 * The lease scopes a foreign CLI child is issued, and nothing more.
 *
 * `gateway:llm` because the whole point is that its model traffic goes through
 * AMC's gateway rather than straight to the provider. NOT any `toolhub:*` scope:
 * Claude Code runs its own tools in its own process and never calls AMC's
 * toolhub, so those scopes would be authority the child could not exercise and
 * nothing would ever refuse. Over-granting here is invisible precisely because
 * it is never exercised, which is what makes it worth stating rather than
 * copying the default scope list from `runAdapterCommand`.
 */
export const CLAUDE_CLI_DELEGATE_SCOPES: readonly LeaseScope[] = ["gateway:llm"];

const DEFAULT_LEASE_TTL_MS = 15 * 60_000;

export interface ClaudeCliForeignRunnerInit {
  readonly workspace: string;
  /** Origin of AMC's gateway, e.g. `http://127.0.0.1:3210`. */
  readonly gatewayBase: string;
  /** Route prefix the child's traffic is pinned to, e.g. `/anthropic`. */
  readonly providerRoute: string;
  readonly model: string;
  /** Origin of AMC's forward proxy, when one should be set. */
  readonly proxyBase?: string;
  /** Flags to place BEFORE the goal, for a CLI build that needs them. */
  readonly argsBefore?: readonly string[];
  readonly timeoutMs?: number;
  readonly leaseTtlMs?: number;
  readonly maxRequestsPerMinute?: number;
  readonly maxTokensPerMinute?: number;
  /**
   * AXR-10: run the child WITHOUT AMC's PreToolUse control hook, governing only its model route (`gateway:llm`).
   * Off by default: a delegated Claude Code child otherwise runs Bash, Edit and Write under no AMC tool policy, so
   * without this the runner refuses to spawn unless the workspace's signed control hook is installed and admitted.
   */
  readonly observeOnly?: boolean;
  /** Claude Code's file-based managed settings directory; defaults to the platform's. Overridable for tests. */
  readonly managedSettingsDir?: string | null;
}

/**
 * Why a delegated Claude Code child's own tool calls would not meet AMC's hook control, or null when they would (AXR-10).
 *
 * The child runs the workspace's signed Claude Code control installation: Claude Code loads it from the project's
 * `.claude/settings.local.json` when started in the workspace, and every PreToolUse call is decided by the Bridge's
 * control route under that installation's `hook:control` lease. Nothing is handed to the child on its command line:
 * AMC's forwarder accepts only the installation's lease, and AMC refuses to govern a session started with `--settings`
 * (it can add hooks AMC did not install), so a per-child lease or settings file would leave every call denied.
 */
function claudeControlHookRefusal(workspace: string, agentId: string, managedDir: string | null): string | null {
  const install = "install it with: amc connect hooks install --provider claude-code --mode control --agent " + agentId + ", or delegate observe-only";
  let status: ReturnType<typeof getHookIntegrationStatus>;
  try {
    status = getHookIntegrationStatus({ workspace, provider: "claude-code", readonly: true });
  } catch (error) {
    return `AMC's Claude Code control hook cannot be inspected (${error instanceof Error ? error.message : String(error)}); ${install}`;
  }
  if (status.state !== "installed" || status.mode !== "control" || !status.configOwned || !status.manifestValid) {
    return `AMC's Claude Code control hook is not installed (${status.mode ?? "no"} hook, ${status.state}${status.issues.length > 0 ? `: ${status.issues.join("; ")}` : ""}); ${install}`;
  }
  if (status.agentId !== agentId) return `AMC's Claude Code control hook governs ${status.agentId ?? "no agent"}, not ${agentId}; ${install}`;
  const lease = verifyManagedLease({ workspace, tokenPath: status.files.token, expectedAgentId: agentId, mode: "control" });
  if (!lease.valid || lease.payload?.leaseId !== status.leaseId) {
    return `AMC's Claude Code control hook is not admitted: ${lease.error ?? "its lease is not the installation's"}; ${install}`;
  }
  const settings = claudeSettingsRefusal(workspace, status.files.manifest, managedDir);
  return settings === null ? null : `Claude Code's settings would keep AMC's control hook from deciding its calls: ${settings}`;
}

/**
 * Why Claude Code's settings layers would keep the installed control hook from deciding the child's calls, or null:
 * hooks disabled anywhere, managed-hooks-only without managed delivery, an enabled plugin, a foreign PreToolUse (or
 * other call-changing) hook, or an AMC hook this installation did not write. Read as the registration reads them.
 */
function claudeSettingsRefusal(workspace: string, manifestPath: string, managedDir: string | null): string | null {
  const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
  const findings = claudeHookSettingsFindings({ workspace, home: join(configDir, ".."), managedDir });
  if (findings.blockers.length > 0) return findings.blockers.join("; ");
  // The findings read <home>/.claude/settings.json; a CLAUDE_CONFIG_DIR with another name is read here.
  try {
    if ((JSON.parse(readFileSync(join(configDir, "settings.json"), "utf8")) as { disableAllHooks?: unknown }).disableAllHooks === true) {
      return `disableAllHooks is true in ${join(configDir, "settings.json")}`;
    }
  } catch {
    // Absent is fine; an unreadable file is refused by the scan below.
  }
  let bindings: ClaudeHookBinding[];
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { handlers?: Array<{ eventName: string; handlerSha256: string }> };
    bindings = (manifest.handlers ?? []).map(({ eventName, handlerSha256 }) => ({ eventName, handlerSha256 }));
  } catch (error) {
    return `the control installation manifest cannot be read (${error instanceof Error ? error.message : String(error)})`;
  }
  return scanClaudeHookSettings({ workspace, userSettingsPath: join(configDir, "settings.json"), managedDir, bindings }).problem;
}

export function claudeCliForeignRunner(init: ClaudeCliForeignRunnerInit): SubagentRunner {
  const detection = detectAdapter(claudeCliAdapter);

  return async function runClaudeChild(ctx) {
    // Checked per call rather than at composition, because a runner may be
    // built once for a long-lived agent and the binary can come and go.
    if (!detection.installed || !detection.command) {
      return {
        ok: false,
        text: "",
        reason:
          `${claudeCliAdapter.displayName} is not detected on PATH `
          + `(${claudeCliAdapter.detection.commandCandidates.join(", ")}); install it or delegate `
          + "to a different provider"
      };
    }

    // AXR-10: the child's own tool calls meet AMC's hook control, or it is not started.
    const refusal = init.observeOnly === true ? null : claudeControlHookRefusal(init.workspace, ctx.toolsetAgentId,
      init.managedSettingsDir === undefined ? CLAUDE_MANAGED_SETTINGS_DIRS[process.platform] ?? null : init.managedSettingsDir);
    if (refusal !== null) return { ok: false, text: "", reason: `refusing to delegate to Claude Code: ${refusal}` };

    const runner = createForeignRunner({
      workspace: init.workspace,
      // Claude Code loads the installed control hook from the workspace it starts in, and the forwarder reads its
      // workspace from the same working directory.
      ...(init.observeOnly === true ? {} : { cwd: init.workspace }),
      ...(init.timeoutMs === undefined ? {} : { timeoutMs: init.timeoutMs }),
      spawn: (goal) => ({
        command: detection.command as string,
        args: [...(init.argsBefore ?? claudeCliAdapter.commandTemplate.args), goal]
      }),
      governedEnv: () => {
        // Minted per delegation, not per runner: a lease issued when the runner
        // was composed could already have expired by the time a model decides to
        // delegate, and a child holding an expired credential fails at the
        // gateway with an error about auth rather than about timing.
        const lease = issueLeaseToken({
          workspace: init.workspace,
          workspaceId: workspaceIdFromDirectory(init.workspace),
          // The GOVERNING id, never `runAs`. The gateway attributes spend and
          // rate limits to whatever this says, so a fresh name here would hand
          // the child an unspent budget — the same escape `spawnSubagent`
          // closes for the in-process path.
          agentId: ctx.toolsetAgentId,
          ttlMs: init.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS,
          scopes: [...CLAUDE_CLI_DELEGATE_SCOPES],
          // Pinned, and enforced by the gateway on every request: this child may
          // reach one route with one model, whatever its own config says.
          routeAllowlist: [init.providerRoute],
          modelAllowlist: [init.model],
          maxRequestsPerMinute: init.maxRequestsPerMinute ?? 60,
          maxTokensPerMinute: init.maxTokensPerMinute ?? 200_000,
          maxCostUsdPerDay: null
        });

        const env = assembleAdapterEnv({
          adapter: claudeCliAdapter,
          lease: lease.token,
          agentId: ctx.toolsetAgentId,
          gatewayBase: init.gatewayBase,
          proxyBase: init.proxyBase ?? "",
          providerRoute: init.providerRoute,
          model: init.model,
          includeProxyEnv: init.proxyBase !== undefined
        });

        const defined: Record<string, string> = {};
        for (const [key, value] of Object.entries(env)) {
          if (typeof value === "string") defined[key] = value;
        }
        return { env: defined, lease: lease.token };
      }
    });

    return runner(ctx);
  };
}
