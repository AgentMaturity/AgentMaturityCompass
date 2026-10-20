import { randomUUID } from "node:crypto";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getSigningKey, getPublicKeyHistory } from "../crypto/keys.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { assertOwnerMode } from "../mode/mode.js";
import { readContainedOrNull } from "../utils/containedFs.js";
import { parseDelegation, verifyDelegation } from "../keys/delegation.js";
import { DELEGATION_REL, getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { signingRoute } from "../crypto/signing/signer.js";
import { hashBinaryOrPath, openLedger, verifyEvidenceEventIntegrity } from "../ledger/ledger.js";
import { EgressBlocked } from "../residency/checkEgress.js";
import { boundedFile } from "../standard/externalEvidenceFiles.js";
import {
  anchorReceiptPath, anchorsDir, checkpointNotePath, checkpointNoteText, loadTransparencyConfig, pinnedTransparencyLogs, verifyAnchorReceipt,
  type AnchorReceiptV1, type TransparencyConfig
} from "../transparency/anchors/anchor.js";
import { submitRekorV2Entry } from "../transparency/anchors/rekorV2.js";
import { NOTE_MAX_BYTES, signNote, verifySignedNote } from "../transparency/checkpointNote.js";
import { verifyTransparencyMerkle } from "../transparency/merkleIndexStore.js";
import { merkleCurrentRootPath } from "../transparency/merklePaths.js";
import type { PublicAnchoring } from "../trust/verifierReport.js";
import { loadTrustContext, workspaceSelfTrust, type TrustContext } from "../trust/trustContext.js";
import { localLedgerRowKeys } from "../keys/operationalLedgerReader.js";
import { readOperationalDelegationState } from "../keys/operationalDelegationState.js";
import { verifyOperationalCheckpoints, type DelegationCheckpoint } from "../keys/operationalDelegation.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { boundProviderKey } from "../keys/keyset.js";
import { assertSigningKeyUsable } from "../keys/signingKeys.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { KeyProviderError } from "../keys/provider.js";
import { withDelegationUseLock } from "../keys/delegationUsage.js";
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
  sequence: z.number().int().positive().safe(),
  claimedAt: z.iso.datetime(),
  ledger: z.strictObject({ headEventHash: sha256, eventCount: z.number().int().positive().safe() }),
  transparency: z.strictObject({ root: sha256, leafCount: z.number().int().nonnegative(), algorithm: z.enum(["amc-legacy-v1", "rfc9162-sha256"]) }).nullable(),
  previousCheckpointSha256: sha256.nullable()
});
const checkpointFileSchema = z.strictObject({ checkpoint: checkpointSchema, sha256, signature: z.string().min(1), providerKeyId: sha256.optional() });
export type LedgerCheckpointV1 = z.infer<typeof checkpointSchema>;

export const checkpointsDir = (workspace: string): string => join(workspace, ".amc", "time", "checkpoints");
const tokenPath = (workspace: string, sequence: number): string => join(checkpointsDir(workspace), `${sequence}.tsr`);

interface VerifiedCheckpoint { checkpoint: LedgerCheckpointV1; sha256: string }

/**
 * Every checkpoint, verified whole: contiguous sequences, digests, monitor signatures and previous links. Throws when
 * broken. ponytail: O(checkpoints) signature checks per call; cache the verified prefix if years of checkpoints pile up.
 */
function readCheckpointFiles(workspace: string): { chain: VerifiedCheckpoint[]; authority: DelegationCheckpoint[] } {
  const dir = checkpointsDir(workspace);
  const sequences = (pathExists(dir) ? readdirSync(dir) : []).flatMap(name => /^([1-9][0-9]*)\.json$/.exec(name)?.[1] ?? []).map(Number).sort((a, b) => a - b);
  const authority: DelegationCheckpoint[] = [];
  const chain: VerifiedCheckpoint[] = [];
  for (const [index, sequence] of sequences.entries()) {
    const file = checkpointFileSchema.parse(JSON.parse(boundedFile(join(dir, `${sequence}.json`), 64 * 1024).toString("utf8")) as unknown);
    const digest = sha256Hex(canonicalize(file.checkpoint));
    const broken = sequence !== index + 1 || file.checkpoint.sequence !== sequence ? "sequence gap or mismatch"
      : file.checkpoint.workspaceId !== workspaceIdFromDirectory(workspace) ? "workspace mismatch"
        : digest !== file.sha256 ? "digest invalid"
        : file.checkpoint.previousCheckpointSha256 !== (chain[index - 1]?.sha256 ?? null) ? "previous checkpoint link broken" : null;
    if (broken) throw new Error(`ledger checkpoint ${sequence}: ${broken}`);
    chain.push({ checkpoint: file.checkpoint, sha256: digest });
    authority.push({ sequence, sha256: digest, signature: file.signature, claimedAt: file.checkpoint.claimedAt,
      ...(file.providerKeyId === undefined ? {} : { providerKeyId: file.providerKeyId }) });
  }
  return { chain, authority };
}

