import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { EVIDENCE_EVENT_TYPES } from "../../src/contracts/v1/evidenceEvent.js";
import { emitterAdmits, emitterById, EVIDENCE_EMITTERS, fromRegisteredEmitter, type EmitterEntry } from "../../src/diagnostic/evidenceEmitters.js";
import { parseEvidenceEventWith } from "../../src/diagnostic/gates.js";
import type { EvidenceEvent } from "../../src/types.js";

const CHECKOUT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
type DirectAdmissionRow = Parameters<typeof emitterAdmits>[1]; // Synthetic input with an already-derived effective tier.
function entry(id: string): EmitterEntry {
  const found = emitterById(id);
  if (!found) throw new Error(`Missing registered emitter ${id}`);
  return found;
}
function raw(meta: Record<string, unknown>, eventType: EvidenceEvent["event_type"] = "audit"): EvidenceEvent {
  return { id: "unverified-parser-input", ts: Date.now(), session_id: "synthetic-parser-session", runtime: "amc",
    event_type: eventType, payload_path: null, payload_inline: "synthetic input", payload_sha256: "0".repeat(64),
    meta_json: JSON.stringify(meta), prev_event_hash: "0".repeat(64), event_hash: "0".repeat(64), writer_sig: "unverified-unit-input" };
}

