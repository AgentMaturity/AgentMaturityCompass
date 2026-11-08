/**
 * The `amc integrations source ...` operations (SH-INTEG-01/02), as plain functions so the CLI module stays thin and
 * tests call them directly. `observe` and `check` read a file, `admit` files proposals in the agent's approval inbox,
 * `status` reads the store. `check` decides and files nothing (the CI entry point). None opens a socket itself; `admit`
 * hands a filed proposal to the approval lifecycle delivery, which may notify over the channels a signed
 * integrations.yaml routes.
 *
 * `observe` and `admit` trust the payload file and the store rows they are given, so they are owner-mode commands: in
 * agent mode an agent could record a forged payload and have it filed as an allowed sender's request.
 */
import { readFileSync, statSync } from "node:fs";
import { approvalStatusPayload } from "../../approvals/approvalEngine.js";
import { assertOwnerMode } from "../../mode/mode.js";
import { observationFromGitHubEvent } from "./githubObservationParser.js";
import { admitSourceObservation, type AdmissionDecision } from "./sourceAdmission.js";
import {
  SOURCE_LIST_LIMIT, countProposals, countSourceObservations, getSourceObservation, listProposals, listSourceObservationIds, openSourceIntakeDb,
  recordSourceObservation
} from "./sourceIntakeStore.js";
import type { SourceObservation } from "./sourceObservationSchema.js";
import { loadVerifiedSourcePolicy, type LoadedSourcePolicy } from "./sourcePolicyStore.js";
import { proposeSourceRequest, recordNotAdmitted, verifyBoundWorkOrder, type ProposalOutcome } from "./sourceProposal.js";

const MAX_EVENT_FILE_BYTES = 1_048_576;

function parseEventFile(file: string, sourceId: string, receivedAt = Date.now()) {
  const tooLarge = () => new Error(`event file exceeds ${MAX_EVENT_FILE_BYTES} bytes`);
  // Size first, so a wrong path to a large file fails here instead of being read into memory; the length is checked
  // again after the read, since the file can change between the two.
  if (statSync(file).size > MAX_EVENT_FILE_BYTES) throw tooLarge();
  const bytes = readFileSync(file);
  if (bytes.byteLength > MAX_EVENT_FILE_BYTES) throw tooLarge();
  let payload: unknown;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("event file is not JSON");
  }
  return observationFromGitHubEvent(payload, { sourceId, receivedAt });
}

function summarize(observation: SourceObservation) {
  return {
    observationId: observation.observationId, sourceId: observation.sourceId, nativeEventId: observation.nativeEventId,
    repositoryId: observation.repository.id, threadKey: observation.primaryThreadKey, actor: observation.actor, mentions: observation.mentions,
    disposition: observation.disposition, contentBytes: observation.contentBytes, sourceAt: observation.sourceAt
  };
}

export function sourceObserveCli(params: { workspace: string; sourceId: string; file: string }) {
  assertOwnerMode(params.workspace, "integrations source observe");
  const parsed = parseEventFile(params.file, params.sourceId);
  if (!parsed.ok) return { ok: false as const, reason: parsed.reason, detail: parsed.detail };
  const db = openSourceIntakeDb(params.workspace);
  try {
    const { inserted } = recordSourceObservation(db, parsed.observation);
    return { ok: true as const, inserted, ...summarize(parsed.observation) };
  } finally {
    db.close();
  }
}

/** `policy_unverified` comes from workspace state, not from the policy: nothing was decided and nothing is recorded. */
function decideWithPolicy(loaded: LoadedSourcePolicy, observation: SourceObservation): { decision: AdmissionDecision; policyDigest: string | null; detail?: string } {
  if (!loaded.ok) return { decision: { kind: "not_admitted", reason: "policy_unverified" }, policyDigest: null, detail: loaded.detail };
  return { decision: admitSourceObservation(observation, loaded.policy), policyDigest: loaded.digest };
}

