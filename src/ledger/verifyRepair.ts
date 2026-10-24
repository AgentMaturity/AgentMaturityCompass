/**
 * `amc verify --repair` without deletion (P0-45).
 *
 * Repair used to delete .amc/blobs, .amc/reports and then the ledger, which erased the trace of exactly the tampering
 * that makes signatures fail. Now it only plans; apply moves a failing evidence store into
 * .amc/quarantine/<id>/ after a legal-hold check, with a signed receipt naming every move. Every original byte stays
 * reachable. Files are renamed, never copied and deleted. Holds and signing are injected so this module stays free of
 * CLI, compliance and signing code.
 */
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import type { SignedDigest } from "../crypto/signing/signerTypes.js";
import { readSessionStoreMarker } from "../persistence/openSessionEventStore.js";
import { writeFileAtomic } from "../utils/fs.js";
import { listContainedDir, readContainedOrNull, ensureContainedDir } from "../utils/containedFs.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { sha256Hex } from "../utils/hash.js";
import { amcVersion } from "../version.js";
import { verifyLedgerIntegrity } from "./ledgerVerification.js";

export type RepairErrorClass = "missing_blob" | "payload_mismatch" | "signature_invalid"
  | "trust_root" | "ledger_missing" | "other_chain" | "governance";
/** A file `--apply` would move: workspace-relative POSIX path, size and SHA-256 at plan time. */
export interface StoreFile { path: string; bytes: number; sha256: string }
export interface RepairPlan {
  verified: boolean;
  chainOk: boolean;
  errorCounts: Partial<Record<RepairErrorClass, number>>;
  /** The first 200 verifier messages. */
  errors: string[];
  action: "none" | "archive_evidence_store";
  files: StoreFile[];
}
export interface RepairReceipt {
  v: 1; type: "amc.verify-repair"; id: string; createdAt: string; amcVersion: string;
  trigger: { errorCounts: RepairPlan["errorCounts"]; errors: string[] };
  legalHold: { state: "none"; checkedAt: string };
  moved: Array<{ from: string; to: string; bytes: number; sha256: string }>;
  untouched: string[];
}
export type HoldState = { state: "none" } | { state: "active"; holdIds: string[] } | { state: "unknown"; reason: string };
/** Apply declined before moving anything (or after putting back everything it moved). */
export class RepairRefused extends Error {}
/** Constructed only after the real move rollback has returned successfully. */
class RepairRolledBack extends RepairRefused {}

export const QUARANTINE_DIR = ".amc/quarantine";
const MAX_PLAN_ERRORS = 200;
const CLASS_BY_TEXT: ReadonlyArray<readonly [string, RepairErrorClass]> = [
  ["Missing blob file", "missing_blob"],
  ["payload hash mismatch", "payload_mismatch"],
  ["payload authentication failed", "payload_mismatch"],
  ["signature invalid", "signature_invalid"],
  ["trust root:", "trust_root"],
  ["Evidence ledger is missing", "ledger_missing"],
  ["jsonl session event log is missing", "ledger_missing"]
];

const posix = (path: string) => path.split(sep).join("/");
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

function classify(message: string): RepairErrorClass {
  return CLASS_BY_TEXT.find(([text]) => message.includes(text))?.[1] ?? "other_chain";
}

function hashFile(workspace: string, path: string): StoreFile {
  const bytes = fs.readFileSync(join(workspace, path));
  return { path, bytes: bytes.byteLength, sha256: sha256Hex(bytes) };
}

function filesUnder(workspace: string, dir: string): string[] {
  const full = join(workspace, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { recursive: true }).map(String).sort()
    .filter((rel) => fs.statSync(join(full, rel)).isFile())
    .map((rel) => `${dir}/${posix(rel)}`);
}

/** The evidence store and nothing else: the SQLite ledger with its sidecars, the blob store, and JSONL session logs. */
function evidenceStoreFiles(workspace: string): StoreFile[] {
  const ledger = [".amc/evidence.sqlite", ".amc/evidence.sqlite-wal", ".amc/evidence.sqlite-shm"]
    .filter((path) => fs.existsSync(join(workspace, path)));
  const jsonl = readSessionStoreMarker(workspace) === "jsonl"
    ? filesUnder(workspace, ".amc/jsonl").filter((path) => path.endsWith(".jsonl"))
    : [];
  return [...ledger, ...filesUnder(workspace, ".amc/blobs"), ...jsonl].map((path) => hashFile(workspace, path));
}

