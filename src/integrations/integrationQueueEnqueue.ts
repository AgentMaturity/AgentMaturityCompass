import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import YAML from "yaml";
import { z } from "zod";
import { lstatSync, readFileSync } from "node:fs";
import { integrationsConfigPath, integrationsConfigSigPath } from "./integrationStore.js";
import { integrationsConfigSchema } from "./integrationSchema.js";
import { getSigningKey, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { assertKeysetComplete, boundProviderKey } from "../keys/keyset.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { assertSigningKeyUsable, getSigningPublicKeyPem, getPurposeKeyHistory } from "../keys/signingKeys.js";
import { signingKeyIdentity } from "../keys/algorithmPolicy.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { vaultStatus } from "../vault/vault.js";
import { openIntegrationQueueDb } from "./integrationQueueDb.js";
import type { IntegrationChannelType, IntegrationQueueItemInput, QueuedIntegrationDelivery, IntegrationQueueRow } from "./integrationDeliveryQueue.js";
import { inCheckPass } from "../utils/checkPass.js";

const DEFAULT_MAX_ROUNDS = 3;
function clampMaxRounds(input: number | undefined): number {
  if (!Number.isFinite(input)) {
    return DEFAULT_MAX_ROUNDS;
  }
  return Math.max(1, Math.min(20, Math.floor(input ?? DEFAULT_MAX_ROUNDS)));
}

export function queueBindingDigest(params: {
  queueId: string;
  channelId: string;
  channelType: IntegrationChannelType;
  eventName: string;
  agentId: string;
  payloadSha256: string;
  orderedSequence: number | null;
  maxRounds: number;
  createdTs: number;
}): string {
  return sha256Hex(canonicalize({
    v: 1,
    queueId: params.queueId,
    channelId: params.channelId,
    channelType: params.channelType,
    eventName: params.eventName,
    agentId: params.agentId,
    payloadSha256: params.payloadSha256,
    orderedSequence: params.orderedSequence,
    maxRounds: params.maxRounds,
    createdTs: params.createdTs
  }));
}

type EnqueueInput = { workspace: string; deliveries: IntegrationQueueItemInput[]; nowTs?: number };
function prepareItem(item: IntegrationQueueItemInput, nowTs: number) {
  const queueId = `iq_${randomUUID().replace(/-/g, "")}`, payloadSha256 = sha256Hex(Buffer.from(item.payloadBody, "utf8"));
  const maxRounds = clampMaxRounds(item.maxRounds), orderedSequence = typeof item.orderedSequence === "number" ? item.orderedSequence : null;
  const row = { queueId, channelId: item.channelId, channelType: item.channelType, eventName: item.eventName, agentId: item.agentId,
    payloadBody: item.payloadBody, payloadSha256, orderedSequence, maxRounds, createdTs: nowTs };
  return { ...row, bindingDigest: queueBindingDigest(row) };
}
function insertStatement(db: Database.Database) {
  return db.prepare(`
      INSERT INTO integration_delivery_queue (
        queue_id,
        channel_id,
        channel_type,
        event_name,
        agent_id,
        payload_body,
        payload_sha256,
        ordered_sequence,
        binding_digest,
        binding_signature,
        destination_url,
        destination_ref,
        secret_ref,
        extra_headers_json,
        state,
        attempt_round,
        max_rounds,
        next_attempt_ts,
        created_ts,
        updated_ts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, ?, ?)
    `);
}
function insertItem(insert: ReturnType<typeof insertStatement>, row: ReturnType<typeof prepareItem>, signature: string): QueuedIntegrationDelivery {
  const result = insert.run(row.queueId, row.channelId, row.channelType, row.eventName, row.agentId, row.payloadBody, row.payloadSha256,
    row.orderedSequence, row.bindingDigest, signature, null, null, null, "{}", row.maxRounds, row.createdTs, row.createdTs, row.createdTs);
  return { queueId: row.queueId, channelId: row.channelId, channelType: row.channelType, eventName: row.eventName, agentId: row.agentId,
    payloadSha256: row.payloadSha256, orderedSequence: row.orderedSequence, seq: Number(result.lastInsertRowid), state: "PENDING",
    attemptRound: 0, maxRounds: row.maxRounds, createdTs: row.createdTs, nextAttemptTs: row.createdTs };
}

/** Retained synchronous API body, with only the identical SQL statement prepared by the shared helper. */
export function enqueueIntegrationDeliveries(params: {
  workspace: string;
  deliveries: IntegrationQueueItemInput[];
  nowTs?: number;
}): QueuedIntegrationDelivery[] {
  const nowTs = typeof params.nowTs === "number" ? params.nowTs : Date.now();
  const db = openIntegrationQueueDb(params.workspace);
  try {
    const insert = insertStatement(db);

    const queued: QueuedIntegrationDelivery[] = [];
    const tx = db.transaction(() => {
      for (const item of params.deliveries) {
        const queueId = `iq_${randomUUID().replace(/-/g, "")}`;
        const payloadSha256 = sha256Hex(Buffer.from(item.payloadBody, "utf8"));
        const maxRounds = clampMaxRounds(item.maxRounds);
        const extraHeaders = "{}";
        const bindingDigest = queueBindingDigest({
          queueId,
          channelId: item.channelId,
          channelType: item.channelType,
          eventName: item.eventName,
          agentId: item.agentId,
          payloadSha256,
          orderedSequence: typeof item.orderedSequence === "number" ? item.orderedSequence : null,
          maxRounds,
          createdTs: nowTs
        });
        const bindingSignature = signHexDigest(
          bindingDigest,
          getSigningKey(params.workspace, "artifact-seal")
        );
        const result = insert.run(
          queueId,
          item.channelId,
          item.channelType,
          item.eventName,
          item.agentId,
          item.payloadBody,
          payloadSha256,
          typeof item.orderedSequence === "number" ? item.orderedSequence : null,
          bindingDigest,
          bindingSignature,
          null,
          null,
          null,
          extraHeaders,
          maxRounds,
          nowTs,
          nowTs,
          nowTs
        );
        queued.push({
          queueId,
          channelId: item.channelId,
          channelType: item.channelType,
          eventName: item.eventName,
          agentId: item.agentId,
          payloadSha256,
          orderedSequence: typeof item.orderedSequence === "number" ? item.orderedSequence : null,
          seq: Number(result.lastInsertRowid),
          state: "PENDING",
          attemptRound: 0,
          maxRounds,
          createdTs: nowTs,
          nextAttemptTs: nowTs
        });
      }
    });
    tx();

    return queued;
  } finally {
    db.close();
  }
}

/** Native cause and known returned effects survive an interrupted best-effort dispatch. */
export class IntegrationDispatchPartialError extends Error {
  constructor(cause: unknown, readonly progress: Readonly<Record<string, unknown>>) {
    super("Integration publication interrupted; earlier effects may remain", { cause }); this.name = "IntegrationDispatchPartialError";
  }
}

/** Internal negative authority refusal. Earlier native effects remain facts; no rollback is implied. */
export class IntegrationAuthorityRefused extends IntegrationDispatchPartialError {
  constructor(cause: unknown, progress: Readonly<Record<string, unknown>>) {
    super(cause, progress);
    this.name = "IntegrationAuthorityRefused";
  }
}

/** Fixed raw artifact-seal authority; never routes queue bindings through BUNDLE policy. */
export function captureIntegrationQueueAuthority(workspace: string): () => void {
  const purpose = capturePurposePublication(workspace, "artifact-seal");
  const selected = boundProviderKey(workspace, "artifact-seal"), holder = selected?.binding.provider ?? "file";
  const publicKey = selected?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "artifact-seal");
  const identity = signingKeyIdentity(publicKey), config = canonicalize(loadKeysConfig(workspace));
  if (identity === null) throw new Error("integration queue signing key is invalid");
  const assertCurrent = inCheckPass(() => {
    if (canonicalize(assertKeysetComplete(workspace)) !== purpose.keyset || canonicalize(loadKeysConfig(workspace)) !== config)
      throw new Error("integration queue original signing authority changed");
    const policy = keyPolicy(loadKeysConfig(workspace));
    if (!policy.allowed.includes(identity.algorithm) || (holder === "file" && policy.requireNonExportable))
      throw new Error("integration queue signing policy refuses the original key");
    assertSigningKeyUsable(workspace, "artifact-seal", publicKey, holder);
    if (holder === "file" && (!vaultStatus(workspace).unlocked || publicKeyFromPrivate(getSigningKey(workspace, "artifact-seal")) !== publicKey))
      throw new Error("integration queue original vault key is unavailable");
  });
  assertCurrent(); return assertCurrent;
}

