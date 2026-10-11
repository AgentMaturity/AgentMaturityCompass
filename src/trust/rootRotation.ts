/**
 * Trust-list root-set rotation (P1-08). `<AMC home>/trust/trust-roots.json` names a root set (`rootSetId`), its roots and
 * its threshold. A rotation is one signed `amc.root-rotation` statement:
 *
 *   { "statement": { "type": "amc.root-rotation", "version": 1, "rootSetId": "acme-roots", "sequence": 3,
 *       "previousSha256": "<sha256 of rotation 2's bytes>", "previousRoots": [...], "previousThreshold": 2,
 *       "newRoots": [...], "newThreshold": 2, "newRootPublicKeyPems": [...], "allowDecrease": false, "issuedAt": "..." },
 *     "signatures": [ { "by": "current" | "new", "keyId": "<64 hex>", "signature": "<base64>" } ] }
 *
 * The signed bytes are `amc.root-rotation/v1`, 0x00 and the canonical statement. It is authorized only by `previousThreshold`
 * distinct signatures from the CURRENT root set (the one this machine pinned and its verified chain names); the new set
 * proves possession with `newThreshold` distinct signatures of its own keys. A smaller threshold or set needs
 * `allowDecrease: true`, signed by the current set; a threshold below 2, an empty set or duplicate keys are refused. Each
 * statement names the previous one by digest and carries the next sequence, so replaying an applied rotation or forking
 * from an older set fails. Applied statements are kept outside the trust directory, in
 * `<AMC home>/state/root-rotations/<rootSetId>/<sequence>.json`, and the latest one is anchored by this machine's
 * high-water mark: once a rotation was applied, trust-roots.json must equal what that signed statement installed.
 */
import { createPublicKey, sign, verify } from "node:crypto";
import { z } from "zod";
import { resolveAmcHome } from "../credentials/credentialsPaths.js";
import { carryHighWaterMarks, compareHighWater, highWaterIds, highWaterKey, readHighWater, recordHighWater } from "../keys/highWater.js";
import { containedExists, listContainedDir, readContained, readContainedOrNull, writeContained } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize, isCanonicalSignatureBase64, parseCanonicalJson } from "../utils/json.js";
import { canonicalEd25519Pem, ed25519KeyId, parseTrustJson, parseTrustValue, TrustListError } from "./trustList.js";

const DOMAIN = "amc.root-rotation/v1";
const keyIdSchema = z.string().regex(/^[0-9a-f]{64}$/);
const setIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
const rootSet = z.array(keyIdSchema).min(2).max(64).refine(roots => new Set(roots).size === roots.length, "roots must be unique");

const trustRootsSchema = z.strictObject({
  type: z.literal("amc.trust-roots"),
  version: z.literal(1),
  roots: z.array(keyIdSchema).min(1).refine(roots => new Set(roots).size === roots.length, "roots must be unique"),
  /** P1-08: `threshold` (default 1) distinct pinned roots must sign each list (m-of-n). */
  threshold: z.number().int().positive().optional(),
  /** P1-08: names the root set, so a rotation for another set never applies here. Needed to rotate. */
  rootSetId: setIdSchema.optional()
}).refine(file => (file.threshold ?? 1) <= file.roots.length, "threshold cannot exceed the number of roots");
export type TrustRoots = z.infer<typeof trustRootsSchema>;

const statementSchema = z.strictObject({
  type: z.literal("amc.root-rotation"),
  version: z.literal(1),
  rootSetId: setIdSchema,
  sequence: z.number().int().positive().safe(),
  previousSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  previousRoots: z.array(keyIdSchema).min(1).max(64).refine(roots => new Set(roots).size === roots.length, "roots must be unique"),
  previousThreshold: z.number().int().positive(),
  newRoots: rootSet,
  newThreshold: z.number().int().min(2, "a root set needs a threshold of at least 2").max(64),
  newRootPublicKeyPems: z.array(z.string().min(1).max(4096).refine(pem => canonicalEd25519Pem(pem) === pem, "canonical Ed25519 SPKI PEM")).max(64),
  allowDecrease: z.boolean(),
  issuedAt: z.iso.datetime().refine(value => new Date(value).toISOString() === value, "time must be in toISOString form")
}).refine(statement => statement.newThreshold <= statement.newRoots.length, "newThreshold cannot exceed the number of new roots")
  .refine(statement => statement.newRootPublicKeyPems.length === statement.newRoots.length
    && statement.newRootPublicKeyPems.every((pem, index) => ed25519KeyId(pem) === statement.newRoots[index]), "newRootPublicKeyPems must be the new roots' keys, in order");
