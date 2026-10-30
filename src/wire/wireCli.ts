import { consumeAcceptedWork, type WireWorkExecution } from "./workConsumer.js";
import { nativeRouteFor, paramsFor, type RunOptions } from "../cli-agent-options.js";
import { AdapterRegistry } from "../llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../llm/adapter/llmRuntime.js";
import { LocalCredentialsService } from "../credentials/localCredentialsService.js";
import { stubProviderTransport, STUB_PROVIDER_MODEL } from "../agent/stubProvider.js";
import { getMode } from "../mode/mode.js";
import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { openLedger } from "../ledger/ledger.js";
import { sha256Hex } from "../utils/hash.js";
import { amcVersion } from "../version.js";
import { startWireListener, wireSocketPath } from "./wireListener.js";

/**
 * `amc wire serve` (plan P7.1a).
 *
 * THE INTAKE SESSION IS LEDGER-DIRECT, NOT A `SessionService`. That service holds
 * its session's chain head in memory "because this instance is the only writer
 * for the session" (../session/sessionService.ts) -- and the wire's acceptances
 * are written through `ledger.appendEvidenceWithReceipt`, which is a second
 * writer. Using both would leave the service chaining from a phantom head. So
 * the session row is opened on the ledger directly and this command owns its
 * whole lifecycle.
 *
 * WHICH MEANS THIS COMMAND MUST SEAL IT. A session with no seal is reported by
 * `verifyLedgerIntegrity` as an error, not as a state: the OPEN/INTERRUPTED
 * verdict is reserved for sessions carrying a `session/open` row, and forging
 * one here would mean writing a row that looks like the service's without the
 * envelope every reader of it expects. Sealing therefore happens on `exit`,
 * which covers ordinary return, an uncaught throw, and both signals -- SQLite
 * writes are synchronous, so an exit handler is a real place to do it.
 *
 * WHAT REMAINS UNCOVERED, stated plainly: SIGKILL and power loss. Those leave the
 * session unsealed and `amc verify` will report it. That report is TRUE -- work
 * was accepted and the record of that period was never closed -- so it is left
 * to say so rather than papered over with a retroactive seal at next startup,
 * which would claim an orderly end to something that did not have one.
 */

