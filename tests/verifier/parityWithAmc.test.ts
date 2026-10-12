/**
 * The package's hand-written validators and AMC's zod schemas must accept and reject the same inputs: every fixture
 * record, and deterministic single-field mutations of them. Two validators drift without this check; keep it blocking.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { z } from "zod";
import { actionReceiptV1Schema } from "../../src/actions/receiptStates.js";
import { INTOTO_PAYLOAD_TYPE, verifyDsse } from "../../src/attest/dsse.js";
import { envelopeFromSigstoreBundle } from "../../src/attest/sigstoreBundle.js";
import { inTotoStatementSchema } from "../../src/attest/statement.js";
import { controlResultV1Schema, evidenceEventV1Schema, receiptV2Schema, scopedAttestationV2Schema } from "../../src/contracts/index.js";
import { signedRevocationListSchema } from "../../src/keys/revocationList.js";
import { signedKeyRotationStatementSchema } from "../../src/keys/rotationStatement.js";
import { validateExternalEvidenceProfile } from "../../src/standard/externalEvidenceProfile.js";
import { signedRootRotationSchema } from "../../src/trust/rootRotation.js";
import { signedTrustListSchema } from "../../src/trust/trustList.js";
import { REASON_CODES as AMC_REASON_CODES, verifierReportSchema } from "../../src/trust/verifierReport.js";
import { BUILT_IN_DISTRUST, REASON_CODES, validateRecord, verifyArtifact, type RecordKind } from "../../packages/verifier/src/index.js";
import { caseNames, loadCase } from "./fixtures.js";

const ZOD: Record<Exclude<RecordKind, "external-evidence">, z.ZodType> = {
  "trust-list": signedTrustListSchema,
  "scoped-attestation": scopedAttestationV2Schema,
  "receipt-payload": receiptV2Schema,
  "action-receipt": actionReceiptV1Schema,
  "control-result": controlResultV1Schema,
  "evidence-event": evidenceEventV1Schema,
  "key-rotation": signedKeyRotationStatementSchema,
  "root-rotation": signedRootRotationSchema,
  "revocation-list": signedRevocationListSchema,
  "intoto-statement": inTotoStatementSchema
};

const amcAccepts = (kind: RecordKind, value: unknown) =>
  kind === "external-evidence" ? validateExternalEvidenceProfile(value).length === 0 : ZOD[kind].safeParse(value).success;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const isObject = (value: unknown): value is Record<string, Json> => value !== null && typeof value === "object" && !Array.isArray(value);

/** The kind of an artifact or evidence item, by the same markers the verifier uses. */
function kindOf(value: Json): RecordKind | null {
  if (!isObject(value)) return null;
  const nested = (key: string) => (isObject(value[key]) ? (value[key] as Record<string, Json>).type : undefined);
  if (value.type === "amc.scoped-attestation") return "scoped-attestation";
  if (value._type === "https://in-toto.io/Statement/v1") return "intoto-statement";
  if (value.profile === "amc.external-evidence") return "external-evidence";
  if (value.schema === "amc.action-receipt/v1") return "action-receipt";
  if (value.type === "amc.control-result") return "control-result";
  if (typeof value.eventHash === "string") return "evidence-event";
  if (nested("list") === "amc.trust-list") return "trust-list";
  if (nested("list") === "amc.revocation-list") return "revocation-list";
  if (nested("statement") === "amc.key-rotation") return "key-rotation";
  if (nested("statement") === "amc.root-rotation") return "root-rotation";
  return null;
}

/** Every distinct record in the corpus: artifacts, trust lists, receipt payloads and evidence items. */
function corpus(): Array<{ kind: RecordKind; value: Json; from: string }> {
  const seen = new Map<string, { kind: RecordKind; value: Json; from: string }>();
  const add = (value: Json, from: string) => {
    if (typeof value === "string" && value.includes(".")) {
      add(JSON.parse(Buffer.from(value.split(".")[0]!, "base64url").toString("utf8")) as Json, `${from} payload`);
      return;
    }
    if (Array.isArray(value)) { value.forEach((item, index) => add(item, `${from}[${index}]`)); return; }
    if (isObject(value) && isObject(value.dsseEnvelope)) {
      add(JSON.parse(Buffer.from(String(value.dsseEnvelope.payload), "base64").toString("utf8")) as Json, `${from} statement`);
      return;
    }
    const kind = typeof value === "object" && value !== null && !Array.isArray(value) && (value.v === 2 && typeof value.receipt_id === "string") ? "receipt-payload" : kindOf(value);
    if (kind && !seen.has(JSON.stringify(value))) seen.set(JSON.stringify(value), { kind, value, from });
  };
  for (const name of caseNames()) {
    const { bytes, options } = loadCase(name);
    add(JSON.parse(bytes.toString("utf8")) as Json, `${name}/artifact.json`);
    for (const list of options.trustLists) add(list as Json, `${name}/trust-list.json`);
    for (const [digest, item] of options.evidence ?? []) {
      try { add(JSON.parse(Buffer.from(item).toString("utf8")) as Json, `${name}/evidence/${digest}`); } catch { /* raw bytes, not a record */ }
    }
  }
  return [...seen.values()];
}

