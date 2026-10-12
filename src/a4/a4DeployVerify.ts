/**
 * AMC's own check of a recorded deployment (P1-62 slice B; design §10.4 Verify deployment, §16 rule 13; D-18 option 1).
 * Owner only, token-less, and only to the deploy receipt's `destinationRef` (a body never names a URL): the host goes
 * through `resolveAndCheck` (P1-66; every A/AAAA record through `decideEgress`, an empty resolution refused, a non-public
 * address refused unless listed — and AMC lists none), the connection is pinned to the checked address with the host as
 * TLS servername, TLS verifies against the system CA set pinned here, any 3xx fails, 5 s and 256 KiB bound it, and every
 * remote body is parsed strictly. Neither `/readyz` nor `/healthz` exposes a release digest and verify sends no credential, so
 * the image, package and plan-head checks are not_evaluated (P2-40): `reachable` is the best status in v1, `passed` is
 * unreachable, and no probe turn runs. The row keeps `recorded_status` and `amc_check_status` apart (C-35).
 */
import { randomBytes } from "node:crypto";
import { request } from "node:https";
import { isIP } from "node:net";
import tls from "node:tls";
import { z } from "zod";
import { pinnedLookup } from "../gateway/requestFieldGuard.js";
import { isNonPublicAddress, resolveAndCheck, type EgressCheck } from "../enforce/egressAllowlist.js";
import { assertOwnerMode } from "../mode/mode.js";
import { loadTrustContext } from "../trust/trustContext.js";
import { buildVerifierReport } from "../trust/verifierReport.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { statusText } from "./a4Deploy.js";
import { assertAllowed, evaluateFor, governed, livePrincipal, loadA4State, type A4Call } from "./a4Gates.js";
import { recordEnvelope, writeReleaseRecord } from "./a4Package.js";
import type { A4ReadinessState } from "./a4Readiness.js";
import { a4DeploymentReceiptV1Schema, headSeqSchema, type A4ChainLink } from "./a4Schema.js";
import type { A4ChangeSpec, A4Store, A4TransitionResult } from "./a4Store.js";
import { cycleLinks, IDENTITY_NOT_EVALUATED, releaseDestination } from "./spec/activate.js";
import { fail } from "./stages/common.js";

const TIMEOUT_MS = 5_000;
const BODY_CAP = 256 * 1024;
const RUNTIME_NOT_EVALUATED = "runtime behaviour at the destination: not evaluated (no probe turn; verify sends no credential)";

export const verifyBodySchema = z.strictObject({ environment: z.enum(["staging", "production"]), expectedHeadSeq: headSeqSchema,
  clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/) });

// Strict on what AMC reads from the destination; anything else is REMOTE_BODY_INVALID.
const readyzSchema = z.strictObject({ status: z.enum(["READY", "NOT_READY"]), reasons: z.array(z.string().max(500)).max(64),
  checks: z.record(z.string().max(128), z.unknown()), ts: z.number() });
const healthzSchema = z.strictObject({ status: z.enum(["ok", "degraded"]), version: z.string().max(64), uptime: z.number(), dbStatus: z.enum(["ok", "degraded"]) });

/** The system CA set, pinned per request so a process-wide CA override cannot widen it; Node's bundled roots where no system store is readable. */
function systemCas(): string[] {
  const read = (tls as { getCACertificates?: (type: "system") => string[] }).getCACertificates;
  const system = typeof read === "function" ? read("system") : [];
  return system.length > 0 ? system : [...tls.rootCertificates];
}

type Fetched = { status: number; body: Buffer } | { error: string };
const TLS_CODES = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME|ERR_TLS|ERR_SSL/;

