#!/usr/bin/env node
/**
 * Generates the normative verifier fixtures (P1-06): `node spec/fixtures/v1/generate.mjs [--out <dir>]`.
 *
 * Self-contained (node: built-ins only) and independent of any verifier, so it cannot share a verifier's bugs. Every
 * key comes from a fixed 32-byte seed, sha256("amc-verifier-fixtures/v1:<name>"), wrapped in the PKCS#8 DER prefix
 * 302e020100300506032b657004220420; no private key is committed. Ed25519 signatures are deterministic and every time is a
 * constant, so a regeneration is byte-identical: no randomness is involved, so the bytes are fixed, not only the verdicts.
 * The expected verdicts below are written by hand from the rules in docs/STANDALONE_VERIFIER.md, never computed by a
 * verifier. Every key is TEST ONLY: its seed is public, and it must never appear in a trust list outside this corpus.
 */
import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outIndex = process.argv.indexOf("--out");
const OUT = outIndex > 0 ? process.argv[outIndex + 1] : dirname(fileURLToPath(import.meta.url));
if (!OUT) throw new Error("--out needs a directory");

// ── Primitives (the same rules a verifier implements, written out once more) ──
const sha256 = data => createHash("sha256").update(data).digest("hex");
const sortDeep = value => Array.isArray(value) ? value.map(sortDeep)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortDeep(value[key])])) : value;
/** AMC canonical JSON (spec/ACCEPTANCE_RULES.md): JSON.stringify of recursively key-sorted objects. */
const canonical = value => JSON.stringify(sortDeep(value));
/** The external-evidence profile's canonical JSON (keys sorted by UTF-16 code units, built as text). */
const profileCanonical = value => value === null || typeof value !== "object" ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(profileCanonical).join(",")}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${profileCanonical(value[key])}`).join(",")}}`;
const tagged = (tag, text) => Buffer.concat([Buffer.from(tag, "ascii"), Buffer.from([0]), Buffer.from(text, "utf8")]);
const b64 = bytes => Buffer.from(bytes).toString("base64");
const b64url = bytes => Buffer.from(bytes).toString("base64url");
const label = text => sha256(`amc-verifier-fixtures/v1:${text}`);

const PKCS8_ED25519_PREFIX = "302e020100300506032b657004220420";
function key(name) {
  const privateKey = createPrivateKey({ key: Buffer.from(PKCS8_ED25519_PREFIX + label(name), "hex"), format: "der", type: "pkcs8" });
  const pem = createPublicKey(privateKey).export({ format: "pem", type: "spki" }).toString();
  return { name, privateKey, pem, keyId: sha256(pem) };
}
const signBytes = (bytes, signer) => sign(null, bytes, signer.privateKey);

const K = Object.fromEntries(["root", "root2", "rogue-root", "attester", "seal", "compromised", "superseded", "distrusted", "outsider",
  "forger", "late", "expired", "rotated", "late-distrust", "receipt", "ledger", "rogue-ledger", "authority", "revoker", "next-seal", "new-root-1", "new-root-2"]
  .map(name => [name, key(name)]));

// ── Times ──
const T = {
  keyFrom: "2026-01-01T00:00:00.000Z", keyTo: "2028-01-01T00:00:00.000Z",
  listIssued: "2026-09-01T00:00:00.000Z", listExpires: "2027-09-01T00:00:00.000Z",
  windowStart: "2026-08-01T00:00:00.000Z", windowEnd: "2026-09-01T00:00:00.000Z",
  issued: "2026-09-02T00:00:00.000Z", expires: "2026-12-02T00:00:00.000Z",
  receiptAt: "2026-08-15T10:00:00.000Z", ingested: "2026-09-03T00:00:00.000Z", statement: "2026-09-10T00:00:00.000Z",
  asOf: "2026-10-01T00:00:00.000Z"
};

// ── Trust lists ──
function entry(k, purposes, extra = {}) {
  return { keyId: k.keyId, algorithm: "ed25519", publicKeyPem: k.pem, purposes, subject: `TEST ONLY ${k.name} key (amc-verifier-fixtures v1)`,
    validFrom: T.keyFrom, validTo: T.keyTo, source: "operator", ...extra };
}
const BASE_ENTRIES = [
  entry(K.attester, ["independent-attestation"]),
  entry(K.seal, ["artifact-seal"]),
  entry(K.compromised, ["independent-attestation"], { revokedAt: "2026-09-15T00:00:00.000Z", revocationReason: "key-compromise" }),
  entry(K.superseded, ["independent-attestation"], { revokedAt: "2026-09-15T00:00:00.000Z", revocationReason: "superseded" }),
  entry(K.distrusted, ["independent-attestation"]),
  entry(K.late, ["independent-attestation"], { validFrom: "2026-09-10T00:00:00.000Z" }),
  entry(K.expired, ["independent-attestation"], { validFrom: "2026-01-01T00:00:00.000Z", validTo: "2026-09-01T00:00:00.000Z" }),
  entry(K.rotated, ["independent-attestation"], { validFrom: "2026-01-01T00:00:00.000Z", validTo: "2026-09-15T00:00:00.000Z" }),
  entry(K["late-distrust"], ["independent-attestation"]),
  entry(K.receipt, ["receipt"]),
  entry(K.ledger, ["ledger-row"]),
  entry(K.authority, ["evidence-authority"], { authority: { producers: ["pi-callback"], captureMethods: ["producer-callback"], maxTrustTier: "ATTESTED" } }),
  entry(K.revoker, ["revocation-list"])
];
const BASE_DISTRUST = [{ keyId: K.distrusted.keyId, distrustedFrom: null, reason: "exposed-in-public-history",
  note: "TEST ONLY: this fixture key's seed is published", source: "operator" },
{ keyId: K["late-distrust"].keyId, distrustedFrom: "2026-09-20T00:00:00.000Z", reason: "key-compromise",
  note: "TEST ONLY: distrusted after the fixture attestation's claimed issuance", source: "operator" }];