const ROLE_ORDER = ["current", "new"] as const;
const rowSchema = z.strictObject({ by: z.enum(ROLE_ORDER), keyId: keyIdSchema, signature: z.string().refine(isCanonicalSignatureBase64, "canonical base64") });
type Row = z.infer<typeof rowSchema>;
const rowOrder = (a: Row, b: Row) => ROLE_ORDER.indexOf(a.by) - ROLE_ORDER.indexOf(b.by) || a.keyId.localeCompare(b.keyId);
const signedSchema = z.strictObject({
  statement: statementSchema,
  signatures: z.array(rowSchema).max(128).refine(rows => rows.every((row, index) => index === 0 || rowOrder(rows[index - 1]!, row) < 0),
    "signatures sorted by role then key id, one per key and role")
});
export type RootRotationStatement = z.infer<typeof statementSchema>;
type SignedRootRotation = z.infer<typeof signedSchema>;

const bytesToSign = (statement: RootRotationStatement) => Buffer.concat([Buffer.from(DOMAIN, "ascii"), Buffer.from([0]), Buffer.from(canonicalize(statement), "utf8")]);
const sortedEqual = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().every((value, index) => value === [...b].sort()[index]);

function signatureRow(statement: RootRotationStatement, by: Row["by"], privateKeyPem: string): Row {
  const keyId = ed25519KeyId(publicOf(privateKeyPem));
  if (keyId === null) throw new Error("root keys are Ed25519");
  if (!(by === "current" ? statement.previousRoots : statement.newRoots).includes(keyId)) throw new Error(`${keyId} is not a key of the ${by} root set`);
  return { by, keyId, signature: sign(null, bytesToSign(statement), privateKeyPem).toString("base64") };
}

function encodeSigned(statement: RootRotationStatement, rows: readonly Row[]): Buffer {
  return Buffer.from(canonicalize(signedSchema.parse({ statement, signatures: [...rows].sort(rowOrder) })), "utf8");
}

/** Signs a root-set rotation with current-set keys ("current") and new-set keys ("new"). Only the canonical encoding is ever accepted. */
export function signRootRotation(statement: RootRotationStatement, keys: { current: readonly string[]; next: readonly string[] }): Buffer {
  const parsed = statementSchema.parse(statement);
  return encodeSigned(parsed, [...keys.current.map(pem => signatureRow(parsed, "current", pem)), ...keys.next.map(pem => signatureRow(parsed, "new", pem))]);
}

/** Adds (or replaces) one holder's signature, so each root holder can sign on their own machine. */
export function addRootRotationSignature(bytes: Buffer, by: Row["by"], privateKeyPem: string): Buffer {
  const { statement, signatures } = parseSigned(bytes, "the statement");
  const row = signatureRow(statement, by, privateKeyPem);
  return encodeSigned(statement, [...signatures.filter(existing => existing.by !== by || existing.keyId !== row.keyId), row]);
}

function publicOf(privateKeyPem: string): string {
  return createPublicKey(privateKeyPem).export({ format: "pem", type: "spki" }).toString();
}

const MAX_STATEMENT_BYTES = 64 * 1024;
const rootsRel = "trust/trust-roots.json";
const chainDir = (setId: string) => `state/root-rotations/${setId}`;
const chainRel = (setId: string, sequence: number) => `${chainDir(setId)}/${sequence}.json`;
const markOf = (setId: string) => highWaterKey("trust-root-set", setId);
type RootSetState = { roots: readonly string[]; threshold: number };
type Applied = { rootSetId: string; sequence: number; roots: string[]; threshold: number };

