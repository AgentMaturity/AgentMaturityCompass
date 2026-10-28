/**
 * The IntegrationClaim path table (P1-60; design §13): for each way of building an agent, which boundary enforces it,
 * what tier its evidence reaches and what it does not cover. A claim is a projection AMC states about its own
 * integration paths, never about the agent. The hook paths (claude-code, pi) are projected from P2-17's adapter claim
 * manifests (P2-37): `enforced` only when the adapter's tool-call hook has role `enforce`, onFailure `blocks`, and the
 * checked manifest has no problems and a qualification record hashed by its receipt for the qualified versions.
 * Anything less is `preview` (a manifest that does not back the claim) or `unsupported` (no manifest), with the key.
 * The other rows stay hand-maintained: no manifest exists for them. The closure-stub adapters
 * (src/integrations/langchainAdapter.ts) are never listed.
 *
 * Manifests live under docs/ and qualification/, which the npm package does not ship: the build copies each manifest
 * with its record and that folder's receipt.json into dist/adapter-claims (scripts/copy-build-assets.mjs), and the
 * loader re-checks them there at runtime. A source run reads them from the repository. When neither is present the hook
 * paths read `unsupported` (fail closed).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAdapterManifests, type CheckedAdapterManifest } from "../adapters/conformance/adapterManifest.js";
import type { IntegrationFramework } from "../setup/integrationScaffold.js";
import { a4IntegrationClaimV1Schema, type A4IntegrationClaimV1 } from "./a4Schema.js";

export type A4IntegrationPath = A4IntegrationClaimV1["path"];

const SOURCE = "design §13 (amc.a4-integration-claim/v1)";
const MANIFEST_DIR = "docs/adapters/manifests";
const GATEWAY_GAPS = ["tool calls are not intercepted (gateway sees model traffic only)", "imported traces are self_reported, originals retained (P1-24)"];

/** The manifest-owned paths: the adapter's tool-call hook, the boundary it enforces at, and the key that qualifies it. */
const MANIFEST_PATHS = {
  "claude-code": { hook: "PreToolUse", boundary: "hook:PreToolUse", key: "P1-23" },
  pi: { hook: "tool_call", boundary: "pi:tool_call", key: "P1-22" }
} as const satisfies Partial<Record<A4IntegrationPath, { hook: string; boundary: A4IntegrationClaimV1["enforcementBoundary"]; key: string }>>;
type ManifestPath = keyof typeof MANIFEST_PATHS;

type Row = Omit<A4IntegrationClaimV1, "source" | "conformanceReceipt">;
const HAND_ROWS: Row[] = [
  { path: "native", enforcementBoundary: "tool_pipeline", evidenceTier: "observed", supported: "supported", reason: null,
    notCovered: ["the shell (decideNativeShell) is confined by linux-bwrap or macos-seatbelt and refused when no backend is available; it has no enforcement boundary (enforcement none) only under the operator's macOS unconfined opt-in",
      "agent behaviour on the stub provider is not evaluated (synthetic_example)"] },
  ...(["langgraph", "langchain", "crewai", "openai-agents", "vercel-ai"] as const).map((path) => ({ path, enforcementBoundary: "gateway" as const,
    evidenceTier: "observed" as const, supported: "preview" as const, reason: "P1-54 (ToolHub-bridged calls observed, not journaled)", notCovered: GATEWAY_GAPS })),
  { path: "generic-http", enforcementBoundary: "gateway", evidenceTier: "self_reported", supported: "preview", reason: "observe-only through the gateway", notCovered: GATEWAY_GAPS },
  { path: "other", enforcementBoundary: "none", evidenceTier: "self_reported", supported: "preview", reason: "no integration path; only what the operator reports",
    notCovered: ["nothing is enforced or observed by AMC"] }
];

/** Why the manifest does not back an enforced claim at `hook`, or null when it does. */
function blocker(checked: CheckedAdapterManifest, path: ManifestPath, hook: string): string | null {
  if (checked.manifest === null || checked.problems.length > 0) return `manifest not backed: ${checked.problems[0] ?? "unreadable"}`;
  if (checked.manifest.adapter !== path) return `${checked.file} names adapter ${checked.manifest.adapter}`;
  const entry = checked.manifest.hooks.find((candidate) => candidate.name === hook);
  if (entry === undefined || entry.role !== "enforce" || entry.onFailure !== "blocks") {
    return `${hook} is not an enforce hook that blocks on failure (role ${entry?.role ?? "absent"}, onFailure ${entry?.onFailure ?? "absent"})`;
  }
  if (checked.receiptSha256 === null || checked.manifest.harness.versions.length === 0) return "no conformance receipt for the pinned version";
  return null;
}