/** One GET to the checked address over TLS: no redirect followed, no credential, no keep-alive socket, 256 KiB, within `signal`. */
function fetchPinned(host: string, port: number, address: string, path: string, signal: AbortSignal): Promise<Fetched> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: Fetched): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    let req: ReturnType<typeof request>;
    try {
      req = request({ hostname: host, port, path, method: "GET", agent: false, lookup: pinnedLookup([address]), ca: systemCas(), rejectUnauthorized: true,
        ...(isIP(host) === 0 ? { servername: host } : {}), headers: { accept: "application/json", "user-agent": "amc-a4-verify" }, signal },
        (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.destroy();
          return done({ error: "REDIRECT_REFUSED" });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > BODY_CAP) {
            res.destroy();
            done({ error: "BODY_TOO_LARGE" });
          } else chunks.push(chunk);
        });
        res.on("end", () => done({ status, body: Buffer.concat(chunks) }));
        res.on("error", () => done({ error: "CONNECT_FAILED" }));
        // A response cut short settles too (after `end` this is a no-op).
        res.on("close", () => done({ error: signal.aborted ? "TIMEOUT" : "CONNECT_FAILED" }));
        });
    } catch {
      // A request Node refuses to build (a bad port) is a coded failure, never a 500.
      return done({ error: "CONNECT_FAILED" });
    }
    req.on("error", (error: NodeJS.ErrnoException) => done({ error: error.name === "AbortError" || error.name === "TimeoutError" ? "TIMEOUT"
      : TLS_CODES.test(String(error.code ?? error.message)) ? "TLS_REFUSED" : "CONNECT_FAILED" }));
    req.end();
  });
}

type Check = { name: string; status: "passed" | "failed" | "not_evaluated"; detail: string };
export type ProbeResult = { checks: Check[]; amcCheckStatus: "reachable" | "failed"; reasonCodes: string[]; resolvedAddress: string | null; responseSha256: string | null };

/** `/readyz` decides the status (READY → reachable, anything else → failed); `/healthz` is recorded beside it. */
export async function probeDestination(destinationRef: string, egress: EgressCheck, fetch: typeof fetchPinned = fetchPinned): Promise<ProbeResult> {
  const [host, rawPort] = destinationRef.split(":");
  const port = rawPort === undefined ? 443 : Number(rawPort);
  const address = egress.addresses[0]!;
  // One 5 s deadline for both requests.
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const readyz = await fetch(host!, port, address, "/readyz", signal);
  const healthz = await fetch(host!, port, address, "/healthz", signal);
  const parse = <T>(fetched: Fetched, schema: z.ZodType<T>): { value: T | null; code: string | null } => {
    if ("error" in fetched) return { value: null, code: fetched.error };
    try {
      const parsed = schema.safeParse(JSON.parse(fetched.body.toString("utf8")));
      return parsed.success ? { value: parsed.data, code: null } : { value: null, code: "REMOTE_BODY_INVALID" };
    } catch {
      return { value: null, code: "REMOTE_BODY_INVALID" };
    }
  };
  const ready = parse(readyz, readyzSchema);
  const health = parse(healthz, healthzSchema);
  const readyOk = "status" in readyz && readyz.status === 200 && ready.value?.status === "READY";
  const readyCode = ready.code ?? ("status" in readyz && readyz.status === 503 ? "READYZ_FAILED" : readyOk ? null : "READYZ_UNEXPECTED");
  const redirect = [readyz, healthz].some((fetched) => "error" in fetched && fetched.error === "REDIRECT_REFUSED");
  const notEvaluated = (name: string): Check => ({ name, status: "not_evaluated", detail: IDENTITY_NOT_EVALUATED });
  const checks: Check[] = [
    { name: "destination", status: "passed", detail: `the receipt's destinationRef ${destinationRef}, resolved and checked: ${egress.decision.reason}` },
    { name: "readyz", status: readyOk ? "passed" : "failed", detail: readyOk ? "READY" : `${readyCode}${"status" in readyz ? ` (HTTP ${readyz.status})` : ""}` },
    { name: "healthz", status: "status" in healthz && healthz.status === 200 && health.value !== null ? "passed" : "failed",
      detail: health.value !== null ? `${health.value.status}, version ${health.value.version}` : health.code ?? `HTTP ${"status" in healthz ? healthz.status : "?"}` },
    notEvaluated("image_digest"), notEvaluated("package_digest"), notEvaluated("plan_head"),
    { name: "runtime_behaviour", status: "not_evaluated", detail: RUNTIME_NOT_EVALUATED }
  ];
  const failed = !readyOk || redirect;
  return { checks, amcCheckStatus: failed ? "failed" : "reachable", reasonCodes: failed ? [...new Set([...(redirect ? ["REDIRECT_REFUSED"] : []), readyCode ?? "READYZ_FAILED"])]
    : ["DEPLOYMENT_IDENTITY_NOT_EVALUATED", "KEY:P2-40"], resolvedAddress: address, responseSha256: "status" in readyz ? sha256Hex(readyz.body) : null };
}

/** The newest deploy or rollback receipt of `releaseId` in `environment` (this cycle), or undefined. */
const receiptOf = (state: A4ReadinessState, releaseId: string, environment: string): A4ChainLink | undefined =>
  cycleLinks(state.chain, "DEPLOYMENT").filter((link) => link.body.releaseId === releaseId && link.body.environment === environment).at(-1);