function trustList({ roots = [K.root], ...overrides } = {}) {
  const list = { type: "amc.trust-list", version: 1, listId: "fixtures-v1", sequence: 3, issuedAt: T.listIssued, expiresAt: T.listExpires,
    entries: BASE_ENTRIES, distrust: BASE_DISTRUST, ...overrides };
  const bytes = tagged("AMC_TRUST_LIST_V1", canonical(list));
  return { list, signatures: roots.map(root => ({ keyId: root.keyId, publicKeyPem: root.pem, signature: b64(signBytes(bytes, root)) })) };
}

// ── Evidence: action receipts and control results ──
function actionReceipt(executionId, overrides = {}) {
  return { schema: "amc.action-receipt/v1", executionId, workspaceId: "ws-a", agentId: "agent-payments", seq: 3, state: "completed",
    previousState: "started", reasonCode: "adapter_completed", effect: "applied", evidenceComplete: true,
    authorizationDigest: label(`authz:${executionId}`), intentDigest: label(`intent:${executionId}`), idempotencyKey: `idem-${executionId}`,
    resolution: null, outcomeDigest: label(`outcome:${executionId}`), externalRef: null, at: T.receiptAt, prevReceiptDigest: label(`prev:${executionId}`),
    ...overrides };
}
const doc = value => Buffer.from(canonical(value), "utf8");
function controlResult(evidenceRefs, overrides = {}) {
  return { type: "amc.control-result", version: 1, controlId: "PAY-01", controlVersion: "1.0.0", evaluatedAt: "2026-09-01T12:00:00.000Z",
    dimensions: { result: "pass", applicability: { state: "applicable" }, evidence: "sufficient",
      enforcement: { state: "enforced", boundary: "payments-gateway" }, review: "approved" },
    claimKind: "observed", evidenceRefs, exceptions: [], ...overrides };
}
/** Evidence files for receipts and control results; returns the evidence map and the control results digest. */
function evidenceSet({ receipts = [actionReceipt("exec-1"), actionReceipt("exec-2")], controls, omit = [] } = {}) {
  const files = receipts.map(doc);
  const refs = files.map(bytes => sha256(bytes));
  const results = controls ? controls(refs) : [controlResult(refs)];
  const resultsBytes = doc(results);
  const evidence = [...files.filter((_, index) => !omit.includes(index)), resultsBytes];
  return { evidence, controlResultsDigest: sha256(resultsBytes) };
}

// ── Scoped attestation ──
function attestation({ signer = K.attester, controlResultsDigest, ...overrides }) {
  const body = { type: "amc.scoped-attestation", version: 2, tenantId: "tenant-a", workspaceId: "ws-a", subjectId: "agent-payments", sequence: 7,
    snapshotDigest: label("snapshot"), deployment: { deploymentId: "payments-prod", deploymentDigest: label("deployment") },
    profile: { id: "finance-ops", version: "1.0.0" }, window: { start: T.windowStart, end: T.windowEnd }, exclusions: [],
    controlResultsDigest, issuerKeyId: signer.keyId, issuedAt: T.issued, expiresAt: T.expires, ...overrides };
  const digest = createHash("sha256").update(tagged("AMC_SCOPED_ATTESTATION_V2", canonical(body))).digest();
  return { ...body, signature: { v: 1, alg: "ed25519", pubkeyB64: b64(signer.pem), fingerprint: signer.keyId, sigB64: b64(signBytes(digest, signer)),
    signedTs: Date.parse(body.issuedAt), signer: { type: "VAULT", attestationLevel: "SOFTWARE" } } };
}

// ── Receipt and its ledger row ──
function receiptCase({ ledgerSigner = K.ledger, version = 2 } = {}) {
  const body = actionReceipt("exec-1");
  const bodyBytes = doc(body);
  const eventHash = label("ledger-event:exec-1");
  const payload = { v: version, kind: "action_state", receipt_id: "rcpt-exec-1-3", ts: Date.parse(T.receiptAt), agentId: "agent-payments", providerId: "amc",
    model: null, event_hash: eventHash, body_sha256: sha256(bodyBytes), session_id: "session-1", executionId: "exec-1", idempotencyKey: "idem-exec-1",
    authorizationRecordDigest: label("authz:exec-1"), enforcement: { level: "enforced", boundary: "payments-gateway" }, state: "completed" };
  const payloadBytes = doc(payload);
  const row = { eventId: "evt-exec-1-3", ts: Date.parse(T.receiptAt), isoTs: T.receiptAt, sessionId: "session-1", runtime: "amc", eventType: "audit",
    actorId: "agent-payments", claimKind: "observed", payloadSha256: sha256(bodyBytes), prevEventHash: label("ledger-event:previous"), eventHash,
    writerSignature: b64(signBytes(Buffer.from(eventHash, "hex"), ledgerSigner)), chainIndex: -1, chainValid: true, chainExpectedPrevHash: "",
    incidentIds: [], correctionIds: [], correctionStatuses: [], corrected: false, correctedTs: null, rationale: null, rationaleChain: [], meta: {} };
  return { artifact: `${b64url(payloadBytes)}.${b64url(signBytes(payloadBytes, K.receipt))}`, evidence: [bodyBytes, doc(row)] };
}