export function readCheckpointChain(workspace: string, trust?: TrustContext): VerifiedCheckpoint[] {
  const state = readOperationalDelegationState(workspace);
  const { chain, authority } = readCheckpointFiles(workspace);
  if (chain.length === 0 && state === null) return [];
  const errors = verifyOperationalCheckpoints(state?.chain ?? [], authority,
    localLedgerRowKeys(workspace), trust ?? loadTrustContext({}));
  if (errors.length) throw new Error(`ledger checkpoint authority invalid: ${errors.slice(0, 3).join("; ")}`);
  return chain;
}

/**
 * Internal key-owner migration only, never a public verifier mode. The binder has already opened the matching vault
 * with its passphrase; its captured delegate must equal this generation's local purpose key. An expired canonical v1
 * certificate may be renewed, but it never authorizes a current-clock writer. The new provider-signed v2 cutoff is the
 * final prefix endorsement. Do not export this helper from the package/public verifier entry points.
 */
export function readLegacyCheckpointPrefixForKeyMigration(workspace: string, capturedVaultDelegate: string): VerifiedCheckpoint[] {
  assertOwnerMode(workspace, "keys rotate");
  const bound = boundProviderKey(workspace, "ledger-row");
  const fail = (): never => { throw new KeyProviderError("KEY_DELEGATION_INVALID", bound?.binding.provider ?? "file", "the owner checkpoint migration needs a canonical v1 certificate for the exact bound issuer and captured vault ledger key"); };
  if (bound === null || bound.binding.delegationSha256 !== undefined || capturedVaultDelegate !== getSigningPublicKeyPem(workspace, "ledger-row")) return fail();
  const bytes = readContainedOrNull(workspace, DELEGATION_REL, 64 * 1024);
  if (bytes === null) return fail();
  let signed: ReturnType<typeof parseDelegation>;
  try { signed = parseDelegation(bytes); } catch { return fail(); }
  if (signed.delegation.version !== 1 || signed.delegation.delegatePublicKeyPem !== capturedVaultDelegate) return fail();
  const verdict = verifyDelegation(bytes, { issuerPublicKeyPems: [bound.publicKeyPem], at: new Date(signed.delegation.notBefore) });
  if (!verdict.valid) return fail();
  const { chain, authority } = readCheckpointFiles(workspace);
  const errors = verifyOperationalCheckpoints([], authority, localLedgerRowKeys(workspace), workspaceSelfTrust(workspace));
  if (errors.length) return fail();
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
function verifiedLedgerHead(workspace: string, trust: TrustContext): { count: number; hash: string } {
  const ledger = openLedger(workspace);
  try {
    const head = ledger.db.prepare(`SELECT (SELECT COUNT(*) FROM evidence_events) AS count,
      (SELECT id FROM evidence_events ORDER BY rowid DESC LIMIT 1) AS id,
      (SELECT event_hash FROM evidence_events ORDER BY rowid DESC LIMIT 1) AS hash`).get() as { count: number; id: string | null; hash: string | null };
    if (head.id === null || head.hash === null) throw new Error("the ledger is empty; there is nothing to checkpoint");
    const verified = verifyEvidenceEventIntegrity({ ledger, eventId: head.id, trust });
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
  // Producer-internal input checks may trust the current workspace state; public readers use operator trust.
  const sourceTrust = workspaceSelfTrust(workspace);
  const chain = readCheckpointChain(workspace, sourceTrust);
  const head = verifiedLedgerHead(workspace, sourceTrust);
  const prepared = boundProviderKey(workspace, "ledger-row");
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
  // Provider work is outside the shared synchronous publication lock and before file/TSA side effects.
  const signed = await signWithPurposeKey(workspace, "ledger-row", Buffer.from(digest, "hex"));
  withDelegationUseLock(workspace, () => {
    const current = boundProviderKey(workspace, "ledger-row");
    if (canonicalize(current?.binding ?? null) !== canonicalize(prepared?.binding ?? null)) {
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", signed.provider, "the ledger issuer or delegation changed while the checkpoint was signed");
    }
    const policy = keyPolicy(loadKeysConfig(workspace));
    if (!policy.allowed.includes(signed.algorithm) || (signed.provider === "file" && policy.requireNonExportable)) {
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", signed.provider, "the current key policy refuses the checkpoint signer");
    }
    assertSigningKeyUsable(workspace, "ledger-row", signed.publicKeyPem, signed.provider);
    if (signed.provider === "file" && publicKeyFromPrivate(getSigningKey(workspace, "ledger-row")) !== signed.publicKeyPem) {
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the vault ledger key changed while the checkpoint was signed");
    }
    const latest = readCheckpointChain(workspace, workspaceSelfTrust(workspace)).at(-1);
    if ((latest?.sha256 ?? null) !== checkpoint.previousCheckpointSha256 || (latest?.checkpoint.sequence ?? 0) + 1 !== checkpoint.sequence) {
      throw new Error("the checkpoint head changed while the next checkpoint was signed; retry");
    }
    ensureDir(checkpointsDir(workspace));
    // Omit the optional member for the file provider, preserving existing unbound JSON bytes/order.
    writeFileSync(join(checkpointsDir(workspace), `${checkpoint.sequence}.json`),
      `${JSON.stringify({ checkpoint, sha256: digest, signature: signed.signature.toString("base64"),
        ...(signed.provider === "file" ? {} : { providerKeyId: signed.keyId }) }, null, 2)}\n`,
      { flag: "wx", mode: 0o644 });
  });
  const result = await stampCheckpoint(workspace, { checkpoint, sha256: digest }, trust);
  if (result.status === "pending" && config.required) {
    throw new Error(`time.required: checkpoint ${checkpoint.sequence} has no verified token (${result.failures.join("; ") || "no TSA answered"})`);
  }
  return result;
}

/** Fetches tokens for checkpoints still pending, oldest first. */
export async function completePendingCheckpoints(workspace: string, trust?: TrustContext): Promise<CheckpointResult[]> {
  const results: CheckpointResult[] = [];
  for (const entry of readCheckpointChain(workspace, workspaceSelfTrust(workspace))) {
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

export interface AnchorResult { anchor: string; sequence: number; status: PublicAnchoring["status"] | "failed"; detail: string | null }

/**
 * P1-26: the signed C2SP note for a checkpoint whose transparency tree is RFC 9162, written once to
 * `.amc/transparency/anchors/<sequence>.note`; an existing note must be that text signed by an auditor key.
 */
function checkpointNote(workspace: string, entry: VerifiedCheckpoint): Buffer {
  const { sequence, transparency } = entry.checkpoint;
  if (transparency?.algorithm !== "rfc9162-sha256") {
    throw new Error(`checkpoint ${sequence} covers no RFC 9162 transparency tree; run \`amc transparency merkle rebuild --algorithm rfc9162-sha256\``);
  }
  const text = checkpointNoteText({ workspaceId: entry.checkpoint.workspaceId, sequence, checkpointSha256: entry.sha256,
    treeSize: transparency.leafCount, rootHash: transparency.root });
  const origin = text.slice(0, text.indexOf("\n"));
  const path = checkpointNotePath(workspace, sequence);
  if (pathExists(path)) {
    const existing = boundedFile(path, NOTE_MAX_BYTES);
    if (!getPublicKeyHistory(workspace, "auditor").some(pem => verifySignedNote(existing, { name: origin, publicKeyPem: pem }) === text)) {
      throw new Error(`${path} is not checkpoint ${sequence}'s note signed by an auditor key`);
    }
    return existing;
  }
  // Mirrors signDigestWithPolicy: where the notary must sign Merkle roots, the vault key does not sign their checkpoints.
  if (signingRoute(workspace, "MERKLE_ROOT") === "notary") {
    throw new Error("the trust config requires the notary for MERKLE_ROOT, and a C2SP note needs a raw Ed25519 signature the notary does not make");
  }
  const note = Buffer.from(signNote(text, origin, getSigningKey(workspace, "artifact-seal")), "utf8");
  ensureDir(anchorsDir(workspace));
  writeFileSync(path, note, { flag: "wx", mode: 0o644 });
  return note;
}

async function anchorCheckpoint(workspace: string, entry: VerifiedCheckpoint, anchor: TransparencyConfig["anchors"][number], trust: TrustContext): Promise<AnchorResult> {
  const selected = { name: anchor.name, url: anchor.url, logIds: [...anchor.logIds] };
  const sequence = entry.checkpoint.sequence;
  const result = (status: AnchorResult["status"], detail: string | null): AnchorResult => ({ anchor: selected.name, sequence, status, detail });
  const logs = pinnedTransparencyLogs(trust).filter(log => selected.logIds.includes(log.logId));
  if (!logs.length) return result("failed", `none of its logIds (${selected.logIds.join(", ")}) is in a verified trust list`);
  try {
    const note = checkpointNote(workspace, entry);
    const digest = sha256Hex(note);
    // The token first: a public log entry is permanent, so nothing is submitted that the anchor could not complete.
    const { grant, failures } = await timestampDigest(workspace, digest, trust);
    if (!grant) return result("failed", `no RFC 3161 token for the checkpoint note: ${failures.join("; ") || "no time.tsa configured"}`);
    const response = await submitRekorV2Entry(new URL(selected.url), note, workspace);
    const receipt: AnchorReceiptV1 = { type: "amc.anchor-receipt", version: 1, backend: "rekor-v2", service: selected.url, checkpointSha256: digest,
      submittedAt: new Date().toISOString(), responseB64: response.toString("base64"), timestampTokenB64: grant.tokenDer.toString("base64") };
    const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    // Kept whatever it says: the entry is public now, and a verifier reports a bad anchor instead of never seeing it.
    writeFileSync(anchorReceiptPath(workspace, sequence, selected.name), bytes, { flag: "wx", mode: 0o644 });
    const verified = verifyAnchorReceipt(bytes, note, trust, logs);
    return result(verified.status, verified.detail);
  } catch (error) {
    if (error instanceof EgressBlocked) throw error;
    return result("failed", error instanceof Error ? error.message : String(error));
  }
}

/**
 * P1-26: anchors the newest ledger checkpoint in each log of `transparency.anchors` (`anchorEvery`: every checkpoint,
 * or at most daily per log). A no-op without anchors. Failures are returned unless every selected anchor is denied by
 * residency, which throws the original typed denial. An unanchored checkpoint is retried by a later tick.
 */
export async function anchorCheckpoints(workspace: string, trust?: TrustContext, now = Date.now()): Promise<AnchorResult[]> {
  const config = loadTransparencyConfig(workspace);
  const context = trust ?? loadTrustContext();
  const chain = readCheckpointChain(workspace, context);
  const latest = chain.at(-1);
  if (!config.anchors.length || !latest) return [];
  const results: AnchorResult[] = [];
  let selected = 0;
  let denied = 0;
  let firstDenial: EgressBlocked | undefined;
  for (const anchor of config.anchors) {
    const name = anchor.name;
    if (pathExists(anchorReceiptPath(workspace, latest.checkpoint.sequence, name))) continue;
    const lastAnchored = [...chain].reverse().find(entry => pathExists(anchorReceiptPath(workspace, entry.checkpoint.sequence, name)));
    if (config.anchorEvery === "daily" && lastAnchored && now - Date.parse(lastAnchored.checkpoint.claimedAt) < 86_400_000) continue;
    selected += 1;
    try {
      results.push(await anchorCheckpoint(workspace, latest, anchor, context));
    } catch (error) {
      if (!(error instanceof EgressBlocked)) throw error;
      denied += 1;
      firstDenial ??= error;
      results.push({ anchor: name, sequence: latest.checkpoint.sequence, status: "failed", detail: error.message });
    }
  }
  if (firstDenial && denied === selected) throw firstDenial;
  return results;
}

const inFlight = new Set<string>();

/**
 * One scheduler tick: a no-op unless TSAs are configured; completes pending tokens, checkpoints when due, then
 * anchors the newest checkpoint publicly when `transparency.anchors` asks for it (P1-26).
 */
export async function timeCheckpointTick(workspace: string, now = Date.now()): Promise<{ ran: boolean; anchors: AnchorResult[] }> {
  const config = loadTimeConfig(workspace);
  if (!config.tsa.length || inFlight.has(workspace)) return { ran: false, anchors: [] };
  inFlight.add(workspace);
  try {
    await completePendingCheckpoints(workspace);
    const due = checkpointDue(workspace, config, readCheckpointChain(workspace, workspaceSelfTrust(workspace)).at(-1)?.checkpoint, now);
    if (due) await checkpointLedger(workspace);
    return { ran: due, anchors: await anchorCheckpoints(workspace, undefined, now) };
  } catch (error) {
    if (!(error instanceof EgressBlocked)) throw error;
    console.error(error.message);
    return { ran: false, anchors: [] };
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
  opts: { anchors: readonly TimestampAuthority[]; toleranceMinutes?: number; trust?: TrustContext }): LedgerTimeline {
  const checkpoints: LedgerTimeline["checkpoints"] = [];
  const upper: Array<{ eventCount: number; attested: AttestedTime }> = [];
  const byTokenSha = new Map<string, AttestedTime>();
  for (const { checkpoint, sha256: digest } of readCheckpointChain(workspace, opts.trust)) {
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
