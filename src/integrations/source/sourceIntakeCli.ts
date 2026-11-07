/**
 * The `amc integrations source ...` operations (SH-INTEG-01/02), as plain functions so the CLI module stays thin and
 * tests call them directly. None opens a socket: `observe` and `check` read a file, `admit` files proposals in the
 * agent's approval inbox, `status` reads the store. `check` decides and files nothing (the CI entry point).
 */
import { readFileSync } from "node:fs";
import { approvalStatusPayload } from "../../approvals/approvalEngine.js";
import { observationFromGitHubEvent } from "./githubObservationParser.js";
import { admitSourceObservation, type AdmissionDecision } from "./sourceAdmission.js";
import { getSourceObservation, listProposals, listSourceObservationIds, openSourceIntakeDb, recordSourceObservation } from "./sourceIntakeStore.js";
import type { SourceObservation } from "./sourceObservationSchema.js";
import { loadVerifiedSourcePolicy } from "./sourcePolicyStore.js";
import { proposeSourceRequest, recordNotAdmitted, type ProposalOutcome } from "./sourceProposal.js";

const MAX_EVENT_FILE_BYTES = 1_048_576;

function parseEventFile(file: string, sourceId: string, receivedAt = Date.now()) {
  const bytes = readFileSync(file);
  if (bytes.byteLength > MAX_EVENT_FILE_BYTES) throw new Error(`event file exceeds ${MAX_EVENT_FILE_BYTES} bytes`);
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

function decideWithPolicy(workspace: string, observation: SourceObservation): { decision: AdmissionDecision; policyDigest: string | null; detail?: string } {
  const loaded = loadVerifiedSourcePolicy(workspace);
  if (!loaded.ok) return { decision: { kind: "not_admitted", reason: "policy_unverified" }, policyDigest: null, detail: loaded.detail };
  return { decision: admitSourceObservation(observation, loaded.policy), policyDigest: loaded.digest };
}

/** Pure decision for CI: parse, verify the policy, admit. Nothing is stored and nothing is filed. */
export function sourceCheckCli(params: { workspace: string; sourceId: string; file: string }) {
  const parsed = parseEventFile(params.file, params.sourceId);
  if (!parsed.ok) return { admitted: false as const, reason: parsed.reason, detail: parsed.detail };
  const { decision, detail } = decideWithPolicy(params.workspace, parsed.observation);
  if (decision.kind === "not_admitted") return { admitted: false as const, reason: decision.reason, ...(detail === undefined ? {} : { detail }), ...summarize(parsed.observation) };
  return { admitted: true as const, sender: decision.sender, workOrderId: decision.source.workOrderId, agentId: decision.source.agentId, ...summarize(parsed.observation) };
}

export type AdmitResult = { observationId: string } & ({ admitted: false; reason: string; detail?: string } | ({ admitted: true } & ProposalOutcome));

export async function sourceAdmitCli(params: { workspace: string; observationId?: string; allPending?: boolean }): Promise<{ results: AdmitResult[] }> {
  if (!params.observationId && !params.allPending) throw new Error("name --observation <id> or pass --all-pending");
  const db = openSourceIntakeDb(params.workspace);
  try {
    const ids = params.observationId ? [params.observationId] : listSourceObservationIds(db, { pendingOnly: true });
    const results: AdmitResult[] = [];
    for (const observationId of ids) {
      const observation = getSourceObservation(db, observationId);
      if (!observation) {
        results.push({ observationId, admitted: false, reason: "observation_unavailable" });
        continue;
      }
      const { decision, policyDigest, detail } = decideWithPolicy(params.workspace, observation);
      if (decision.kind === "not_admitted") {
        recordNotAdmitted(db, observationId, decision.reason);
        results.push({ observationId, admitted: false, reason: decision.reason, ...(detail === undefined ? {} : { detail }) });
        continue;
      }
      const outcome = await proposeSourceRequest({ workspace: params.workspace, db, observation, source: decision.source, sender: decision.sender, policyDigest: policyDigest! });
      results.push({ observationId, admitted: true, ...outcome });
    }
    return { results };
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
      admission: source.admission, allowedSenders: source.allowedSenders.length, observations: listSourceObservationIds(db, { sourceId: source.id }).length
    })) : [];
    const agentFor = (observationId: string) => {
      const observation = getSourceObservation(db, observationId);
      return loaded.ok ? loaded.policy.sources.sources.find((source) => source.id === observation?.sourceId)?.agentId ?? null : null;
    };
    const proposals = listProposals(db).map((row) => {
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
    return {
      policy: loaded.ok ? { verified: true, digest: loaded.digest, path: loaded.path } : { verified: false, reason: loaded.reason, detail: loaded.detail, path: loaded.path },
      sources, pending: listSourceObservationIds(db, { pendingOnly: true }).length, proposals
    };
  } finally {
    db.close();
  }
}
