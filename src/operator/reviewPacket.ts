/**
 * The auditor review packet (P2-22, backlog A14): a zip an auditor checks without trusting AMC. plan/ holds the signed
 * plan, its lockfile and the diff from the previous plan; results/ the control results (claim kind and five dimensions)
 * the plan's A4 project recorded at Adapt Review; evidence/ references and payload hashes only (never content, which is
 * stricter than any data-class rule); receipts/ the action receipts in the window; exports/ OSCAL (P1-28) and a PDF
 * summary. attestation/review-packet.dsse.json is a DSSE in-toto statement (P1-27's control-results predicate) whose
 * subjects are every other file, signed with the workspace's artifact-seal (auditor) key through its key provider (P2-08).
 * verifier/report.json is the standalone verifier's report (P1-06) at build time against this machine's trust list; it is
 * not a subject, and an auditor re-runs `amc-verify` with the issuer key pinned in their own trust list. Bundled public keys
 * only identify the signer. No private key material is ever written: every file is scanned before signing.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pae, INTOTO_PAYLOAD_TYPE } from "../attest/dsse.js";
import { buildControlResultsStatement, AttestationRefused } from "../attest/statement.js";
import { conformanceView } from "../a4/a4Conformance.js";
import { proposedPlan, buildOf } from "../a4/spec/adapt.js";
import { loadAdmittedCatalog } from "../catalog/admission/gate.js";
import { renderPlanDiffMarkdown } from "../catalog/compiler/diff.js";
import { assertSignedPlan } from "../catalog/compiler/sign.js";
import type { SignedPlan } from "../catalog/compiler/types.js";
import { readSignedControlResults } from "../catalog/evidence/signedResults.js";
import type { ClaimKind } from "../claims/eligibility/types.js";
import { resolveAmcHome } from "../credentials/credentialsPaths.js";
import { createZipArchive } from "../evidence/zip.js";
import { parseControlResults, toOscalAssessmentResults } from "../exports/oscal/oscalAssessmentResults.js";
import { OSCAL_VERSION, oscalJson } from "../exports/oscal/oscalIds.js";
import { buildLossReport } from "../exports/oscal/oscalLoss.js";
import { toOscalProfile } from "../exports/oscal/oscalProfile.js";
import { signingKeyId } from "../keys/algorithmPolicy.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { openLedger } from "../ledger/ledger.js";
import { readPinnedTrustRoots } from "../trust/rootRotation.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { renderPdfFromLines, wrapPdfLines } from "../utils/textPdf.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { readA4Projects } from "./operatorSources.js";
import { listOperatorPlans, OperatorPlanError } from "./planDiffView.js";

export type PacketFormat = "json" | "oscal" | "pdf";
export const PACKET_ID = /^rp_[0-9a-f]{24}$/;
const PRIVATE_KEY = /PRIVATE KEY/;
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const packetsDir = (workspace: string) => join(workspace, ".amc", "operator", "review-packets");
const fail = (status: number, code: string, message: string) => new OperatorPlanError(status, code, message);

export const PACKET_README = (packetId: string) => [
  "# AMC review packet", "", `Packet: ${packetId}`, "",
  "Evidence of conformity, never a compliance statement. A signature proves who issued these bytes and that they are unchanged, not that they are true.", "",
  "## Verify", "",
  "1. Verify `attestation/review-packet.dsse.json` with `amc-verify` and the issuer key pinned in your trust list (`--trust-list`, `--trust-root`).",
  "   Supply every other file of this packet as evidence: each subject digest must match the bytes you hold.",
  "2. Public keys inside a packet only identify the signer. Never verify a packet with a key it ships: a forger can replace both.",
  "3. `verifier/report.json` is the verifier's report when the packet was built, against the builder's trust list. Re-run it yourself.", "",
  "## Contents", "",
  "- `plan/`: the signed compiled plan, its catalog lockfile and the diff from the previous plan (reasons from the compiler).",
  "- `results/`: control results with their claim kind and five status dimensions.",
  "- `evidence/`: evidence references and payload hashes; no evidence content.",
  "- `receipts/`: action receipts in the window.",
  "- `exports/`: OSCAL documents and a PDF summary, when requested.",
  "- `manifest.json`: every file and its sha256.", ""
].join("\n");

/** The part of the standalone verifier (packages/verifier, P1-06) this module calls; src compiles without that package. */
interface StandaloneVerifier {
  verifyArtifact(bytes: Uint8Array, options: { trustLists: readonly unknown[]; trustRoots: readonly string[]; asOf?: Date; path?: string;
    evidence?: ReadonlyMap<string, Uint8Array> }): Record<string, unknown>;
}

