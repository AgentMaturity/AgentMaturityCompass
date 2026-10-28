/**
 * A4 as a consumer of P2-23's governed lifecycle and P2-26's regulatory runtime (P2-34; design §6.6, §14.2, §14.4). The
 * three lifecycle axes stay apart: A4 stages, `lifecycle.ts` deployment stages and P2-23 governance states. A4 reads
 * P2-23 and P2-26 and calls their public functions; it never changes their engines or writes their rows itself.
 *
 * - A deployed project consumes the runtime's change records once each, as `amc-runtime` (`syncRuntimeLifecycle`): a
 *   change P2-23 recorded as passed (inside a change envelope, or no mandatory control invalidated) is a `TUNE` from the
 *   deployed release without reopening Adapt; one it left open (a mandatory invalidated control, or a change outside
 *   the envelope, which P2-23 suspends) is a `REOPEN` to Adapt and then that `TUNE`. For an agent P2-23 does not
 *   govern, P2-26's envelope audit rows say the same (`CHANGE_ENVELOPE_APPLIED` covered, `AGENT_REASSESSMENT_REQUIRED`
 *   not). A scheduled review is a `TUNE` only.
 * - A kill switch holds through the freeze path (activeFreezeStatus carries it); `holdIncidentIds` names each kill's
 *   incident beside its id. Break-glass is never read here: it lifts no A4 hold.
 * - The package embeds P2-23's `AgentVersionManifest` with the digest P2-23's signed row carries (`packageVersionManifest`).
 * - The deployment approval's effect records P2-23's activation (approved → active) naming the gate's binding digest:
 *   one human decision, two records (`recordLifecycleActivation`). A4's RETIRE of a deployed project retires the agent
 *   through P2-23 first (`retireGovernedAgent`).
 */
import { killSwitchStatus, type KillSwitchRecord } from "../runtime/killSwitch.js";
import {
  LIFECYCLE_AUDIT, LifecycleError, lifecycleEvents, lifecycleView, transitionAgent, type LifecycleActor, type LifecycleView
} from "../lifecycle/governanceLifecycle.js";
import { retireAgent } from "../lifecycle/retirement.js";
import { agentVersionManifestSchema, manifestDigest, type AgentVersionManifest } from "../lifecycle/versionManifest.js";
import { openLedger } from "../ledger/ledger.js";
import { flatSlots, type A4Principal } from "./a4Schema.js";
import { A4StoreError, type A4Actor, type A4ChangeSpec, type A4Store, type A4TransitionResult } from "./a4Store.js";

/** Writes the server makes on its own behalf (automatic hold, runtime changes, effect outcomes); never a person. */
export const A4_RUNTIME: A4Actor = { key: "amc-runtime", username: "amc-runtime" };
const fail = (status: number, code: string, message: string): A4StoreError => new A4StoreError(status, code, message);

/** P2-26's envelope audit rows (src/runtime/changeEnvelope.ts), read for an agent P2-23 does not govern. */
const ENVELOPE_APPLIED = "CHANGE_ENVELOPE_APPLIED";
const ENVELOPE_REQUIRED = "AGENT_REASSESSMENT_REQUIRED";
/** Links after which an earlier runtime change no longer concerns the deployed release. */
const SETTLING_KINDS = new Set(["TUNE", "REOPEN", "RELEASE", "DEPLOYMENT", "ROLLBACK"]);

/** The Assemble-bound slots: a TUNE whose head revision differs from the deployed one in any of them reopens Assemble. */
const ASSEMBLE_SLOTS = /^(enforce|composition|graph)\./;

/**
 * The stage a TUNE sends the project back to (design §6.6): Assemble when the owner flags a capability change, the
 * deployed release is not among `releases`, or any Assemble-bound slot of the head revision differs from the release's
 * revision; else Adapt. A release missing from the read widens the reopen to Assemble, never narrows it.
 */