/** Runs the read-only verifier and says what `--apply` would do. Changes nothing. */
export function planVerifyRepair(workspace: string, options: { expectedMonitorFingerprint?: string } = {}): RepairPlan {
  const result = verifyLedgerIntegrity(workspace, options);
  const governance = new Set(result.governance.errors);
  const errorCounts: RepairPlan["errorCounts"] = {};
  for (const message of result.errors) {
    const kind = governance.has(message) ? "governance" : classify(message);
    errorCounts[kind] = (errorCounts[kind] ?? 0) + 1;
  }
  // Nothing to archive when the evidence verified (governance-only failures need configs re-signed) or is already gone.
  const archive = !result.ok && !result.chain.ok && !errorCounts.ledger_missing;
  return {
    verified: result.ok,
    chainOk: result.chain.ok,
    errorCounts,
    errors: result.errors.slice(0, MAX_PLAN_ERRORS),
    action: archive ? "archive_evidence_store" : "none",
    files: archive ? evidenceStoreFiles(workspace) : []
  };
}

function quarantineId(now: Date): string {
  return `${now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "")}-${randomBytes(4).toString("hex")}`;
}

/** Removes the directories an aborted apply created; rmdirSync refuses any that still hold a file. */
function removeEmptyDirs(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirs(join(dir, entry.name));
  }
  fs.rmdirSync(dir);
}

/** Puts moved files back, newest first. A file that cannot go back is named, never dropped. */
function rollBack(workspace: string, quarantineDir: string, moved: RepairReceipt["moved"]): void {
  const stuck: string[] = [], failures: unknown[] = [];
  for (const row of [...moved].reverse()) {
    try {
      fs.renameSync(join(workspace, row.to), join(workspace, row.from));
    } catch (error) {
      stuck.push(`${row.to} (${errorText(error)})`); failures.push(error);
    }
  }
  if (stuck.length > 0) {
    throw new Error(`repair aborted and could not put back: ${stuck.join(", ")}; the files are intact at those paths`, { cause: failures[0] });
  }
  // Every file is back, so the intent record describes nothing: remove it and the empty folders.
  try {
    fs.unlinkSync(join(quarantineDir, "repair-plan.json"));
    removeEmptyDirs(quarantineDir);
    fs.rmdirSync(dirname(quarantineDir));
  } catch {
    // A leftover empty folder or plan is reported by the archived-store note; it holds no evidence.
  }
}

function moveIntoQuarantine(workspace: string, quarantineDir: string, files: StoreFile[], moved: RepairReceipt["moved"] = []): RepairReceipt["moved"] {
  for (const file of files) {
    // .amc/blobs/x.blob -> .amc/quarantine/<id>/blobs/x.blob; the SQLite files come first and move together.
    const target = join(quarantineDir, relative(".amc", file.path));
    try {
      fs.mkdirSync(dirname(target), { recursive: true });
      fs.renameSync(join(workspace, file.path), target);
    } catch (error) {
      try { rollBack(workspace, quarantineDir, moved); }
      catch (rollback) { throw new AggregateError([error, rollback], "repair move and rollback failed; inspect retained paths"); }
      throw new RepairRolledBack(`could not move ${file.path}: ${errorText(error)}; every moved file was put back`, { cause: error });
    }
    moved.push({ from: file.path, to: posix(relative(workspace, target)), bytes: file.bytes, sha256: file.sha256 });
  }
  return moved;
}

