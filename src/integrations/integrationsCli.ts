import { dispatchIntegrationEvent, dispatchIntegrationEventsBatch, dispatchIntegrationTest } from "./integrationDispatcher.js";
import {
  exportIntegrationDeliveryJournal,
  integrationDeliveryJournalPath,
  listIntegrationDeadLetters,
  listIntegrationDeliveries
} from "./integrationDeliveryStore.js";
import {
  exportIntegrationDeliverySnapshot,
  integrationQueueStats,
  listIntegrationDeadLetters as listQueueDeadLetters,
  requeueIntegrationDeadLetters
} from "./integrationDeliveryQueue.js";
import {
  initIntegrationsConfig,
  loadIntegrationsConfig,
  verifyIntegrationsConfigSignature
} from "./integrationStore.js";

export function integrationsInitCli(workspace: string): {
  path: string;
  sigPath: string;
} {
  return initIntegrationsConfig(workspace);
}

export function integrationsVerifyCli(workspace: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  return verifyIntegrationsConfigSignature(workspace);
}

export function integrationsStatusCli(workspace: string): {
  signature: ReturnType<typeof verifyIntegrationsConfigSignature>;
  deliveryJournalPath: string;
  queueStats: ReturnType<typeof integrationQueueStats>;
  queueDeadLetters: ReturnType<typeof listQueueDeadLetters>;
  recentDeliveries: ReturnType<typeof listIntegrationDeliveries>;
  unresolvedDeadLetters: ReturnType<typeof listIntegrationDeadLetters>;
  channels: Array<{
    id: string;
    type: string;
    enabled: boolean;
    routedEvents: string[];
  }>;
} {
  const signature = verifyIntegrationsConfigSignature(workspace);
  const config = loadIntegrationsConfig(workspace);
  const channels = config.integrations.channels.map((channel) => ({
    id: channel.id,
    type: channel.type,
    enabled: channel.enabled,
    routedEvents: Object.entries(config.integrations.routing)
      .filter(([, channelIds]) => channelIds.includes(channel.id))
      .map(([eventName]) => eventName)
      .sort((a, b) => a.localeCompare(b))
  }));
  return {
    signature,
    deliveryJournalPath: integrationDeliveryJournalPath(workspace),
    queueStats: integrationQueueStats(workspace),
    queueDeadLetters: listQueueDeadLetters(workspace, { limit: 20 }),
    recentDeliveries: listIntegrationDeliveries(workspace, 20),
    unresolvedDeadLetters: listIntegrationDeadLetters({
      workspace,
      unresolvedOnly: true,
      limit: 20
    }),
    channels
  };
}

export async function integrationsTestCli(params: {
  workspace: string;
  channelId?: string;
}): Promise<ReturnType<typeof dispatchIntegrationTest>> {
  return dispatchIntegrationTest(params);
}

export async function integrationsDispatchCli(params: {
  workspace: string;
  eventName: string;
  agentId: string;
  summary?: string;
  details?: Record<string, unknown>;
}): Promise<ReturnType<typeof dispatchIntegrationEvent>> {
  return dispatchIntegrationEvent({
    workspace: params.workspace,
    eventName: params.eventName,
    agentId: params.agentId,
    summary: params.summary ?? `AMC integration dispatch for ${params.eventName}`,
    details: params.details
  });
}

export async function integrationsDispatchBatchCli(params: {
  workspace: string;
  events: Array<{
    eventName: string;
    agentId: string;
    summary: string;
    details?: Record<string, unknown>;
    forceChannelId?: string;
  }>;
}): Promise<ReturnType<typeof dispatchIntegrationEventsBatch>> {
  return dispatchIntegrationEventsBatch({
    workspace: params.workspace,
    events: params.events
  });
}

export function integrationsRequeueDeadLettersCli(params: {
  workspace: string;
  channelId?: string;
  limit?: number;
}): ReturnType<typeof requeueIntegrationDeadLetters> {
  return requeueIntegrationDeadLetters({
    workspace: params.workspace,
    channelId: params.channelId,
    limit: params.limit
  });
}

export function integrationsExportJournalCli(params: {
  workspace: string;
  outFile: string;
}): ReturnType<typeof exportIntegrationDeliveryJournal> {
  return exportIntegrationDeliveryJournal({
    workspace: params.workspace,
    outFile: params.outFile
  });
}

export function integrationsExportDeliverySnapshotCli(params: {
  workspace: string;
  outFile: string;
  includeDelivered?: boolean;
  includePending?: boolean;
  includeDeadLetters?: boolean;
  limit?: number;
}): ReturnType<typeof exportIntegrationDeliverySnapshot> {
  return exportIntegrationDeliverySnapshot({
    workspace: params.workspace,
    outFile: params.outFile,
    includeDelivered: params.includeDelivered,
    includePending: params.includePending,
    includeDeadLetters: params.includeDeadLetters,
    limit: params.limit
  });
}