/** Pure decision for CI: parse, verify the policy, admit, verify the bound work order as `admit` would. Nothing is stored and nothing is filed. */
export function sourceCheckCli(params: { workspace: string; sourceId: string; file: string }) {
  const parsed = parseEventFile(params.file, params.sourceId);
  if (!parsed.ok) return { admitted: false as const, reason: parsed.reason, detail: parsed.detail };
  const { decision, detail } = decideWithPolicy(loadVerifiedSourcePolicy(params.workspace), parsed.observation);
  if (decision.kind === "not_admitted") return { admitted: false as const, reason: decision.reason, ...(detail === undefined ? {} : { detail }), ...summarize(parsed.observation) };
  const bound = verifyBoundWorkOrder(params.workspace, decision.source);
  if (!bound.ok) return { admitted: false as const, reason: bound.reason, detail: bound.detail, ...summarize(parsed.observation) };
  return { admitted: true as const, sender: decision.sender, workOrderId: bound.workOrder.workOrderId, agentId: decision.source.agentId, ...summarize(parsed.observation) };
}

export type AdmitResult = { observationId: string } & ({ admitted: false; reason: string; detail?: string } | ({ admitted: true } & ProposalOutcome));

/** Decides one observation or a batch of up to SOURCE_LIST_LIMIT pending ones; `remainingPending` says how many are still undecided after it. */
export async function sourceAdmitCli(params: { workspace: string; observationId?: string; allPending?: boolean }): Promise<{ results: AdmitResult[]; remainingPending: number }> {
  if (!params.observationId && !params.allPending) throw new Error("name --observation <id> or pass --all-pending");
  assertOwnerMode(params.workspace, "integrations source admit");
  const db = openSourceIntakeDb(params.workspace);
  try {
    const loaded = loadVerifiedSourcePolicy(params.workspace);
    const ids = params.observationId ? [params.observationId] : listSourceObservationIds(db, { pendingOnly: true });
    const results: AdmitResult[] = [];
    for (const observationId of ids) {
      const observation = getSourceObservation(db, observationId);
      if (!observation) {
        results.push({ observationId, admitted: false, reason: "observation_unavailable" });
        continue;
      }
      const { decision, policyDigest, detail } = decideWithPolicy(loaded, observation);
      if (decision.kind === "not_admitted") {
        if (decision.reason !== "policy_unverified") recordNotAdmitted(db, observationId, decision.reason);
        results.push({ observationId, admitted: false, reason: decision.reason, ...(detail === undefined ? {} : { detail }) });
        continue;
      }
      const outcome = await proposeSourceRequest({ workspace: params.workspace, db, observation, source: decision.source, sender: decision.sender, policyDigest: policyDigest! });
      results.push({ observationId, admitted: true, ...outcome });
    }
    return { results, remainingPending: countSourceObservations(db, { pendingOnly: true }) };
  } finally {
    db.close();
  }
}

export function sourceStatusCli(params: { workspace: string }) {
  const loaded = loadVerifiedSourcePolicy(params.workspace);
  const db = openSourceIntakeDb(params.workspace);
  try {
    const sources = loaded.ok ? loaded.policy.sources.sources.map((source) => ({
      id: source.id, repository: source.repository, agentId: source.agentId, workOrderId: source.workOrderId, mention: source.mention,
      admission: source.admission, allowedSenders: source.allowedSenders.length,
      observations: countSourceObservations(db, { sourceId: source.id }), pending: countSourceObservations(db, { sourceId: source.id, pendingOnly: true })
    })) : [];
    const agentFor = (observationId: string) => {
      const observation = getSourceObservation(db, observationId);
      return loaded.ok ? loaded.policy.sources.sources.find((source) => source.id === observation?.sourceId)?.agentId ?? null : null;
    };
    const proposals = listProposals(db).map(({ token: _token, ...row }) => {
      let approval: ReturnType<typeof approvalStatusPayload>["quorum"] | { status: "unavailable"; detail: string } | null = null;
      const agentId = row.approvalRequestId === null ? null : agentFor(row.observationId);
      if (row.approvalRequestId !== null && agentId !== null) {
        try {
          approval = approvalStatusPayload({ workspace: params.workspace, agentId, approvalId: row.approvalRequestId }).quorum;
        } catch (error) {
          approval = { status: "unavailable", detail: String(error) };
        }
      }
      return { ...row, approval };
    });
    const proposalsTotal = countProposals(db);
    return {
      policy: loaded.ok ? { verified: true, digest: loaded.digest, path: loaded.path } : { verified: false, reason: loaded.reason, detail: loaded.detail, path: loaded.path },
      sources, pending: countSourceObservations(db, { pendingOnly: true }),
      /** Newest first; `proposalsTotal` is exact, the list is capped at SOURCE_LIST_LIMIT. */
      proposals, proposalsTotal, proposalsTruncated: proposalsTotal > SOURCE_LIST_LIMIT
    };
  } finally {
    db.close();
  }
}
