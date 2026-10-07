import { randomUUID } from "node:crypto";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { hashBinaryOrPath, openLedger, verifyEvidenceEventIntegrity } from "../ledger/ledger.js";
import { boundedFile } from "../standard/externalEvidenceFiles.js";
import { verifyTransparencyMerkle } from "../transparency/merkleIndexStore.js";
import { merkleCurrentRootPath } from "../transparency/merklePaths.js";
import type { TrustContext } from "../trust/trustContext.js";
import type { TimestampAuthority } from "../trust/trustList.js";
import type { EvidenceEvent } from "../types.js";
import { ensureDir, pathExists } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { evaluateTime, type AttestedTime, type TimeEvidence, type TimeFinding } from "./timeEvidence.js";
import { loadTimeConfig, timestampDigest, type TimeConfig } from "./tsaClient.js";
import { TIMESTAMP_TOKEN_MAX_BYTES, verifyTimestampToken } from "./verifyTimestamp.js";

/**
 * Ledger checkpoints (P1-25). A checkpoint commits to the ledger head and the transparency root, links to the
 * previous checkpoint and is signed with the ledger-row (monitor) key. An RFC 3161 token over its digest bounds every
 * event it covers from above; the `time/checkpoint` event recorded once the token arrives holds the token's digest, so
 * every later event chains through it and cannot predate genTime. Appends never wait on a TSA: a checkpoint without a
 * token stays pending until a later tick fetches one.
 */
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const checkpointSchema = z.strictObject({
  type: z.literal("amc.ledger-checkpoint"),
  version: z.literal(1),
  workspaceId: z.string(),
  sequence: z.number().int().positive(),
  claimedAt: z.iso.datetime(),
  ledger: z.strictObject({ headEventHash: sha256, eventCount: z.number().int().positive() }),
  transparency: z.strictObject({ root: sha256, leafCount: z.number().int().nonnegative(), algorithm: z.enum(["amc-legacy-v1", "rfc9162-sha256"]) }).nullable(),
  previousCheckpointSha256: sha256.nullable()
});
const checkpointFileSchema = z.strictObject({ checkpoint: checkpointSchema, sha256, signature: z.string().min(1) });
export type LedgerCheckpointV1 = z.infer<typeof checkpointSchema>;

export const checkpointsDir = (workspace: string): string => join(workspace, ".amc", "time", "checkpoints");
const tokenPath = (workspace: string, sequence: number): string => join(checkpointsDir(workspace), `${sequence}.tsr`);

interface VerifiedCheckpoint { checkpoint: LedgerCheckpointV1; sha256: string }

/**
 * Every checkpoint, verified whole: contiguous sequences, digests, monitor signatures and previous links. Throws when
 * broken. ponytail: O(checkpoints) signature checks per call; cache the verified prefix if years of checkpoints pile up.
 */
export function readCheckpointChain(workspace: string): VerifiedCheckpoint[] {
  const dir = checkpointsDir(workspace);
  if (!pathExists(dir)) return [];
  const sequences = readdirSync(dir).flatMap(name => /^([1-9][0-9]*)\.json$/.exec(name)?.[1] ?? []).map(Number).sort((a, b) => a - b);
  const monitorKeys = getPublicKeyHistory(workspace, "monitor");
  const chain: VerifiedCheckpoint[] = [];
  for (const [index, sequence] of sequences.entries()) {
    const file = checkpointFileSchema.parse(JSON.parse(boundedFile(join(dir, `${sequence}.json`), 64 * 1024).toString("utf8")) as unknown);
    const digest = sha256Hex(canonicalize(file.checkpoint));
    const broken = sequence !== index + 1 || file.checkpoint.sequence !== sequence ? "sequence gap or mismatch"
      : digest !== file.sha256 || !verifyHexDigestAny(digest, file.signature, monitorKeys) ? "digest or monitor signature invalid"
        : file.checkpoint.previousCheckpointSha256 !== (chain[index - 1]?.sha256 ?? null) ? "previous checkpoint link broken" : null;
    if (broken) throw new Error(`ledger checkpoint ${sequence}: ${broken}`);
    chain.push({ checkpoint: file.checkpoint, sha256: digest });
  }
  return chain;
}

function appendCheckpointEvent(workspace: string, meta: { checkpointSequence: number; checkpointSha256: string; tokenSha256: string }): void {
  const ledger = openLedger(workspace);
  try {
    const sessionId = randomUUID();
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "amc-time-checkpoint", binarySha256: hashBinaryOrPath("amc-time-checkpoint", "1") });
    ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "time/checkpoint", payload: canonicalize(meta), payloadExt: "json", inline: true, meta });
    ledger.sealSession(sessionId);
  } finally {
    ledger.close();
  }
}

/**
 * The head (count and hash, read in one statement) after the ledger prefix up to it verifies.
 * ponytail: re-verifies from genesis each checkpoint (O(events)); start from the previous checkpoint's head if large
 * ledgers make the scheduler tick slow.
 */
