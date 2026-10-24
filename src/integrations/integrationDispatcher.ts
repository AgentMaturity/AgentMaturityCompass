import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getVaultSecretReadOnly } from "../vault/vault.js";
import { captureIntegrationConfiguration, prepareIntegrationEnqueue, captureIntegrationQueueReader, IntegrationDispatchPartialError } from "./integrationQueueEnqueue.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { openLedger } from "../ledger/ledger.js";
import { EgressBlocked } from "../residency/checkEgress.js";
import {
  loadIntegrationsConfig,
  resolveSecretRef
} from "./integrationStore.js";
import {
  enqueueIntegrationDeliveriesAsync,
  getIntegrationDeliveryStatusByQueueIds,
  listDueIntegrationChannelIds,
  listIntegrationDeliveriesNeedingFinalization,
  markIntegrationDeliveriesFinalized,
  processIntegrationChannelQueue,
  processIntegrationChannelQueueWithAuthority, captureIntegrationPendingRows, finalizeIntegrationDeliveryWithAuthority,
  type IntegrationQueueRow,
  type IntegrationQueueDeliveryStatus,
  type IntegrationQueueItemInput,
  type ProcessedIntegrationDelivery
} from "./integrationDeliveryQueue.js";
import { appendIntegrationDeadLetter } from "./integrationDeadLetters.js";
import {
  addIntegrationDeadLetter, integrationDeliveryJournalPath,
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

export interface IntegrationQueuedDispatchResult {
  queueId: string;
  channelId: string;
  eventName: string;
  payloadSha256: string;
  orderedSequence: number | null;
  attemptRound: number;
  maxRounds: number;
  nextAttemptTs: number;
}

export interface IntegrationDispatchOutcome {
  dispatched: IntegrationDispatchResult[];
  queued: IntegrationQueuedDispatchResult[];
  skipped: string[];
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
}, beforeCommit?: () => void): {
  eventId: string;
  receiptId: string;
  receipt: string;
} {
  beforeCommit?.();
  const ledger = openLedger(params.workspace);
  const sessionId = `integration-dispatch-${Date.now()}-${randomUUID().replace(/-/g, "")}`;
  let sessionStarted = false, sessionSealed = false, returnedEvidence: { id: string; receiptId: string; receipt: string } | null = null;
  try {
    beforeCommit?.();
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "amc-integrations",
      binarySha256: sha256Hex("amc-integrations")
    });
    sessionStarted = true;
    beforeCommit?.();
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
    returnedEvidence = written;
    beforeCommit?.();
    ledger.sealSession(sessionId);
    sessionSealed = true;
    return {
      eventId: written.id,
      receiptId: written.receiptId,
      receipt: written.receipt
    };
  } catch (cause) {
    if (!beforeCommit) throw cause;
    throw new IntegrationDispatchPartialError(cause, Object.freeze({ stage: "integration-evidence", sessionId, sessionStarted, returnedEvidence, sessionSealed }));
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
  publishSequence?: (channelId: string) => number;
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
      ? (params.publishSequence ? params.publishSequence(channel.id) : nextIntegrationChannelSequence(params.workspace, channel.id))
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

async function processChannelQueue(params: {
  workspace: string;
  channelId: string;
  policy?: ChannelDeliveryPolicy;
  now?: () => number;
  beforeCommit?: () => void;
  selectedRows?: readonly IntegrationQueueRow[];
  terminalWrites?: IntegrationQueueDeliveryStatus[];
}): Promise<ProcessedIntegrationDelivery[]> {
  return withChannelProcessingLock(params.workspace, params.channelId, async () => {
    try {
      const run = params.beforeCommit ? (input: Parameters<typeof processIntegrationChannelQueue>[0]) =>
        processIntegrationChannelQueueWithAuthority(input, params.beforeCommit!, params.selectedRows ?? [], params.terminalWrites) : processIntegrationChannelQueue;
      const result = await run({
        workspace: params.workspace,
        channelId: params.channelId,
        deliveryPolicy: params.policy?.retry ?? {},
        now: params.now,
        onDelivered: async (input, beforeEvidenceCommit) => writeIntegrationEvidence({
          workspace: params.workspace,
          channelId: input.channelId,
          eventName: input.eventName,
          agentId: input.agentId,
          payloadBody: input.payloadBody,
          payloadSha256: input.payloadSha256,
          orderedSequence: input.orderedSequence,
          attempts: input.receipt.attempts.length,
          httpStatus: input.httpStatus
        }, beforeEvidenceCommit ?? params.beforeCommit)
      });
      return result.processed;
    } catch (error) {
      if (error instanceof EgressBlocked) return [];
      throw error;
    }
  });
}

/** Fixed integration journal targets; existing writers do not all share a lock, so no cross-process atomicity is claimed. */
function captureJournalPublication(workspace: string, beforeCommit: () => void) {
  const paths = [integrationDeliveryJournalPath(workspace), join(workspace, ".amc", "integrations", "dead-letters.jsonl")];
  const read = (path: string) => {
    let stat: ReturnType<typeof lstatSync>;
    try { stat = lstatSync(path); } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw cause;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("integration journal target is not a regular file");
    return { bytes: readFileSync(path), mode: stat.mode & 0o7777 };
  };
  let targets = paths.map(read);
  const progress: Array<{ stage: string; returned: boolean }> = [];
  return { progress, publish: <T>(stage: string, operation: () => T, assertRow?: () => void): T => {
    beforeCommit(); assertRow?.();
    for (let index = 0; index < paths.length; index += 1) {
      const current = read(paths[index]!), original = targets[index]!;
      if ((current === null) !== (original === null) || (current !== null && original !== null &&
        (current.mode !== original.mode || !current.bytes.equals(original.bytes)))) throw new Error("integration journal target changed");
    }
    const effect = { stage, returned: false }; progress.push(effect);
    const result = operation(); effect.returned = true; targets = paths.map(read); return result;
  } };
}

/** Original config/selected secrets are captured before the first async turn. No callback comes from event JSON. */
function captureDispatchInputs(workspace: string, channels: ReturnType<typeof loadIntegrationsConfig>["integrations"]["channels"],
  beforeCommit: () => void, assertConfigurationCurrent: () => void) {
  beforeCommit();
  const refs = [...new Set(channels.filter(channel => channel.enabled).map(channel =>
    channel.type === "webhook" ? channel.secretRef : channel.webhookUrlRef))];
  const values = refs.map(ref => resolveSecretRef(workspace, ref));
  return () => {
    beforeCommit();
    for (let index = 0; index < refs.length; index += 1) {
      const ref = refs[index]!, current = ref.startsWith("vault:") ? getVaultSecretReadOnly(workspace, ref.slice(6)) : null;
      if (current !== values[index]) throw new Error("selected integration secret or destination changed");
    }
    assertConfigurationCurrent();
  };
}

function finalizeTerminalDelivery(params: {
  workspace: string;
  status: IntegrationQueueDeliveryStatus;
  recordDeadLetters: boolean;
  beforeCommit?: () => void;
  journals?: ReturnType<typeof captureJournalPublication>;
}): void {
  const status = params.status;
  const journals = (assertRow?: () => void) => {
  const publish = <T>(stage: string, operation: () => T): T => params.journals ? params.journals.publish(stage, operation, assertRow) : operation();
  if (status.deliveryReceipt) {
    const sequence = status.orderedSequence ?? status.seq;
    publish("record-delivery", () => recordIntegrationDelivery({
      workspace: params.workspace,
      channelId: status.channelId,
      eventName: status.eventName,
      agentId: status.agentId,
      sequence,
      payloadSha256: status.payloadSha256,
      receipt: status.deliveryReceipt!
    }));
    if (status.state === "DEAD_LETTER" && params.recordDeadLetters) {
      publish("record-dead-letter", () => addIntegrationDeadLetter({
        workspace: params.workspace,
        channelId: status.channelId,
        eventName: status.eventName,
        agentId: status.agentId,
        sequence,
        payloadSha256: status.payloadSha256,
        receipt: status.deliveryReceipt!
      }));
      publish("append-dead-letter", () => appendIntegrationDeadLetter(params.workspace, {
        v: 1,
        deadLetterId: `idl_${status.queueId}`,
        ts: status.deadLetterTs ?? Date.now(),
        channelId: status.channelId,
        eventName: status.eventName,
        agentId: status.agentId,
        url: status.deliveryReceipt!.url,
        orderedSequence: sequence,
        payloadSha256: status.payloadSha256,
        attemptCount: status.deliveryReceipt!.attempts.length,
        lastHttpStatus: status.lastHttpStatus,
        reason: status.lastError ?? "dead-letter"
      }));
    }
  }
  };
  if (params.beforeCommit) finalizeIntegrationDeliveryWithAuthority(params.workspace, status, params.beforeCommit, journals);
  else { journals(); markIntegrationDeliveriesFinalized({ workspace: params.workspace, queueIds: [status.queueId] }); }
}

function finalizePendingTerminals(params: {
  workspace: string;
  policiesByChannelId: Map<string, ChannelDeliveryPolicy>;
  beforeCommit?: () => void;
  journals?: ReturnType<typeof captureJournalPublication>;
  statuses?: readonly IntegrationQueueDeliveryStatus[];
}): string[] {
  const failures: string[] = [];
  params.beforeCommit?.();
  for (const status of params.statuses ?? listIntegrationDeliveriesNeedingFinalization(params.workspace)) {
    try {
      finalizeTerminalDelivery({
        workspace: params.workspace,
        status,
        recordDeadLetters: params.policiesByChannelId.get(status.channelId)?.recordDeadLetters ?? true,
        beforeCommit: params.beforeCommit, journals: params.journals
      });
    } catch (cause) {
      if (params.beforeCommit) throw new IntegrationDispatchPartialError(cause, { stage: "terminal-finalization", queueId: status.queueId, journals: params.journals?.progress.map(item => ({ ...item })) });
      failures.push(`${status.channelId}:delivery-finalization-failed`);
    }
  }
  return failures;
}

type IntegrationEventInput = {
  workspace: string;
  eventName: string;
  agentId: string;
  summary: string;
  details?: Record<string, unknown>;
  forceChannelId?: string;
};

export async function dispatchIntegrationEvent(params: IntegrationEventInput): Promise<IntegrationDispatchOutcome> {
  return dispatchIntegrationEventAttempt(params);
}

/** Internal maintained-caller API, deliberately absent from the root SDK. Negative callback is never read from JSON. */
export async function dispatchIntegrationEventWithAuthority(params: IntegrationEventInput, beforeCommit: () => void): Promise<IntegrationDispatchOutcome> {
  return dispatchIntegrationEventAttempt(params, beforeCommit);
}

async function dispatchIntegrationEventAttempt(params: IntegrationEventInput, beforeCommit?: () => void): Promise<IntegrationDispatchOutcome> {
  params = { ...params, details: JSON.parse(canonicalize(params.details ?? {})) as Record<string, unknown> };
  const reservedSequences: Array<{ channelId: string; sequence: number }> = [];
  let queued: Awaited<ReturnType<typeof enqueueIntegrationDeliveriesAsync>> = [];
  let journals: ReturnType<typeof captureJournalPublication> | undefined;
  try {
  beforeCommit?.();
  const capturedConfig = captureIntegrationConfiguration(params.workspace), config = capturedConfig.config;
  const assertConfigurationCurrent = capturedConfig.assertCurrent;
  const routed = params.forceChannelId
    ? [params.forceChannelId]
    : config.integrations.routing[params.eventName] ?? [];
  const routedSet = new Set(routed);
  const channels = config.integrations.channels.filter((channel) => routedSet.has(channel.id));

  const assertInputs = beforeCommit ? captureDispatchInputs(params.workspace, channels, beforeCommit, assertConfigurationCurrent) : assertConfigurationCurrent;
  let assertOriginalQueue = () => {};
  journals = beforeCommit ? captureJournalPublication(params.workspace, () => { assertInputs(); assertOriginalQueue(); }) : undefined;
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
    skipped,
    publishSequence: journals ? channelId => journals.publish("reserve-sequence", () => {
      const sequence = nextIntegrationChannelSequence(params.workspace, channelId); reservedSequences.push({ channelId, sequence }); return sequence;
    }) : undefined
  });
  const deliveries = prepared.deliveries;
  const policiesByChannelId = prepared.policiesByChannelId;

  if (deliveries.length === 0) {
    return {
      dispatched: [],
      queued: [],
      skipped
    };
  }

  let assertOriginalReader = () => {};
  const enqueue = prepareIntegrationEnqueue({ workspace: params.workspace, deliveries }, { beforePublish: () => { assertInputs(); assertOriginalReader(); } });
  if (beforeCommit) assertOriginalReader = captureIntegrationQueueReader(params.workspace);
  assertOriginalQueue = enqueue.assertCurrent;
  const gate = beforeCommit ? enqueue.assertCurrent : undefined;
  const selectedRows = beforeCommit ? captureIntegrationPendingRows(params.workspace, deliveries.map(row => row.channelId), enqueue.assertCurrent) : undefined;
  gate?.();
  const selectedTerminals = beforeCommit ? listIntegrationDeliveriesNeedingFinalization(params.workspace)
    .filter(status => deliveries.some(row => row.channelId === status.channelId)) : undefined;
  const terminalWrites: IntegrationQueueDeliveryStatus[] = [];
  // Empty channel ids are forbidden by the config schema. This Promise schedule spans no SQL/file lock or Sign lock.
  queued = await withChannelProcessingLock(params.workspace, "", enqueue.publish);
  const processingRows = selectedRows ? [...selectedRows, ...enqueue.publishedRows()] : undefined;
  const channelOrder: string[] = [];
  for (const delivery of queued) {
    if (!channelOrder.includes(delivery.channelId)) {
      channelOrder.push(delivery.channelId);
    }
  }

  for (const channelId of channelOrder) {
    const channelPolicy = policiesByChannelId.get(channelId);
    await processChannelQueue({
      workspace: params.workspace,
      channelId,
      policy: channelPolicy, beforeCommit: gate, selectedRows: processingRows, terminalWrites
    });
  }

  skipped.push(...finalizePendingTerminals({
    workspace: params.workspace,
    policiesByChannelId, beforeCommit: gate, journals, statuses: selectedTerminals ? [...selectedTerminals, ...terminalWrites] : undefined
  }));

  gate?.();
  const statuses = getIntegrationDeliveryStatusByQueueIds(
    params.workspace,
    queued.map((row) => row.queueId)
  );
  const statusByQueueId = new Map(statuses.map((row) => [row.queueId, row]));

  const dispatched: IntegrationDispatchResult[] = [];
  const stillQueued: IntegrationQueuedDispatchResult[] = [];
  for (const queuedRow of queued) {
    const status = statusByQueueId.get(queuedRow.queueId);
    if (!status) {
      skipped.push(`${queuedRow.channelId}:dispatch-status-missing`);
      continue;
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

    stillQueued.push({
      queueId: status.queueId,
      channelId: status.channelId,
      eventName: status.eventName,
      payloadSha256: status.payloadSha256,
      orderedSequence: status.orderedSequence,
      attemptRound: status.attemptRound,
      maxRounds: status.maxRounds,
      nextAttemptTs: status.nextAttemptTs
    });
  }

  return {
    dispatched,
    queued: stillQueued,
    skipped
  };
  } catch (cause) {
    if (!beforeCommit) throw cause;
    throw new IntegrationDispatchPartialError(cause, Object.freeze({ reservedSequences: reservedSequences.map(item => ({ ...item })),
      queued: queued.map(item => ({ ...item })), journals: journals?.progress.map(item => ({ ...item })) }));
  }
}