const REPLACEMENTS: Json[] = [null, "", "x", 0, -1, 1.5, true, [], {}, "A".repeat(64), "f".repeat(64), "2026-10-15T09:00Z", "2026-02-30T00:00:00.000Z",
  9_007_199_254_740_992, "x".repeat(5000), "2026-10-15T09:00:00+00:00"];

/** Paths to every member and element, depth first. */
function paths(value: Json, prefix: Array<string | number> = []): Array<Array<string | number>> {
  const children = Array.isArray(value) ? value.map((item, index) => [index, item] as const)
    : isObject(value) ? Object.entries(value) : [];
  return children.flatMap(([key, child]) => [[...prefix, key], ...paths(child as Json, [...prefix, key])]);
}

/** One mutation of the member at `path`: deleted, given an unknown sibling, or replaced. */
function mutate(value: Json, path: Array<string | number>, op: number): Json {
  const copy = structuredClone(value);
  const parent = path.slice(0, -1).reduce<Json>((node, key) => (node as Record<string, Json>)[key as string]!, copy) as Record<string, Json> | Json[];
  const key = path[path.length - 1]!;
  if (op === REPLACEMENTS.length) {
    if (Array.isArray(parent)) parent.splice(key as number, 1);
    else delete parent[key as string];
  } else if (op === REPLACEMENTS.length + 1) {
    if (Array.isArray(parent)) parent.push(structuredClone(parent[0]!));
    else parent.zz_unknown = 1;
  } else {
    (parent as Record<string, Json>)[key as string] = structuredClone(REPLACEMENTS[op]!);
  }
  return copy;
}

describe("the package and AMC agree", () => {
  const records = corpus();

  test("on every record of the corpus", () => {
    expect(new Set(records.map(record => record.kind))).toEqual(new Set(["trust-list", "scoped-attestation", "receipt-payload", "action-receipt",
      "control-result", "evidence-event", "key-rotation", "root-rotation", "revocation-list", "external-evidence", "intoto-statement"]));
    for (const record of records) {
      expect(validateRecord(record.kind, record.value).ok, record.from).toBe(amcAccepts(record.kind, record.value));
    }
  });

  test("on at least 200 single-field mutations, accepting and rejecting the same ones", () => {
    let compared = 0;
    let accepted = 0;
    const OPS = REPLACEMENTS.length + 2;
    records.forEach((record, recordIndex) => {
      // A deterministic stride over (path, operation) pairs keeps the run short and covers every operation.
      paths(record.value).forEach((path, pathIndex) => {
        if ((pathIndex + recordIndex) % 3 !== 0) return;
        const op = (pathIndex * 7 + recordIndex) % OPS;
        const mutated = mutate(record.value, path, op);
        const ours = validateRecord(record.kind, mutated).ok;
        expect(ours, `${record.from} ${path.join(".")} op ${op}`).toBe(amcAccepts(record.kind, mutated));
        compared += 1;
        if (ours) accepted += 1;
      });
    });
    expect(compared).toBeGreaterThanOrEqual(200);
    expect(accepted).toBeGreaterThan(0);
    expect(accepted).toBeLessThan(compared);
  });

  test("every report the package writes is a valid AMC verifier report", () => {
    for (const name of caseNames()) {
      const { bytes, options } = loadCase(name);
      const parsed = verifierReportSchema.safeParse(verifyArtifact(bytes, options));
      expect(parsed.success, `${name}: ${parsed.error?.issues[0]?.message}`).toBe(true);
    }
  });

  test("on the reason codes and the built-in distrust list", () => {
    expect(REASON_CODES).toEqual(AMC_REASON_CODES);
    const amc = JSON.parse(readFileSync("src/trust/amc-distrust.json", "utf8")) as { distrust: unknown[] };
    expect(BUILT_IN_DISTRUST).toEqual(amc.distrust);
  });
});

