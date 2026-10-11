/**
 * Activate's deployment plans and receipts (P1-62 slice B; design §10.4 Record deployment, §14.3). AMC prepares the
 * Compose or Helm files and commands inside the package (`deploy/`, the plan signed `a4-deployment-plan`) and never
 * runs them; both targets are recordable in v1, with the image pinned by tag (IMAGE_TAG_ONLY) and, for Helm, the
 * topology undecided (TOPOLOGY_UNDECIDED), both WAITING. v1 is a same-host restart with a pinned image (D-18): a receipt
 * is recordable only from the Compose or Helm-hosted Studio that built the agent (DEPLOYMENT_NOT_SAME_HOST otherwise,
 * P2-40). A receipt is the operator's statement in two columns: `recorded_status` (self_reported) and
 * `amc_check_status` (`not_evaluated` here; AMC's own probe is src/a4/a4DeployVerify.ts). It lists what changed —
 * image digest, overlay digest, restart time — and nothing more; no lease is issued and no runtime run is created.
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { z } from "zod";
import { assertOwnerMode } from "../mode/mode.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { amcVersion } from "../version.js";
import { assertAllowed, evaluateFor, governed, livePrincipal, loadA4State, type A4Call } from "./a4Gates.js";
import { recordEnvelope, writeReleaseRecord } from "./a4Package.js";
import type { A4ReadinessState } from "./a4Readiness.js";
import { a4DeploymentReceiptV1Schema, type A4ChainLink, type A4Stage } from "./a4Schema.js";
import { A4StoreError, type A4ChangeSpec, type A4Store, type A4TransitionResult } from "./a4Store.js";
import { currentRelease, cycleLinks, DESTINATION_REF, IDENTITY_NOT_EVALUATED, productionLeaseOf, rolledBack } from "./spec/activate.js";

const fail = (status: number, code: string, message: string, detail?: unknown): A4StoreError => new A4StoreError(status, code, message, detail);
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
/** The workspace inside the container: the base Compose file's AMC_WORKSPACE_DIR and the chart's workspace.mountPath. */
const WORKSPACE_IN_CONTAINER = "/data/amc";
const IMAGE_TAG = amcVersion.replace(/[^A-Za-z0-9_.-]/g, "-");
const NAMESPACE = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
/** Operator-stated times may run ahead of the server clock by at most this much (the incident-clock skew bound). */
const SKEW_MS = 5 * 60_000;
export const PLAN_PATH = "deploy/plan.json";
export const CLAIM_BOUNDARY = "Prepared by AMC; AMC never runs these commands. Instructions are not evidence of an executed deployment: "
  + "a receipt records what the operator stated, and AMC's check what its own probe found.";

/**
 * Where this Studio runs (v1 deploys by restarting it, D-18): Kubernetes sets KUBERNETES_SERVICE_HOST in every pod (helm);
 * Docker and Podman leave a marker file (compose). ponytail: container markers only; a plain `docker run` reads as compose.
 */
export function hostingNow(): { kind: "compose" | "helm" | null; signal: string | null } {
  if ((process.env.KUBERNETES_SERVICE_HOST ?? "").length > 0) return { kind: "helm", signal: "KUBERNETES_SERVICE_HOST" };
  const marker = ["/.dockerenv", "/run/.containerenv"].find((path) => existsSync(path));
  return marker === undefined ? { kind: null, signal: null } : { kind: "compose", signal: marker };
}

export interface DeployPlanInput {
  readonly releaseId: string;
  readonly projectId: string;
  readonly agentId: string;
  readonly target: "compose" | "helm";
  readonly destinationRef: string;
  /** Used only as the Kubernetes namespace, and only when it is a valid DNS label (it is pasted into commands). */
  readonly hostHint: string | null;
  /** The release a rollback re-applies (its overlay), or null. */
  readonly previousReleaseId: string | null;
}
type Step = { readonly phase: "preflight" | "deploy" | "verify" | "rollback"; readonly command: string | null; readonly note: string };

