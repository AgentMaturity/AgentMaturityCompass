import { z } from "zod";
import { signDigestWithPolicyAsync, describePolicySigner, assertPolicySignerCurrent } from "../crypto/signing/signer.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { boundProviderKey } from "../keys/keyset.js";
import { signingKeyId } from "../keys/algorithmPolicy.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { orgSignatureSchema } from "../org/orgSchema.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { loadSessionEventHistory } from "../session/sessionEventHistory.js";
import { selectForkPrefix } from "../session/forkConversation.js";
import { extractEnvelope } from "../session/sessionTypes.js";
import { merkleRoot, SESSION_MERKLE_EMPTY } from "../session/sessionMerkle.js";
import { containedExists, ensureContainedDir, listContainedDir, readContained, writeContained } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

const directory = ".amc/native-bookmarks";
const nameSchema = z.string().min(1, "Invalid bookmark name").max(80, "Invalid bookmark name").refine(name => name === name.trim() && !/[\x00-\x1f\x7f-\x9f]/.test(name), "Invalid bookmark name");
const bookmarkSchema = z.object({
  format: z.literal("amc-native-bookmark-v1"), name: nameSchema,
  sessionId: z.string().min(1), turn: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sealEventId: z.string().min(1), sealEventHash: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();
const fileSchema = z.object({ record: bookmarkSchema, signature: orgSignatureSchema }).strict();
export type NativeInteractiveBookmark = z.infer<typeof bookmarkSchema>;
const relativePath = (name: string) => `${directory}/${sha256Hex(nameSchema.parse(name))}.json`;

/** A bookmark is navigation metadata, never context or authority to acquire a writer. */
function verifiedTurn(workspace: string, sessionId: string, turn?: number, expected?: NativeInteractiveBookmark) {
  const history = loadSessionEventHistory({ workspace, sessionId, verifyPayloads: true });
  if (history.events[0]?.runtime !== "amc") throw new Error("Bookmarks require native session history.");
  const selectedTurn = turn ?? extractEnvelope(history.events.filter(row => row.event_type === "turn/seal").at(-1)?.meta_json ?? "")?.turn;
  if (typeof selectedTurn !== "number" || !Number.isSafeInteger(selectedTurn) || selectedTurn < 1) throw new Error("Bookmark requires a complete sealed turn.");
  // This existing selector refuses ambiguous, incomplete and recovery turn boundaries.
  const prefix = selectForkPrefix(history.events, selectedTurn).rows;
  const seal = prefix.at(-1)!;
  const first = prefix.findIndex(row => row.event_type === "turn/start" && extractEnvelope(row.meta_json)?.turn === selectedTurn);
  const window = prefix.slice(first, -1);
  const meta = JSON.parse(seal.meta_json) as Record<string, unknown>;
  const previous = prefix.slice(0, first).filter(row => row.event_type === "turn/seal");
  const prior = previous.at(-1);
  if (seal.event_type !== "turn/seal" || window.length === 0
    || meta.window_first_event_id !== window[0]!.id || meta.window_last_event_id !== window.at(-1)!.id
    || meta.window_event_count !== window.length || meta.window_merkle_root !== merkleRoot(window.map(row => row.event_hash))
    || meta.prev_seal_event_id !== (prior?.id ?? null)
    || meta.prev_seal_merkle_root !== (prior ? (JSON.parse(prior.meta_json) as Record<string, unknown>).window_merkle_root : SESSION_MERKLE_EMPTY)
    || meta.seal_chain_index !== previous.length) throw new Error("Bookmark turn seal failed verification.");
  if (expected !== undefined && (seal.id !== expected.sealEventId || seal.event_hash !== expected.sealEventHash)) {
    throw new Error("Bookmark target no longer matches its signed turn seal.");
  }
  return { seal, turn: selectedTurn, events: [...window, seal] };
}

function readBookmark(workspace: string, filename: string): NativeInteractiveBookmark {
  if (!/^[a-f0-9]{64}\.json$/.test(filename)) throw new Error("Invalid bookmark record filename.");
  const bytes = readContained(workspace, `${directory}/${filename}`, 64 * 1024);
  const file = fileSchema.parse(JSON.parse(bytes.toString("utf8")));
  const verdict = verifyAuditorSignatureBytes(workspace, "BUNDLE", Buffer.from(canonicalize(file.record)), Buffer.from(JSON.stringify(file.signature)));
  if (!verdict.valid) throw new Error("Bookmark signature failed verification.");
  if (filename !== `${sha256Hex(file.record.name)}.json`) throw new Error("Bookmark filename does not match its signed name.");
  return Object.freeze(file.record);
}

/** Missing collection is empty; present invalid records refuse the whole listing. */
export function listNativeInteractiveBookmarks(workspace: string): NativeInteractiveBookmark[] {
  return listContainedDir(workspace, directory).map(filename => readBookmark(workspace, filename))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createNativeInteractiveBookmark(workspace: string, input: { name: string; sessionId: string; turn?: number }): Promise<NativeInteractiveBookmark> {
  const name = nameSchema.parse(input.name), path = relativePath(name);
  if (containedExists(workspace, path)) throw new Error("Bookmark name already exists; choose another name.");
  const target = verifiedTurn(workspace, input.sessionId, input.turn);
  const record = bookmarkSchema.parse({ format: "amc-native-bookmark-v1", name, sessionId: input.sessionId, turn: target.turn,
    sealEventId: target.seal.id, sealEventHash: target.seal.event_hash });
  const selectedSigner = describePolicySigner(workspace, "BUNDLE"), policy = canonicalize(loadTrustConfig(workspace));
  const purpose = selectedSigner.mode === "VAULT" ? { authority: capturePurposePublication(workspace, "artifact-seal"),
    provider: boundProviderKey(workspace, "artifact-seal")?.binding.provider ?? "file" as const } : null;
  const signature = await signDigestWithPolicyAsync({ workspace, kind: "BUNDLE", digestHex: sha256Hex(canonicalize(record)), expectedSigner: selectedSigner });
  return withControlFileLock({ root: ensureContainedDir(workspace, ".amc"), name: "bookmarks", operation: () => {
    assertPolicySignerCurrent(workspace, selectedSigner);
    if (canonicalize(loadTrustConfig(workspace)) !== policy) throw new Error("Bookmark signing policy changed before publication.");
    if (purpose !== null) assertPurposePublicationCurrent(workspace, purpose.authority, {
      provider: purpose.provider, algorithm: selectedSigner.algorithm, keyId: signingKeyId(selectedSigner.publicKeyPem)!,
      publicKeyPem: selectedSigner.publicKeyPem, signature: Buffer.from(signature.signature, "base64")
    });
    verifiedTurn(workspace, record.sessionId, record.turn, record);
    if (containedExists(workspace, path)) throw new Error("Bookmark name already exists; choose another name.");
    writeContained(workspace, path, JSON.stringify({ record, signature }, null, 2), 0o600);
    return Object.freeze(record);
  } });
}

export function navigateNativeInteractiveBookmark(workspace: string, name: string, expected?: NativeInteractiveBookmark) {
  if (!containedExists(workspace, relativePath(name))) throw new Error("Bookmark is missing.");
  const bookmark = readBookmark(workspace, `${sha256Hex(name)}.json`);
  if (expected !== undefined && canonicalize(bookmark) !== canonicalize(expected)) throw new Error("Bookmark changed since selection; inspect the list again.");
  return { bookmark, events: verifiedTurn(workspace, bookmark.sessionId, bookmark.turn, bookmark).events };
}