function verifiedLedgerHead(workspace: string): { count: number; hash: string } {
  const ledger = openLedger(workspace);
  try {
    const head = ledger.db.prepare(`SELECT (SELECT COUNT(*) FROM evidence_events) AS count,
      (SELECT id FROM evidence_events ORDER BY rowid DESC LIMIT 1) AS id,
      (SELECT event_hash FROM evidence_events ORDER BY rowid DESC LIMIT 1) AS hash`).get() as { count: number; id: string | null; hash: string | null };
    if (head.id === null || head.hash === null) throw new Error("the ledger is empty; there is nothing to checkpoint");
    const verified = verifyEvidenceEventIntegrity({ ledger, eventId: head.id });
    if (!verified.ok) throw new Error(`the ledger does not verify up to its head: ${verified.errors.slice(0, 3).join("; ")}`);
    return { count: head.count, hash: head.hash };
  } finally {
    ledger.close();
  }
}

export interface CheckpointResult { sequence: number; status: "timestamped" | "pending"; failures: string[] }

async function stampCheckpoint(workspace: string, entry: VerifiedCheckpoint, trust?: TrustContext): Promise<CheckpointResult> {
  const { sequence } = entry.checkpoint;
  const { grant, failures } = await timestampDigest(workspace, entry.sha256, trust);
  if (!grant) return { sequence, status: "pending", failures };
  // Event first: if the token file then fails to land, the checkpoint stays pending and a later tick retries; an
  // event naming a token nobody stored only bounds nothing.
  appendCheckpointEvent(workspace, { checkpointSequence: sequence, checkpointSha256: entry.sha256, tokenSha256: sha256Hex(grant.tokenDer) });
  writeFileSync(tokenPath(workspace, sequence), grant.tokenDer, { flag: "wx", mode: 0o644 });
  return { sequence, status: "timestamped", failures };
}

/**
 * Writes the next checkpoint over the verified ledger head and asks the configured TSAs for a token. Without one it
 * stays pending; with `time.required` that also throws. The previous checkpoints and the ledger prefix up to the head
 * are verified before anything is written.
 */
export async function checkpointLedger(workspace: string, trust?: TrustContext): Promise<CheckpointResult> {
  const config = loadTimeConfig(workspace);
  if (!config.tsa.length) throw new Error("ledger checkpoints need at least one time.tsa entry in .amc/amc.config.yaml");
  const chain = readCheckpointChain(workspace);
  const head = verifiedLedgerHead(workspace);
  let transparency: LedgerCheckpointV1["transparency"] = null;
  if (pathExists(merkleCurrentRootPath(workspace))) {
    const merkle = verifyTransparencyMerkle(workspace);
    if (!merkle.ok || merkle.root === null || merkle.algorithm === null) throw new Error(`the transparency root does not verify: ${merkle.errors.join("; ")}`);
    transparency = { root: merkle.root, leafCount: merkle.leafCount, algorithm: merkle.algorithm };
  }
  const previous = chain[chain.length - 1];
  const checkpoint: LedgerCheckpointV1 = {
    type: "amc.ledger-checkpoint", version: 1, workspaceId: workspaceIdFromDirectory(workspace), sequence: (previous?.checkpoint.sequence ?? 0) + 1,
    claimedAt: new Date().toISOString(), ledger: { headEventHash: head.hash, eventCount: head.count }, transparency,
    previousCheckpointSha256: previous?.sha256 ?? null
  };
  const digest = sha256Hex(canonicalize(checkpoint));
  ensureDir(checkpointsDir(workspace));
  // "wx": a concurrent writer of the same sequence fails here instead of forking the chain.
  writeFileSync(join(checkpointsDir(workspace), `${checkpoint.sequence}.json`),
    `${JSON.stringify({ checkpoint, sha256: digest, signature: signHexDigest(digest, getPrivateKeyPem(workspace, "monitor")) }, null, 2)}\n`,
    { flag: "wx", mode: 0o644 });
  const result = await stampCheckpoint(workspace, { checkpoint, sha256: digest }, trust);
  if (result.status === "pending" && config.required) {
    throw new Error(`time.required: checkpoint ${checkpoint.sequence} has no verified token (${result.failures.join("; ") || "no TSA answered"})`);
  }
  return result;
}

/** Fetches tokens for checkpoints still pending, oldest first. */
export async function completePendingCheckpoints(workspace: string, trust?: TrustContext): Promise<CheckpointResult[]> {
  const results: CheckpointResult[] = [];
  for (const entry of readCheckpointChain(workspace)) {
    if (!pathExists(tokenPath(workspace, entry.checkpoint.sequence))) results.push(await stampCheckpoint(workspace, entry, trust));
  }
  return results;
}