const overlayName = (target: "compose" | "helm", releaseId: string): string =>
  target === "compose" ? `docker-compose.a4-${releaseId}.yml` : `values.a4-${releaseId}.yaml`;
const inContainer = (input: DeployPlanInput, releaseId: string): string =>
  `${WORKSPACE_IN_CONTAINER}/a4-releases/${input.projectId}/${releaseId}/deploy/${overlayName(input.target, releaseId)}`;
const header = (input: DeployPlanInput): string[] => [
  `# AMC A4 release ${input.releaseId} (project ${input.projectId}, agent ${input.agentId}). Prepared by AMC; AMC never runs it.`,
  "# v1 is a same-host restart with a pinned image (D-18): this overlay restarts the hosted Studio that built the agent.",
  "# IMAGE_TAG_ONLY: the image is pinned by tag until D-03 and P0-14 provide a digest."
];

function composeOverlay(input: DeployPlanInput): string {
  return [...header(input),
    "services:", "  studio:", `    image: amc-studio:${IMAGE_TAG}`, "    environment:", "      - AMC_A4_PREVIEW=1",
    // The signed-journal checkpoints need a writable root outside the workspace (/data/amc); /workspace exists in the image
    // owned by uid 10001, so a new named volume mounted there is writable.
    "      - AMC_CONTROL_CHECKPOINT_DIR=/workspace/control-checkpoints", "    volumes:", "      - amc_control_checkpoints:/workspace",
    "    secrets:", "      - amc_a4_lease",
    "secrets:", "  amc_a4_lease:", "    # Operator-supplied: the lease token shown once by AMC. Nothing in this Studio reads it; it is for the agent's gateway client.",
    `    file: ./secrets/amc_a4_lease_${input.releaseId}.txt`,
    "volumes:", "  amc_control_checkpoints:", ""].join("\n");
}

function helmOverlay(input: DeployPlanInput): string {
  return [...header(input),
    "# TOPOLOGY_UNDECIDED until D-03. The chart has no image.digest field yet (P0-14) and mounts one volume, the workspace,",
    "# so AMC_CONTROL_CHECKPOINT_DIR is not set here. Secrets are named only; the chart's change-me-* defaults are never copied.",
    "# A4_PREVIEW_NOT_SET_BY_CHART: the chart renders a fixed env list, so no values key sets AMC_A4_PREVIEW=1; see deploy/plan.json.",
    "image:", "  repository: amc-studio", `  tag: "${IMAGE_TAG}"`, ""].join("\n");
}

function composeSteps(input: DeployPlanInput): Step[] {
  const name = overlayName("compose", input.releaseId);
  const copy = (releaseId: string): string =>
    `docker compose -f docker-compose.yml cp studio:${inContainer(input, releaseId)} ./${overlayName("compose", releaseId)}`;
  const previous = input.previousReleaseId;
  return [
    { phase: "preflight", command: "cd deploy/compose", note: "Run from the AMC checkout on the host that runs this Studio (a same-host restart)." },
    { phase: "preflight", command: copy(input.releaseId), note: "Copy the prepared overlay out of the data volume." },
    { phase: "preflight", command: null, note: `Write the lease token (shown once by AMC) to deploy/compose/secrets/amc_a4_lease_${input.releaseId}.txt, mode 0600. AMC never stores it; never commit it.` },
    { phase: "preflight", command: "docker compose -f docker-compose.yml exec studio amc doctor --strict --json", note: "Pre-flight on the running Studio." },
    { phase: "deploy", command: `docker compose -f docker-compose.yml -f ${name} up -d`, note: "Restarts the hosted Studio; never down -v." },
    { phase: "verify", command: `curl -fsS https://${input.destinationRef}/readyz`, note: "Reachability only; release identity is not evaluated at the destination (P2-40)." },
    { phase: "verify", command: `docker compose -f docker-compose.yml -f ${name} exec studio amc verify all --json`, note: "Integrity of the workspace records." },
    { phase: "verify", command: `sha256sum ${name}`, note: "The overlayDigest for the receipt." },
    ...(previous === null
      ? [{ phase: "rollback" as const, command: "docker compose -f docker-compose.yml up -d", note: "No earlier release: back to the base file; never down -v." }]
      : [{ phase: "rollback" as const, command: copy(previous), note: `The overlay of the previous release ${previous}.` },
        { phase: "rollback" as const, command: `docker compose -f docker-compose.yml -f ${overlayName("compose", previous)} up -d`, note: "Re-pin the previous release; never down -v." }])
  ];
}