/** The verifier as built beside this checkout (`npm run build:verifier`), loaded at run time; null when it is not there. */
async function loadVerifier(): Promise<StandaloneVerifier | null> {
  try {
    return await import(new URL("../../packages/verifier/dist/packages/verifier/src/index.js", import.meta.url).href) as StandaloneVerifier;
  } catch {
    return null;
  }
}

/** This machine's operator trust list and roots (the files loadTrustContext reads), raw; none when absent. */
function machineTrust(): { trustLists: unknown[]; trustRoots: string[] } {
  const home = resolveAmcHome();
  const listPath = join(home, "trust", "amc-trust-list.json");
  if (!pathExists(listPath)) return { trustLists: [], trustRoots: [] };
  return { trustLists: [JSON.parse(readFileSync(listPath, "utf8")) as unknown], trustRoots: readPinnedTrustRoots(home)?.roots ?? [] };
}

export interface PacketSource {
  signed: SignedPlan; agentId: string; projectId: string;
  statement: ReturnType<typeof conformanceView>;
  resultsFile: { path: string; sha256: string } | null;
  refs: Array<Record<string, unknown>>;
}

/** The plan's A4 project: its signed build, the conformance statement for this plan, and the references in the window. */
export function packetSource(workspace: string, planDigest: string, window: { fromTs: number; toTs: number }, now: number): PacketSource {
  const candidate = listOperatorPlans(workspace, now).candidates.find((entry) => entry.plan.digest === planDigest && entry.source.kind === "a4" && entry.signed !== null);
  if (candidate === undefined || candidate.source.kind !== "a4" || candidate.signed === null) {
    throw fail(404, "PLAN_NOT_FOUND", "no signed A4 plan with this digest; a packet is built from a plan an A4 project signed");
  }
  try {
    assertSignedPlan(workspace, candidate.signed, "plan");
  } catch {
    throw fail(409, "PLAN_UNSIGNED", "the plan's CONTROL_PLAN signature does not verify");
  }
  const { projectId } = candidate.source;
  const base = candidate.signed;
  return readA4Projects(workspace, now, (projects) => {
    const project = projects.find((entry) => entry.projectId === projectId);
    if (project === undefined) throw fail(404, "PLAN_NOT_FOUND", "the plan's A4 project is gone");
    const statement = conformanceView(workspace, project.state, "adapt", now, () => project.readiness().items);
    if (statement.planDigest !== planDigest.replace(/^sha256:/, "") && statement.planDigest !== planDigest) {
      throw fail(409, "RESULTS_NOT_RECORDED", "no control results are recorded for this plan (Adapt Review of this plan)");
    }
    const revision = project.state.revisions.filter((row) => row.stage === "adapt").at(-1);
    const spec = revision === undefined ? {} : JSON.parse(revision.spec_json) as Record<string, unknown>;
    const conformance = (spec.review as { conformance?: { resultsPath?: unknown; resultsSha256?: unknown } } | undefined)?.conformance;
    const build = buildOf(spec);
    const signed: SignedPlan = { ...base, diff: proposedPlan(spec)?.digest === planDigest ? build?.diff ?? null : null,
      review: { status: "pending", approvalRequestId: null } };
    const refs = project.state.refs.filter((ref) => ref.revisionNo === revision?.revision_no).map((ref) => ({
      refKind: ref.refKind, refSha256: sha256Hex(`${ref.refKind}:${ref.refId}`), sha256: ref.sha256, claimKind: ref.claimKind, lane: ref.lane,
      trustTier: ref.trustTier, status: ref.status }));
    return { signed, agentId: project.agentId, projectId, statement, refs,
      resultsFile: typeof conformance?.resultsPath === "string" && typeof conformance.resultsSha256 === "string"
        ? { path: conformance.resultsPath, sha256: conformance.resultsSha256 } : null };
  });
}

function receiptsIn(workspace: string, agentId: string, window: { fromTs: number; toTs: number }): unknown[] {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    return ledger.db.prepare(`SELECT execution_id AS executionId, agent_id AS agentId, tool_name AS toolName, action_class AS actionClass, state, effect,
      evidence_complete AS evidenceComplete, last_receipt_digest AS lastReceiptDigest, created_ts AS createdTs, updated_ts AS updatedTs
      FROM action_executions WHERE agent_id = ? AND updated_ts BETWEEN ? AND ? ORDER BY created_ts`).all(agentId, window.fromTs, window.toTs);
  } finally {
    ledger.close();
  }
}

