/**
 * Writing the coding move (UX-01, ./codingAdoption.ts) so that a crash never leaves a half-moved folder unnoticed.
 *
 * Order: copies of the files about to change go to `.amc/coding-move/`, then a signed WORKSPACE_CODING_SETUP_STARTED
 * row names their digests, then `manifest.json` marks the move as begun, then the starter profile is written, then the
 * vault passphrase is changed (last, so that until then the earlier files can be put back with the passphrase that
 * opens the vault), then the signed WORKSPACE_CODING_SETUP_ADOPTED row names what was written, and the copies go.
 *
 * A folder found with the manifest is a move that did not finish. If the passphrase was already changed, every file was
 * written, so the move is finished (the adopted row). Otherwise the earlier files are put back from the copies, each
 * only when its bytes match the digest the signed started row recorded, and WORKSPACE_CODING_SETUP_PUT_BACK is written.
 * A firewall policy the move wrote stays: its signed journal has a host-side checkpoint and cannot be taken back, and it
 * only adds protection.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { approvalPolicyPath } from "../approvals/approvalPolicyEngine.js";
import { usersConfigPath } from "../auth/authApi.js";
import { actionPolicyPath } from "../governor/actionPolicyStore.js";
import { keysetAnchoring } from "../keys/keyset.js";
import { openLedger } from "../ledger/ledger.js";
import { appendOpsAuditEvent } from "../ops/audit.js";
import { loadRuntimeFirewallPolicy, runtimeFirewallPolicyPath } from "../runtime/firewall.js";
import { readEventPayload } from "../session/eventPayload.js";
import { toolsConfigPath } from "../toolhub/toolhubValidators.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { localVaultPassphrasePath } from "../vault/localPassphrase.js";
import { changeVaultPassphrase } from "../vault/vaultCli.js";
import { vaultOpensWith } from "../vault/vault.js";
import { assertPersonAdopts, codingAdoptionBlockers, hasCodingSetup, prepareCodingAdoption, type CodingAdoption, type CodingAdoptionIo } from "./codingAdoption.js";

const STARTED = "WORKSPACE_CODING_SETUP_STARTED";
const ADOPTED = "WORKSPACE_CODING_SETUP_ADOPTED";
const PUT_BACK = "WORKSPACE_CODING_SETUP_PUT_BACK";
const moveDir = (workspace: string): string => join(workspace, ".amc", "coding-move");
const manifestPath = (workspace: string): string => join(moveDir(workspace), "manifest.json");

/** Every file the starter profile writes or replaces, and their signatures. */
function movedFiles(workspace: string): string[] {
  return [toolsConfigPath(workspace), actionPolicyPath(workspace), approvalPolicyPath(workspace), join(workspace, ".amc", "amc.config.yaml"),
    usersConfigPath(workspace)].flatMap((path) => [path, `${path}.sig`]);
}

const digestOf = (path: string): string | null => (existsSync(path) ? sha256Hex(readFileSync(path)) : null);
const digests = (paths: readonly string[]): Record<string, string | null> => Object.fromEntries(paths.map((path) => [basename(path), digestOf(path)]));

/** A move that wrote its manifest and has no adopted or put-back row yet. */
export function codingMoveInterrupted(workspace: string): boolean {
  return existsSync(manifestPath(workspace));
}

interface Manifest { readonly startedEventId: string; readonly startedAt: string; readonly passphraseChange: boolean }

/** What the move is about to apply: the profile, then the printed report. */
export interface CodingMoveApply<R> {
  readonly apply: (owner: CodingAdoption["owner"], keepFirewall: boolean) => Promise<R>;
}

/** The move as `amc init --coding` runs it in an existing folder. Returns null when nothing was written. */
export async function runCodingMove<R>(workspace: string, webHosts: readonly string[], io: CodingAdoptionIo, steps: CodingMoveApply<R>): Promise<R | null> {
  assertPersonAdopts(workspace);
  if (codingMoveInterrupted(workspace)) { await recoverCodingMove(workspace, io); return null; }
  rmSync(moveDir(workspace), { recursive: true, force: true }); // copies from a move that stopped before its started row
  if (hasCodingSetup(workspace)) {
    io.log("This folder already has the coding setup. Work here with the agent: amc agent-loop chat --provider stub --tools workspace --approval-mode default");
    return null;
  }
  const adoption = await prepareCodingAdoption(workspace, webHosts, io);
  if (adoption === null) return null;
  // Checked again right before writing: a file changed while the questions were open is not overwritten.
  const late = codingAdoptionBlockers(workspace);
  if (late.length > 0) throw new Error(`A file changed while you answered: ${late.join("; ")}. Nothing was changed.`);
  const keepFirewall = loadRuntimeFirewallPolicy(workspace) !== null;
  const files = movedFiles(workspace);
  process.env.AMC_VAULT_PASSPHRASE = adoption.passphrase.current;
  mkdirSync(moveDir(workspace), { recursive: true, mode: 0o700 });
  for (const path of files) if (existsSync(path)) copyFileSync(path, join(moveDir(workspace), basename(path)));
  const passphraseChange = adoption.passphrase.next !== null;
  const started = appendOpsAuditEvent({ workspace, auditType: STARTED, severity: "HIGH", payload: { owner: adoption.owner.username,
    atTerminal: true, osAccount: adoption.osAccount, passphraseChange, before: digests(files), webHosts: [...webHosts] } });
  const manifest: Manifest = { startedEventId: started.eventId, startedAt: new Date().toISOString(), passphraseChange };
  writeFileAtomic(manifestPath(workspace), `${JSON.stringify(manifest)}\n`, 0o600);
  const report = await steps.apply(adoption.owner, keepFirewall);
  if (adoption.passphrase.next !== null) changeVaultPassphrase(workspace, adoption.passphrase.current, adoption.passphrase.next);
  process.env.AMC_VAULT_PASSPHRASE = adoption.passphrase.next ?? adoption.passphrase.current;
  recordAdopted(workspace, { owner: adoption.owner.username, osAccount: adoption.osAccount, passphraseChanged: passphraseChange,
    firewallKept: keepFirewall, webHosts: [...webHosts] });
  return report;
}