function helmSteps(input: DeployPlanInput): Step[] {
  const name = overlayName("helm", input.releaseId);
  const ns = input.hostHint !== null && NAMESPACE.test(input.hostHint) ? ` -n ${input.hostHint}` : "";
  const exec = `kubectl${ns} exec deploy/amc-amc -c amc-studio --`;
  return [
    { phase: "preflight", command: `${exec} cat ${inContainer(input, input.releaseId)} > ${name}`, note: "Copy the prepared values overlay out of the workspace volume (Helm release amc)." },
    { phase: "preflight", command: `kubectl${ns} create secret generic amc-a4-lease-${input.releaseId.slice(4, 16)} --from-file=token=./amc_a4_lease_${input.releaseId}.txt`,
      note: "Write the lease token (shown once by AMC) to that file first, mode 0600, and delete it afterwards. The chart does not mount this secret yet; it is for the agent's gateway client." },
    { phase: "preflight", command: `${exec} amc doctor --strict --json`, note: "Pre-flight on the running Studio." },
    { phase: "deploy", command: `helm${ns} upgrade --install amc deploy/helm/amc -f ${name} --atomic --wait`, note: "Restarts the hosted Studio." },
    { phase: "deploy", command: `kubectl${ns} set env deploy/amc-amc -c amc-studio AMC_A4_PREVIEW=1`,
      note: "A4_PREVIEW_NOT_SET_BY_CHART: the chart cannot set the A4 preview flag, so set it on the Studio container after each upgrade (this restarts it once more); without it A4 answers 404 and the receipt cannot be recorded." },
    { phase: "verify", command: `helm${ns} history amc`, note: "The revision this upgrade made is the receipt's helmRevision." },
    { phase: "verify", command: `curl -fsS https://${input.destinationRef}/readyz`, note: "Reachability only; release identity is not evaluated at the destination (P2-40)." },
    { phase: "verify", command: `${exec} amc verify all --json`, note: "Integrity of the workspace records." },
    { phase: "verify", command: `sha256sum ${name}`, note: "The overlayDigest for the receipt." },
    { phase: "verify", command: "helm package deploy/helm/amc", note: "The chart digest (sha256 of the .tgz) for your records; the v1 receipt does not carry it." },
    { phase: "rollback", command: `helm${ns} history amc`, note: "Find the revision before this release's upgrade." },
    { phase: "rollback", command: `helm${ns} rollback amc <previous revision> --wait`, note: "Re-pins the previous release." }
  ];
}

/**
 * The prepared deployment for one release (design §14.3): the overlay and `deploy/plan.json` (steps, the receipt form, the
 * gaps), both packaged; the caller signs the plan `a4-deployment-plan`. Inputs pasted into commands are validated: the
 * destination is a host[:port] answer, the namespace a DNS label, the ids AMC's own.
 */
