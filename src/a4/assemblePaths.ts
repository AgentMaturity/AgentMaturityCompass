/**
 * The IntegrationClaim path table (P1-60; design §13): for each way of building an agent, which boundary enforces it,
 * what tier its evidence reaches and what it does not cover. A claim is a projection AMC states about its own
 * integration paths, never about the agent; P2-17's AdapterClaimManifest will own the type (P2-37). `enforced` is
 * reachable only for `hook:*`/`pi:*` with a conformance receipt for the pinned version, and none exists yet, so no
 * external path reads enforced. The closure-stub adapters (src/integrations/langchainAdapter.ts) are never listed.
 */
import type { IntegrationFramework } from "../setup/integrationScaffold.js";
import { a4IntegrationClaimV1Schema, type A4IntegrationClaimV1 } from "./a4Schema.js";

export type A4IntegrationPath = A4IntegrationClaimV1["path"];

const SOURCE = "design §13 (amc.a4-integration-claim/v1)";
const GATEWAY_GAPS = ["tool calls are not intercepted (gateway sees model traffic only)", "imported traces are self_reported, originals retained (P1-24)"];

/** The table, keyed by path; every row parses as amc.a4-integration-claim/v1. */
export const INTEGRATION_CLAIMS: Readonly<Record<A4IntegrationPath, A4IntegrationClaimV1>> = Object.fromEntries(([
  { path: "native", enforcementBoundary: "tool_pipeline", evidenceTier: "observed", supported: "supported", reason: null,
    notCovered: ["the shell runs only on Linux (decideNativeShell); elsewhere the shell has no enforcement boundary",
      "agent behaviour on the stub provider is not evaluated (synthetic_example)"] },
  { path: "claude-code", enforcementBoundary: "hook:PreToolUse", evidenceTier: "observed", supported: "preview", reason: "P1-23 (held on D-02)",
    notCovered: ["enforced only with a conformance receipt for the pinned version; none is recorded"] },
  { path: "pi", enforcementBoundary: "pi:tool_call", evidenceTier: "self_reported", supported: "unsupported", reason: "P1-22 (held on D-02)",
    notCovered: ["no pi package has landed; nothing is enforced or observed"] },
  ...(["langgraph", "langchain", "crewai", "openai-agents", "vercel-ai"] as const).map((path) => ({ path, enforcementBoundary: "gateway" as const,
    evidenceTier: "observed" as const, supported: "preview" as const, reason: "P1-54 (ToolHub-bridged calls observed, not journaled)", notCovered: GATEWAY_GAPS })),
  { path: "generic-http", enforcementBoundary: "gateway", evidenceTier: "self_reported", supported: "preview", reason: "observe-only through the gateway", notCovered: GATEWAY_GAPS },
  { path: "other", enforcementBoundary: "none", evidenceTier: "self_reported", supported: "preview", reason: "no integration path; only what the operator reports",
    notCovered: ["nothing is enforced or observed by AMC"] }
] satisfies Array<Omit<A4IntegrationClaimV1, "source" | "conformanceReceipt">>).map((row) =>
  [row.path, a4IntegrationClaimV1Schema.parse({ ...row, source: SOURCE, conformanceReceipt: null })])) as Record<A4IntegrationPath, A4IntegrationClaimV1>;

export const INTEGRATION_PATHS = Object.keys(INTEGRATION_CLAIMS) as A4IntegrationPath[];

/** The claim for `path`; null for a path the table does not list. */
export const integrationClaimFor = (path: unknown): A4IntegrationClaimV1 | null =>
  typeof path === "string" && Object.hasOwn(INTEGRATION_CLAIMS, path) ? INTEGRATION_CLAIMS[path as A4IntegrationPath] : null;

/**
 * The scaffold each external path gets (design §13; src/a4/assembleConnect.ts): the LangChain callback handler for the
 * LangChain family, the generic HTTP guide for gateway-observed paths, the custom guide for `other`. Hook and pi paths
 * connect instead, and the native path builds through native tasks.
 */
export const SCAFFOLD_FRAMEWORK: Readonly<Partial<Record<A4IntegrationPath, IntegrationFramework>>> = {
  langgraph: "langchain", langchain: "langchain", crewai: "langchain", "openai-agents": "generic-http", "vercel-ai": "generic-http",
  "generic-http": "generic-http", other: "custom"
};
