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
  const stuck: string[] = [];
  for (const row of [...moved].reverse()) {
    try {
      fs.renameSync(join(workspace, row.to), join(workspace, row.from));
    } catch (error) {
      stuck.push(`${row.to} (${errorText(error)})`);
    }
  }
  if (stuck.length > 0) {
    throw new Error(`repair aborted and could not put back: ${stuck.join(", ")}; the files are intact at those paths`);
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

function moveIntoQuarantine(workspace: string, quarantineDir: string, files: StoreFile[]): RepairReceipt["moved"] {
  const moved: RepairReceipt["moved"] = [];
  for (const file of files) {
    // .amc/blobs/x.blob -> .amc/quarantine/<id>/blobs/x.blob; the SQLite files come first and move together.
    const target = join(quarantineDir, relative(".amc", file.path));
    try {
      fs.mkdirSync(dirname(target), { recursive: true });
      fs.renameSync(join(workspace, file.path), target);
    } catch (error) {
      rollBack(workspace, quarantineDir, moved);
      throw new RepairRefused(`could not move ${file.path}: ${errorText(error)}; every moved file was put back`);
    }
    moved.push({ from: file.path, to: posix(relative(workspace, target)), bytes: file.bytes, sha256: file.sha256 });
  }
  return moved;
}

/**
 * Moves a failing evidence store into .amc/quarantine/<id>/ and writes a signed receipt. Every refusal before the
 * quarantine folder exists changes nothing; a failed rename puts back what moved.
 */
export function applyVerifyRepair(workspace: string, plan: RepairPlan, deps: {
  legalHolds: () => HoldState;
  sign: (digestHex: string) => SignedDigest;
  now?: () => Date;
}): { quarantineDir: string; receipt: RepairReceipt } {
  const now = deps.now ?? (() => new Date());
  if (plan.action !== "archive_evidence_store") throw new RepairRefused("nothing to archive: the plan's action is none");
  if (plan.errorCounts.trust_root) {
    throw new RepairRefused("the monitor key does not match the expected fingerprint (trust root); a fresh ledger would be signed by an unexpected key");
  }
  let hold: HoldState;
  try {
    hold = deps.legalHolds();
  } catch (error) {
    hold = { state: "unknown", reason: errorText(error) };
  }
  const checkedAt = now().toISOString();
  if (hold.state === "unknown") throw new RepairRefused(`legal hold state unknown: ${hold.reason}`);
  if (hold.state === "active") throw new RepairRefused(`legal hold active: ${hold.holdIds.join(", ")}`);
  for (const file of plan.files) {
    const current = fs.existsSync(join(workspace, file.path)) ? hashFile(workspace, file.path).sha256 : null;
    if (current !== file.sha256) throw new RepairRefused(`evidence changed since the plan: ${file.path}`);
  }
  const planJson = `${JSON.stringify(plan, null, 2)}\n`;
  try {
    deps.sign(sha256Hex(planJson));
  } catch (error) {
    throw new RepairRefused(`cannot sign a repair receipt: ${errorText(error)}`);
  }

  const id = quarantineId(now());
  const quarantineDir = join(workspace, QUARANTINE_DIR, id);
  if (fs.existsSync(quarantineDir)) throw new RepairRefused(`quarantine folder already exists: ${QUARANTINE_DIR}/${id}`);
  fs.mkdirSync(quarantineDir, { recursive: true });
  fs.writeFileSync(join(quarantineDir, "repair-plan.json"), planJson, { flag: "wx" });
  const moved = moveIntoQuarantine(workspace, quarantineDir, plan.files);
  for (const row of moved) {
    if (hashFile(workspace, row.to).sha256 !== row.sha256) {
      throw new Error(`repair aborted: ${row.to} does not match ${row.from} after the move; nothing else was changed`);
    }
  }

  const receipt: RepairReceipt = {
    v: 1, type: "amc.verify-repair", id, createdAt: now().toISOString(), amcVersion,
    trigger: { errorCounts: plan.errorCounts, errors: plan.errors },
    legalHold: { state: "none", checkedAt },
    moved,
    untouched: [".amc/reports"]
  };
  const receiptJson = `${JSON.stringify(receipt, null, 2)}\n`;
  const signed = deps.sign(sha256Hex(receiptJson));
  // Signature first: a receipt on disk always has its signature beside it.
  writeFileAtomic(join(quarantineDir, "repair-receipt.json.sig"), `${JSON.stringify(signed, null, 2)}\n`);
  writeFileAtomic(join(quarantineDir, "repair-receipt.json"), receiptJson);
  return { quarantineDir, receipt };
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
