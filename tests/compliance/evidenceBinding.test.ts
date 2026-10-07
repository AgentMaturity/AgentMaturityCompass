import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { getAgentPaths } from "../../src/fleet/paths.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { evidenceProducer, PRODUCER_BY_SOURCE } from "../../src/claims/evidenceProvenance.js";
import { isBoundToControl, subjectRole, verifiedAssuranceByPack } from "../../src/compliance/evidenceBinding.js";
import type { ComplianceEvidenceRequirement, ComplianceMapping } from "../../src/compliance/mappingSchema.js";
import type { EvidenceEvent } from "../../src/types.js";

function event(fields: { meta?: Record<string, unknown> | string; session?: string; type?: string; auditType?: string }): EvidenceEvent {
  return {
    id: "e1",
    ts: Date.now(),
    session_id: fields.session ?? "session-1",
    runtime: "unknown",
    event_type: fields.type ?? "audit",
    payload_path: null,
    payload_inline: fields.auditType ? JSON.stringify({ auditType: fields.auditType }) : null,
    payload_sha256: "0".repeat(64),
    meta_json: typeof fields.meta === "string" ? fields.meta : JSON.stringify(fields.meta ?? {}),
    prev_event_hash: "",
    event_hash: "1".repeat(64),
    writer_sig: ""
  } as EvidenceEvent;
}

describe("evidenceProducer", () => {
  const rows: Array<[Record<string, unknown>, string]> = [
    [{ provenance: "dogfood" }, "synthetic"],
    [{ claimKind: "synthetic_example", source: "bridge" }, "synthetic"],
    [{ source: "dogfood-maturity" }, "synthetic"],
    ...["eval_import", "import", "watch", "attested_ingest", "chatgpt", "claude_console", "gemini_ui", "generic_json", "generic_text"]
      .map((source): [Record<string, unknown>, string] => [{ source }, "import"]),
    ...["manual", "operator", "feedback.ingest"].map((source): [Record<string, unknown>, string] => [{ source }, "manual"]),
    [{ source: "webhook" }, "external-report"],
    [{ source: "stdin_pipe" }, "amc-runtime"],
    [{ source: "constructor" }, "amc-runtime"],
    [{}, "amc-runtime"]
  ];
  test.each(rows)("%j -> %s", (meta, producer) => {
    expect(evidenceProducer(event({ meta }))).toBe(producer);
  });

  test("unparseable meta is runtime with no claims (it binds to nothing)", () => {
    expect(evidenceProducer(event({ meta: "{not json" }))).toBe("amc-runtime");
  });
});

/**
 * Every `source: "…"` literal in src must be classified: either a non-runtime producer in
 * PRODUCER_BY_SOURCE, or reviewed here as AMC-runtime (or not an evidence source at all).
 * A new importer that writes `source: "x_import"` fails this test until someone classifies it.
 */