export function tuneStage(revisions: ReadonlyArray<Record<string, unknown>>, releases: ReadonlyArray<Record<string, unknown>>,
  releaseId: string, headRevisionNo: number, capabilityChange: boolean): "assemble" | "adapt" {
  const release = releases.find((row) => row.release_id === releaseId);
  const slotsOf = (revisionNo: unknown) => flatSlots(JSON.parse(String(revisions.find((row) => row.revision_no === revisionNo)?.resource_digests_json ?? "{}")));
  const deployed = slotsOf(release?.revision_no), head = slotsOf(headRevisionNo);
  return capabilityChange || release === undefined || Object.keys({ ...deployed, ...head }).some((slot) => ASSEMBLE_SLOTS.test(slot) && deployed[slot] !== head[slot])
    ? "assemble" : "adapt";
}

interface RuntimeChange {
  readonly ref: string;
  readonly ts: number;
  readonly source: "reassessment" | "envelope";
  readonly trigger: string;
  /** Recorded as passed (TUNE only); otherwise Adapt is reopened too. */
  readonly covered: boolean;
  readonly envelopeId: string | null;
}

const lifecycleUnreadable = (agentId: string, error: unknown): A4StoreError =>
  fail(409, "LIFECYCLE_STATE_UNREADABLE", `the P2-23 lifecycle state of agent ${agentId} could not be read (${error instanceof Error ? error.message : String(error)})`);

function viewOf(workspace: string, agentId: string): LifecycleView {
  try {
    return lifecycleView(workspace, agentId);
  } catch (error) {
    throw lifecycleUnreadable(agentId, error);
  }
}

/**
 * The runtime changes recorded for the agent after `sinceTs`, oldest first. A reassessment counts as created: its first
 * row decides (an owner's later resume closes it as passed, which never makes the change covered after the fact).
 */
function runtimeChanges(store: A4Store, agentId: string, sinceTs: number): RuntimeChange[] {
  const db = store.ledger.db;
  if (!viewOf(store.workspace, agentId).implicit) {
    const first = new Map<string, RuntimeChange>();
    for (const row of lifecycleEvents(db, LIFECYCLE_AUDIT.reassessment, agentId)) {
      const meta = row.meta as { reassessmentId?: unknown; trigger?: unknown; status?: unknown; envelopeId?: unknown };
      if (typeof meta.reassessmentId !== "string" || first.has(meta.reassessmentId)) continue;
      if (meta.trigger !== "invalidated_by" && meta.trigger !== "scheduled") continue;
      first.set(meta.reassessmentId, { ref: `reassessment:${meta.reassessmentId}`, ts: row.ts, source: "reassessment", trigger: meta.trigger,
        covered: meta.status === "passed" || meta.trigger === "scheduled", envelopeId: typeof meta.envelopeId === "string" ? meta.envelopeId : null });
    }
    return [...first.values()].filter((change) => change.ts > sinceTs);
  }
  const rows = db.prepare(`SELECT id, ts, meta_json FROM evidence_events WHERE event_type = 'audit' AND json_valid(meta_json)
    AND json_extract(meta_json, '$.auditType') IN (?, ?) AND json_extract(meta_json, '$.agentId') = ? AND ts > ? ORDER BY rowid`)
    .all(ENVELOPE_APPLIED, ENVELOPE_REQUIRED, agentId, sinceTs) as Array<{ id: string; ts: number; meta_json: string }>;
  return rows.map((row) => {
    const meta = JSON.parse(row.meta_json) as { auditType: string; envelopeId?: unknown };
    return { ref: `ledger:${row.id}`, ts: row.ts, source: "envelope" as const, trigger: meta.auditType, covered: meta.auditType === ENVELOPE_APPLIED,
      envelopeId: typeof meta.envelopeId === "string" ? meta.envelopeId : null };
  });
}

/**
 * Consumes the runtime changes recorded since the deployed release last settled, as one `amc-runtime` transition: a
 * `TUNE` from the deployed release, preceded by a `REOPEN` to Adapt when any change was not covered. Only a deployed
 * project at Activate, not held and not retired, is moved; anywhere else the changes wait (a project mid-tune is already
 * being reworked). Returns null when nothing was written. A lifecycle state that cannot be read refuses (409).
 */