/** One hook path's claim from its checked manifest (undefined: no manifest for the adapter). */
function manifestClaim(path: ManifestPath, checked: CheckedAdapterManifest | undefined): A4IntegrationClaimV1 {
  const { hook, boundary, key } = MANIFEST_PATHS[path];
  if (checked === undefined) {
    return a4IntegrationClaimV1Schema.parse({ path, enforcementBoundary: boundary, evidenceTier: "self_reported", supported: "unsupported",
      reason: `${key} (no adapter claim manifest)`, notCovered: ["no adapter claim manifest: nothing is enforced or observed"], source: SOURCE, conformanceReceipt: null });
  }
  const source = `${checked.file} (amc.adapter-claim-manifest/v1)`;
  const why = blocker(checked, path, hook);
  const notCovered = checked.manifest?.notCovered ?? [];
  if (why !== null) {
    return a4IntegrationClaimV1Schema.parse({ path, enforcementBoundary: boundary, evidenceTier: "self_reported", supported: "preview",
      reason: `${key} (${why.slice(0, 200)})`, notCovered: [`enforced only with a conformance receipt for the pinned version: ${why.slice(0, 200)}`, ...notCovered],
      source, conformanceReceipt: null });
  }
  const versions = checked.manifest!.harness.versions;
  return a4IntegrationClaimV1Schema.parse({ path, enforcementBoundary: boundary, evidenceTier: "observed", supported: "supported", reason: null,
    notCovered: [...notCovered, `${checked.manifest!.harness.package} versions other than ${versions.join(", ")}`], source,
    conformanceReceipt: { sha256: checked.receiptSha256!, pinnedVersion: versions.join(", ") } });
}

/** The table from checked manifests: hook paths projected from their adapter's manifest, every other path hand-maintained. */
export function integrationClaimsFrom(manifests: readonly CheckedAdapterManifest[]): Readonly<Record<A4IntegrationPath, A4IntegrationClaimV1>> {
  // Keyed by file name, not by the manifest's own `adapter` field: a manifest that fails to parse still blocks its path.
  const byAdapter = (path: ManifestPath) => manifests.find((checked) => checked.file === `${MANIFEST_DIR}/${path}.json`);
  const hand = Object.fromEntries(HAND_ROWS.map((row) => [row.path, a4IntegrationClaimV1Schema.parse({ ...row, source: SOURCE, conformanceReceipt: null })]));
  return Object.freeze({ native: hand.native!, "claude-code": manifestClaim("claude-code", byAdapter("claude-code")), pi: manifestClaim("pi", byAdapter("pi")),
    ...Object.fromEntries(HAND_ROWS.slice(1).map((row) => [row.path, hand[row.path]!])) }) as Record<A4IntegrationPath, A4IntegrationClaimV1>;
}

/** The roots that may hold the manifests: the copy beside dist, then the repository a source run lives in. */
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const MANIFEST_ROOTS = [join(MODULE_DIR, "..", "adapter-claims"), join(MODULE_DIR, "..", "..")];

/** The checked manifests AMC shipped with, or none (every hook path then reads unsupported). */
function shippedManifests(): CheckedAdapterManifest[] {
  const root = MANIFEST_ROOTS.find((candidate) => existsSync(join(candidate, MANIFEST_DIR)));
  return root === undefined ? [] : loadAdapterManifests(root);
}

/** The table, keyed by path; every row parses as amc.a4-integration-claim/v1. */
export const INTEGRATION_CLAIMS: Readonly<Record<A4IntegrationPath, A4IntegrationClaimV1>> = integrationClaimsFrom(shippedManifests());

export const INTEGRATION_PATHS = Object.keys(INTEGRATION_CLAIMS) as A4IntegrationPath[];

/** The claim for `path`; null for a path the table does not list. */
export const integrationClaimFor = (path: unknown): A4IntegrationClaimV1 | null =>
  typeof path === "string" && Object.hasOwn(INTEGRATION_CLAIMS, path) ? INTEGRATION_CLAIMS[path as A4IntegrationPath] : null;

/** How a card states the claim: "enforced at <boundary>" only for a supported path with an enforcing boundary. */
export const claimLabel = (claim: A4IntegrationClaimV1): string =>
  claim.supported === "supported" && claim.enforcementBoundary !== "gateway" && claim.enforcementBoundary !== "none"
    ? `enforced at ${claim.enforcementBoundary}` : claim.supported;

/**
 * The release record's row for the claim's boundary (src/a4/a4Package.ts enforcementBoundaries): `enforced` exactly when
 * the card reads "enforced at <boundary>" (claimLabel), `observed` when the claim's evidence is observed, else `none`.
 */
export const releaseBoundaryOf = (claim: A4IntegrationClaimV1): { boundary: string; status: "enforced" | "observed" | "none"; note: string } => ({
  boundary: claim.enforcementBoundary,
  status: claimLabel(claim) !== claim.supported ? "enforced" : claim.enforcementBoundary !== "none" && claim.evidenceTier === "observed" ? "observed" : "none",
  note: claim.notCovered.join("; ") || claim.supported
});

/**
 * The scaffold each external path gets (design §13; src/a4/assembleConnect.ts): the LangChain callback handler for the
 * LangChain family, the generic HTTP guide for gateway-observed paths, the custom guide for `other`. Hook and pi paths
 * connect instead, and the native path builds through native tasks.
 */
export const SCAFFOLD_FRAMEWORK: Readonly<Partial<Record<A4IntegrationPath, IntegrationFramework>>> = {
  langgraph: "langchain", langchain: "langchain", crewai: "langchain", "openai-agents": "generic-http", "vercel-ai": "generic-http",
  "generic-http": "generic-http", other: "custom"
};