const REVIEWED_RUNTIME_OR_NON_EVIDENCE = new Set([
  "", "active", "adapter-observation", "adapters", "agent", "agents", "amc", "amc-registered", "amc.audit", "api",
  "approvals", "assurance", "audit-logs", "backoff", "backup", "both", "bridge", "budgets", "built-in-mcp-agent-provider",
  "builtin", "catalog-only", "cli", "compliance", "correlation", "decision", "derived", "detector",
  "diagnostic-eval-replay-corpus-boundary", "env", "eoc", "eval-replay-corpus", "eval.run.layer", "eval.run.question",
  "events", "failed-evaluation", "file", "filesystem", "firewall", "fleet", "forecast", "gateway", "hook", "hook_control",
  "host", "identity", "incident-regression", "inference-strategy-comparison", "judge-calibration", "ledger", "leases",
  "linked-recorded-request-outcomes", "live-score-behavior-drift", "local", "none", "ops", "ops.blobs",
  "override-near-miss-analytics", "plugin", "plugins", "policy", "project-env", "provider", "provider-drift-benchmark",
  "redteam", "registry", "release", "replay-benchmark-corpus", "reports", "request-failure", "retention.auto",
  "risk-cost-latency-slo", "roles", "sdk", "settings", "shield.exploit_confirmation", "stdin_pipe", "studio",
  "studio-audit", "support-observation", "toolhub", "tools", "trace", "transform", "transparency", "trust", "trust-list",
  "trust-list-history", "turn-error", "turn-events", "undeclared-runner", "user-env", "users", "validators"
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|js|mjs|cjs)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe("source-literal enumeration", () => {
  test("every source literal in src is classified", () => {
    const literals = new Set<string>();
    for (const file of sourceFiles("src")) {
      for (const match of readFileSync(file, "utf8").matchAll(/source: "([a-z_.-]*)"/g)) literals.add(match[1] ?? "");
    }
    expect(literals.size).toBeGreaterThan(50);
    const unclassified = [...literals].filter((source) =>
      !Object.hasOwn(PRODUCER_BY_SOURCE, source) && !REVIEWED_RUNTIME_OR_NON_EVIDENCE.has(source)).sort();
    expect(unclassified).toEqual([]);
  });
});

const mapping = { id: "nist_map" } as ComplianceMapping;
const eventReq = { type: "requires_evidence_event", eventTypes: ["audit"], minObservedRatio: 0 } as ComplianceEvidenceRequirement;
const auditReq = { ...eventReq, auditTypes: ["NIST_MAP_SIGNAL"] } as ComplianceEvidenceRequirement;

describe("isBoundToControl", () => {
  test("binds through meta.controlIds naming the mapping", () => {
    expect(isBoundToControl(event({ meta: { controlIds: ["nist_map"] } }), mapping, eventReq)).toBe(true);
    expect(isBoundToControl(event({ meta: { controlIds: ["soc2_availability"] } }), mapping, eventReq)).toBe(false);
    expect(isBoundToControl(event({ meta: { controlIds: "nist_map" } }), mapping, eventReq)).toBe(false);
    expect(isBoundToControl(event({ meta: "{not json" }), mapping, eventReq)).toBe(false);
  });

  test("binds an audit event through the requirement's auditTypes only", () => {
    expect(isBoundToControl(event({ auditType: "NIST_MAP_SIGNAL" }), mapping, auditReq)).toBe(true);
    expect(isBoundToControl(event({ auditType: "NIST_MAP_SIGNAL" }), mapping, eventReq)).toBe(false);
    expect(isBoundToControl(event({ auditType: "OTHER_SIGNAL" }), mapping, auditReq)).toBe(false);
    expect(isBoundToControl(event({ type: "metric", meta: { auditType: "NIST_MAP_SIGNAL" } }), mapping, auditReq)).toBe(false);
    expect(isBoundToControl(event({ meta: { auditType: "NIST_MAP_SIGNAL" } }), mapping, auditReq)).toBe(true);
  });
});

describe("subjectRole", () => {
  test.each([
    [{ agentId: "a" }, "session-1", "agent", "positive"],
    [{ agentId: "b" }, "session-1", "agent", "none"],
    [{}, "session-1", "agent", "none"],
    [{}, "session-1", "workspace", "none"],
    [{}, "system", "agent", "violation-only"],
    [{ agentId: "a" }, "system", "agent", "violation-only"],
    [{}, "system", "workspace", "positive"]
  ] as const)("meta %j in %s with scope %s -> %s", (meta, session, scope, role) => {
    expect(subjectRole(event({ meta, session }), "a", scope)).toBe(role);
  });

  test("a missing agent id is never credited to default", () => {
    expect(subjectRole(event({ meta: {} }), "default", "agent")).toBe("none");
  });
});

describe("verifiedAssuranceByPack", () => {
  const roots: string[] = [];
  afterEach(() => {
    while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
  });

  function workspace(): string {
    const dir = mkdtempSync(join(tmpdir(), "amc-evidence-binding-"));
    roots.push(dir);
    process.env.AMC_VAULT_PASSPHRASE = "evidence-binding-passphrase";
    initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
    return dir;
  }

  function write(ws: string, name: string, fields: Record<string, unknown>, seal: boolean): void {
    const now = Date.now();
    const base = {
      assuranceRunId: name, agentId: "default", ts: now, windowStartTs: now - 1000, windowEndTs: now,
      evidenceStatus: "MEASURED", packResults: [{ packId: name, score0to100: 90, scenarioResults: [] }],
      reportJsonSha256: "", runSealSig: "", ...fields
    };
    const hash = sha256Hex(canonicalize(base));
    const ledger = openLedger(ws);
    const sig = seal ? ledger.signRunHash(hash) : "unsigned";
    ledger.close();
    const dir = join(getAgentPaths(ws, "default").reportsDir, "assurance");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.json`), JSON.stringify({ ...base, reportJsonSha256: hash, runSealSig: sig }));
  }

  test("counts sealed in-window reports, names unverifiable ones and skips insufficient evidence", () => {
    const ws = workspace();
    const now = Date.now();
    write(ws, "sealed", {}, true);
    write(ws, "unsealed", {}, false);
    write(ws, "insufficient", { evidenceStatus: "INSUFFICIENT_EVIDENCE" }, true);
    write(ws, "stale", { ts: now - 10 * 86_400_000 }, true);
    write(ws, "other-agent", { agentId: "someone-else" }, true);
    writeFileSync(join(getAgentPaths(ws, "default").reportsDir, "assurance", "broken.json"), "{not json");
    const out = verifiedAssuranceByPack({ workspace: ws, agentId: "default", windowStartTs: now - 86_400_000, windowEndTs: now + 1000 });
    expect([...out.packs.keys()]).toEqual(["sealed"]);
    expect(out.packs.get("sealed")?.score0to100).toBe(90);
    expect(out.unverifiable.map((row) => row.packIds)).toEqual([[], ["unsealed"]]);
  });

  test("an agent without a reports folder has no verified packs", () => {
    const ws = workspace();
    const out = verifiedAssuranceByPack({ workspace: ws, agentId: "nobody", windowStartTs: 0, windowEndTs: Date.now() });
    expect(out.packs.size).toBe(0);
    expect(out.unverifiable).toEqual([]);
  });
});