const refuse = (detail: string): never => { throw new TrustListError("TRUST_LIST_SIGNATURE_INVALID", `root rotation refused: ${detail}`); };

function parseSigned(bytes: Buffer, what: string): SignedRootRotation {
  try {
    return signedSchema.parse(parseCanonicalJson(bytes));
  } catch (error) {
    const detail = error instanceof z.ZodError ? `${error.issues[0]?.path.join(".")}: ${error.issues[0]?.message}` : error instanceof Error ? error.message : String(error);
    throw new TrustListError("TRUST_LIST_INVALID", `${what} is not a canonical amc.root-rotation statement (${detail})`);
  }
}

function count(statementBytes: Buffer, rows: readonly Row[], by: Row["by"], pems: ReadonlyMap<string, string>): number {
  const valid = new Set<string>();
  for (const row of rows) {
    if (row.by !== by) continue;
    const pem = pems.get(row.keyId);
    if (pem === undefined) refuse(`${by} signature by ${row.keyId} is not by a key of the ${by} root set`);
    let ok = false;
    try { ok = verify(null, statementBytes, pem!, Buffer.from(row.signature, "base64")); } catch { /* reported below */ }
    if (!ok) refuse(`${by} signature by ${row.keyId} does not verify`);
    valid.add(row.keyId);
  }
  return valid.size;
}

const newSetPems = (statement: RootRotationStatement) => new Map(statement.newRoots.map((id, index) => [id, statement.newRootPublicKeyPems[index]!] as const));

/** The supplied keys that belong to the pinned set; any other key is ignored. */
function pinnedPems(roots: readonly string[], pems: readonly string[]): Map<string, string> {
  return new Map(pems.flatMap(pem => { const id = ed25519KeyId(pem); return id !== null && roots.includes(id) ? [[id, pem] as const] : []; }));
}

/**
 * One rotation against the set it replaces: it must name that set and threshold, lower neither without `allowDecrease`,
 * carry `current.threshold` distinct valid signatures by `current` keys and `newThreshold` by the new keys. `currentPems`
 * is null only for the first stored rotation when re-reading the chain: its authority was checked against the
 * operator's pinned keys when it was applied, and no earlier statement holds those keys.
 */
function authorize(signed: SignedRootRotation, current: RootSetState, currentPems: ReadonlyMap<string, string> | null): void {
  const { statement } = signed;
  if (!sortedEqual(statement.previousRoots, current.roots) || statement.previousThreshold !== current.threshold) refuse("previousRoots and previousThreshold are not the pinned root set");
  if ((statement.newThreshold < current.threshold || statement.newRoots.length < current.roots.length) && !statement.allowDecrease) {
    refuse("it lowers the threshold or the set size without allowDecrease");
  }
  const bytes = bytesToSign(statement);
  if (currentPems !== null && count(bytes, signed.signatures, "current", currentPems) < current.threshold) refuse(`it needs ${current.threshold} distinct signatures from the current root set`);
  if (count(bytes, signed.signatures, "new", newSetPems(statement)) < statement.newThreshold) refuse(`the new set must prove possession with ${statement.newThreshold} distinct signatures`);
}

/** Rotations 1..`upTo` of a set, verified as one chain; any missing, unlinked or unauthorized link refuses. */
function storedChain(home: string, setId: string, upTo: number): { statement: RootRotationStatement; sha256: string } {
  let previous: { statement: RootRotationStatement; sha256: string } | null = null;
  for (let sequence = 1; sequence <= upTo; sequence += 1) {
    const bytes = readContainedOrNull(home, chainRel(setId, sequence), MAX_STATEMENT_BYTES);
    if (bytes === null) throw new TrustListError("TRUST_LIST_INVALID", `root set ${setId} rotation ${sequence} is missing; refusing the pinned roots`);
    const signed = parseSigned(bytes, chainRel(setId, sequence));
    const { statement } = signed;
    if (statement.rootSetId !== setId || statement.sequence !== sequence || statement.previousSha256 !== (previous?.sha256 ?? null)) refuse(`stored rotation ${sequence} of ${setId} does not chain`);
    const before = previous === null ? { roots: statement.previousRoots, threshold: statement.previousThreshold } : { roots: previous.statement.newRoots, threshold: previous.statement.newThreshold };
    authorize(signed, before, previous === null ? null : newSetPems(previous.statement));
    previous = { statement, sha256: sha256Hex(bytes) };
  }
  return previous!;
}