export function deploymentPlan(input: DeployPlanInput): { files: Array<{ path: string; bytes: Buffer; kind: string }>; overlayPath: string; overlaySha256: string;
  rollbackCommands: string[] } {
  if (!DESTINATION_REF.test(input.destinationRef)) throw Object.assign(new Error(`DESTINATION_INVALID: ${input.destinationRef.slice(0, 80)}`), { code: "DESTINATION_INVALID" });
  const overlayPath = `deploy/${overlayName(input.target, input.releaseId)}`;
  const overlay = Buffer.from(input.target === "compose" ? composeOverlay(input) : helmOverlay(input), "utf8");
  const steps = input.target === "compose" ? composeSteps(input) : helmSteps(input);
  const helm = input.target === "helm";
  const plan = {
    schema: "amc.a4-deployment-plan/v1", releaseId: input.releaseId, projectId: input.projectId, agentId: input.agentId, target: input.target, sameHost: true,
    destinationRef: input.destinationRef, overlay: { path: overlayPath, sha256: sha256Hex(overlay) },
    image: { pin: "tag", reference: `amc-studio:${IMAGE_TAG}`, digest: null, reasonCode: "IMAGE_TAG_ONLY", key: "P0-14" },
    topology: helm ? { reasonCode: "TOPOLOGY_UNDECIDED", key: "D-03" } : null,
    steps,
    receiptForm: { method: "POST", route: `/api/v1/a4/projects/${input.projectId}/releases/${input.releaseId}/deployments`, body: {
      kind: "deploy", environment: "staging", target: input.target, packageDigest: "<packageDigest from the release response>", imageDigest: null,
      overlayDigest: "<sha256sum of the overlay you applied>", restartedAt: "<ISO 8601 time the Studio restarted>", helmRevision: helm ? "<revision from helm history>" : null,
      leaseIds: ["<the lease id from the release response>"], destinationRef: input.destinationRef, operatorStated: { status: "succeeded | failed | partial" },
      expectedHeadSeq: "<the project's head seq>", clientRequestId: "<8 to 128 letters, digits, _ or ->" } },
    gaps: [
      { reasonCode: "IMAGE_TAG_ONLY", note: "No image digest exists until D-03 and P0-14; the image is pinned by tag. WAITING, never BLOCKED." },
      { reasonCode: "RELEASE_IDENTITY_NOT_EVALUATED", note: `AMC's check establishes reachability only: ${IDENTITY_NOT_EVALUATED}.` },
      ...(helm ? [
        { reasonCode: "TOPOLOGY_UNDECIDED", note: "D-03 is open; a Helm receipt is recordable. WAITING, never BLOCKED." },
        { reasonCode: "CHECKPOINT_DIR_NOT_SET", note: "The chart mounts one volume (the workspace), so the signed-journal checkpoint root stays in the home directory." },
        { reasonCode: "A4_PREVIEW_NOT_SET_BY_CHART", note: "The chart renders a fixed env list, so the values overlay cannot set AMC_A4_PREVIEW=1; set it on the Studio container out of band (the deploy step names one way). A chart values key is a later item." },
        { reasonCode: "EGRESS_CIDRS_NOT_SET", note: "networkPolicy.allowedEgressCidrs stays the chart's: no Adapt answer carries CIDRs." }] : [])
    ],
    claimBoundary: CLAIM_BOUNDARY
  };
  return { files: [{ path: overlayPath, bytes: overlay, kind: "deploy-overlay" }, { path: PLAN_PATH, bytes: json(plan), kind: "deploy-plan" }], overlayPath,
    overlaySha256: sha256Hex(overlay), rollbackCommands: steps.filter((step) => step.phase === "rollback" && step.command !== null).map((step) => step.command!) };
}

const sha = z.string().regex(/^[0-9a-f]{64}$/);
/** POST …/releases/:rid/deployments. No notes: the receipt lists what changed and nothing more (free text stays out of the ledger). */
export const deploymentBodySchema = z.strictObject({
  kind: z.enum(["deploy", "rollback"]), environment: z.enum(["staging", "production"]), target: z.enum(["compose", "helm"]),
  packageDigest: sha.nullable(), imageDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/).nullable(), overlayDigest: sha,
  restartedAt: z.iso.datetime(), helmRevision: z.number().int().min(1).max(1_000_000_000).nullable(),
  leaseIds: z.array(z.string().regex(/^lease_[0-9a-f]{32}$/)).max(4), destinationRef: z.string().regex(DESTINATION_REF),
  operatorStated: z.strictObject({ status: z.enum(["succeeded", "failed", "partial"]) }),
  expectedHeadSeq: z.number().int().min(0), clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/)
});
export type DeploymentBody = z.infer<typeof deploymentBodySchema>;