type IntegrationDrainInput = { workspace: string; nowTs?: number; maxChannels?: number };
type IntegrationDrainOutcome = { channelIds: string[]; processed: ProcessedIntegrationDelivery[]; finalizationFailures: string[] };

export async function drainDueIntegrationDeliveries(params: IntegrationDrainInput): Promise<IntegrationDrainOutcome> {
  return drainDueIntegrationDeliveriesAttempt(params);
}

/** Internal maintained scheduler counterpart. Existing queue verification needs no new signing or BUNDLE authority. */
export async function drainDueIntegrationDeliveriesWithAuthority(params: IntegrationDrainInput, beforeCommit: () => void): Promise<IntegrationDrainOutcome> {
  return drainDueIntegrationDeliveriesAttempt(params, beforeCommit);
}

async function drainDueIntegrationDeliveriesAttempt(params: IntegrationDrainInput, beforeCommit?: () => void): Promise<IntegrationDrainOutcome> {
  params = { ...params }; beforeCommit?.();
  const captured = captureIntegrationConfiguration(params.workspace), config = captured.config;
  const assertInputs = beforeCommit ? captureDispatchInputs(params.workspace, config.integrations.channels, beforeCommit, captured.assertCurrent) : captured.assertCurrent;
  const assertReader = beforeCommit ? captureIntegrationQueueReader(params.workspace) : () => {};
  const gate = beforeCommit ? () => { assertInputs(); assertReader(); } : undefined;
  const journals = gate ? captureJournalPublication(params.workspace, gate) : undefined;
  const policiesByChannelId = new Map<string, ChannelDeliveryPolicy>();
  for (const channel of config.integrations.channels) policiesByChannelId.set(channel.id, mergeChannelDeliveryPolicy({
    defaults: config.integrations.defaults.delivery, channel
  }));
  gate?.();
  const channelIds = listDueIntegrationChannelIds({ workspace: params.workspace, nowTs: params.nowTs, limit: params.maxChannels });
  const selectedRows = gate ? captureIntegrationPendingRows(params.workspace, channelIds, gate) : undefined;
  gate?.();
  const selectedTerminals = gate ? listIntegrationDeliveriesNeedingFinalization(params.workspace) : undefined;
  const terminalWrites: IntegrationQueueDeliveryStatus[] = [], processed: ProcessedIntegrationDelivery[] = [];
  try {
    for (const channelId of channelIds) processed.push(...await processChannelQueue({
      workspace: params.workspace, channelId, policy: policiesByChannelId.get(channelId),
      now: typeof params.nowTs === "number" ? () => params.nowTs! : undefined,
      beforeCommit: gate, selectedRows, terminalWrites
    }));
    const finalizationFailures = finalizePendingTerminals({ workspace: params.workspace, policiesByChannelId,
      beforeCommit: gate, journals, statuses: selectedTerminals ? [...selectedTerminals, ...terminalWrites] : undefined });
    gate?.(); return { channelIds, processed, finalizationFailures };
  } catch (cause) {
    if (!gate) throw cause;
    throw new IntegrationDispatchPartialError(cause, Object.freeze({ stage: "integration-drain", processed: processed.map(item => ({ ...item })),
      journals: journals?.progress.map(item => ({ ...item })) }));
  }
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
    queued: IntegrationQueuedDispatchResult[];
    skipped: string[];
  }>;
}> {
  const results: Array<{
    eventName: string;
    agentId: string;
    dispatched: IntegrationDispatchResult[];
    queued: IntegrationQueuedDispatchResult[];
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
      queued: out.queued,
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
}): Promise<IntegrationDispatchOutcome> {
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

/** Internal current-session counterpart for the maintained integration test route. */
export async function dispatchIntegrationTestWithAuthority(params: { workspace: string; channelId?: string }, beforeCommit: () => void): Promise<IntegrationDispatchOutcome> {
  return dispatchIntegrationEventWithAuthority({ workspace: params.workspace, eventName: "INTEGRATION_TEST", agentId: "system",
    summary: "AMC integration test dispatch", details: { source: "amc integrations test" }, forceChannelId: params.channelId }, beforeCommit);
}