/** OSCAL profile and assessment results (P1-28), plus the loss report; assessment results only from the signed results file. */
function oscalFiles(workspace: string, source: PacketSource): Record<string, Buffer> {
  const catalog = loadAdmittedCatalog();
  const profile = toOscalProfile(source.signed, "catalog.json");
  const results = source.resultsFile === null ? null : readSignedControlResults(workspace, source.resultsFile.path);
  const assessment = results === null ? null : toOscalAssessmentResults(parseControlResults(results.value, source.signed.plan, catalog), source.signed.plan, results.digestSha256);
  const report = buildLossReport([{ kind: "plan", digest: source.signed.plan.digest },
    ...(results ? [{ kind: "results" as const, digest: `sha256:${results.digestSha256}` }] : [])], [...profile.losses, ...(assessment?.losses ?? [])]);
  return Object.fromEntries([
    ...(profile.document ? [["exports/oscal/profile.json", Buffer.from(oscalJson(profile.document), "utf8")]] : []),
    ...(assessment?.document ? [["exports/oscal/assessment-results.json", Buffer.from(oscalJson(assessment.document), "utf8")]] : []),
    ["exports/oscal/oscal-loss-report.json", Buffer.from(oscalJson(report), "utf8")]
  ]);
}

function summaryPdf(packetId: string, source: PacketSource, window: { fromTs: number; toTs: number }, claimKind: string): Buffer {
  const { statement } = source;
  return renderPdfFromLines(wrapPdfLines([
    "AMC review packet summary", `Packet ${packetId}`, `Plan ${source.signed.plan.digest}`,
    `Window ${new Date(window.fromTs).toISOString()} to ${new Date(window.toTs).toISOString()}`,
    `Claim kind: ${claimKind}. Evidence of conformity, never a compliance statement.`,
    `Counts: pass ${statement.counts.pass}, fail ${statement.counts.fail}, not evaluated ${statement.counts.not_evaluated}, `
      + `not applicable ${statement.counts.not_applicable}, unresolved ${statement.counts.unresolved}`, "",
    ...statement.controls.map((control) => `${control.controlId}: result ${control.result}, evidence ${control.evidence}, review ${control.review}, `
      + `claim ${control.claimKind}${"notEvaluatedReason" in control && control.notEvaluatedReason ? ` (${control.notEvaluatedReason})` : ""}`)
  ]));
}

export interface ReviewPacketResult {
  packetId: string; sha256: string; files: Array<{ path: string; sha256: string }>;
  verifier: { available: boolean; dimensions: Record<string, string> | null };
}