interface PreparedRepairSignature {
  readonly digestSha256: string;
  readonly signatureBytes: string;
  assertCurrent(): void;
}
interface RepairDependencies { legalHolds: () => HoldState; now?: () => Date }
type RepairResult = { quarantineDir: string; receipt: RepairReceipt };
export class RepairPublicationError extends Error {
  readonly code = "REPAIR_PARTIAL";
  constructor(readonly quarantineDir: string, readonly phase: string, readonly publishedPaths: readonly string[],
    readonly attemptedMoves: readonly RepairReceipt["moved"][number][], cause: unknown) {
    super(`repair publication is incomplete at ${quarantineDir} (${phase}); inspect retained evidence before retrying`, { cause });
    this.name = "RepairPublicationError";
  }
}
const serialized = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sameBytes = (a: Buffer | null, b: Buffer | null) => a === null ? b === null : b !== null && a.equals(b);
function pathPresent(path: string): boolean {
  try { fs.lstatSync(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
function holdClear(legalHolds: () => HoldState): void {
  let hold: HoldState;
  try { hold = legalHolds(); } catch (error) { hold = { state: "unknown", reason: errorText(error) }; }
  if (hold.state === "unknown") throw new RepairRefused(`legal hold state unknown: ${hold.reason}`);
  if (hold.state === "active") throw new RepairRefused(`legal hold active: ${hold.holdIds.join(", ")}`);
}
function containedTree(workspace: string, dir: string): string[] {
  return listContainedDir(workspace, dir).sort().flatMap(name => {
    const path = `${dir}/${name}`, stat = fs.lstatSync(join(workspace, path));
    return stat.isDirectory() && !stat.isSymbolicLink() ? containedTree(workspace, path) : [path];
  }).sort();
}
function currentStore(workspace: string) {
  const marker = readContainedOrNull(workspace, ".amc/session-store.json", 64 * 1024);
  let backend: "sqlite" | "jsonl" | null = null;
  if (marker !== null) {
    const parsed: unknown = JSON.parse(marker.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || !("backend" in parsed) || (parsed.backend !== "sqlite" && parsed.backend !== "jsonl")) throw new RepairRefused("session-store marker is invalid");
    backend = parsed.backend;
  }
  const files: StoreFile[] = [];
  const paths = [".amc/evidence.sqlite", ".amc/evidence.sqlite-wal", ".amc/evidence.sqlite-shm",
    ...containedTree(workspace, ".amc/blobs"), ...(backend === "jsonl" ? containedTree(workspace, ".amc/jsonl").filter(path => path.endsWith(".jsonl")) : [])];
  for (const path of paths) {
    const bytes = readContainedOrNull(workspace, path, Number.MAX_SAFE_INTEGER);
    if (bytes !== null) files.push({ path, bytes: bytes.length, sha256: sha256Hex(bytes) });
  }
  return { marker, files };
}
function prepareRepair(workspace: string, input: RepairPlan, deps: RepairDependencies) {
  const legalHolds = deps.legalHolds, now = deps.now ?? (() => new Date());
  // Capture nested arguments before a signer can yield; no later caller mutation supplies the receipt.
  const plan: RepairPlan = { verified: input.verified, chainOk: input.chainOk, errorCounts: { ...input.errorCounts }, errors: [...input.errors],
    action: input.action, files: input.files.map(file => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 })) };
  if (plan.action !== "archive_evidence_store") throw new RepairRefused("nothing to archive: the plan's action is none");
  if (plan.errorCounts.trust_root) throw new RepairRefused("the monitor key does not match the expected fingerprint (trust root); a fresh ledger would be signed by an unexpected key");
  holdClear(legalHolds);
  const checkedAt = now().toISOString(), store = currentStore(workspace);
  if (JSON.stringify(plan.files) !== JSON.stringify(store.files)) throw new RepairRefused("evidence changed since the plan");
  const id = quarantineId(now()), relativeDir = `${QUARANTINE_DIR}/${id}`, quarantineDir = join(workspace, relativeDir);
  if (pathPresent(quarantineDir)) throw new RepairRefused(`quarantine folder already exists: ${relativeDir}`);
  const moved = plan.files.map(file => ({ from: file.path, to: `${relativeDir}/${posix(relative(".amc", file.path))}`, bytes: file.bytes, sha256: file.sha256 }));
  const receipt: RepairReceipt = { v: 1, type: "amc.verify-repair", id, createdAt: now().toISOString(), amcVersion,
    trigger: { errorCounts: plan.errorCounts, errors: plan.errors }, legalHold: { state: "none", checkedAt }, moved, untouched: [".amc/reports"] };
  return { workspace, legalHolds, store, plan, planJson: serialized(plan), receipt, receiptJson: serialized(receipt), relativeDir, quarantineDir };
}
function publishRepair(plan: ReturnType<typeof prepareRepair>, signatureBytes: string, assertCurrent: () => void): RepairResult {
  return withControlFileLock({ root: join(plan.workspace, ".amc"), name: "verify-repair", operation: () => {
    holdClear(plan.legalHolds);
    const current = currentStore(plan.workspace);
    assertCurrent();
    if (!sameBytes(current.marker, plan.store.marker) || JSON.stringify(current.files) !== JSON.stringify(plan.store.files)) throw new RepairRefused("evidence changed since the plan");
    if (pathPresent(plan.quarantineDir)) throw new RepairRefused(`quarantine folder already exists: ${plan.relativeDir}`);
    let phase = "quarantine-directory";
    const published: string[] = [], moved: RepairReceipt["moved"] = [];
    try {
      ensureContainedDir(plan.workspace, QUARANTINE_DIR);
      fs.mkdirSync(plan.quarantineDir);
      phase = "repair-plan";
      fs.writeFileSync(join(plan.quarantineDir, "repair-plan.json"), plan.planJson, { flag: "wx" });
      published.push(`${plan.relativeDir}/repair-plan.json`);
      phase = "move";
      moveIntoQuarantine(plan.workspace, plan.quarantineDir, plan.plan.files, moved);
      phase = "moved-bytes";
      for (const row of moved) {
        const bytes = readContainedOrNull(plan.workspace, row.to, Number.MAX_SAFE_INTEGER);
        if (bytes === null || sha256Hex(bytes) !== row.sha256) throw new Error(`moved evidence differs: ${row.to}`);
      }
      if (currentStore(plan.workspace).files.length !== 0) throw new Error("live evidence appeared while the store moved");
      phase = "receipt-signature";
      writeFileAtomic(join(plan.quarantineDir, "repair-receipt.json.sig"), signatureBytes + "\n");
      published.push(`${plan.relativeDir}/repair-receipt.json.sig`);
      phase = "receipt";
      writeFileAtomic(join(plan.quarantineDir, "repair-receipt.json"), plan.receiptJson);
      published.push(`${plan.relativeDir}/repair-receipt.json`);
      return { quarantineDir: plan.quarantineDir, receipt: plan.receipt };
    } catch (error) {
      if (error instanceof RepairRolledBack) throw error; // Only the rename helper's confirmed restoration is an ordinary refusal here.
      throw new RepairPublicationError(plan.relativeDir, phase, Object.freeze([...published]), Object.freeze([...moved]), error);
    }
  } });
}

/** Retained sync API. Both existing signature calls finish before any quarantine effect or common repair lock. */
export function applyVerifyRepair(workspace: string, input: RepairPlan, deps: RepairDependencies & {
  sign: (digestHex: string) => SignedDigest;
}): RepairResult {
  const plan = prepareRepair(workspace, input, deps);
  try { deps.sign(sha256Hex(plan.planJson)); }
  catch (error) { throw new RepairRefused(`cannot sign a repair receipt: ${errorText(error)}`, { cause: error }); }
  const signed = deps.sign(sha256Hex(plan.receiptJson));
  return publishRepair(plan, JSON.stringify(signed, null, 2), () => {});
}

/** Internal async preparation used by the maintained repair CLI; apply is synchronous and performs no signing. */
export async function prepareVerifyRepairAsync(workspace: string, input: RepairPlan, deps: RepairDependencies & {
  prepareSignature: (path: string, bytes: Buffer) => Promise<PreparedRepairSignature>;
}): Promise<{ apply(): RepairResult }> {
  const prepareSignature = deps.prepareSignature, plan = prepareRepair(workspace, input, deps);
  const first = await prepareSignature(join(plan.quarantineDir, "repair-plan.json"), Buffer.from(plan.planJson));
  if (first.digestSha256 !== sha256Hex(plan.planJson)) throw new RepairRefused("prepared plan signature digest mismatch");
  const firstCurrent = first.assertCurrent.bind(first);
  firstCurrent();
  const second = await prepareSignature(join(plan.quarantineDir, "repair-receipt.json"), Buffer.from(plan.receiptJson));
  if (second.digestSha256 !== sha256Hex(plan.receiptJson)) throw new RepairRefused("prepared receipt signature digest mismatch");
  const secondCurrent = second.assertCurrent.bind(second), signatureBytes = second.signatureBytes;
  return Object.freeze({ apply: () => publishRepair(plan, signatureBytes, () => { firstCurrent(); secondCurrent(); }) });
}

/** Receipts of archived stores (oldest first) and quarantine folders holding a plan but no receipt (interrupted). */
export function archivedStores(workspace: string): { receipts: string[]; interrupted: string[] } {
  const root = join(workspace, QUARANTINE_DIR);
  if (!fs.existsSync(root)) return { receipts: [], interrupted: [] };
  const receipts: string[] = [];
  const interrupted: string[] = [];
  for (const id of fs.readdirSync(root).sort()) {
    const dir = `${QUARANTINE_DIR}/${id}`;
    if (fs.existsSync(join(workspace, dir, "repair-receipt.json"))) receipts.push(`${dir}/repair-receipt.json`);
    else if (fs.existsSync(join(workspace, dir, "repair-plan.json"))) interrupted.push(dir);
  }
  return { receipts, interrupted };
}