describe("P1-07 emitter registry finite correspondence", () => {
  test("registered IDs are unique and keep both canonical tool-decision anchors", () => {
    const ids = EVIDENCE_EMITTERS.map(row => row.id);
    expect(ids.length).toBeGreaterThan(0); expect(ids.every(id => id.trim().length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("tool-call-allowed"); expect(ids).toContain("tool-call-denied");
  });

  // Separate fixed body: literal absence must not hide the direct seeder/synthetic registry witness.
  test("the registry excludes seeder modules and synthetic claims and caps importers at L1", () => {
    const seeders = EVIDENCE_EMITTERS.filter(row => row.module.startsWith("src/dogfood/")).map(row => row.id);
    const synthetic = EVIDENCE_EMITTERS.filter(row => row.claimKind === "synthetic_example").map(row => row.id);
    console.log("AMC_P107_REGISTRY_EXCLUSIONS " + JSON.stringify({ seeders, synthetic }));
    expect(seeders).toEqual([]); expect(synthetic).toEqual([]);
    for (const registered of EVIDENCE_EMITTERS) {
      if (/import|ingest/i.test(registered.module)) {
        expect(registered.claimKind, registered.id).toBe("self_reported");
        expect(registered.producer, registered.id).toBe("import");
        expect(registered.levelUse, registered.id).toEqual(["L1"]);
      }
      if (registered.claimKind === "observed") expect(registered.producer, registered.id).toBe("amc-runtime");
      expect(registered.levelUse.length, registered.id).toBeGreaterThan(0);
    }
  });

  test("every current module contains its exact quoted literal in this physical checkout", () => {
    for (const registered of EVIDENCE_EMITTERS) {
      expect(registered.module.startsWith("src/"), registered.id).toBe(true);
      expect(registered.module.split("/").includes(".."), registered.id).toBe(false);
      const path = join(CHECKOUT, registered.module);
      expect(existsSync(path), registered.id).toBe(true);
      const source = readFileSync(path, "utf8");
      expect(source, registered.id).toContain(`"${registered.auditType ?? registered.metricKey ?? registered.eventType}"`);
      if (registered.requiresMeta) expect(source, registered.id).toContain(registered.requiresMeta);
      expect(EVIDENCE_EVENT_TYPES, registered.id).toContain(registered.eventType);
    }
  });
});

describe("P1-07 synthetic already-effective-tier admission matrices", () => {
  test("observed admission needs the exact shape, runtime producer and effective tier", () => {
    const allowed = entry("tool-call-allowed");
    const rows: Array<{ label: string; row: DirectAdmissionRow; admitted: boolean }> = [
      { label: "observed", row: { event_type: "audit", meta: { auditType: "TOOL_CALL_ALLOWED" }, trustTier: "OBSERVED" }, admitted: true },
      { label: "hardened", row: { event_type: "audit", meta: { auditType: "TOOL_CALL_ALLOWED" }, trustTier: "OBSERVED_HARDENED" }, admitted: true },
      { label: "wrong event", row: { event_type: "metric", meta: { auditType: "TOOL_CALL_ALLOWED" }, trustTier: "OBSERVED" }, admitted: false },
      { label: "wrong audit", row: { event_type: "audit", meta: { auditType: "TOOL_CALL_DENIED" }, trustTier: "OBSERVED" }, admitted: false },
      { label: "manual producer", row: { event_type: "audit", meta: { auditType: "TOOL_CALL_ALLOWED", source: "manual" }, trustTier: "OBSERVED" }, admitted: false },
      { label: "import producer", row: { event_type: "audit", meta: { auditType: "TOOL_CALL_ALLOWED", source: "eval_import" }, trustTier: "OBSERVED" }, admitted: false },
      { label: "synthetic producer", row: { event_type: "audit", meta: { auditType: "TOOL_CALL_ALLOWED", source: "dogfood-maturity" }, trustTier: "OBSERVED" }, admitted: false },
      { label: "self reported", row: { event_type: "audit", meta: { auditType: "TOOL_CALL_ALLOWED" }, trustTier: "SELF_REPORTED" }, admitted: false },
      { label: "attested", row: { event_type: "audit", meta: { auditType: "TOOL_CALL_ALLOWED" }, trustTier: "ATTESTED" }, admitted: false }
    ];
    const actual = rows.map(candidate => ({ label: candidate.label, admitted: emitterAdmits(allowed, candidate.row) }));
    expect(actual).toEqual(rows.map(candidate => ({ label: candidate.label, admitted: candidate.admitted })));
  });

  test("import admission requires import provenance, matching metric key and SELF_REPORTED", () => {
    const imported = entry("eval-import-score");
    const rows: Array<{ row: DirectAdmissionRow; expected: boolean }> = [
      { row: { event_type: "metric", meta: { source: "eval_import", metricKey: "external_eval_score" }, trustTier: "SELF_REPORTED" }, expected: true },
      { row: { event_type: "metric", meta: { source: "eval_import", metricKey: "other" }, trustTier: "SELF_REPORTED" }, expected: false },
      { row: { event_type: "metric", meta: { metricKey: "external_eval_score" }, trustTier: "SELF_REPORTED" }, expected: false },
      { row: { event_type: "metric", meta: { source: "eval_import", metricKey: "external_eval_score" }, trustTier: "OBSERVED" }, expected: false }
    ];
    expect(rows.map(candidate => emitterAdmits(imported, candidate.row))).toEqual(rows.map(candidate => candidate.expected));
  });

  test("requiresMeta means own-property presence without claiming delegation-scope validation", () => {
    const delegated = entry("delegation-settled"), inherited: Record<string, unknown> = { auditType: "DELEGATION_SETTLED" };
    Object.setPrototypeOf(inherited, { delegationScope: "inherited-synthetic-value" });
    const rows: DirectAdmissionRow[] = [
      { event_type: "audit", meta: { auditType: "DELEGATION_SETTLED", delegationScope: "synthetic-scope" }, trustTier: "OBSERVED" },
      { event_type: "audit", meta: { auditType: "DELEGATION_SETTLED" }, trustTier: "OBSERVED" },
      { event_type: "audit", meta: inherited, trustTier: "OBSERVED" },
      { event_type: "audit", meta: { auditType: "DELEGATION_SETTLED", delegationScope: undefined }, trustTier: "OBSERVED" }
    ];
    expect(rows.map(candidate => emitterAdmits(delegated, candidate))).toEqual([true, false, false, true]);
  });

  test("unknown audit shapes refuse while broad stdout admission does not authenticate a unique writer", () => {
    const unknown: DirectAdmissionRow = { event_type: "audit", meta: { auditType: "NO_REGISTERED_UNIT_AUDIT" }, trustTier: "OBSERVED" };
    const stdout: DirectAdmissionRow = { event_type: "stdout", meta: {}, trustTier: "OBSERVED" };
    expect(fromRegisteredEmitter(unknown)).toBe(false);
    expect(fromRegisteredEmitter(stdout)).toBe(true);
    expect(EVIDENCE_EMITTERS.filter(registered => emitterAdmits(registered, stdout)).map(registered => registered.id))
      .toEqual(["tool-output-digest", "delegate-report-digest"]);
  });
});

describe("P1-07 public parser provenance on unverified input", () => {
  test("known manual/import/dogfood and unbound ATTESTED markers cannot impersonate observed tool receipts", () => {
    let trustLoads = 0;
    const noTrust = () => { trustLoads++; return { trustList: null }; };
    const cases = [
      { label: "manual", meta: { source: "manual", trustTier: "OBSERVED" } },
      { label: "operator", meta: { source: "operator", trustTier: "OBSERVED" } },
      { label: "import", meta: { source: "import", trustTier: "OBSERVED" } },
      { label: "eval import", meta: { source: "eval_import", trustTier: "OBSERVED" } },
      { label: "dogfood", meta: { source: "dogfood-maturity", trustTier: "OBSERVED" } },
      { label: "dogfood provenance", meta: { provenance: "dogfood", trustTier: "OBSERVED" } },
      { label: "synthetic claim", meta: { claimKind: "synthetic_example", trustTier: "OBSERVED" } },
      { label: "unbound attested", meta: { trustTier: "ATTESTED" } }
    ].map(candidate => ({ label: candidate.label, parsed: parseEvidenceEventWith(raw({ auditType: "TOOL_CALL_ALLOWED", ...candidate.meta }), noTrust) }));
    expect(cases.map(candidate => ({ label: candidate.label, tier: candidate.parsed.trustTier,
      admitted: fromRegisteredEmitter(candidate.parsed) })))
      .toEqual(cases.map(candidate => ({ label: candidate.label, tier: "SELF_REPORTED", admitted: false })));
    expect(trustLoads).toBe(0); // No bound attestation: no ambient trust or positive signature verification was reached.
  });

  test("missing or unknown source defaults to runtime, and parsed import tests remain self-reported", () => {
    const noTrust = () => ({ trustList: null });
    const runtime = [{ trustTier: "OBSERVED" }, { source: "unmapped-unit-source", trustTier: "OBSERVED" }]
      .map(meta => parseEvidenceEventWith(raw({ auditType: "TOOL_CALL_ALLOWED", ...meta }), noTrust));
    expect(runtime.map(row => [row.trustTier, fromRegisteredEmitter(row)])).toEqual([["OBSERVED", true], ["OBSERVED", true]]);
    const imported = parseEvidenceEventWith(raw({ source: "eval_import", trustTier: "OBSERVED" }, "test"), noTrust);
    expect(imported.trustTier).toBe("SELF_REPORTED"); expect(fromRegisteredEmitter(imported)).toBe(true);
  });
});