// ── External evidence profile ──
const ORIGINAL = Buffer.from("TEST ONLY synthetic Pi-shaped callback log; not a capture of a real task\n", "utf8");
function externalProfile({ trustTier = "ATTESTED", corruptDigest = false, producer = "pi-callback", signed = true } = {}) {
  const event = (id, kind, extra = {}) => ({ id, parentId: null, toolCallId: null, kind, outcome: null, sourceTime: "2026-09-02T23:00:00.000Z",
    durationNs: null, cost: null, attributes: {}, ...extra });
  const profile = { profile: "amc.external-evidence", version: 1,
    source: { producer, version: "3.0.0", originalSha256: sha256(ORIGINAL), mediaType: "application/jsonl" },
    session: { id: "session-ext-1", parentSessionId: null },
    provenance: { trustTier, captureMethod: "producer-callback", authorityId: K.authority.keyId },
    normalization: { normalizer: "amc-normalizer/1", normalizedSha256: "", ingestedAt: T.ingested, losses: [] }, policyRefs: [],
    events: [event("e1", "input"), event("e2", "tool-call", { parentId: "e1", toolCallId: "call-1" }),
      event("e3", "tool-result", { parentId: "e2", toolCallId: "call-1", outcome: "success" })],
    signature: null };
  const { normalization, signature: _signature, ...rest } = profile;
  const semantic = { profile: rest.profile, version: rest.version, source: rest.source, session: rest.session, provenance: rest.provenance,
    normalizer: normalization.normalizer, losses: normalization.losses, policyRefs: rest.policyRefs, events: rest.events };
  profile.normalization.normalizedSha256 = corruptDigest ? label("not-the-digest") : sha256(profileCanonical(semantic));
  if (!signed) return profile;
  const { signature: _unsigned, ...body } = profile;
  const bytes = Buffer.from(`amc.external-evidence/v1\n${profileCanonical(body)}`, "utf8");
  return { ...profile, signature: { algorithm: "ed25519", authorityId: K.authority.keyId, value: b64(signBytes(bytes, K.authority)) } };
}

// ── P1-08 statements ──
function revocationList({ sequence = 1, previousSha256 = null } = {}) {
  const list = { type: "amc.revocation-list", version: 1, listId: "leases:ws-a", sequence, previousSha256, issuedAt: "2026-09-05T00:00:00.000Z",
    revoked: [{ id: "lease-1", kind: "lease", revokedAt: "2026-09-05T00:00:00.000Z", reason: "TEST ONLY: the operator ended the lease" }] };
  return { list, signature: { keyId: K.revoker.keyId, signature: b64(signBytes(tagged("AMC_REVOCATION_LIST_V1", canonical(list)), K.revoker)) }, anchor: null };
}
const ROTATION_ROLES = ["previous", "next", "root"];
function keyRotation({ reason = "scheduled", roots = [], sequence = 1 } = {}) {
  const statement = { type: "amc.key-rotation", version: 1, workspaceId: "ws-a", purpose: "artifact-seal", sequence, previousStatementSha256: null,
    previousKeyId: K.seal.keyId, nextKeyId: K["next-seal"].keyId, nextPublicKeyPem: K["next-seal"].pem, reason,
    overlap: reason === "key-compromise" ? null : { notBefore: T.statement, notAfter: "2026-09-20T00:00:00.000Z" }, issuedAt: T.statement };
  const bytes = tagged("AMC_KEY_ROTATION_V1", canonical(statement));
  const rows = [["previous", K.seal], ["next", K["next-seal"]], ...roots.map(root => ["root", root])]
    .map(([by, signer]) => ({ by, keyId: signer.keyId, signature: b64(signBytes(bytes, signer)) }))
    .sort((a, b) => ROTATION_ROLES.indexOf(a.by) - ROTATION_ROLES.indexOf(b.by) || a.keyId.localeCompare(b.keyId));
  return { statement, signatures: rows };
}
function rootRotation() {
  const fresh = [K["new-root-1"], K["new-root-2"]];
  const statement = { type: "amc.root-rotation", version: 1, rootSetId: "fixtures-roots", sequence: 1, previousSha256: null,
    previousRoots: [K.root.keyId, K.root2.keyId], previousThreshold: 2, newRoots: fresh.map(k => k.keyId), newThreshold: 2,
    newRootPublicKeyPems: fresh.map(k => k.pem), allowDecrease: false, issuedAt: T.statement };
  const bytes = tagged("amc.root-rotation/v1", canonical(statement));
  const rows = [...[K.root, K.root2].map(k => ["current", k]), ...fresh.map(k => ["new", k])]
    .map(([by, signer]) => ({ by, keyId: signer.keyId, signature: b64(signBytes(bytes, signer)) }))
    .sort((a, b) => ["current", "new"].indexOf(a.by) - ["current", "new"].indexOf(b.by) || a.keyId.localeCompare(b.keyId));
  return { statement, signatures: rows };
}

// ── Cases ──
const EXPECT = { tenant: "tenant-a", deployment: "payments-prod", subject: "agent-payments", profile: "finance-ops" };
const PARAMS = { asOf: T.asOf, trustRoots: [K.root.keyId], expect: EXPECT, knownSequences: { "agent-payments": 7 } };
const DIMS = ["integrity", "issuerAdmission", "scope", "freshness", "completeness", "satisfaction"];
/** Dimension statuses in order (P pass, F fail, N not-evaluated). */
function dims(code) {
  const word = { P: "pass", F: "fail", N: "not-evaluated" };
  return Object.fromEntries(DIMS.map((dimension, index) => [dimension, word[code[index]]]));
}
const exitFor = statuses => Object.values(statuses).includes("fail") ? 1 : Object.values(statuses).includes("not-evaluated") ? 3 : 0;

