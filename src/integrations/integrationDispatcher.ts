import { randomUUID } from "node:crypto";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { openLedger } from "../ledger/ledger.js";
import {
  loadIntegrationsConfig,
  resolveSecretRef,
  verifyIntegrationsConfigSignature
} from "./integrationStore.js";
import {
  enqueueIntegrationDeliveries,
  getIntegrationDeliveryStatusByQueueIds,
  processIntegrationChannelQueue,
  type IntegrationQueueItemInput
} from "./integrationDeliveryQueue.js";
import { appendIntegrationDeadLetter } from "./integrationDeadLetters.js";
import {
  addIntegrationDeadLetter,
  nextIntegrationChannelSequence,
  recordIntegrationDelivery
} from "./integrationDeliveryStore.js";

export interface IntegrationDispatchPayload {
  type: "AMC_OPS_EVENT";
  eventName: string;
  ts: number;
  agentId: string;
  summary: string;
  details: Record<string, unknown>;
}

export interface IntegrationDispatchResult {
  channelId: string;
  eventName: string;
  payloadSha256: string;
  orderedSequence: number | null;
  attempts: number;
  deliveryId: string;
  httpStatus: number;
  eventId: string;
  receiptId: string;
  receipt: string;
}

function slackWebhookPayload(body: IntegrationDispatchPayload, channel?: string): string {
  const summary = body.summary.trim().length > 0 ? body.summary.trim() : body.eventName;
  const detailsJson = JSON.stringify(body.details, null, 2);
  const detailsSection = detailsJson === "{}" ? "None" : detailsJson.slice(0, 3000);
  return canonicalize({
    text: `[AMC] ${body.eventName}: ${summary}`,
    channel,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `AMC Incident: ${body.eventName}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Agent:* \`${body.agentId}\`\n*Summary:* ${summary}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Details:*\n\`\`\`${detailsSection}\`\`\``
        }
      }
    ]
  });
}

function writeIntegrationEvidence(params: {
  workspace: string;
  channelId: string;
  eventName: string;
  agentId: string;
  payloadBody: string;
  payloadSha256: string;
  orderedSequence: number | null;
  attempts: number;
  httpStatus: number;
}): {
  eventId: string;
  receiptId: string;
  receipt: string;
} {
  const ledger = openLedger(params.workspace);
  const sessionId = `integration-dispatch-${Date.now()}-${randomUUID().replace(/-/g, "")}`;
  try {
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "amc-integrations",
      binarySha256: sha256Hex("amc-integrations")
    });
    const written = ledger.appendEvidenceWithReceipt({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload: params.payloadBody,
      payloadExt: "json",
      inline: true,
      meta: {
        trustTier: "OBSERVED",
        auditType: "INTEGRATION_DISPATCHED",
        channelId: params.channelId,
        eventName: params.eventName,
        payloadSha256: params.payloadSha256,
        orderedSequence: params.orderedSequence,
        attempts: params.attempts,
        httpStatus: params.httpStatus,
        agentId: params.agentId
      },
      receipt: {
        kind: "guard_check",
        agentId: params.agentId,
        providerId: "integration",
        model: null,
        bodySha256: params.payloadSha256
      }
    });
    ledger.sealSession(sessionId);
    return {
      eventId: written.id,
      receiptId: written.receiptId,
      receipt: written.receipt
    };
  } finally {
    ledger.close();
  }
}

const DEFAULT_QUEUE_MAX_ROUNDS = 3;
const channelProcessingLocks = new Map<string, Promise<void>>();

interface ChannelDeliveryPolicy {
  ordered: boolean;
  recordDeadLetters: boolean;
  maxRounds: number;
  retry: {
    maxAttempts?: number;
    initialBackoffMs?: number;
    maxBackoffMs?: number;
    jitterFactor?: number;
    timeoutMs?: number;
  };
}

function mergeChannelDeliveryPolicy(params: {
  defaults: ReturnType<typeof loadIntegrationsConfig>["integrations"]["defaults"]["delivery"];
  channel: ReturnType<typeof loadIntegrationsConfig>["integrations"]["channels"][number];
}): ChannelDeliveryPolicy {
  const maxRoundsRaw = params.channel.delivery?.maxRounds ?? params.defaults.maxRounds ?? DEFAULT_QUEUE_MAX_ROUNDS;
  return {
    ordered: params.channel.delivery?.ordered ?? params.defaults.ordered,
    recordDeadLetters: params.channel.delivery?.recordDeadLetters ?? params.defaults.recordDeadLetters,
    maxRounds: Math.max(1, Math.min(20, Math.floor(maxRoundsRaw))),
    retry: {
      ...params.defaults.retry,
      ...(params.channel.delivery?.retry ?? {})
    }
  };
}