const headStage = (state: A4ReadinessState): A4Stage => state.project.stage === "retired" ? "activate" : state.project.stage;
const releaseLink = (chain: readonly A4ChainLink[], releaseId: string | null): A4ChainLink | undefined =>
  releaseId === null ? undefined : chain.find((link) => link.kind === "RELEASE" && link.body.releaseId === releaseId);
/** Every lease id the release's effects minted: the staging lease (RELEASE) and the production lease (the deployment approval). */
export function mintedLeases(chain: readonly A4ChainLink[], releaseId: string): { staging: string[]; production: string | null } {
  const release = releaseLink(chain, releaseId);
  const staging = (Array.isArray(release?.body.leases) ? release.body.leases as Array<{ leaseId?: unknown; scope?: unknown }> : [])
    .filter((lease) => lease.scope === "staging" && typeof lease.leaseId === "string").map((lease) => String(lease.leaseId));
  const production = productionLeaseOf(chain, releaseId)?.leaseId;
  return { staging, production: typeof production === "string" ? production : null };
}

/**
 * The checks a receipt passes on one set of rows (before anything is written, and again on the rows the transaction
 * read): the release and its target, the same-host rule, operator times inside the skew bound, the package digest and
 * the lease ids its effects minted (a rollback row: the release it rolled back to). Returns where `deployed_release_id`
 * moves, if anywhere.
 */
function deploymentChecks(state: A4ReadinessState, releaseId: string, body: DeploymentBody, now: number): { deployed: string | null | undefined } {
  const release = releaseLink(state.chain, releaseId);
  if (release === undefined) throw fail(404, "A4_RELEASE_NOT_FOUND", `no release ${releaseId} on this project`);
  if (body.target !== release.body.target) throw fail(409, "TARGET_MISMATCH", `release ${releaseId} was prepared for ${String(release.body.target)}`);
  if ((body.target === "helm") !== (body.helmRevision !== null)) throw fail(400, "INPUT_INVALID", "helmRevision: the helm history revision for a Helm target, null for Compose.");
  const hosting = hostingNow();
  if (hosting.kind !== body.target) {
    throw fail(409, "DEPLOYMENT_NOT_SAME_HOST", "v1 records a deployment only from the Compose or Helm-hosted Studio that built the agent (D-18); "
      + "installing a package into another workspace is P2-40.", { reasonCodes: ["DEPLOYMENT_NOT_SAME_HOST", "KEY:P2-40", `HOSTED:${hosting.kind ?? "none"}`] });
  }
  const restarted = Date.parse(body.restartedAt);
  if (restarted > now + SKEW_MS || restarted < Number(release.body.ts) - SKEW_MS) {
    throw fail(400, "OPERATOR_TIME_REFUSED", "restartedAt lies outside the release's lifetime (the server clock records when this was recorded).");
  }
  const succeeded = body.operatorStated.status === "succeeded";
  if (body.kind === "deploy") {
    if (currentRelease(state.chain)?.body.releaseId !== releaseId) throw fail(409, "RELEASE_NOT_CURRENT", "Deploy this cycle's release; re-deploying an earlier one is a rollback.");
    if (rolledBack(state.chain, releaseId)) throw fail(409, "RELEASE_ROLLED_BACK", "This release was rolled back; reopen or tune Activate and release again.");
    if (body.packageDigest !== release.body.packageDigest) throw fail(409, "PACKAGE_DIGEST_MISMATCH", "packageDigest is not this release's package digest.");
    const minted = mintedLeases(state.chain, releaseId);
    const required = body.environment === "staging" ? minted.staging.at(-1) ?? null : minted.production;
    if (required === null) throw fail(409, "PRODUCTION_LEASE_NOT_MINTED", "A production deployment uses the production lease the deployment approval mints.");
    if (!body.leaseIds.includes(required) || body.leaseIds.some((id) => id !== minted.production && !minted.staging.includes(id))) {
      throw fail(409, "LEASE_NOT_OF_RELEASE", `leaseIds must name this release's ${body.environment} lease and only leases its effects minted.`);
    }
    return { deployed: succeeded && body.environment === "production" ? releaseId : undefined };
  }
  const rollback = cycleLinks(state.chain, "ROLLBACK").filter((link) => link.body.releaseId === releaseId).at(-1);
  if (rollback === undefined) throw fail(409, "ROLLBACK_NOT_RECORDED", "Roll back through POST …/rollback first; this row records what the operator then ran.");
  const toReleaseId = typeof rollback.body.toReleaseId === "string" ? rollback.body.toReleaseId : null;
  const to = releaseLink(state.chain, toReleaseId);
  if (body.packageDigest !== (to?.body.packageDigest ?? null)) throw fail(409, "PACKAGE_DIGEST_MISMATCH", "packageDigest is not the package of the release rolled back to (null when none).");
  const minted = toReleaseId === null ? null : mintedLeases(state.chain, toReleaseId);
  if (body.leaseIds.some((id) => minted === null || (id !== minted.production && !minted.staging.includes(id)))) {
    throw fail(409, "LEASE_NOT_OF_RELEASE", "leaseIds of a rollback row name only leases the release rolled back to minted.");
  }
  return { deployed: succeeded ? toReleaseId : undefined };
}