/** Root sets this machine applied a rotation of: a mark or a stored chain, both outside the trust directory. */
function rotatedRootSets(home: string): string[] {
  const stored = listContainedDir(home, "state/root-rotations").filter(name => setIdSchema.safeParse(name).success && listContainedDir(home, chainDir(name)).length > 0);
  return [...new Set([...highWaterIds("trust-root-set", { amcHome: home }), ...stored])];
}

function latestStored(home: string, setId: string): number | null {
  const stored = listContainedDir(home, chainDir(setId)).flatMap(name => /^[1-9][0-9]{0,15}\.json$/.test(name) ? [Number(name.slice(0, -5))] : []);
  return stored.length === 0 ? null : Math.max(...stored);
}

/**
 * The pinned roots (null when there is no trust-roots.json), checked against this machine's verified rotation chain:
 * once a set was rotated here, trust-roots.json must exist, name that set, and equal what the anchored statement
 * installed. A missing mark is rebuilt from the stored chain; a missing statement, a broken chain or a file that drops
 * or changes `rootSetId` fails closed.
 */
export function readPinnedTrustRoots(home: string): TrustRoots | null {
  const roots = containedExists(home, rootsRel) ? readRootsFile(home) : null;
  const rotated = rotatedRootSets(home);
  if (rotated.length === 0) return roots;
  if (roots?.rootSetId === undefined || !rotated.includes(roots.rootSetId)) {
    throw new TrustListError("TRUST_LIST_INVALID", `this machine rotated root set ${rotated.join(", ")}, but ${rootsRel} is missing or names `
      + `${roots?.rootSetId ?? "no rootSetId"}; restore it, or have the machine owner remove that set's state/root-rotations directory and high-water mark`);
  }
  const setId = roots.rootSetId;
  let anchored = readHighWater(markOf(setId), { amcHome: home });
  if (anchored === null) {
    const latest = latestStored(home, setId);
    if (latest === null) return roots;
    const sha256 = sha256Hex(readContained(home, chainRel(setId, latest), MAX_STATEMENT_BYTES));
    recordHighWater(markOf(setId), latest, sha256, { amcHome: home });
    anchored = { sequence: latest, sha256, seenAt: new Date().toISOString() };
  }
  const installed = storedChain(home, setId, anchored.sequence);
  compareHighWater(markOf(setId), anchored, anchored.sequence, installed.sha256);
  if (!sortedEqual(installed.statement.newRoots, roots.roots) || installed.statement.newThreshold !== (roots.threshold ?? 1)) {
    throw new TrustListError("TRUST_LIST_INVALID", `${rootsRel} differs from the root set rotation ${anchored.sequence} installed; refusing it`);
  }
  return roots;
}

function readRootsFile(home: string): TrustRoots {
  return parseTrustValue(trustRootsSchema, parseTrustJson(readContained(home, rootsRel, 1024 * 1024), rootsRel), rootsRel);
}

function writeRoots(home: string, from: TrustRoots, next: TrustRoots): void {
  // Trust-list marks are kept per root set: copy them, so a list older than one already accepted stays refused.
  const fromId = `@${trustRootSetIdOf(from.roots)}`;
  const toId = `@${trustRootSetIdOf(next.roots)}`;
  carryHighWaterMarks(key => key.startsWith("trust-list") && key.endsWith(fromId) ? `${key.slice(0, -fromId.length)}${toId}` : null, { amcHome: home });
  writeContained(home, rootsRel, `${JSON.stringify(next, null, 2)}\n`, 0o600);
}

const installedRoots = (file: TrustRoots, statement: RootRotationStatement) =>
  parseTrustValue(trustRootsSchema, { ...file, roots: [...statement.newRoots], threshold: statement.newThreshold }, rootsRel);