export async function buildReviewPacket(p: { workspace: string; planDigest: string; agentIds?: string[]; window: { fromTs: number; toTs: number };
  formats: PacketFormat[]; nowTs?: number; source?: typeof packetSource }): Promise<ReviewPacketResult> {
  const now = p.nowTs ?? Date.now();
  if (!(p.window.fromTs <= p.window.toTs && p.window.toTs <= now)) throw fail(400, "WINDOW_INVALID", "the window must satisfy fromTs <= toTs <= now");
  if (p.formats.length === 0) throw fail(400, "FORMATS_REQUIRED", "name at least one of json, oscal and pdf");
  const source = (p.source ?? packetSource)(p.workspace, p.planDigest, p.window, now);
  if (p.agentIds !== undefined && !p.agentIds.includes(source.agentId)) throw fail(409, "AGENT_NOT_IN_PLAN", "the plan's project governs another agent");
  if (source.statement.controls.length === 0) throw fail(409, "RESULTS_NOT_RECORDED", "the plan has no control result to put in a packet");
  const packetId = `rp_${randomBytes(12).toString("hex")}`;
  const { plan } = source.signed;
  const files: Record<string, Buffer> = {
    "README.md": Buffer.from(PACKET_README(packetId), "utf8"),
    "plan/plan.json": json({ plan, signature: source.signed.signature, compiledAt: source.signed.compiledAt }),
    "plan/lockfile.json": json(plan.lock),
    "plan/diff.json": json(source.signed.diff),
    "plan/diff.md": Buffer.from(renderPlanDiffMarkdown(source.signed.diff), "utf8"),
    "results/control-results.json": json({ planDigest: plan.digest, evaluatedAt: source.statement.evaluatedAt, controls: source.statement.controls,
      counts: source.statement.counts, claimBoundary: source.statement.claimBoundary }),
    "evidence/references.json": json({ note: "References and payload hashes only; no evidence content.", refs: source.refs }),
    "receipts/action-receipts.json": json(receiptsIn(p.workspace, source.agentId, p.window)),
    ...(p.formats.includes("oscal") ? oscalFiles(p.workspace, source) : {})
  };
  const claimKinds = source.statement.controls.map((control) => control.claimKind as ClaimKind);
  if (p.formats.includes("pdf")) files["exports/summary.pdf"] = summaryPdf(packetId, source, p.window, [...new Set(claimKinds)].join(", "));
  files["manifest.json"] = json({ schema: "amc.review-packet/v1", packetId, planDigest: plan.digest, projectId: source.projectId, agentId: source.agentId,
    window: p.window, formats: p.formats, generatedAt: new Date(now).toISOString(), oscalVersion: OSCAL_VERSION,
    files: Object.entries(files).map(([path, bytes]) => ({ path, sha256: sha256Hex(bytes) })).sort((a, b) => a.path.localeCompare(b.path)) });
  const leaked = Object.entries(files).filter(([, bytes]) => PRIVATE_KEY.test(bytes.toString("latin1"))).map(([path]) => path);
  if (leaked.length > 0) throw fail(409, "PACKET_KEY_MATERIAL", `refused: key material in ${leaked.join(", ")}; nothing was written`);

  let statement;
  try {
    statement = buildControlResultsStatement({
      subjects: Object.entries(files).map(([name, bytes]) => ({ name, bytes })), claimKinds, signerPurpose: "artifact-seal",
      scope: { tenant: plan.profile.deployment?.tenantId ?? null, deployment: plan.profile.deployment?.deploymentId ?? null,
        workspace: workspaceIdFromDirectory(p.workspace), agent: source.agentId, snapshot: sha256Hex(files["manifest.json"]!), profile: plan.profile.profileId,
        profileVersion: null, window: { start: new Date(p.window.fromTs).toISOString(), end: new Date(p.window.toTs).toISOString() },
        exclusions: plan.requirements.filter((row) => row.applicability === "not_applicable").map((row) => ({ controlId: row.controlId, rationale: row.exclusion?.reason ?? "not applicable" })) },
      controls: source.statement.controls.map(({ controlId, applicability, evidence, result, enforcement, review }) => ({ controlId,
        dimensions: { applicability, evidence, result, enforcement, review } })),
      evidence: [{ sha256: sha256Hex(files["results/control-results.json"]!), kind: "control-results" }, { sha256: sha256Hex(files["plan/plan.json"]!), kind: "signed-plan" }],
      verifierReport: null, issuedAt: new Date(now)
    });
  } catch (error) {
    if (error instanceof AttestationRefused) throw fail(409, error.code, error.message);
    throw error;
  }
  const payload = Buffer.from(JSON.stringify(statement), "utf8");
  const signature = await signWithPurposeKey(p.workspace, "artifact-seal", pae(INTOTO_PAYLOAD_TYPE, payload));
  const keyid = signingKeyId(signature.publicKeyPem) ?? signature.keyId;
  const envelope = json({ payloadType: INTOTO_PAYLOAD_TYPE, payload: payload.toString("base64"), signatures: [{ keyid, sig: signature.signature.toString("base64") }] });
  const verifier = await loadVerifier();
  const report = verifier === null ? null : verifier.verifyArtifact(envelope, { ...machineTrust(), asOf: new Date(now), path: "attestation/review-packet.dsse.json",
    evidence: new Map(Object.values(files).map((bytes) => [sha256Hex(bytes), new Uint8Array(bytes)])) });
  const all: Record<string, Buffer> = { ...files, "attestation/review-packet.dsse.json": envelope,
    "verifier/report.json": json(report ?? { verifier: "amc-verify", status: "unavailable", note: "The standalone verifier is not installed here; run amc-verify yourself." }) };
  const zip = createZipArchive(Object.entries(all).map(([path, bytes]) => ({ path, bytes, modifiedTs: now })));
  ensureDir(packetsDir(p.workspace));
  writeFileAtomic(join(packetsDir(p.workspace), `${packetId}.zip`), zip, 0o600);
  return { packetId, sha256: sha256Hex(zip), files: Object.entries(all).map(([path, bytes]) => ({ path, sha256: sha256Hex(bytes) })),
    verifier: { available: report !== null, dimensions: report === null ? null
      : Object.fromEntries(["integrity", "issuerAdmission", "scope", "freshness", "completeness", "satisfaction"].map((dimension) => [dimension,
        (report[dimension] as { status: string }).status])) } };
}

/** The stored zip of `packetId`, or null; the id is checked against its shape first, so it never names another path. */
export function reviewPacketBytes(workspace: string, packetId: string): Buffer | null {
  if (!PACKET_ID.test(packetId)) return null;
  const path = join(packetsDir(workspace), `${packetId}.zip`);
  return pathExists(path) ? readFileSync(path) : null;
}