/** Due after `everyEvents` new events or `everyMinutes` since the last checkpoint, never for checkpoint rows alone. */
function checkpointDue(workspace: string, config: TimeConfig, last: LedgerCheckpointV1 | undefined, now: number): boolean {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    const { n } = ledger.db.prepare(`SELECT COUNT(*) AS n FROM evidence_events WHERE event_type != 'time/checkpoint'
      AND rowid > COALESCE((SELECT rowid FROM evidence_events WHERE event_hash = ?), 0)`).get(last?.ledger.headEventHash ?? null) as { n: number };
    return n > 0 && (!last || n >= config.checkpoint.everyEvents || now - Date.parse(last.claimedAt) >= config.checkpoint.everyMinutes * 60_000);
  } finally {
    ledger.close();
  }
}

const inFlight = new Set<string>();

/** One scheduler tick: a no-op unless TSAs are configured; completes pending tokens, then checkpoints when due. */
export async function timeCheckpointTick(workspace: string, now = Date.now()): Promise<{ ran: boolean }> {
  const config = loadTimeConfig(workspace);
  if (!config.tsa.length || inFlight.has(workspace)) return { ran: false };
  inFlight.add(workspace);
  try {
    await completePendingCheckpoints(workspace);
    const due = checkpointDue(workspace, config, readCheckpointChain(workspace).at(-1)?.checkpoint, now);
    if (due) await checkpointLedger(workspace);
    return { ran: due };
  } finally {
    inFlight.delete(workspace);
  }
}

export interface LedgerTimeline {
  checkpoints: Array<{ sequence: number; status: "timestamped" | "pending" | "invalid"; genTime: string | null; detail: string | null }>;
  /** Time evidence for the event at `index` (0-based, ledger order) that claims `claimedTs`. */
  eventTime(index: number, claimedTs: number): { time: TimeEvidence; findings: TimeFinding[] };
}

/**
 * Attested windows for ledger events, offline. `events` must come from a ledger whose chain the caller verified; each
 * token is read once, verified against `anchors` and used only from those bytes. An event is bounded above by the
 * earliest-genTime checkpoint covering it and below by the latest `time/checkpoint` row before it whose token verified.
 */
export function ledgerTimeline(workspace: string, events: ReadonlyArray<Pick<EvidenceEvent, "event_hash" | "event_type" | "meta_json">>,
  opts: { anchors: readonly TimestampAuthority[]; toleranceMinutes?: number }): LedgerTimeline {
  const checkpoints: LedgerTimeline["checkpoints"] = [];
  const upper: Array<{ eventCount: number; attested: AttestedTime }> = [];
  const byTokenSha = new Map<string, AttestedTime>();
  for (const { checkpoint, sha256: digest } of readCheckpointChain(workspace)) {
    const row = { sequence: checkpoint.sequence, genTime: null as string | null, detail: null as string | null };
    if (!pathExists(tokenPath(workspace, checkpoint.sequence))) { checkpoints.push({ ...row, status: "pending" }); continue; }
    const token = boundedFile(tokenPath(workspace, checkpoint.sequence), TIMESTAMP_TOKEN_MAX_BYTES);
    const verified = verifyTimestampToken({ token, expectedDigestHex: digest, anchors: opts.anchors });
    const headMismatch = events[checkpoint.ledger.eventCount - 1]?.event_hash !== checkpoint.ledger.headEventHash;
    if (!verified.ok || headMismatch) {
      checkpoints.push({ ...row, status: "invalid", detail: verified.ok ? "the checkpoint head is not this ledger's event" : `${verified.code}: ${verified.detail}` });
      continue;
    }
    checkpoints.push({ ...row, status: "timestamped", genTime: verified.attested.genTime });
    upper.push({ eventCount: checkpoint.ledger.eventCount, attested: verified.attested });
    byTokenSha.set(sha256Hex(token), verified.attested);
  }
  const lower: Array<{ index: number; attested: AttestedTime }> = [];
  events.forEach((event, index) => {
    if (event.event_type !== "time/checkpoint") return;
    const tokenSha = (JSON.parse(event.meta_json) as { tokenSha256?: unknown }).tokenSha256;
    const attested = typeof tokenSha === "string" ? byTokenSha.get(tokenSha) : undefined;
    if (attested) lower.push({ index, attested });
  });
  // The tightest bounds: the earliest genTime above, the latest genTime below.
  const pick = (rows: AttestedTime[], sign: 1 | -1) => rows.sort((a, b) => sign * (Date.parse(a.genTime) - Date.parse(b.genTime)))[0] ?? null;
  return {
    checkpoints,
    eventTime: (index, claimedTs) => evaluateTime({
      claimedAt: claimedTs, toleranceMinutes: opts.toleranceMinutes,
      upper: pick(upper.filter(row => row.eventCount > index).map(row => row.attested), 1),
      lower: pick(lower.filter(row => row.index < index).map(row => row.attested), -1)
    })
  };
}