/**
 * Verifies one rotation against the pinned current set and applies it. `currentRootPublicKeyPems` only locates the
 * current roots' keys; a key that is not pinned is ignored.
 */
export function applyTrustRootRotation(opts: { statement: Buffer; currentRootPublicKeyPems: readonly string[]; amcHome?: string; env?: NodeJS.ProcessEnv }): Applied {
  const home = opts.amcHome ?? resolveAmcHome({ env: opts.env ?? process.env });
  const finished = finishInterruptedApply(home, opts.statement, opts.currentRootPublicKeyPems);
  if (finished) return finished;
  const current = readPinnedTrustRoots(home);
  if (current?.rootSetId === undefined) throw new TrustListError("TRUST_LIST_INVALID", `${rootsRel} is missing or names no rootSetId; set one before rotating roots`);
  const signed = parseSigned(opts.statement, "the statement");
  const { statement } = signed;
  const setId = current.rootSetId;
  if (statement.rootSetId !== setId) refuse(`it is for root set ${statement.rootSetId}, not ${setId}`);
  // Replay and forks: the next sequence after the anchored one, naming the anchored statement by digest.
  const anchored = readHighWater(markOf(setId), { amcHome: home });
  if (statement.sequence !== (anchored?.sequence ?? 0) + 1) refuse(`sequence ${statement.sequence} does not follow the applied ${anchored?.sequence ?? 0}`);
  if (statement.previousSha256 !== (anchored?.sha256 ?? null)) refuse("previousSha256 does not name the last applied rotation");
  // The current set is the pinned one, never one the statement names.
  authorize(signed, { roots: current.roots, threshold: current.threshold ?? 1 }, pinnedPems(current.roots, opts.currentRootPublicKeyPems));
  const next = installedRoots(current, statement);
  // Anchor first, outside the trust directory, then publish the new set: a crash in between leaves the anchored
  // statement, which readPinnedTrustRoots then requires, and applying that same statement again finishes the job.
  const leftover = readContainedOrNull(home, chainRel(setId, statement.sequence), MAX_STATEMENT_BYTES);
  if (leftover !== null && !leftover.equals(opts.statement)) refuse(`another rotation ${statement.sequence} is stored but was never anchored; the machine owner must remove it`);
  writeContained(home, chainRel(setId, statement.sequence), opts.statement, 0o600);
  recordHighWater(markOf(setId), statement.sequence, sha256Hex(opts.statement), { amcHome: home });
  writeRoots(home, current, next);
  return { rootSetId: setId, sequence: statement.sequence, roots: next.roots, threshold: statement.newThreshold };
}

/**
 * Applying the anchored statement again completes an apply that stopped before trust-roots.json was written: the whole
 * stored chain and the statement's authority over the still-pinned set are verified again first. Anything else is null.
 */
function finishInterruptedApply(home: string, statementBytes: Buffer, currentRootPublicKeyPems: readonly string[]): Applied | null {
  const file = containedExists(home, rootsRel) ? readRootsFile(home) : null;
  if (file?.rootSetId === undefined) return null;
  const anchored = readHighWater(markOf(file.rootSetId), { amcHome: home });
  if (anchored === null || sha256Hex(statementBytes) !== anchored.sha256) return null;
  const installed = storedChain(home, file.rootSetId, anchored.sequence).statement;
  if (sortedEqual(installed.newRoots, file.roots) && installed.newThreshold === (file.threshold ?? 1)) refuse(`rotation ${anchored.sequence} is already applied`);
  const pinned = { roots: file.roots, threshold: file.threshold ?? 1 };
  authorize(parseSigned(statementBytes, "the statement"), pinned, pinnedPems(pinned.roots, currentRootPublicKeyPems));
  const next = installedRoots(file, installed);
  writeRoots(home, file, next);
  return { rootSetId: file.rootSetId, sequence: anchored.sequence, roots: next.roots, threshold: installed.newThreshold };
}

/** The id that scopes trust-list marks to one pinned root set. */
export function trustRootSetIdOf(roots: readonly string[]): string {
  return sha256Hex([...roots].sort().join(",")).slice(0, 16);
}