/** Fixed read admission for existing queue bindings, without signing, vault unlock or a BUNDLE route. */
export function captureIntegrationQueueReader(workspace: string): () => void {
  const state = () => canonicalize({ keyset: assertKeysetComplete(workspace), keys: loadKeysConfig(workspace),
    history: getPurposeKeyHistory(workspace, "artifact-seal") });
  const original = state();
  return () => { if (state() !== original) throw new Error("integration queue original verification authority changed"); };
}

/** Same bytes are verified and parsed. Existing auditor-history config admission is retained. */
export function captureIntegrationConfiguration(workspace: string) {
  const path = integrationsConfigPath(workspace), sidecar = integrationsConfigSigPath(workspace);
  const mode = (file: string) => { const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("integration config target is not a regular file");
    return stat.mode & 0o7777; };
  const bodyMode = mode(path), signatureMode = mode(sidecar), bytes = readFileSync(path), signatureBytes = readFileSync(sidecar);
  const signature = z.object({ digestSha256: z.string().length(64), signature: z.string().min(1),
    signedTs: z.number().int(), signer: z.literal("auditor") }).parse(JSON.parse(signatureBytes.toString("utf8")));
  const digest = sha256Hex(bytes), config = integrationsConfigSchema.parse(YAML.parse(bytes.toString("utf8")));
  const assertCurrent = inCheckPass(() => {
    if (mode(path) !== bodyMode || mode(sidecar) !== signatureMode || !bytes.equals(readFileSync(path)) || !signatureBytes.equals(readFileSync(sidecar)) || signature.digestSha256 !== digest
      || !verifyHexDigestAny(digest, signature.signature, getPublicKeyHistory(workspace, "auditor")))
      throw new Error("integration configuration changed or no longer verifies");
  });
  assertCurrent(); return { config, assertCurrent };
}