const cases = [];
function addCase(name, why, { artifact, trust = trustList(), moreTrust = [], params = PARAMS, evidence = [], verdict, codes = {}, raw = false }) {
  const dimensions = dims(verdict);
  cases.push({ name, why, artifact, raw, trust, moreTrust, params, evidence, expected: { case: name, normative: true, dimensions, reasonCodes: codes, exitCode: exitFor(dimensions) } });
}

const good = evidenceSet();
const valid = attestation({ controlResultsDigest: good.controlResultsDigest });
const withEvidence = { evidence: good.evidence };

addCase("valid-attestation", "A scoped attestation by a key the pinned trust list admits for independent-attestation, in scope, fresh, with every control result and receipt it depends on, and a recomputable pass. Every dimension passes; anything less would mean the corpus cannot tell good evidence from bad.",
  { artifact: valid, ...withEvidence, verdict: "PPPPPP" });
addCase("forged-embedded-key", "Someone fabricated a newer attestation (sequence 8) and signed it with a fresh key carried in the artifact's own signature envelope (pubkeyB64, the issuer hint). The signature matches the carried key, so integrity passes, but no pinned list admits that key. An artifact's embedded key must never vouch for it.",
  { artifact: attestation({ signer: K.forger, sequence: 8, controlResultsDigest: good.controlResultsDigest }), ...withEvidence, verdict: "PFNNNN", codes: { issuerAdmission: ["ISSUER_NOT_PINNED"] } });
addCase("unpinned-issuer", "A well-formed attestation signed by a key that no supplied trust list holds. Without a pin there is no issuer to trust, so it must not pass.",
  { artifact: attestation({ signer: K.outsider, controlResultsDigest: good.controlResultsDigest }), ...withEvidence, verdict: "PFNNNN", codes: { issuerAdmission: ["ISSUER_NOT_PINNED"] } });
addCase("wrong-purpose", "Signed by a key the trust list pins for artifact-seal only. A key admitted for one purpose must not vouch for another (here independent-attestation).",
  { artifact: attestation({ signer: K.seal, controlResultsDigest: good.controlResultsDigest }), ...withEvidence, verdict: "PFNNNN", codes: { issuerAdmission: ["ISSUER_WRONG_PURPOSE"] } });
addCase("revoked-key-compromise", "Signed by a key the trust list revoked for key-compromise. Its claimed signing time is before the revocation, but a compromised key can backdate, so it is refused for every claimed time.",
  { artifact: attestation({ signer: K.compromised, controlResultsDigest: good.controlResultsDigest }), ...withEvidence, verdict: "PFNNNN", codes: { issuerAdmission: ["ISSUER_REVOKED"] } });
addCase("revoked-superseded-earlier-claim", "Signed by a key revoked as superseded on 2026-09-15; the attestation claims issuance on 2026-09-02. That date is the record's own word, not a trusted timestamp, so it cannot reach back before the revocation: as of 2026-10-01 the key admits nothing.",
  { artifact: attestation({ signer: K.superseded, controlResultsDigest: good.controlResultsDigest }), ...withEvidence, verdict: "PFNNNN", codes: { issuerAdmission: ["ISSUER_REVOKED"] } });
addCase("revoked-superseded-as-of-before-revocation", "The same attestation, verified as of 2026-09-10, before the key's revocation. The verifier's user chose that time, so the key is admitted and every dimension passes: a dated cut-off comes from the verifier, never from the record.",
  { artifact: attestation({ signer: K.superseded, controlResultsDigest: good.controlResultsDigest }), ...withEvidence, params: { ...PARAMS, asOf: "2026-09-10T00:00:00.000Z" }, verdict: "PPPPPP" });
addCase("rotated-out-key-earlier-claim", "Signed by a key whose validity ended on 2026-09-15 (rotated out); the attestation claims issuance before that. As of 2026-10-01 the key is no longer valid, and a claimed signing time does not bring it back.",
  { artifact: attestation({ signer: K.rotated, controlResultsDigest: good.controlResultsDigest }), ...withEvidence, verdict: "PFNNNN", codes: { issuerAdmission: ["KEY_EXPIRED"] } });
addCase("distrusted-after-claim", "Signed by a key distrusted from 2026-09-20, while the attestation claims issuance on 2026-09-02. Whoever holds a distrusted key can write any date, so distrust is judged as of the verification time, not the claimed one.",
  { artifact: attestation({ signer: K["late-distrust"], controlResultsDigest: good.controlResultsDigest }), ...withEvidence, verdict: "PFNNNN", codes: { issuerAdmission: ["ISSUER_DISTRUSTED"] } });
addCase("distrusted-key", "Signed by a key the trust list pins and also distrusts (its seed is public). Distrust beats every pin, so it must not pass.",
  { artifact: attestation({ signer: K.distrusted, controlResultsDigest: good.controlResultsDigest }), ...withEvidence, verdict: "PFNNNN", codes: { issuerAdmission: ["ISSUER_DISTRUSTED"] } });
addCase("stale-attestation", "A valid attestation verified as of a time after its expiresAt. An expired statement must not pass as current.",
  { artifact: valid, ...withEvidence, params: { ...PARAMS, asOf: "2026-12-03T00:00:00.000Z" }, verdict: "PPPFPN", codes: { freshness: ["ATTESTATION_EXPIRED"] } });
addCase("stale-trust-list", "The only trust list expired before the as-of time. An expired list admits nobody, so issuer admission fails.",
  { artifact: valid, ...withEvidence, trust: trustList({ expiresAt: "2026-09-30T00:00:00.000Z" }), verdict: "PFNNNN", codes: { issuerAdmission: ["TRUST_LIST_EXPIRED"] } });