export function syncRuntimeLifecycle(store: A4Store, projectId: string): A4TransitionResult | null {
  const head = store.readHead(projectId);
  if (head === null || head.stage !== "activate" || head.hold === 1 || head.deployed_release_id === null) return null;
  const snapshot = store.snapshot(projectId);
  const since = Math.max(0, ...snapshot.links.filter((link) => SETTLING_KINDS.has(link.kind)).map((link) => Number(link.body.ts) || 0));
  const changes = runtimeChanges(store, head.agent_id, since);
  if (changes.length === 0) return null;
  const releaseId = head.deployed_release_id;
  const reopen = changes.some((change) => !change.covered);
  const runtime = { refs: changes.map((change) => change.ref), triggers: [...new Set(changes.map((change) => change.trigger))],
    envelopeIds: [...new Set(changes.flatMap((change) => change.envelopeId === null ? [] : [change.envelopeId]))] };
  const reason = `runtime ${reopen ? "change not covered" : "change covered"}: ${runtime.triggers.join(", ")}`;
  try {
    return store.transition(projectId, A4_RUNTIME, ({ head: now }) => {
      if (now?.head_seq !== head.head_seq) throw fail(409, "A4_STALE_HEAD", "the project moved; the runtime changes wait for the next write");
      const reopenSpec: A4ChangeSpec[] = reopen ? [{ kind: "REOPEN", payload: { toStage: "adapt", reason, automatic: true, runtime },
        head: { stage: "adapt", step: snapshot.rows.a4_revisions.some((row) => row.stage === "adapt") ? "proposed" : "asked" } }] : [];
      const stage = tuneStage(snapshot.rows.a4_revisions, snapshot.rows.a4_releases, releaseId, head.revision_no, false);
      return [...reopenSpec, { kind: "TUNE", payload: { baseReleaseId: releaseId, capabilityChange: false, mechanicPlanId: null, reason, automatic: true, runtime },
        head: { stage, step: "asked", base_release_id: releaseId } }];
    }, { expectedHeadSeq: head.head_seq });
  } catch (error) {
    if (error instanceof A4StoreError && error.code === "A4_STALE_HEAD") return null;
    throw error;
  }
}

/**
 * The incident ids an automatic hold names: each `kill-switch:<killId>` from activeFreezeStatus is followed by the kill's
 * own incident id. A kill status that cannot be read leaves the kill ids as they are (the hold stands either way).
 */
export function holdIncidentIds(workspace: string, ids: readonly string[]): string[] {
  if (!ids.some((id) => id.startsWith("kill-switch:"))) return [...ids];
  let kills: KillSwitchRecord[] = [];
  try {
    kills = killSwitchStatus(workspace).kills;
  } catch {
    // The freeze already holds the project; the incident is named once the status reads.
  }
  return [...new Set(ids.flatMap((id) => {
    const incidentId = kills.find((kill) => `kill-switch:${kill.killId}` === id)?.incidentId;
    return incidentId ? [id, incidentId] : [id];
  }))];
}

export interface PackageVersionManifest {
  readonly manifest: AgentVersionManifest | null;
  readonly manifestDigest: string | null;
  /** The approval-bound manifest, else the one AMC observed at the agent's last session open, else why there is none. */
  readonly source: "lifecycle_bound" | "lifecycle_observed" | "not_governed" | "not_observed";
}

/**
 * The `versionManifest` a package embeds (design §14.2): P2-23's manifest for the agent, with `manifestDigest` computed by
 * P2-23's own function and checked against the digest P2-23's newest signed row for it carries, so the digest derives
 * the same from either side. A mismatch or an unreadable state refuses the release.
 */