describe("the package and AMC share their constants and their verify-level checks", () => {
  test("purposes, event types, receipt states, rotation reasons, claim kinds and the overlap limit", async () => {
    const amc = {
      purposes: (await import("../../src/trust/keyPurposes.js")).KEY_PURPOSES,
      events: (await import("../../src/contracts/v1/evidenceEvent.js")).EVIDENCE_EVENT_TYPES,
      states: (await import("../../src/actions/receiptStates.js")).RECEIPT_STATES,
      rotation: await import("../../src/keys/rotationStatement.js"),
      claims: (await import("../../src/claims/eligibility/types.js")).CLAIM_KINDS
    };
    const ours = { codes: await import("../../packages/verifier/src/codes.js"), evidence: await import("../../packages/verifier/src/records/evidence.js"),
      statements: await import("../../packages/verifier/src/records/statements.js"), rotation: await import("../../packages/verifier/src/kinds/rotation.js") };
    expect(ours.codes.KEY_PURPOSES).toEqual(amc.purposes);
    expect(ours.evidence.EVIDENCE_EVENT_TYPES).toEqual(amc.events);
    expect(ours.evidence.RECEIPT_STATES).toEqual(amc.states);
    expect(ours.statements.ROTATION_REASONS).toEqual(amc.rotation.ROTATION_REASONS);
    expect(ours.evidence.CLAIM_KINDS).toEqual(amc.claims);
    expect(ours.rotation.MAX_OVERLAP_DAYS).toBe(amc.rotation.DEFAULT_MAX_OVERLAP_DAYS);
  });

  test("a trust list counts for the package exactly when AMC's verifySignedTrustList accepts it", async () => {
    const { verifySignedTrustList } = await import("../../src/trust/trustList.js");
    const { trustContext } = await import("../../packages/verifier/src/trust.js");
    let compared = 0;
    for (const name of caseNames()) {
      const { options, params } = loadCase(name);
      const asOf = new Date(params.asOf!);
      for (const list of options.trustLists) {
        const tampered = structuredClone(list) as { list: { sequence: number } };
        tampered.list.sequence += 1;
        for (const candidate of [list, tampered]) {
          let amc = true;
          try { verifySignedTrustList(candidate, { pinnedRootKeyIds: options.trustRoots, now: asOf, threshold: options.rootThreshold }); } catch { amc = false; }
          const ours = trustContext([candidate], new Set(options.trustRoots), asOf.getTime(), {}, options.rootThreshold ?? 1).problems.length === 0;
          expect(ours, name).toBe(amc);
          compared += 1;
        }
      }
    }
    expect(compared).toBeGreaterThan(100);
  });

  test("a DSSE signature verifies for the package exactly when AMC's verifyDsse accepts it over the same PAE", () => {
    let compared = 0;
    const dsseCases = caseNames().filter(item => item.startsWith("dsse-"));
    for (const name of dsseCases) {
      const { bytes, options } = loadCase(name);
      const bundle = JSON.parse(bytes.toString("utf8")) as { dsseEnvelope: { payload: string } };
      const twin = structuredClone(bundle);
      const payload = Buffer.from(twin.dsseEnvelope.payload, "base64");
      payload[payload.length - 2] ^= 1;
      twin.dsseEnvelope.payload = payload.toString("base64");
      const keys = new Map((options.trustLists[0] as { list: { entries: Array<{ keyId: string; publicKeyPem: string }> } }).list.entries.map(entry => [entry.keyId, entry.publicKeyPem]));
      for (const candidate of [bundle, twin]) {
        const amc = verifyDsse(envelopeFromSigstoreBundle(candidate), INTOTO_PAYLOAD_TYPE, keys).ok;
        const ours = verifyArtifact(Buffer.from(JSON.stringify(candidate)), options).integrity.status === "pass";
        expect(ours, `${name}${candidate === twin ? " (payload changed)" : ""}`).toBe(amc);
        compared += 1;
      }
    }
    expect(dsseCases.length).toBeGreaterThanOrEqual(5);
    expect(compared).toBe(2 * dsseCases.length);
  });

  test("an external evidence signature verifies for the package exactly when it does for AMC", async () => {
    const { verifyExternalEvidence } = await import("../../src/standard/externalEvidenceProfile.js");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (const name of caseNames().filter(item => item.startsWith("valid-external") || item.startsWith("external-evidence"))) {
      const { bytes, options } = loadCase(name);
      const profile = JSON.parse(bytes.toString("utf8")) as { source: { producer: string }; provenance: { captureMethod: "producer-callback" }; signature: { authorityId: string; value: string } | null };
      if (profile.signature === null) continue;
      const twin = structuredClone(profile);
      const last = twin.signature!.value.length - 3;
      twin.signature!.value = `${twin.signature!.value.slice(0, last)}${alphabet[alphabet.indexOf(twin.signature!.value[last]!) ^ 1]}==`;
      const entry = (options.trustLists[0] as { list: { entries: Array<{ keyId: string; publicKeyPem: string }> } }).list.entries
        .find(item => item.keyId === profile.signature!.authorityId)!;
      for (const candidate of [profile, twin]) {
        // An authority scoped to this producer and capture method, so only the signature decides AMC's answer.
        const authority = { id: entry.keyId, publicKeyPem: entry.publicKeyPem, maxTrustTier: "OBSERVED" as const,
          captureMethods: [candidate.provenance.captureMethod], producers: [candidate.source.producer] };
        const amc = verifyExternalEvidence(candidate, { authorities: [authority] }).signatureVerified;
        const ours = verifyArtifact(Buffer.from(JSON.stringify(candidate)), options).integrity.status === "pass";
        expect(ours, `${name}${candidate === twin ? " (non-canonical base64)" : ""}`).toBe(amc);
      }
    }
  });
});