addCase("replayed", "A genuine older attestation (sequence 4) presented when sequence 7 for the same subject is already known. A replayed or superseded statement must not pass as current.",
  { artifact: attestation({ sequence: 4, controlResultsDigest: good.controlResultsDigest }), ...withEvidence, verdict: "PPPFPN", codes: { freshness: ["REPLAYED_OR_SUPERSEDED"] } });
const contradictory = evidenceSet({ receipts: [actionReceipt("exec-1"), actionReceipt("exec-1", { seq: 1, state: "denied", previousState: "requested", effect: null, outcomeDigest: null, reasonCode: "policy_denied" })] });
addCase("contradictory", "The evidence holds receipts saying the same execution (exec-1) both completed and was denied. Contradictory evidence cannot support a result.",
  { artifact: attestation({ controlResultsDigest: contradictory.controlResultsDigest }), evidence: contradictory.evidence, verdict: "PPPPFN", codes: { completeness: ["CONTRADICTORY_EVIDENCE"] } });
addCase("cross-tenant", "A valid attestation about tenant-b presented to a verifier checking tenant-a. A statement about another tenant must not pass.",
  { artifact: attestation({ tenantId: "tenant-b", controlResultsDigest: good.controlResultsDigest }), ...withEvidence, verdict: "PPFPPN", codes: { scope: ["SCOPE_MISMATCH"] } });
const empty = evidenceSet({ receipts: [], controls: () => [] });
addCase("empty", "The control results the attestation names are an empty list. Empty evidence never yields a pass.",
  { artifact: attestation({ controlResultsDigest: empty.controlResultsDigest }), evidence: empty.evidence, verdict: "PPPPFN", codes: { completeness: ["EMPTY_EVIDENCE"] } });
const missing = evidenceSet({ omit: [1] });
addCase("missing-evidence", "One receipt a control result cites was not supplied. Missing evidence means the claim cannot be checked, never that it passes.",
  { artifact: attestation({ controlResultsDigest: missing.controlResultsDigest }), evidence: missing.evidence, verdict: "PPPPFN", codes: { completeness: ["EVIDENCE_MISSING"] } });
const anchoredReceipt = receiptCase();
const unanchoredReceipt = receiptCase({ ledgerSigner: K["rogue-ledger"] });
const RECEIPT_PARAMS = { asOf: T.asOf, trustRoots: [K.root.keyId], expect: { subject: "agent-payments" } };
addCase("unanchored", "A receipt whose ledger row (the checkpoint it names) is signed by a monitor key no trust list pins for ledger-row. Without a pinned ledger key the row proves only internal consistency, so the receipt is unanchored and must not pass.",
  { artifact: unanchoredReceipt.artifact, evidence: unanchoredReceipt.evidence, params: RECEIPT_PARAMS, verdict: "PFNNNN", codes: { issuerAdmission: ["UNANCHORED"] } });
addCase("backdated", "Signed by a key whose trust-list validity starts on 2026-09-10, while the attestation claims issuance on 2026-09-02. The key is valid now, but the claimed time predates it: a backdated claim must not pass.",
  { artifact: attestation({ signer: K.late, controlResultsDigest: good.controlResultsDigest }), ...withEvidence, verdict: "PPPFPN", codes: { freshness: ["CLAIMED_TIME_BEFORE_KEY_VALIDITY"] } });
const tampered = structuredClone(valid);
tampered.profile.version = "1.0.1";
addCase("tampered", "One byte of the signed statement (profile.version 1.0.0 to 1.0.1) changed after signing. The signature no longer verifies, so nothing else in it can be read.",
  { artifact: tampered, ...withEvidence, verdict: "FNNNNN", codes: { integrity: ["SIGNATURE_INVALID"] } });
addCase("rollback-revocation-list", "A genuine revocation list with sequence 3 presented when sequence 5 is already known. Restoring an older list could un-revoke a lease, so it must not pass (P1-08 anti-rollback).",
  { artifact: revocationList({ sequence: 3, previousSha256: label("revocation-list:2") }), raw: true, params: { asOf: T.asOf, trustRoots: [K.root.keyId], knownSequences: { "leases:ws-a": 5 } },
    verdict: "PFNNNN", codes: { issuerAdmission: ["ROLLBACK_DETECTED"] } });
addCase("valid-external-evidence-attested", "An external evidence profile signed by an authority a pinned trust list admits for evidence-authority, for this producer and capture method, with its original bytes supplied. Its declared ATTESTED tier is what that authority supports, so every dimension passes.",
  { artifact: externalProfile(), evidence: [ORIGINAL], params: { asOf: T.asOf, trustRoots: [K.root.keyId], expect: { subject: "session-ext-1" } }, verdict: "PPPPPP" });

// Beyond the 19 the spec lists: at least one fixture per reason code and one valid fixture per record kind.
const foreign = evidenceSet({ receipts: [actionReceipt("exec-1"), actionReceipt("exec-2", { workspaceId: "ws-b" })] });
addCase("foreign-evidence", "One cited receipt names another workspace. Evidence from another tenant's workspace cannot support this tenant's claim.",
  { artifact: attestation({ controlResultsDigest: foreign.controlResultsDigest }), evidence: foreign.evidence, verdict: "PPFPPN", codes: { scope: ["FOREIGN_EVIDENCE"] } });
const unknownOutcome = evidenceSet({ receipts: [actionReceipt("exec-1"), actionReceipt("exec-2", { state: "outcome_unknown", effect: null, outcomeDigest: null, reasonCode: "body_threw_ambiguous" })] });
addCase("outcome-unknown", "One cited execution ends outcome_unknown and was never reconciled. A critical unknown must not pass.",
  { artifact: attestation({ controlResultsDigest: unknownOutcome.controlResultsDigest }), evidence: unknownOutcome.evidence, verdict: "PPPPFN", codes: { completeness: ["OUTCOME_UNKNOWN"] } });