export function packageVersionManifest(workspace: string, agentId: string): PackageVersionManifest {
  const view = viewOf(workspace, agentId);
  if (view.implicit) return { manifest: null, manifestDigest: null, source: "not_governed" };
  const source = view.boundManifest !== null ? "lifecycle_bound" : view.observedManifest !== null ? "lifecycle_observed" : "not_observed";
  const manifest = view.boundManifest ?? view.observedManifest;
  if (manifest === null) return { manifest: null, manifestDigest: null, source };
  const digest = manifestDigest(agentVersionManifestSchema.parse(manifest));
  const ledger = openLedger(workspace, { readonly: true });
  let recorded: unknown;
  try {
    recorded = lifecycleEvents(ledger.db, source === "lifecycle_bound" ? LIFECYCLE_AUDIT.transition : LIFECYCLE_AUDIT.observed, agentId).at(-1)?.meta.manifestDigest;
  } finally {
    ledger.close();
  }
  if (recorded !== digest) {
    throw fail(409, "VERSION_MANIFEST_MISMATCH", `the agent version manifest digest ${digest} is not the one P2-23 recorded (${String(recorded)})`);
  }
  return { manifest, manifestDigest: digest, source };
}

const actorOf = (principal: A4Principal): LifecycleActor =>
  ({ userId: principal.userId, username: principal.username, roles: [...principal.roles], via: "studio-session" });
const asStoreError = (error: unknown): unknown =>
  error instanceof LifecycleError ? fail(error.status === 403 ? 403 : 409, `LIFECYCLE_${error.code.toUpperCase()}`, error.message) : error;

/**
 * P2-23's activation, recorded by the deployment approval's effect before the production lease (one human decision,
 * two records sharing `binding_digest`): an approved agent moves to active as the completing owner, its note naming the
 * gate and binding digest. An agent P2-23 does not govern, or one already active, is left as it is; any other state
 * refuses the effect, so no production lease is minted for an agent P2-23 has not approved.
 */
export function recordLifecycleActivation(workspace: string, agentId: string, principal: A4Principal, gate: { gate_id: string; binding_digest: string }):
  { status: "activated" | "already_active" | "not_governed"; lifecycleEventId: string | null; bindingDigest: string } {
  const view = viewOf(workspace, agentId);
  const done = (status: "already_active" | "not_governed") => ({ status, lifecycleEventId: null, bindingDigest: gate.binding_digest });
  if (view.implicit) return done("not_governed");
  if (view.state === "active") return done("already_active");
  if (view.state !== "approved") {
    throw fail(409, "LIFECYCLE_NOT_APPROVED", `agent ${agentId} is ${view.state} (${view.reason}); P2-23 approves it before its deployment approval mints a production lease`);
  }
  try {
    const written = transitionAgent({ workspace, agentId, to: "active", actor: actorOf(principal),
      note: `A4 activate.completion gate ${gate.gate_id}, binding_digest ${gate.binding_digest}` });
    return { status: "activated", lifecycleEventId: written.id, bindingDigest: gate.binding_digest };
  } catch (error) {
    throw asStoreError(error);
  }
}

/**
 * A4's RETIRE of a deployed project delegates to P2-23 retirement first (credentials first: a failure part-way leaves
 * the agent less able to act). A never-deployed project, an agent P2-23 does not govern, or one already retired is not
 * retired here. P2-23 refuses an open outcome_unknown receipt without the owner's acceptance note.
 */
export async function retireGovernedAgent(workspace: string, project: { agent_id: string; deployed_release_id: string | null }, principal: A4Principal,
  input: { reason: string; acceptanceNote?: string }): Promise<{ lifecycleEventId: string } | null> {
  if (project.deployed_release_id === null) return null;
  const view = viewOf(workspace, project.agent_id);
  if (view.implicit || view.state === "retired") return null;
  try {
    const retired = await retireAgent({ workspace, agentId: project.agent_id, actor: actorOf(principal), note: `A4 RETIRE: ${input.reason}`,
      ...(input.acceptanceNote?.trim() ? { acceptOutcomeUnknown: input.acceptanceNote } : {}) });
    return { lifecycleEventId: retired.id };
  } catch (error) {
    throw asStoreError(error);
  }
}