/** The operator's status and AMC's check, composed and never merged (C-35). */
export function statusText(recorded: string, check: string, reasonCodes: readonly string[] = []): string {
  const amc = check === "reachable" ? `reachable, release identity not evaluated at the destination (P2-40)`
    : check === "failed" ? `failed (${reasonCodes[0] ?? "AMC_CHECK_FAILED"})` : check === "passed" ? "passed" : "not evaluated";
  return `recorded: ${recorded}; AMC check: ${amc}`;
}

/**
 * POST …/releases/:rid/deployments (owner; design §10.4 Record deployment): the signed `a4-deployment-receipt` file and
 * its A4_RECORD envelope are written before the transaction (a refused write leaves a file nothing names), then
 * DEPLOYMENT on rows re-checked inside it, pinned to `expectedHeadSeq`, with the a4_deployments row and the receipt as
 * an implementation-lane ref (self_reported). A succeeded production deploy moves `deployed_release_id` to the release;
 * a succeeded rollback row to the release rolled back to.
 */
export function recordDeployment(store: A4Store, projectId: string, releaseId: string, input: A4Call & { body: DeploymentBody }):
  { result: A4TransitionResult; deploymentId: string; receiptPath: string; statusText: string } {
  const { body } = input;
  const principal = livePrincipal(store, input);
  assertOwnerMode(store.workspace, "a4 deployment record");
  const now = Date.now();
  const before = loadA4State(store, projectId, now);
  assertAllowed(evaluateFor(store, before, principal, input, headStage(before), now).readiness, "recordDeployment");
  if (before.project.head_seq !== body.expectedHeadSeq) throw fail(409, "A4_STALE_HEAD", "The project moved; reload and retry.", { headSeq: before.project.head_seq });
  deploymentChecks(before, releaseId, body, now);
  const deploymentId = `a4dep_${randomBytes(16).toString("hex")}`;
  const doc = a4DeploymentReceiptV1Schema.parse({ schema: "amc.a4-deployment-receipt/v1", deploymentId, releaseId, projectId, kind: body.kind,
    environment: body.environment, target: body.target, receipt: { imageDigest: body.imageDigest, overlayDigest: body.overlayDigest, restartedAt: body.restartedAt,
      helmRevision: body.helmRevision, destinationRef: body.destinationRef, note: null },
    receiptSha256: sha256Hex(canonicalize({ imageDigest: body.imageDigest, overlayDigest: body.overlayDigest, restartedAt: body.restartedAt,
      helmRevision: body.helmRevision, destinationRef: body.destinationRef, note: null })),
    recordedStatus: body.operatorStated.status, amcCheckStatus: "not_evaluated", amcCheck: null, recordedByKey: principal.key, claimKind: "self_reported", ts: now });
  const file = writeReleaseRecord(store.workspace, projectId, "receipts", releaseId, deploymentId, doc, "a4-deployment-receipt");
  const receiptJson = canonicalize(doc);
  const envelope = recordEnvelope(store.workspace, sha256Hex(receiptJson));
  const text = statusText(body.operatorStated.status, "not_evaluated");
  const result = governed(store, projectId, principal, { expectedHeadSeq: body.expectedHeadSeq, request: input.request,
    response: { deploymentId, receiptPath: file.path, statusText: text } }, (ts, load) => {
    const state = load(now);
    const { readiness } = evaluateFor(store, state, principal, input, headStage(state), now);
    assertAllowed(readiness, "recordDeployment");
    const { deployed } = deploymentChecks(state, releaseId, body, now);
    const label = `${body.kind} receipt ${deploymentId} (${body.environment}, ${body.target}): ${text} (self_reported)`;
    const spec: A4ChangeSpec = { kind: "DEPLOYMENT", stage: state.project.stage, payload: { deploymentId, releaseId, deploymentKind: body.kind, environment: body.environment,
      target: body.target, recordedStatus: body.operatorStated.status, receiptPath: file.path, receiptFileSha256: file.sha256, receiptSha256: doc.receiptSha256,
      leaseIds: [...body.leaseIds], destinationRef: body.destinationRef, claimKind: "self_reported" },
    sideRows: [
      { table: "a4_deployments", values: { deployment_id: deploymentId, release_id: releaseId, project_id: projectId, kind: body.kind, environment: body.environment,
        target: body.target, receipt_json: receiptJson, receipt_sha256: doc.receiptSha256, recorded_status: body.operatorStated.status, amc_check_status: "not_evaluated",
        amc_check_json: null, recorded_by_key: principal.key, envelope_json: JSON.stringify(envelope), ts } },
      { table: "a4_evidence_refs", values: { project_id: projectId, seq: state.project.head_seq + 1, revision_no: state.project.revision_no, stage: state.project.stage,
        lane: "implementation", ref_kind: "deployment_receipt", ref_id: file.path, sha256: file.sha256, claim_kind: "self_reported", trust_tier: null, method: null,
        label, actor_key: principal.key, ts } }],
    ...(deployed === undefined ? {} : { head: { deployed_release_id: deployed } }) };
    return { readiness, specs: spec };
  });
  return { result, deploymentId, receiptPath: file.path, statusText: text };
}

