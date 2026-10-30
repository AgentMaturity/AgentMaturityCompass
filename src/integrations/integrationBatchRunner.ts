import { canonicalize } from "../utils/json.js";
import { getVaultSecretReadOnly } from "../vault/vault.js";
import { captureIntegrationJournalPublication } from "./integrationJournalProtocol.js";
export { captureIntegrationJournalPublication } from "./integrationJournalProtocol.js";
import { resolveSecretRef } from "./integrationStore.js";
import { captureIntegrationConfiguration, captureIntegrationQueueAuthority, captureIntegrationQueueReader } from "./integrationQueueEnqueue.js";
import { captureIntegrationPendingRows, listIntegrationDeliveriesNeedingFinalization,
  type IntegrationQueueRow, type IntegrationQueueDeliveryStatus } from "./integrationDeliveryQueue.js";
import type { IntegrationEventInput } from "./integrationDispatcher.js";

type IntegrationBatchEvent = Omit<IntegrationEventInput, "workspace">;
export interface IntegrationBatchInput { workspace: string; events: IntegrationBatchEvent[] }

/** Fixed integration batch context. No actor or authority is read from an event body or chosen after an await. */
export function captureIntegrationBatchRun(params: IntegrationBatchInput, beforeCommit?: () => void) {
  const workspace = params.workspace, events = params.events.map(event => ({ eventName: event.eventName, agentId: event.agentId,
    summary: event.summary, forceChannelId: event.forceChannelId, details: JSON.parse(canonicalize(event.details ?? {})) as Record<string, unknown> }));
  beforeCommit?.();
  const captured = captureIntegrationConfiguration(workspace), config = captured.config;
  const ids = new Set(events.flatMap(event => event.forceChannelId ? [event.forceChannelId] : config.integrations.routing[event.eventName] ?? []));
  const channels = config.integrations.channels.filter(channel => ids.has(channel.id));
  const refs = [...new Set(channels.filter(channel => channel.enabled).map(channel =>
    channel.type === "webhook" ? channel.secretRef : channel.webhookUrlRef))];
  const values = refs.map(ref => resolveSecretRef(workspace, ref));
  const secretValues: ReadonlyMap<string, string | null> = new Map<string, string | null>(refs.map((ref, index) => [ref, values[index] ?? null]));
  // A batch with no actual enqueue intent never acquires an unrelated signing requirement.
  const needsQueue = values.some(value => Boolean(value));
  const signer = needsQueue ? captureIntegrationQueueAuthority(workspace) : () => {};
  const reader = needsQueue ? captureIntegrationQueueReader(workspace) : () => {};
  const assertAuthority = () => {
    beforeCommit?.();
    for (let index = 0; index < refs.length; index += 1) {
      const ref = refs[index]!, current = ref.startsWith("vault:") ? getVaultSecretReadOnly(workspace, ref.slice(6)) : null;
      if (current !== values[index]) throw new Error("integration batch selected secret or destination changed");
    }
    captured.assertCurrent(); signer(); reader();
  };
  assertAuthority();
  const journals = captureIntegrationJournalPublication(workspace, assertAuthority);
  const initialRows = needsQueue ? captureIntegrationPendingRows(workspace, [...ids], assertAuthority) : [];
  assertAuthority();
  const initialTerminals = needsQueue ? listIntegrationDeliveriesNeedingFinalization(workspace).filter(row => ids.has(row.channelId)) : [];
  const pending = new Map(initialRows.map(row => [row.queue_id, { ...row }]));
  const terminal = new Map(initialTerminals.map(row => [row.queueId, row]));
  const copyStatus = (row: IntegrationQueueDeliveryStatus) => JSON.parse(canonicalize(row)) as IntegrationQueueDeliveryStatus;
  return { workspace, events, config, journals, secretValues,
    assertCurrent: assertAuthority,
    pendingRows: () => [...pending.values()].map(row => ({ ...row })),
    terminalRows: (channelIds: readonly string[]) => [...terminal.values()].filter(row => channelIds.includes(row.channelId)).map(copyStatus),
    // These facts come only from the maintained enqueue/queue transaction after it returned successfully.
    recordOwnRows: (rows: readonly IntegrationQueueRow[], statuses: readonly IntegrationQueueDeliveryStatus[]) => {
      for (const row of rows) { if (row.state === "PENDING") pending.set(row.queue_id, { ...row }); else pending.delete(row.queue_id); }
      for (const row of statuses) terminal.set(row.queueId, copyStatus(row));
    },
    recordFinalized: (queueId: string) => { terminal.delete(queueId); }
  };
}
export type IntegrationBatchRun = ReturnType<typeof captureIntegrationBatchRun>;