export function registerWireCommands(program: Command): void {
  program
    .command("wire")
    .description("Serve the NDJSON JSON-RPC wire; optionally execute accepted work through an owner-configured native route")
    .option("--socket <path>", "Bind here instead of .amc/wire/wire.sock")
    .option("--max-connections <n>", "Concurrent peers allowed")
    .option("--idle-timeout <ms>", "Close a connection idle for this long")
    .option("--execute-accepted", "Owner opt-in: consume new accepted work serially; refuse overflow, with no hidden queue")
    .option("--provider <id>", "Reviewed native provider for accepted work, or stub for a recording demonstration")
    .option("--model <model>", "Model for the reviewed execution route")
    .option("--base-url <origin>", "Operator-selected provider origin")
    .option("--credential <ref>", "Credential reference for the reviewed route")
    .option("--max-steps <n>", "Native step ceiling for accepted work", "8")
    .option("--max-tokens <n>", "Per-request output token ceiling", "1024")
    .option("--json", "Print the startup facts as JSON")
    .action(async (opts: RunOptions & {
      executeAccepted?: boolean;
      socket?: string;
      maxConnections?: string;
      idleTimeout?: string;
      json?: boolean;
    }) => {
      const maxConnections = integerFlag("--max-connections", opts.maxConnections);
      const idleTimeoutMs = integerFlag("--idle-timeout", opts.idleTimeout);

      const workspace = process.cwd();
      let credentials: LocalCredentialsService | undefined;
      let execution: WireWorkExecution | undefined;
      if (opts.executeAccepted === true) {
        if (getMode(workspace) !== "owner") throw new Error("Wire work execution requires owner mode.");
        if (opts.provider === undefined) throw new Error("--execute-accepted requires an operator-selected --provider.");
        const route = nativeRouteFor(opts.provider, opts, opts.model);
        const registry = new AdapterRegistry(); registry.register(route);
        const maxSteps = integerFlag("--max-steps", opts.maxSteps) ?? 8;
        if (maxSteps > 1024) throw new Error("--max-steps must be an integer from 1 through 1024.");
        const maxTokens = integerFlag("--max-tokens", opts.maxTokens) ?? 1024;
        credentials = new LocalCredentialsService({ projectDir: workspace, includeDotenv: false, watch: false });
        const ownerCredentials = credentials;
        execution = { route: { providerId: route.providerId, model: route.models?.[0] ?? STUB_PROVIDER_MODEL,
          params: paramsFor(route.providerId, maxTokens, opts) },
          makeLlm: session => new LlmRuntime({ session, registry, credentials: ownerCredentials,
            ...(route.providerId === "stub" ? { transport: stubProviderTransport() } : {}) }),
          tools: "none", maxSteps, systemPrompt: "Complete the accepted wire task within this native session's governance.",
          harnessVersion: amcVersion,
          compositionDigest: sha256Hex(JSON.stringify({ surface: "wire-native", provider: route.providerId, model: route.models, tools: "none", maxSteps, maxTokens })),
          policyDigest: sha256Hex(JSON.stringify({ tools: "none" })) };
      } else if (opts.provider !== undefined || opts.model !== undefined || opts.baseUrl !== undefined || opts.credential !== undefined) {
        throw new Error("Wire execution route options require --execute-accepted.");
      }
      const controller = new AbortController();
      const operations = new Set<Promise<unknown>>();
      const ledger = openLedger(workspace);
      const intakeSessionId = randomUUID();

      // A non-agent session, so `binary_path` names the server rather than an
      // agent, and `binary_sha256` records which build served the period.
      ledger.startSession({
        sessionId: intakeSessionId,
        runtime: "amc",
        binaryPath: "amc-wire",
        binarySha256: sha256Hex(`amc-wire@${amcVersion}`)
      });

      let sealed = false;
      const seal = () => {
        if (sealed) return;
        sealed = true;
        try {
          ledger.sealSession(intakeSessionId);
        } catch {
          // A session can be sealed exactly once (the sessions table has a
          // trigger enforcing it), and there is no useful recovery from failing
          // to seal during shutdown. Swallowed so it cannot mask the reason the
          // process was exiting.
        }
      };
      process.on("exit", seal);

      const listener = await startWireListener({
        workspace,
        ledger,
        intakeSessionId,
        monitorPublicKeys: getPublicKeyHistory(workspace, "monitor"),
        ...(execution === undefined ? {} : { onAccepted: (accepted, leaseToken) => {
          const operation = consumeAcceptedWork({ workspace, ledger, intakeSessionId, receipt: accepted.receipt, leaseToken,
            monitorPublicKeys: getPublicKeyHistory(workspace, "monitor"), execution, signal: controller.signal });
          operations.add(operation);
          void operation.then(result => {
            if (!result.ok) console.error(`wire work ${accepted.workSessionId}: ${result.reason}`);
          }, () => console.error(`wire work ${accepted.workSessionId}: consumer settlement unavailable; inspect its claim`))
            .finally(() => operations.delete(operation));
        } }),
        ...(opts.socket === undefined ? {} : { socketPath: opts.socket }),
        ...(maxConnections === undefined ? {} : { maxConnections }),
        ...(idleTimeoutMs === undefined ? {} : { idleTimeoutMs })
      });

      const facts = {
        socketPath: listener.socketPath,
        intakeSessionId,
        defaultSocketPath: wireSocketPath(workspace),
        methods: ["work/accept", "work/describe"],
        execution: execution === undefined ? "unconfigured" : { providerId: execution.route.providerId, model: execution.route.model, tools: "none", activeCap: 1 },
        requiredScope: "wire:submit"
      };
      console.log(opts.json ? JSON.stringify(facts, null, 2) : startupBanner(facts));

      let stopping = false;
      for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.on(signal, () => {
          if (stopping) return;
          stopping = true;
          controller.abort();
          void listener.close().then(async () => {
            await Promise.allSettled([...operations]);
            await credentials?.close();
            // `seal` runs from the exit handler, so shutdown has one path
            // whether it was reached by a signal or by falling off the end.
            process.exit(0);
          });
        });
      }
    });
}

function startupBanner(facts: {
  socketPath: string;
  intakeSessionId: string;
  requiredScope: string;
  methods: readonly string[];
}): string {
  return [
    `wire listening on ${facts.socketPath}`,
    `intake session ${facts.intakeSessionId}`,
    `methods: ${facts.methods.join(", ")}`,
    // Said at startup because a lease without this scope is in no default grant
    // set, so the first thing an operator hits is a refusal they need to
    // understand. `amc lease issue --scopes wire:submit --routes /wire` mints one.
    `every message needs a lease with scope ${facts.requiredScope} and a route covering /wire`
  ].join("\n");
}

/**
 * Parse a numeric flag, or stop.
 *
 * `Number.parseInt` on a missing or misspelt value yields NaN, which silently
 * becomes "no limit" -- this repo has already shipped one bound that was
 * decoration for exactly that reason. A flag that cannot be honoured is refused
 * rather than ignored.
 */
function integerFlag(flag: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    console.error(`${flag} must be a positive integer, got ${JSON.stringify(raw)}`);
    process.exit(2);
  }
  return value;
}