const failed = evidenceSet({ controls: refs => [controlResult(refs, { dimensions: { result: "fail", applicability: { state: "applicable" }, evidence: "sufficient", enforcement: { state: "enforced", boundary: "payments-gateway" }, review: "approved" } })] });
addCase("claimed-result-failed", "Everything checks out, but the control result the attestation binds declares fail. A failed result must never be reported as satisfied.",
  { artifact: attestation({ controlResultsDigest: failed.controlResultsDigest }), evidence: failed.evidence, verdict: "PPPPPF", codes: { satisfaction: ["CLAIMED_RESULT_FAILED"] } });
const selfReported = evidenceSet({ controls: refs => [controlResult(refs, { claimKind: "self_reported" })] });
addCase("self-reported-result", "The bound control result declares pass, but only as self_reported. A self-reported pass gives no positive status, so satisfaction is not evaluated (exit 3, which CI must not treat as success).",
  { artifact: attestation({ controlResultsDigest: selfReported.controlResultsDigest }), evidence: selfReported.evidence, verdict: "PPPPPN", codes: { satisfaction: ["NOT_RECOMPUTABLE"] } });
addCase("not-yet-valid", "A valid attestation verified as of a time before its claimed issuance. A statement from the future relative to the as-of time must not pass.",
  { artifact: valid, ...withEvidence, params: { ...PARAMS, asOf: "2026-09-01T12:00:00.000Z" }, verdict: "PPPFPN", codes: { freshness: ["NOT_YET_VALID"] } });
addCase("key-not-yet-valid", "Signed by a key whose validity starts on 2026-09-10, verified as of 2026-09-05. As of that time the key admits nothing.",
  { artifact: attestation({ signer: K.late, controlResultsDigest: good.controlResultsDigest }), ...withEvidence, params: { ...PARAMS, asOf: "2026-09-05T00:00:00.000Z" }, verdict: "PFNNNN", codes: { issuerAdmission: ["KEY_NOT_YET_VALID"] } });
addCase("key-expired", "Signed by a key whose validity ended on 2026-09-01, while the attestation claims issuance on 2026-09-02. A key past its validTo admits nothing it signs after.",
  { artifact: attestation({ signer: K.expired, controlResultsDigest: good.controlResultsDigest }), ...withEvidence, verdict: "PFNNNN", codes: { issuerAdmission: ["KEY_EXPIRED"] } });
addCase("untrusted-trust-list-root", "The only trust list is signed by a root the verifier did not pin. An unpinned list admits nobody.",
  { artifact: valid, ...withEvidence, trust: trustList({ roots: [K["rogue-root"]] }), verdict: "PFNNNN", codes: { issuerAdmission: ["TRUST_LIST_SIGNATURE_INVALID"] } });
const { signature: _drop, ...unsigned } = valid;
addCase("malformed", "The signature envelope is missing. A record that is not the record it claims to be is refused before anything is read from it.",
  { artifact: unsigned, ...withEvidence, verdict: "FNNNNN", codes: { integrity: ["MALFORMED"] } });
addCase("unknown-field", "A field the v1 schema does not define was added at the top level. Unknown fields are refused: an unsigned or unrecognized member could carry a claim no rule checks.",
  { artifact: { ...valid, assuranceLevel: "L5" }, ...withEvidence, verdict: "FNNNNN", codes: { integrity: ["UNKNOWN_FIELD"] } });
addCase("unsupported-version", "A scoped attestation that says version 3. A verifier must refuse versions it does not know rather than read them as the one it knows.",
  { artifact: { ...valid, version: 3 }, ...withEvidence, verdict: "FNNNNN", codes: { integrity: ["UNSUPPORTED_VERSION"] } });
const { tenantId: _t, workspaceId: _w, subjectId: _s, sequence: _q, signature: _v2sig, ...v1Body } = valid;
addCase("scoped-attestation-v1", "A scoped attestation v1, the contract-only record that names no tenant, workspace, subject or sequence. Without them no scope or replay verdict is possible, so v1 is not a version this verifier supports.",
  { artifact: { ...v1Body, version: 1, signature: valid.signature }, ...withEvidence, verdict: "FNNNNN", codes: { integrity: ["UNSUPPORTED_VERSION"] } });
addCase("valid-receipt", "A state receipt by a key admitted for receipt, its body supplied, and its ledger row signed by a key admitted for ledger-row (anchored). A receipt proves that a row was written, not the outcome of the work, so satisfaction is not evaluated (exit 3).",
  { artifact: anchoredReceipt.artifact, evidence: anchoredReceipt.evidence, params: RECEIPT_PARAMS, verdict: "PPPPPN", codes: { satisfaction: ["NOT_RECOMPUTABLE"] } });
addCase("external-evidence-tier-inflated", "The profile declares OBSERVED, but its authority is admitted for producer-callback capture, which supports ATTESTED at most. A declaration above what the admitted authority supports fails.",
  { artifact: externalProfile({ trustTier: "OBSERVED" }), evidence: [ORIGINAL], params: { asOf: T.asOf, trustRoots: [K.root.keyId], expect: { subject: "session-ext-1" } }, verdict: "PPPPPF", codes: { satisfaction: ["CLAIMED_RESULT_FAILED"] } });
