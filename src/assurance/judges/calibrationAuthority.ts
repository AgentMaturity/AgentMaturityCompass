/** P2-27: real native signature/roster authorizer; no caller verifier or authority flags. */
import { lstatSync } from "node:fs";
import { z } from "zod";
import type { RosterEntry } from "../../catalog/governance/support.js";
import { verifyHexDigest } from "../../crypto/keys.js";
import { getPurposeKeyHistory, keyFile } from "../../keys/signingKeys.js";
import { keysetDeclared } from "../../keys/keyset.js";
import { LOCAL_PURPOSES } from "../../vault/vaultPayload.js";
import { readContained } from "../../utils/containedFs.js";
import { canonicalize, parseCanonicalJson } from "../../utils/json.js";
import { sha256Hex } from "../../utils/hash.js";
import { checkSignature } from "../../trust/signatureCheck.js";
import { loadTrustContext, type TrustContext } from "../../trust/trustContext.js";
import { ed25519KeyId } from "../../trust/trustList.js";
import { calculateConfusion, type ConfusionStatistics, type RegulatedJudgeCalibration } from "./calibration.js";
import { bundleSchema, goldSchema, labelsSchema, adjudicationSchema, policySchema, promptDefinitionSchema,
  rubricDefinitionSchema, judgeBindingSchema, judgeRefusalCode, type ArtifactReference, type JudgeBinding, type CalibrationStatement } from "./calibrationContract.js";
import { captureNativeJudgeCall, capturedJudgeCall, consumeEvaluationCall, type CapturedJudgeCall } from "./regulatedJudgeRuntime.js";
export interface SourceAuthors { readonly identities: readonly string[]; readonly provenance: string }
/** Only trusted operator composition supplies this. Never deserialize it from the bundle or an HTTP/CLI JSON body.
 * The default roster is empty. Signing keys do not prove human engagement, credentials or honest disclosures. */
export interface OperatorCalibrationContext {
  readonly workspace: string;
  readonly expected: JudgeBinding;
  readonly experts: ReadonlyMap<string, RosterEntry>;
  readonly authors: ReadonlyMap<string, SourceAuthors>;
}
export interface CalibrationAuthority { readonly bundleSha256: string }
export interface AuthorizedCalibration { readonly id: string; readonly expiresAt: string }
type NE = { state: "not_evaluated"; reasons: string[] };
type AuthorityResult = NE | { state: "ready"; authority: CalibrationAuthority };
export type CalibrationResult = NE | { state: "eligible"; calibration: AuthorizedCalibration; record: RegulatedJudgeCalibration };
interface Loaded {
  root: string; context: OperatorCalibrationContext; operatorDigest: string; bundleSha256: string;
  id: string; goldPath: string; binding: JudgeBinding; gold: z.infer<typeof goldSchema>;
  prompt: z.infer<typeof promptDefinitionSchema>; rubric: z.infer<typeof rubricDefinitionSchema>;
  policy: z.infer<typeof policySchema>; finalLabels: Map<string, boolean>;
  labelSubjects: string[]; labelledAt: string; references: ReadonlyArray<{ path: string; sha256: string; bytes: number }>;
}
interface Calibrated { loaded: Loaded; record: RegulatedJudgeCalibration; statistics: ConfusionStatistics }
const authorities = new WeakMap<CalibrationAuthority, Loaded>();
const calibrations = new WeakMap<AuthorizedCalibration, Calibrated>();
const hash = (x: unknown): string => sha256Hex(Buffer.from(canonicalize(x), "utf8"));
const same = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);
function reject(reason: string): never { throw new Error(reason); }
const failure = (error: unknown): NE => ({ state: "not_evaluated", reasons: [judgeRefusalCode(error, "CALIBRATION_REFUSED")] });
const norm = (s: string): string => s.normalize("NFKC").replace(/\p{Default_Ignorable_Code_Point}/gu, "").replace(/\s+/gu, " ").trim().toUpperCase().toLowerCase();
const mailbox = (s: string): string => { const at = s.lastIndexOf("@"); return `${s.slice(0, at).replace(/\+.*$/u, "")}@${s.slice(at + 1).replace(/\.+$/u, "")}`; };
const ids = (s: string): string[] => { const p = norm(s), name = norm(p.split("<")[0] ?? "");
  return [p, name, name.replace(/ /gu, ""), ...(p.match(/[^\s<>()]+@[^\s<>()]+/gu) ?? []).map(mailbox)].filter(Boolean); };