/**
 * The rows a check is pinned to: the release, its newest receipt in `environment` and the destination the release's own
 * revision proposed (what its signed deploy/plan.json records), never a later revision's answers.
 */
function checkInputs(state: A4ReadinessState, releaseId: string, environment: string): { receipt: A4ChainLink; declared: string | null } {
  if (!state.chain.some((link) => link.kind === "RELEASE" && link.body.releaseId === releaseId)) throw fail(404, "A4_RELEASE_NOT_FOUND", `no release ${releaseId} on this project`);
  const receipt = receiptOf(state, releaseId, environment);
  if (receipt === undefined) {
    throw fail(409, "DESTINATION_MISMATCH", `No ${environment} receipt is recorded for this release: AMC checks only the destination a receipt names.`, { amcCheckStatus: "not_evaluated" });
  }
  return { receipt, declared: releaseDestination(state, releaseId) };
}

/**
 * POST …/releases/:rid/verify (owner): the check runs on rows pinned to `expectedHeadSeq`; a receipt whose destination is
 * not the declared one fails without any connection (DESTINATION_MISMATCH); an egress refusal is 409 naming the address
 * and records nothing. The signed `a4-amc-check` file and the row's envelope are written before the transaction, then
 * VERIFICATION with an a4_deployments `verify` row (recorded_status copied from the receipt, untouched) and the check as an
 * implementation-lane ref (self_reported); the VerifierReportV1 is an integrity item and never trusted.
 */