async function withChannelProcessingLock<T>(
  workspace: string,
  channelId: string,
  task: () => Promise<T>
): Promise<T> {
  const key = `${workspace}::${channelId}`;
  const previous = channelProcessingLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolvePromise) => {
    release = resolvePromise;
  });
  const chain = previous
    .catch(() => {
      // Continue processing queue after prior failure.
    })
    .then(() => gate);
  channelProcessingLocks.set(key, chain);
  await previous.catch(() => {
    // Preserve strict ordering even after failures.
  });
  try {
    return await task();
  } finally {
    release();
    if (channelProcessingLocks.get(key) === chain) {
      channelProcessingLocks.delete(key);
    }
  }
}

function buildQueueDeliveries(params: {
  workspace: string;
  config: ReturnType<typeof loadIntegrationsConfig>;
  payload: IntegrationDispatchPayload;
  standardPayloadBody: string;
  channels: ReturnType<typeof loadIntegrationsConfig>["integrations"]["channels"];
  skipped: string[];
}): {
  deliveries: IntegrationQueueItemInput[];
  policiesByChannelId: Map<string, ChannelDeliveryPolicy>;
} {
  const deliveries: IntegrationQueueItemInput[] = [];
  const policiesByChannelId = new Map<string, ChannelDeliveryPolicy>();

  for (const channel of params.channels) {
    if (!channel.enabled) {
      params.skipped.push(`${channel.id}:disabled`);
      continue;
    }
    const deliveryPolicy = mergeChannelDeliveryPolicy({
      defaults: params.config.integrations.defaults.delivery,
      channel
    });
    policiesByChannelId.set(channel.id, deliveryPolicy);
    const orderedSequence = deliveryPolicy.ordered
      ? nextIntegrationChannelSequence(params.workspace, channel.id)
      : null;

    if (channel.type === "webhook") {
      const secret = resolveSecretRef(params.workspace, channel.secretRef);
      if (!secret) {
        params.skipped.push(`${channel.id}:missing-secret`);
        continue;
      }
      deliveries.push({
        channelId: channel.id,
        channelType: "webhook",
        eventName: params.payload.eventName,
        agentId: params.payload.agentId,
        payloadBody: params.standardPayloadBody,
        orderedSequence,
        destinationUrl: channel.url,
        secretRef: channel.secretRef,
        extraHeaders: {
          "x-amc-channel-id": channel.id
        },
        maxRounds: deliveryPolicy.maxRounds
      });
      continue;
    }

    if (channel.type === "slack_webhook") {
      const webhookUrl = resolveSecretRef(params.workspace, channel.webhookUrlRef);
      if (!webhookUrl) {
        params.skipped.push(`${channel.id}:missing-slack-webhook-url`);
        continue;
      }
      deliveries.push({
        channelId: channel.id,
        channelType: "slack_webhook",
        eventName: params.payload.eventName,
        agentId: params.payload.agentId,
        payloadBody: slackWebhookPayload(params.payload, channel.channel),
        orderedSequence,
        destinationRef: channel.webhookUrlRef,
        extraHeaders: {
          "x-amc-channel-id": channel.id
        },
        maxRounds: deliveryPolicy.maxRounds
      });
      continue;
    }
  }

  return {
    deliveries,
    policiesByChannelId
  };
}