const overlap = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => [...a].some(x => b.has(x));
function snapshot(context: OperatorCalibrationContext): OperatorCalibrationContext {
  return { workspace: context.workspace, expected: judgeBindingSchema.parse(JSON.parse(canonicalize(context.expected))),
    experts: new Map([...context.experts].map(([s, p]) => [s, { domains: [...p.domains], identities: [...p.identities] }])),
    authors: new Map([...context.authors].map(([d, a]) => [d, { identities: [...a.identities], provenance: a.provenance }])) };
}
function operatorDigest(c: OperatorCalibrationContext): string {
  return hash({ workspace: c.workspace, expected: c.expected,
    experts: [...c.experts].sort(([a], [b]) => a.localeCompare(b)), authors: [...c.authors].sort(([a], [b]) => a.localeCompare(b)) });
}
/** Union intersecting roster aliases transitively, including each statement's declared name. */
function people(context: OperatorCalibrationContext, statements: readonly CalibrationStatement[]): Map<string, Set<string>> {
  const groups = new Map([...context.experts].map(([s, p]) => [s, new Set([s, ...p.identities,
    ...statements.filter(x => x.signer.subject === s).map(x => x.signer.name)].flatMap(ids))]));
  let changed = true;
  while (changed) { changed = false;
    for (const a of groups.values()) for (const b of groups.values()) if (a !== b && overlap(a, b)) {
      const combined = new Set([...a, ...b]);
      if (a.size !== combined.size || b.size !== combined.size) { for (const id of combined) { a.add(id); b.add(id); } changed = true; }
    }
  }
  return groups;
}
function localKeys(workspace: string): Set<string> {
  const roles = ["monitor", "auditor", "lease", "session"];
  const present = keysetDeclared(workspace) || [...LOCAL_PURPOSES.map(p => `${p}.pub`), ...roles.map(r => `${r}_ed25519.pub`)].some(n => keyFile(workspace, n) !== null);
  const keys = new Set<string>();
  if (present) for (const purpose of LOCAL_PURPOSES) for (const pem of getPurposeKeyHistory(workspace, purpose)) {
    const key = ed25519KeyId(pem); if (key) keys.add(key);
  }
  return keys;
}
function verifyStatement(statement: CalibrationStatement, trust: TrustContext, local: ReadonlySet<string>, context: OperatorCalibrationContext): void {
  if (!same(statement.binding, context.expected)) reject("CALIBRATION_SIGNED_BINDING_MISMATCH");
  if (Date.parse(statement.signedAt) > trust.asOf.getTime()) reject("CALIBRATION_STATEMENT_IN_FUTURE");
  const entries = trust.lists.flatMap(l => l.entries).filter(e => e.keyId === statement.signature.keyId);
  if (entries.length === 0 || new Set(entries.map(e => e.subject)).size !== 1 ||
      new Set(entries.map(e => e.publicKeyPem)).size !== 1 || local.has(statement.signature.keyId)) reject("CALIBRATION_SIGNER_NOT_INDEPENDENT");
  const entry = entries[0]!;
  const { signature, ...unsigned } = statement;
  const signed = sha256Hex(Buffer.concat([Buffer.from(`amc.assurance.calibration/${statement.kind}/v1`, "ascii"), Buffer.from([0]), Buffer.from(canonicalize(unsigned), "utf8")]));
  const checked = checkSignature({ signature: `calibration ${statement.kind}`, purpose: "independent-attestation", context: trust,
    candidates: [entry.publicKeyPem], claimedSignedAt: statement.signedAt,
    verify: pem => verifyHexDigest(signed, signature.value, pem) });
  if (!checked.verified || checked.admission.status !== "admitted" || checked.admission.source !== "trust-list" ||
      checked.admission.keyId !== statement.signature.keyId || checked.admission.listId === null) reject("CALIBRATION_SIGNATURE_NOT_ADMITTED");
  const admitted = trust.lists.find(l => l.listId === checked.admission.listId)?.entries.find(e => e.keyId === checked.admission.keyId);
  if (!admitted || admitted.subject !== statement.signer.subject || admitted.subject !== entry.subject) reject("CALIBRATION_SIGNER_SUBJECT_MISMATCH");
  const roster = context.experts.get(admitted.subject);
  if (!roster || !roster.identities.some(i => ids(i).length > 0)) reject("CALIBRATION_SIGNER_NOT_ON_ROSTER");
}
function assertComplete(idsExpected: readonly string[], rows: readonly { itemId: string }[], reason: string): void {
  const got = rows.map(x => x.itemId);
  if (new Set(got).size !== got.length || !same([...got].sort(), [...idsExpected].sort())) reject(reason);
}
function readBundle(root: string, original: OperatorCalibrationContext): Loaded {
  const context = snapshot(original);
  if (context.experts.size > 1000 || context.authors.size > 10000) reject("CALIBRATION_OPERATOR_INPUT_TOO_LARGE");
  if (context.experts.size === 0) reject("CALIBRATION_ROSTER_EMPTY");
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) reject("CALIBRATION_BUNDLE_ROOT_INVALID");
  const manifestBytes = readContained(root, "bundle.json", 64 * 1024);
  const bundle = bundleSchema.parse(parseCanonicalJson(manifestBytes));
  if (!same(bundle.binding, context.expected)) reject("CALIBRATION_EXPECTED_BINDING_MISMATCH");
  const refs = [bundle.gold, bundle.scenario, bundle.prompt, bundle.rubric, ...bundle.labels, bundle.policy,
    ...(bundle.adjudication ? [bundle.adjudication] : [])];
  if (new Set(refs.map(r => r.path)).size !== refs.length || refs.some(r => r.path === "bundle.json")) reject("CALIBRATION_DUPLICATE_FILE_REFERENCE");
  const captures = new Map<string, Buffer>();
  const read = (r: ArtifactReference): Buffer => {
    // readContained rejects unsafe segments, symlinks, hard links, special files and lasting swaps.
    const bytes = readContained(root, r.path, r.bytes);
    if (bytes.length !== r.bytes || sha256Hex(bytes) !== r.sha256) reject("CALIBRATION_ARTIFACT_CHANGED");
    captures.set(r.path, bytes); return bytes;
  };
  for (const r of refs) read(r);
  const parse = <T>(r: ArtifactReference, schema: z.ZodType<T>): T => schema.parse(parseCanonicalJson(captures.get(r.path)!));
  if (bundle.gold.sha256 !== context.expected.goldSha256 || bundle.scenario.sha256 !== context.expected.scenarioSha256 ||
      bundle.prompt.sha256 !== context.expected.judge.promptSha256 || bundle.rubric.sha256 !== context.expected.judge.rubricSha256) reject("CALIBRATION_SOURCE_BINDING_MISMATCH");
  // Scenario bytes are captured and digest-bound even though the trusted registry supplies the domain.
  parseCanonicalJson(captures.get(bundle.scenario.path)!);
  const gold = parse(bundle.gold, goldSchema), prompt = parse(bundle.prompt, promptDefinitionSchema), rubric = parse(bundle.rubric, rubricDefinitionSchema);
  const goldIds = gold.items.map(i => i.id);
  if (new Set(goldIds).size !== goldIds.length) reject("CALIBRATION_DUPLICATE_GOLD_ITEM");
  const a = parse(bundle.labels[0], labelsSchema), b = parse(bundle.labels[1], labelsSchema), policy = parse(bundle.policy, policySchema);
  const adjudication = bundle.adjudication ? parse(bundle.adjudication, adjudicationSchema) : null;
  const statements: CalibrationStatement[] = [a, b, policy, ...(adjudication ? [adjudication] : [])];
  const trust = loadTrustContext({ now: new Date() });
  const local = localKeys(context.workspace);
  for (const s of statements) verifyStatement(s, trust, local, context);
  const groups = people(context, statements);
  const independent = (x: string, y: string): boolean => !overlap(groups.get(x)!, groups.get(y)!);
  const subjects = statements.map(s => s.signer.subject);
  // Conservative fixed first contract: all roles are distinct people, policy included. No role-overlap approval inferred.
  for (let x = 0; x < subjects.length; x++) for (let y = x + 1; y < subjects.length; y++)
    if (!independent(subjects[x]!, subjects[y]!)) reject("CALIBRATION_REVIEWERS_NOT_DISTINCT");
  for (const source of [bundle.gold, bundle.scenario, bundle.prompt, bundle.rubric]) {
    const authors = context.authors.get(source.sha256);
    if (!authors || !authors.provenance.trim()) reject("CALIBRATION_AUTHORS_UNKNOWN");
    // A known-empty set requires the operator's explicit provenance, rather than treating absence as no authors.
    const authorIds = new Set(authors.identities.flatMap(ids));
    for (const subject of subjects) if (overlap(groups.get(subject)!, authorIds)) reject("CALIBRATION_AUTHOR_SELF_REVIEW");
  }
  if (!context.experts.get(policy.signer.subject)!.domains.map(norm).includes(norm(context.expected.domain))) reject("CALIBRATION_EXPERT_DOMAIN_MISSING");
  const now = trust.asOf.getTime();
  if (!(Date.parse(policy.validFrom) <= now && now < Date.parse(policy.expiresAt) &&
        Date.parse(policy.validFrom) < Date.parse(policy.expiresAt) && Date.parse(policy.calibrationExpiresAt) <= Date.parse(policy.expiresAt))) reject("CALIBRATION_POLICY_EXPIRED_OR_INVALID");
  assertComplete(goldIds, a.labels, "CALIBRATION_FIRST_LABEL_SET_INCOMPLETE");
  assertComplete(goldIds, b.labels, "CALIBRATION_SECOND_LABEL_SET_INCOMPLETE");
  const first = new Map(a.labels.map(x => [x.itemId, x.pass])), second = new Map(b.labels.map(x => [x.itemId, x.pass]));
  const disagreements = goldIds.filter(id => first.get(id) !== second.get(id));
  const finalLabels = new Map(first);
  if (disagreements.length > 0) {
    if (!adjudication) reject("CALIBRATION_ADJUDICATION_MISSING");
    const ad = adjudication!;
    if (!same(ad.labelFileSha256, bundle.labels.map(r => r.sha256))) reject("CALIBRATION_ADJUDICATION_BORROWED");
    if (Date.parse(ad.signedAt) < Math.max(Date.parse(a.signedAt), Date.parse(b.signedAt))) reject("CALIBRATION_ADJUDICATION_PRECEDES_LABELS");
    assertComplete(disagreements, ad.choices, "CALIBRATION_ADJUDICATION_SET_MISMATCH");
    for (const row of ad.choices) finalLabels.set(row.itemId, row.pass);
  } else if (adjudication) reject("CALIBRATION_UNNECESSARY_ADJUDICATION");
  if (gold.items.length < policy.minimumGoldSetSize) reject("CALIBRATION_BELOW_EXPERT_MINIMUM");
  return { root, context, operatorDigest: operatorDigest(context), bundleSha256: sha256Hex(manifestBytes), id: bundle.id, goldPath: bundle.gold.path,
    binding: context.expected, gold, prompt, rubric, policy, finalLabels, references: refs.map(r => ({ ...r })),
    labelSubjects: [a.signer.subject, b.signer.subject], labelledAt: [a.signedAt, b.signedAt, ...(adjudication ? [adjudication.signedAt] : [])].sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1)! };
}
export function authorizeCalibrationBundle(root: string, context: OperatorCalibrationContext): AuthorityResult {
  try { const loaded = readBundle(root, context); const authority = Object.freeze({ bundleSha256: loaded.bundleSha256 });
    authorities.set(authority, loaded); return { state: "ready", authority };
  } catch (e) { return failure(e); }
}
/** Re-reads the same files, reloads native trust, and compares current trusted roster/author snapshots. */
function reload(loaded: Loaded, current: OperatorCalibrationContext): Loaded {
  if (operatorDigest(snapshot(current)) !== loaded.operatorDigest) reject("CALIBRATION_OPERATOR_CONTEXT_CHANGED");
  const fresh = readBundle(loaded.root, current);
  if (fresh.bundleSha256 !== loaded.bundleSha256 || !same(fresh.references, loaded.references)) reject("CALIBRATION_BUNDLE_CHANGED");
  return fresh;
}
export async function calibrateOperatorJudge(authority: CalibrationAuthority, current: OperatorCalibrationContext): Promise<CalibrationResult> {
  try {
    const loaded = authority !== null && typeof authority === "object" ? authorities.get(authority) : undefined;
    if (!loaded) reject("CALIBRATION_AUTHORITY_TOKEN_UNVERIFIED");
    const fresh = reload(loaded!, current);
    const startedAt = new Date().toISOString();
    if (Date.parse(fresh.policy.signedAt) > Date.parse(startedAt) || Date.parse(fresh.labelledAt) > Date.parse(startedAt)) reject("CALIBRATION_LABEL_OR_POLICY_AFTER_RUN");
    const pairs: Array<{ itemId: string; expectedPass: boolean; predictedPass: boolean }> = [];
    for (const item of fresh.gold.items) {
      const call = await captureNativeJudgeCall({ workspace: fresh.context.workspace, binding: fresh.binding, prompt: fresh.prompt, rubric: fresh.rubric,
        caseInput: item.input, purpose: "calibration" });
      const captured = capturedJudgeCall(call);
      if (!captured || captured.purpose !== "calibration" || !same(captured.binding, fresh.binding) || captured.inputSha256 !== hash(item.input)) reject("CALIBRATION_CAPTURE_BINDING_MISMATCH");
      pairs.push({ itemId: item.id, expectedPass: fresh.finalLabels.get(item.id)!, predictedPass: captured!.pass });
    }
    reload(fresh, current); // Await cannot preserve an expired/revoked/changed authority.
    const statistics = calculateConfusion(pairs);
    if (!statistics || statistics.falsePositiveRate === null || statistics.falseNegativeRate === null ||
        statistics.interval95.fpr === null || statistics.interval95.fnr === null) reject("CALIBRATION_CLASS_DENOMINATOR_EMPTY");
    const s = statistics!;
    if (s.falsePositiveRate! > fresh.policy.maxFpr || s.falseNegativeRate! > fresh.policy.maxFnr) reject("CALIBRATION_OUTSIDE_EXPERT_TOLERANCE");
    const calibratedAt = new Date().toISOString();
    if (Date.parse(calibratedAt) >= Date.parse(fresh.policy.calibrationExpiresAt)) reject("CALIBRATION_EXPIRED_AT_COMPLETION");
    const record: RegulatedJudgeCalibration = {
      id: fresh.id, scenarioId: fresh.binding.scenarioId, judge: { ...fresh.binding.judge },
      goldSet: { path: fresh.goldPath, sha256: fresh.binding.goldSha256, items: s.items,
        labelledBy: [...fresh.labelSubjects], labelledAt: fresh.labelledAt },
      confusion: { ...s.confusion }, falsePositiveRate: s.falsePositiveRate!, falseNegativeRate: s.falseNegativeRate!,
      interval95: { fpr: [...s.interval95.fpr!], fnr: [...s.interval95.fnr!] },
      tolerance: { maxFpr: fresh.policy.maxFpr, maxFnr: fresh.policy.maxFnr }, minimumGoldSetSize: fresh.policy.minimumGoldSetSize,
      calibratedAt, expiresAt: fresh.policy.calibrationExpiresAt };
    const token = Object.freeze({ id: fresh.id, expiresAt: record.expiresAt });
    // Stored record is copied; external callers receive a different object.
    calibrations.set(token, { loaded: fresh, record: JSON.parse(canonicalize(record)) as RegulatedJudgeCalibration, statistics: s });
    return { state: "eligible", calibration: token, record };
  } catch (e) { return failure(e); }
}
export function calibrationStanding(token: AuthorizedCalibration, current: OperatorCalibrationContext):
  NE | { state: "eligible"; id: string; binding: JudgeBinding; calibratedAt: string; expiresAt: string } {
  try {
    const value = token !== null && typeof token === "object" ? calibrations.get(token) : undefined;
    if (!value) reject("CALIBRATION_TOKEN_UNVERIFIED");
    reload(value!.loaded, current);
    const now = Date.now();
    // Keep this guard independently mutation-tested while the signed policy itself is still current.
    if (!(Date.parse(value!.record.calibratedAt) <= now && now < Date.parse(value!.record.expiresAt))) reject("CALIBRATION_EXPIRED_OR_FUTURE");
    return { state: "eligible", id: value!.record.id, binding: JSON.parse(canonicalize(value!.loaded.binding)) as JudgeBinding,
      calibratedAt: value!.record.calibratedAt, expiresAt: value!.record.expiresAt };
  } catch (e) { return failure(e); }
}
/** The only positive judgment admission. Effect failures/missing effect coverage remain caller-side failure/NE. */
export function admitCapturedJudgeDecision(token: AuthorizedCalibration, call: CapturedJudgeCall,
  current: OperatorCalibrationContext, expectedInputSha256: string):
  NE | { state: "admitted"; outcome: "pass" | "fail"; calibrationId: string; requestSha256: string; responseSha256: string } {
  const standing = calibrationStanding(token, current);
  if (standing.state !== "eligible") return standing;
  const execution = consumeEvaluationCall(call);
  if (!execution || execution.workspace !== current.workspace || !same(execution.binding, standing.binding) || execution.responseModel !== standing.binding.judge.model ||
      execution.inputSha256 !== expectedInputSha256 || Date.parse(execution.evaluatedAt) < Date.parse(standing.calibratedAt) ||
      Date.parse(execution.evaluatedAt) > Date.now()) return { state: "not_evaluated", reasons: ["JUDGE_EXECUTION_NOT_BOUND"] };
  return { state: "admitted", outcome: execution.pass ? "pass" : "fail", calibrationId: standing.id,
    requestSha256: execution.requestSha256, responseSha256: execution.responseSha256 };
}