export async function verifyDeployment(store: A4Store, projectId: string, releaseId: string, input: A4Call & { body: z.infer<typeof verifyBodySchema> },
  probe: typeof probeDestination = probeDestination): Promise<{ result: A4TransitionResult; checkId: string; amcCheckStatus: string; statusText: string }> {
  const { body } = input;
  const principal = livePrincipal(store, input);
  assertOwnerMode(store.workspace, "a4 verify");
  const now = Date.now();
  const before = loadA4State(store, projectId, now);
  const stage = before.project.stage === "retired" ? "activate" : before.project.stage;
  assertAllowed(evaluateFor(store, before, principal, input, stage, now).readiness, "verifyDeployment");
  if (before.project.head_seq !== body.expectedHeadSeq) throw fail(409, "A4_STALE_HEAD", "The project moved; reload and retry.", { headSeq: before.project.head_seq });
  const { receipt, declared } = checkInputs(before, releaseId, body.environment);
  const destination = String(receipt.body.destinationRef);
  let probed: ProbeResult;
  if (declared === null || destination !== declared) {
    probed = { checks: [{ name: "destination", status: "failed", detail: `the receipt names ${destination}; the release was packaged for ${declared ?? "none"}` }],
      amcCheckStatus: "failed", reasonCodes: ["DESTINATION_MISMATCH"], resolvedAddress: null, responseSha256: null };
  } else {
    const host = destination.split(":")[0]!;
    // A non-public IP literal is never listed, so it is refused like a name that resolves inward (no signed opt-in exists in v1).
    const egress = await resolveAndCheck(host, { allowHosts: isIP(host) !== 0 && isNonPublicAddress(host) ? [] : [host] });
    if (!egress.decision.allowed && egress.unresolved !== true) {
      throw fail(409, "VERIFY_EGRESS_REFUSED", `AMC does not connect to ${host}: ${egress.decision.reason}`, { addresses: egress.addresses });
    }
    probed = egress.decision.allowed ? await probe(destination, egress)
      : { checks: [{ name: "destination", status: "failed", detail: egress.decision.reason }], amcCheckStatus: "failed", reasonCodes: ["DESTINATION_UNRESOLVED"],
        resolvedAddress: null, responseSha256: null };
  }
  const checkId = `a4chk_${randomBytes(16).toString("hex")}`;
  const recorded = String(receipt.body.recordedStatus);
  const text = statusText(recorded, probed.amcCheckStatus, probed.reasonCodes);
  // The artifact this report speaks for is the /readyz response AMC fetched (never the check file, which embeds the report),
  // and its digest is not_evaluated when nothing was fetched: never a placeholder digest.
  const report = buildVerifierReport({ artifact: { kind: "a4-amc-check-readyz-response", path: `https://${destination}/readyz`,
    sha256: probed.responseSha256 ?? "not_evaluated" }, context: loadTrustContext(),
    integrityErrors: probed.amcCheckStatus === "failed" ? probed.reasonCodes : [], signatures: [], verifiedAt: new Date(now),
    anchoring: { status: "not-applicable", detail: "a token-less reachability probe; nothing at the destination is signed until P2-40" },
    warnings: [`release identity: ${IDENTITY_NOT_EVALUATED}`, RUNTIME_NOT_EVALUATED] });
  const check = { schema: "amc.a4-amc-check/v1", checkId, releaseId, projectId, receiptId: receipt.body.deploymentId, environment: body.environment,
    destinationRef: destination, resolvedAddress: probed.resolvedAddress, responseSha256: probed.responseSha256, checks: probed.checks,
    amcCheckStatus: probed.amcCheckStatus, reasonCodes: probed.reasonCodes, statusText: text, report, claimKind: "self_reported", checkedByKey: principal.key, ts: now };
  const file = writeReleaseRecord(store.workspace, projectId, "checks", releaseId, checkId, check, "a4-amc-check");
  const row = receiptRowOf(store, projectId, String(receipt.body.deploymentId));
  const receiptJson = canonicalize(a4DeploymentReceiptV1Schema.parse({ ...row, deploymentId: checkId, kind: "verify", amcCheckStatus: probed.amcCheckStatus,
    amcCheck: { checkId, checkPath: file.path, receiptId: receipt.body.deploymentId, reasonCodes: probed.reasonCodes, statusText: text }, recordedByKey: principal.key, ts: now }));
  const envelope = recordEnvelope(store.workspace, sha256Hex(receiptJson));
  const result = governed(store, projectId, principal, { expectedHeadSeq: body.expectedHeadSeq, request: input.request,
    response: { checkId, amcCheckStatus: probed.amcCheckStatus, statusText: text } }, (ts, load) => {
    const state = load(now);
    const { readiness } = evaluateFor(store, state, principal, input, state.project.stage === "retired" ? "activate" : state.project.stage, now);
    assertAllowed(readiness, "verifyDeployment");
    if (checkInputs(state, releaseId, body.environment).receipt.body.deploymentId !== receipt.body.deploymentId) {
      throw fail(409, "A4_STALE_HEAD", "A newer receipt was recorded while AMC checked; check again.");
    }
    const spec: A4ChangeSpec = { kind: "VERIFICATION", stage: state.project.stage, payload: { checkId, releaseId, receiptId: receipt.body.deploymentId,
      environment: body.environment, amcCheckStatus: probed.amcCheckStatus, reasonCodes: probed.reasonCodes, checkPath: file.path, checkSha256: file.sha256,
      resolvedAddress: probed.resolvedAddress, responseSha256: probed.responseSha256, recordedStatus: recorded, claimKind: "self_reported" },
    sideRows: [
      { table: "a4_deployments", values: { deployment_id: checkId, release_id: releaseId, project_id: projectId, kind: "verify", environment: body.environment,
        target: String(receipt.body.target), receipt_json: receiptJson, receipt_sha256: String(receipt.body.receiptSha256), recorded_status: recorded,
        amc_check_status: probed.amcCheckStatus, amc_check_json: canonicalize(check), recorded_by_key: principal.key, envelope_json: JSON.stringify(envelope), ts } },
      { table: "a4_evidence_refs", values: { project_id: projectId, seq: state.project.head_seq + 1, revision_no: state.project.revision_no, stage: state.project.stage,
        lane: "implementation", ref_kind: "verification", ref_id: file.path, sha256: file.sha256, claim_kind: "self_reported", trust_tier: null, method: null,
        label: `AMC check ${checkId} of receipt ${String(receipt.body.deploymentId)}: ${text} (self_reported)`, actor_key: principal.key, ts } }] };
    return { readiness, specs: spec };
  });
  return { result, checkId, amcCheckStatus: probed.amcCheckStatus, statusText: text };
}

/** The checked receipt's stored document (its a4_deployments row), the base of the verify row's own receipt_json. */
function receiptRowOf(store: A4Store, projectId: string, deploymentId: string): Record<string, unknown> {
  const row = store.snapshot(projectId).rows.a4_deployments.find((candidate) => candidate.deployment_id === deploymentId);
  if (row === undefined) throw fail(409, "A4_INTEGRITY_FAILED", `the receipt ${deploymentId} has no stored row`);
  return JSON.parse(String(row.receipt_json)) as Record<string, unknown>;
}