/**
 * The release's receipts in two columns: each deploy or rollback row with `recordedStatus` as the operator stated it and
 * `amcCheckStatus` from the newest AMC check of that row (`not_evaluated` without one), and the status text composed from
 * both. Read from the chain-named a4_deployments rows.
 */
export function deploymentViews(rows: readonly Record<string, unknown>[], releaseId: string): Array<Record<string, unknown>> {
  const mine = rows.filter((row) => row.release_id === releaseId);
  const checks = mine.filter((row) => row.kind === "verify").map((row) => ({ row, check: JSON.parse(String(row.amc_check_json ?? "null")) as Record<string, unknown> | null }));
  return mine.filter((row) => row.kind === "deploy" || row.kind === "rollback").map((row) => {
    const receipt = JSON.parse(String(row.receipt_json)) as Record<string, unknown>;
    const newest = checks.filter((entry) => entry.check?.receiptId === row.deployment_id).at(-1);
    const amc = newest === undefined ? "not_evaluated" : String(newest.row.amc_check_status);
    const reasons = Array.isArray(newest?.check?.reasonCodes) ? newest.check.reasonCodes as string[] : [];
    return { deploymentId: row.deployment_id, kind: row.kind, environment: row.environment, target: row.target, recordedStatus: row.recorded_status,
      amcCheckStatus: amc, statusText: statusText(String(row.recorded_status), amc, reasons), receipt: receipt.receipt, recordedByKey: row.recorded_by_key,
      check: newest === undefined ? null : { checkId: newest.row.deployment_id, reasonCodes: reasons, resolvedAddress: newest.check?.resolvedAddress ?? null,
        responseSha256: newest.check?.responseSha256 ?? null, checks: newest.check?.checks ?? [] }, claimKind: "self_reported", ts: row.ts };
  });
}