function recordAdopted(workspace: string, payload: Record<string, unknown>): void {
  const written = [...movedFiles(workspace), runtimeFirewallPolicyPath(workspace)];
  appendOpsAuditEvent({ workspace, auditType: ADOPTED, severity: "HIGH", payload: { ...payload, atTerminal: true,
    keysetGeneration: keysetAnchoring(workspace).generation, written: digests(written),
    summary: "File edits and commands run after the owner approves each call (executeOnApproval for WRITE_LOW and WRITE_HIGH)." } });
  rmSync(moveDir(workspace), { recursive: true, force: true });
}

/** The digests the signed started row recorded; refuses when the row cannot be read back. */
function startedDigests(workspace: string, eventId: string): Record<string, string | null> {
  const ledger = openLedger(workspace);
  try {
    const row = ledger.getEventById(eventId);
    const read = row === null ? null : readEventPayload(workspace, row);
    const payload = read?.status === "ok" ? JSON.parse(read.bytes.toString("utf8")) as { auditType?: unknown; before?: Record<string, string | null> } : null;
    if (payload?.auditType !== STARTED || payload.before === undefined) throw new Error("its signed started record cannot be read");
    return payload.before;
  } finally { ledger.close(); }
}

async function recoverCodingMove(workspace: string, io: CodingAdoptionIo): Promise<void> {
  const manifest = JSON.parse(readFileSync(manifestPath(workspace), "utf8")) as Manifest;
  io.log(`A move of this folder to the coding setup started at ${manifest.startedAt} and did not finish.`);
  const generated = existsSync(localVaultPassphrasePath(workspace));
  const passphrase = generated ? readFileSync(localVaultPassphrasePath(workspace), "utf8").trim() : await io.secret("This folder's vault passphrase");
  if (!vaultOpensWith(workspace, passphrase)) throw new Error("That passphrase does not open this folder's vault. Nothing was changed.");
  process.env.AMC_VAULT_PASSPHRASE = passphrase;
  if (manifest.passphraseChange && !generated) {
    // The passphrase change is the last write: everything before it is in place.
    if (!hasCodingSetup(workspace)) throw new Error("The passphrase was changed but the coding setup is not complete. Restore .amc from a backup. Nothing was changed.");
    recordAdopted(workspace, { finishedAfterInterruption: manifest.startedEventId, passphraseChanged: true });
    io.log("The coding setup was already written; it is now recorded as finished.");
    return;
  }
  putBack(workspace, manifest);
  io.log("The earlier files are back, as they were before the move. A firewall policy the move wrote stays (it only adds"
    + " protection). Run amc init --coding again to set this folder up.");
}

/** Each earlier file from its copy, only where the copy matches the signed started row; a file that was absent goes. */
function putBack(workspace: string, manifest: Manifest): void {
  const before = startedDigests(workspace, manifest.startedEventId);
  const files = movedFiles(workspace);
  for (const path of files) {
    const expected = before[basename(path)] ?? null;
    const copy = join(moveDir(workspace), basename(path));
    if (expected !== null && digestOf(copy) !== expected) {
      throw new Error(`The saved copy of .amc/${basename(path)} does not match the signed started record. Restore .amc from a backup. Nothing more was changed.`);
    }
  }
  for (const path of files) {
    const expected = before[basename(path)] ?? null;
    if (expected === null) rmSync(path, { force: true });
    else copyFileSync(join(moveDir(workspace), basename(path)), path);
  }
  appendOpsAuditEvent({ workspace, auditType: PUT_BACK, severity: "MEDIUM", payload: { startedEventId: manifest.startedEventId, atTerminal: true,
    restored: digests(files) } });
  rmSync(moveDir(workspace), { recursive: true, force: true });
}