export async function dispatchIntegrationEvent(params: {
  workspace: string;
  eventName: string;
  agentId: string;
  summary: string;
  details?: Record<string, unknown>;
  forceChannelId?: string;
}): Promise<{
  dispatched: IntegrationDispatchResult[];
  skipped: string[];
}> {
  const verify = verifyIntegrationsConfigSignature(params.workspace);
  if (!verify.valid) {
    throw new Error(`integrations config signature invalid: ${verify.reason ?? "unknown"}`);
  }
  const config = loadIntegrationsConfig(params.workspace);
  const routed = params.forceChannelId
    ? [params.forceChannelId]
    : config.integrations.routing[params.eventName] ?? [];
  const routedSet = new Set(routed);
  const channels = config.integrations.channels.filter((channel) => routedSet.has(channel.id));

  const payload: IntegrationDispatchPayload = {
    type: "AMC_OPS_EVENT",
    eventName: params.eventName,
    ts: Date.now(),
    agentId: params.agentId,
    summary: params.summary,
    details: params.details ?? {}
  };
  const standardPayloadBody = canonicalize(payload);

  const skipped: string[] = [];
  const prepared = buildQueueDeliveries({
    workspace: params.workspace,
    config,
    payload,
    standardPayloadBody,
    channels,
    skipped
  });
  const deliveries = prepared.deliveries;
  const policiesByChannelId = prepared.policiesByChannelId;

  if (deliveries.length === 0) {
    return {
      dispatched: [],
      skipped
    };
  }

  const queued = enqueueIntegrationDeliveries({
    workspace: params.workspace,
    deliveries
  });

  const channelOrder: string[] = [];
  for (const delivery of queued) {
    if (!channelOrder.includes(delivery.channelId)) {
      channelOrder.push(delivery.channelId);
    }
  }

  for (const channelId of channelOrder) {
    const channelPolicy = policiesByChannelId.get(channelId);
    await withChannelProcessingLock(params.workspace, channelId, async () => {
      await processIntegrationChannelQueue({
        workspace: params.workspace,
        channelId,
        deliveryPolicy: channelPolicy?.retry ?? {},
        onDelivered: async (input) => {
          return writeIntegrationEvidence({
            workspace: params.workspace,
            channelId: input.channelId,
            eventName: input.eventName,
            agentId: input.agentId,
            payloadBody: input.payloadBody,
            payloadSha256: input.payloadSha256,
            orderedSequence: input.orderedSequence,
            attempts: input.receipt.attempts.length,
            httpStatus: input.httpStatus
          });
        }
      });
    });
  }

  const statuses = getIntegrationDeliveryStatusByQueueIds(
    params.workspace,
    queued.map((row) => row.queueId)
  );
  const statusByQueueId = new Map(statuses.map((row) => [row.queueId, row]));

  const dispatched: IntegrationDispatchResult[] = [];
  for (const queuedRow of queued) {
    const status = statusByQueueId.get(queuedRow.queueId);
    if (!status) {
      skipped.push(`${queuedRow.channelId}:dispatch-status-missing`);
      continue;
    }

    if (status.deliveryReceipt && (status.state === "DELIVERED" || status.state === "DEAD_LETTER")) {
      const sequence = status.orderedSequence ?? status.seq;
      recordIntegrationDelivery({
        workspace: params.workspace,
        channelId: status.channelId,
        eventName: status.eventName,
        agentId: status.agentId,
        sequence,
        payloadSha256: status.payloadSha256,
        receipt: status.deliveryReceipt
      });
      if (status.state === "DEAD_LETTER" && (policiesByChannelId.get(status.channelId)?.recordDeadLetters ?? true)) {
        addIntegrationDeadLetter({
          workspace: params.workspace,
          channelId: status.channelId,
          eventName: status.eventName,
          agentId: status.agentId,
          sequence,
          payloadSha256: status.payloadSha256,
          receipt: status.deliveryReceipt
        });
        appendIntegrationDeadLetter(params.workspace, {
          v: 1,
          deadLetterId: `idl_${status.queueId}`,
          ts: Date.now(),
          channelId: status.channelId,
          eventName: status.eventName,
          agentId: status.agentId,
          url: status.deliveryReceipt.url,
          orderedSequence: sequence,
          payloadSha256: status.payloadSha256,
          attemptCount: status.deliveryReceipt.attempts.length,
          lastHttpStatus: status.lastHttpStatus,
          reason: status.lastError ?? "dead-letter"
        });
      }
    }

    if (status.state === "DELIVERED") {
      if (!status.eventId || !status.receiptId || !status.receipt) {
        skipped.push(`${status.channelId}:dispatch-artifacts-missing`);
        continue;
      }
      dispatched.push({
        channelId: status.channelId,
        eventName: status.eventName,
        payloadSha256: status.payloadSha256,
        orderedSequence: status.orderedSequence,
        attempts: status.deliveryReceipt?.attempts.length ?? status.attemptRound,
        deliveryId: status.deliveryReceipt?.deliveryId ?? `int_${status.queueId}`,
        httpStatus: status.lastHttpStatus ?? 200,
        eventId: status.eventId,
        receiptId: status.receiptId,
        receipt: status.receipt
      });
      continue;
    }

    if (status.state === "DEAD_LETTER") {
      skipped.push(`${status.channelId}:dispatch-failed:${status.lastError ?? "dead-letter"}`);
      continue;
    }

    skipped.push(`${status.channelId}:queued-pending-ordering`);
  }

  return {
    dispatched,
    skipped
  };
}

export async function dispatchIntegrationEventsBatch(params: {
  workspace: string;
  events: Array<{
    eventName: string;
    agentId: string;
    summary: string;
    details?: Record<string, unknown>;
    forceChannelId?: string;
  }>;
}): Promise<{
  results: Array<{
    eventName: string;
    agentId: string;
    dispatched: IntegrationDispatchResult[];
    skipped: string[];
  }>;
}> {
  const results: Array<{
    eventName: string;
    agentId: string;
    dispatched: IntegrationDispatchResult[];
    skipped: string[];
  }> = [];

  for (const event of params.events) {
    const out = await dispatchIntegrationEvent({
      workspace: params.workspace,
      eventName: event.eventName,
      agentId: event.agentId,
      summary: event.summary,
      details: event.details,
      forceChannelId: event.forceChannelId
    });
    results.push({
      eventName: event.eventName,
      agentId: event.agentId,
      dispatched: out.dispatched,
      skipped: out.skipped
    });
  }

  return {
    results
  };
}

export async function dispatchIntegrationTest(params: {
  workspace: string;
  channelId?: string;
}): Promise<{
  dispatched: IntegrationDispatchResult[];
  skipped: string[];
}> {
  return dispatchIntegrationEvent({
    workspace: params.workspace,
    eventName: "INTEGRATION_TEST",
    agentId: "system",
    summary: "AMC integration test dispatch",
    details: {
      source: "amc integrations test"
    },
    forceChannelId: params.channelId
  });
}