/** Freeze logical rows and original purpose authority synchronously, before an outer channel schedule can await. */
export function prepareIntegrationEnqueue(params: EnqueueInput, options: { beforePublish?: () => void } = {}) {
  const input: EnqueueInput = { workspace: params.workspace, nowTs: params.nowTs, deliveries: params.deliveries.map(item => ({ ...item,
    extraHeaders: item.extraHeaders ? { ...item.extraHeaders } : undefined })) }, beforePublish = options.beforePublish;
  beforePublish?.();
  const original = input.deliveries.length === 0 ? () => {} : captureIntegrationQueueAuthority(input.workspace);
  const captured = input.deliveries.length === 0 ? null : capturePurposePublication(input.workspace, "artifact-seal");
  const nowTs = typeof input.nowTs === "number" ? input.nowTs : Date.now(), rows = input.deliveries.map(item => prepareItem(item, nowTs));
  const assertCurrent = inCheckPass(() => { beforePublish?.(); original(); });
  let publishedRows: IntegrationQueueRow[] = [];
  return { publishedRows: () => publishedRows.map(row => ({ ...row })), queueIds: Object.freeze(rows.map(row => row.queueId)), assertCurrent, publish: async (): Promise<QueuedIntegrationDelivery[]> => {
    assertCurrent();
    if (rows.length === 0) {
      const db = openIntegrationQueueDb(input.workspace); try { return []; } finally { db.close(); }
    }
    // Avoid the eager queue -> provider -> boundary -> ledger -> dispatcher cycle. No lock spans Sign.
    const { signWithPurposeKey } = await import("../keys/purposeProviders.js");
    assertCurrent();
    const signatures: Awaited<ReturnType<typeof signWithPurposeKey>>[] = [];
    const beforeSign = () => {
      assertCurrent();
      for (const signed of signatures) assertPurposePublicationCurrent(input.workspace, captured!, signed);
    };
    for (const row of rows) {
      beforeSign();
      const signed = await signWithPurposeKey(input.workspace, "artifact-seal", Buffer.from(row.bindingDigest, "hex"), { beforeSign });
      assertCurrent(); assertPurposePublicationCurrent(input.workspace, captured!, signed); signatures.push(signed);
    }
    assertCurrent(); // The opener may create/migrate/scrub the database, before the insert transaction.
    const db = openIntegrationQueueDb(input.workspace);
    try {
      const committed = db.transaction(() => {
        assertCurrent();
        for (const signed of signatures) assertPurposePublicationCurrent(input.workspace, captured!, signed);
        // New UUID targets must still be absent. This CAS is last, after the negative callback and original authority.
        const exists = db.prepare("SELECT queue_id FROM integration_delivery_queue WHERE queue_id = ?");
        for (const row of rows) if (exists.get(row.queueId)) throw new Error("integration queue target already exists");
        const insert = insertStatement(db);
        const queued = rows.map((row, index) => insertItem(insert, row, signatures[index]!.signature.toString("base64")));
        // Observe only this transaction's own returned writes; no new caller input or authority is adopted.
        const written = rows.map(row => db.prepare("SELECT * FROM integration_delivery_queue WHERE queue_id = ?").get(row.queueId) as IntegrationQueueRow);
        return { queued, written };
      }).immediate();
      publishedRows = committed.written; return committed.queued;
    } finally { db.close(); }
  } };
}

/** New immutable rows and signatures are prepared outside SQL/OS publication locks. */
export async function enqueueIntegrationDeliveriesAsync(params: EnqueueInput, options: { beforePublish?: () => void } = {}): Promise<QueuedIntegrationDelivery[]> {
  return prepareIntegrationEnqueue(params, options).publish();
}