addCase("external-evidence-digest-mismatch", "The profile's normalizedSha256 is not the digest of its content (the authority signed it anyway). A record whose stated digest does not recompute is refused.",
  { artifact: externalProfile({ corruptDigest: true }), evidence: [ORIGINAL], params: { asOf: T.asOf, trustRoots: [K.root.keyId], expect: { subject: "session-ext-1" } }, verdict: "FNNNNN", codes: { integrity: ["DIGEST_MISMATCH"] } });
addCase("valid-trust-list", "The fixture trust list itself, signed by the pinned root and unexpired. It names keys and states no result, so scope and satisfaction are not evaluated (exit 3).",
  { artifact: trustList(), params: { asOf: T.asOf, trustRoots: [K.root.keyId] }, verdict: "PPNPPN" });
addCase("valid-revocation-list", "The first revocation list of its chain, signed by a key admitted for revocation-list. It states revocations, not a result (exit 3).",
  { artifact: revocationList(), raw: true, params: { asOf: T.asOf, trustRoots: [K.root.keyId] }, verdict: "PPNPPN" });
addCase("valid-key-rotation", "A scheduled artifact-seal rotation signed by the key it replaces (admitted for artifact-seal) and by the new key (possession). It never changes a pin by itself (exit 3).",
  { artifact: keyRotation(), raw: true, params: { asOf: T.asOf, trustRoots: [K.root.keyId] }, verdict: "PPNPPN" });
addCase("key-compromise-rotation-without-root", "A key-compromise rotation signed only by the compromised key and the new key. A compromised key has no authority over its replacement; a pinned root must sign.",
  { artifact: keyRotation({ reason: "key-compromise" }), raw: true, params: { asOf: T.asOf, trustRoots: [K.root.keyId] }, verdict: "PFNNNN", codes: { issuerAdmission: ["ISSUER_NOT_PINNED"] } });
addCase("valid-root-rotation", "A root-set rotation authorized by both pinned current roots (whose keys the supplied list carries, signed 2-of-2 as the verifier requires) and proven by both new roots. It never changes a pin by itself (exit 3).",
  { artifact: rootRotation(), raw: true, trust: trustList({ roots: [K.root, K.root2] }), params: { asOf: T.asOf, trustRoots: [K.root.keyId, K.root2.keyId].sort(), rootThreshold: 2 },
    verdict: "PPNPPN" });

addCase("root-threshold-downgrade", "The verifier pins two roots and requires both (--root-threshold 2), but the only trust list is signed by one root and declares no threshold of its own. A list cannot lower the m-of-n its verifier pinned, so it admits nobody.",
  { artifact: valid, ...withEvidence, params: { ...PARAMS, trustRoots: [K.root.keyId, K.root2.keyId].sort(), rootThreshold: 2 }, verdict: "PFNNNN", codes: { issuerAdmission: ["TRUST_LIST_SIGNATURE_INVALID"] } });
const EXTERNAL_PARAMS = { asOf: T.asOf, trustRoots: [K.root.keyId], expect: { subject: "session-ext-1" } };
addCase("external-evidence-unsigned", "An unsigned profile, as every import is. Its digests check out, but it names no signer, so no authority is admitted and it stays self-reported.",
  { artifact: externalProfile({ signed: false }), evidence: [ORIGINAL], params: EXTERNAL_PARAMS, verdict: "PFNNNN", codes: { issuerAdmission: ["ISSUER_NOT_PINNED"] } });
addCase("external-evidence-wrong-producer", "Signed by an admitted evidence authority, but for a producer the trust list does not admit it for. An authority vouches only within the scope its entry names.",
  { artifact: externalProfile({ producer: "dsh-session" }), evidence: [ORIGINAL], params: EXTERNAL_PARAMS, verdict: "PFNNNN", codes: { issuerAdmission: ["ISSUER_WRONG_PURPOSE"] } });
const legacyReceipt = receiptCase({ version: 1 });
addCase("legacy-receipt", "A receipt whose payload says v 1. This verifier reads state receipts (v 2) only and must refuse what it does not support rather than read it as v 2.",
  { artifact: legacyReceipt.artifact, evidence: legacyReceipt.evidence, params: RECEIPT_PARAMS, verdict: "FNNNNN", codes: { integrity: ["UNSUPPORTED_VERSION"] } });
addCase("trust-list-rollback", "The supplied trust list is sequence 3 while sequence 4 of the same list is already known. An older list could restore a key since revoked, so it admits nobody.",
  { artifact: valid, ...withEvidence, params: { ...PARAMS, knownSequences: { "agent-payments": 7, "fixtures-v1": 4 } }, verdict: "PFNNNN", codes: { issuerAdmission: ["ROLLBACK_DETECTED"] } });

// Review round: lists that undercut each other, self-contradictory control results, a chain head that is not first.
const ROOTS_1_AND_2 = [K.root.keyId, K.root2.keyId].sort();
addCase("distrusted-root-in-another-list", "Two roots are pinned, one signature each. One counted list, signed by root 2, distrusts root 1 as compromised; a second list, signed only by root 1, pins an attacker's key. A root that any counted list distrusts signs nothing, so the second list admits nobody.",
  { artifact: attestation({ signer: K.forger, controlResultsDigest: good.controlResultsDigest }), ...withEvidence,
    trust: trustList({ entries: [...BASE_ENTRIES, entry(K.forger, ["independent-attestation"])] }),
    moreTrust: [trustList({ roots: [K.root2], listId: "fixtures-v1-ops", entries: [],
      distrust: [{ keyId: K.root.keyId, distrustedFrom: null, reason: "key-compromise", note: "TEST ONLY: root 1 is compromised", source: "operator" }] })],
    params: { ...PARAMS, trustRoots: ROOTS_1_AND_2 }, verdict: "PFNNNN", codes: { issuerAdmission: ["TRUST_LIST_SIGNATURE_INVALID"] } });
const revokedAttester = BASE_ENTRIES.map(item => (item.keyId === K.attester.keyId ? { ...item, revokedAt: "2026-09-20T00:00:00.000Z", revocationReason: "superseded" } : item));
addCase("stale-list-beside-newer", "Sequence 3 of a trust list is supplied beside sequence 4 of the same list, which revokes the attester's key. An older list must not shadow the newer one's revocation, so the older one is refused as a rollback.",
  { artifact: valid, ...withEvidence, moreTrust: [trustList({ sequence: 4, entries: revokedAttester })], verdict: "PFNNNN", codes: { issuerAdmission: ["ROLLBACK_DETECTED"] } });
addCase("forked-trust-list", "Two different lists are supplied under the same list id and sequence. One of them is not what the root signed for that sequence in any history a verifier can trust, so neither admits anything.",
  { artifact: valid, ...withEvidence, moreTrust: [trustList({ entries: BASE_ENTRIES.filter(item => item.keyId !== K.seal.keyId) })], verdict: "PFNNNN", codes: { issuerAdmission: ["TRUST_LIST_SIGNATURE_INVALID"] } });
const rejectedReview = evidenceSet({ controls: refs => [controlResult(refs, { dimensions: { result: "pass", applicability: { state: "applicable" }, evidence: "sufficient", enforcement: { state: "enforced", boundary: "payments-gateway" }, review: "rejected" } })] });
addCase("review-rejected-pass", "The bound control result declares pass, but its review was rejected. A rejected result is not a pass.",
  { artifact: attestation({ controlResultsDigest: rejectedReview.controlResultsDigest }), evidence: rejectedReview.evidence, verdict: "PPPPPF", codes: { satisfaction: ["CLAIMED_RESULT_FAILED"] } });
const pendingIndependent = evidenceSet({ controls: refs => [controlResult(refs, { claimKind: "independently_reviewed", dimensions: { result: "pass", applicability: { state: "applicable" }, evidence: "sufficient", enforcement: { state: "enforced", boundary: "payments-gateway" }, review: "pending" } })] });
addCase("unreviewed-independent-claim", "The bound control result claims independently_reviewed while its review is still pending. A claim kind that its own review state contradicts cannot be evidence.",
  { artifact: attestation({ controlResultsDigest: pendingIndependent.controlResultsDigest }), evidence: pendingIndependent.evidence, verdict: "PPPPFN", codes: { completeness: ["CONTRADICTORY_EVIDENCE"] } });
const lateResult = evidenceSet({ controls: refs => [controlResult(refs, { evaluatedAt: "2026-09-05T00:00:00.000Z" })] });
addCase("evaluated-after-issuance", "The bound control result says it was evaluated on 2026-09-05, after the attestation that binds it was issued on 2026-09-02. An attestation cannot vouch for a result that did not exist yet.",
  { artifact: attestation({ controlResultsDigest: lateResult.controlResultsDigest }), evidence: lateResult.evidence, verdict: "PPPPFN", codes: { completeness: ["CONTRADICTORY_EVIDENCE"] } });
const excluded = evidenceSet({ controls: refs => [controlResult(refs), controlResult(refs, { controlId: "PAY-09",
  dimensions: { result: "fail", applicability: { state: "applicable" }, evidence: "sufficient", enforcement: { state: "none" }, review: "approved" } })] });
addCase("excluded-failing-control", "The attestation excludes control PAY-09, with a rationale, and the bound results hold a failing PAY-09. An exclusion is part of the signed statement, so the remaining results pass; the report names every excluded control in a warning so the exclusion is never silent.",
  { artifact: attestation({ controlResultsDigest: excluded.controlResultsDigest, exclusions: [{ controlId: "PAY-09", rationale: "TEST ONLY: out of this deployment's scope" }] }),
    evidence: excluded.evidence, verdict: "PPPPPP" });
addCase("rotation-chain-head-not-first", "A key rotation that names no previous statement yet claims sequence 5. Only the first statement of a chain names no predecessor, so it is refused rather than read as a chain start.",
  { artifact: keyRotation({ sequence: 5 }), raw: true, params: { asOf: T.asOf, trustRoots: [K.root.keyId] }, verdict: "FNNNNN", codes: { integrity: ["MALFORMED"] } });

// ── Write ──
const json = value => `${JSON.stringify(value, null, 2)}\n`;
for (const item of cases) {
  const dir = join(OUT, item.name);
  rmSync(join(dir, "evidence"), { recursive: true, force: true });
  rmSync(join(dir, "more-trust-lists"), { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // P1-08 records exist in exactly one byte encoding, so they are written canonical; every other artifact pretty-printed.
  writeFileSync(join(dir, "artifact.json"), item.raw ? canonical(item.artifact) : json(item.artifact));
  writeFileSync(join(dir, "trust-list.json"), json(item.trust));
  if (item.moreTrust.length > 0) {
    mkdirSync(join(dir, "more-trust-lists"));
    item.moreTrust.forEach((list, index) => writeFileSync(join(dir, "more-trust-lists", `${index + 1}.json`), json(list)));
  }
  writeFileSync(join(dir, "params.json"), json(item.params));
  writeFileSync(join(dir, "expected.json"), json(item.expected));
  writeFileSync(join(dir, "README.md"), `# ${item.name}\n\n${item.why}\n`);
  if (item.evidence.length > 0) {
    mkdirSync(join(dir, "evidence"));
    for (const bytes of item.evidence) writeFileSync(join(dir, "evidence", sha256(bytes)), bytes);
  }
}
process.stdout.write(`${cases.length} cases written to ${OUT}\n`);
