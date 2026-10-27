import { join, relative } from "node:path";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../../utils/fs.js";
import { signSerializedPayloadWithAuditor } from "../../org/orgSigner.js";
import { withControlFileLock } from "../../lifecycle/controlFileLock.js";
import { captureOrgFiles, captureOrgPairs, assertOrgPairsCurrent, OrgPairsPublicationError, orgPairBytes, prepareOrgPairsAsync, type OrgPairsOptions, type OrgPairsSnapshot } from "../../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../../org/orgSignatureBytes.js";
import { defaultDiagnosticBankV1 } from "./bankV1.js";
import { diagnosticBankSchema, type DiagnosticBank } from "./bankSchema.js";

function diagnosticBankRoot(workspace: string): string {
  return join(workspace, ".amc", "diagnostic", "bank");
}

export function diagnosticBankPath(workspace: string): string {
  return join(diagnosticBankRoot(workspace), "bank.yaml");
}

export function diagnosticBankSigPath(workspace: string): string {
  return `${diagnosticBankPath(workspace)}.sig`;
}

export function saveDiagnosticBank(workspace: string, bank: DiagnosticBank): {
  path: string;
  sigPath: string;
} {
  ensureDir(diagnosticBankRoot(workspace));
  const path = diagnosticBankPath(workspace);
  const normalized = diagnosticBankSchema.parse(bank);
  const bytes = Buffer.from(YAML.stringify(normalized)), previous = captureOrgPairs([path]), sigPath = `${path}.sig`;
  const signature = JSON.stringify(signSerializedPayloadWithAuditor(workspace, bytes.toString("utf8")), null, 2);
  return withControlFileLock({ root: join(workspace, ".amc"), name: "org-auditor-pairs", operation() {
    assertOrgPairsCurrent(previous); const published: string[] = []; let attempted = relative(workspace, path);
    try { writeFileAtomic(path, bytes, 0o644); published.push(attempted); attempted = relative(workspace, sigPath); writeFileAtomic(sigPath, signature, 0o644); }
    catch (cause) { throw new OrgPairsPublicationError(Object.freeze(published), attempted, cause); }
    return { path, sigPath };
  } });
}

export function initDiagnosticBank(workspace: string): {
  path: string;
  sigPath: string;
  bank: DiagnosticBank;
} {
  const bank = defaultDiagnosticBankV1();
  const saved = saveDiagnosticBank(workspace, bank);
  return {
    ...saved,
    bank
  };
}

export function loadDiagnosticBank(workspace: string): DiagnosticBank {
  const path = diagnosticBankPath(workspace);
  if (!pathExists(path)) {
    return initDiagnosticBank(workspace).bank;
  }
  return diagnosticBankSchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function prepareDiagnosticBankAsync(workspace: string, bank: DiagnosticBank, options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  const path = diagnosticBankPath(workspace), normalized = diagnosticBankSchema.parse(bank), bytes = Buffer.from(YAML.stringify(normalized));
  return prepareOrgPairsAsync(workspace, [{ path, bytes }], options, previous ?? captureOrgPairs([path]));
}
export async function saveDiagnosticBankAsync(workspace: string, bank: DiagnosticBank, options: OrgPairsOptions = {}) {
  return (await prepareDiagnosticBankAsync(workspace, bank, options)).publish()[0]!;
}
export async function initDiagnosticBankAsync(workspace: string, options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  const bank = defaultDiagnosticBankV1(), prepared = await prepareDiagnosticBankAsync(workspace, bank, options, previous);
  return { ...prepared.publish()[0]!, bank };
}
/** Existing loads consume only the body. A genuinely missing body also captures its sidecar destination. */
export function captureDiagnosticBankInput(workspace: string) {
  const path = diagnosticBankPath(workspace), body = captureOrgFiles([path]);
  if (orgPairBytes(body, path) !== null) return body;
  const pair = captureOrgPairs([path]); assertOrgPairsCurrent(body); return pair;
}
/** The existing-body branch only parses its original bytes. It neither signs, repairs nor requires unlock. */
export async function loadDiagnosticBankAttemptAsync(workspace: string, options: OrgPairsOptions = {}, previous = captureDiagnosticBankInput(workspace)) {
  previous = { members: previous.members.map(member => ({ ...member, bytes: member.bytes === null ? null : Buffer.from(member.bytes) })) };
  const path = diagnosticBankPath(workspace), before = orgPairBytes(previous, path);
  const beforePublish = options.beforePublish, assertInputsCurrent = options.assertInputsCurrent;
  if (before !== null) {
    const bank = diagnosticBankSchema.parse(YAML.parse(before.toString("utf8")) as unknown);
    return { bank, bytes: Buffer.from(before), completedPaths: Object.freeze([] as string[]), assertCurrent() { beforePublish?.(); assertInputsCurrent?.(); assertOrgPairsCurrent(previous); } };
  }
  const bank = defaultDiagnosticBankV1(), bytes = Buffer.from(YAML.stringify(diagnosticBankSchema.parse(bank)));
  const prepared = await prepareOrgPairsAsync(workspace, [{ path, bytes }], { beforePublish, assertInputsCurrent }, previous), saved = prepared.publish()[0]!;
  return { bank, bytes: Buffer.from(bytes), completedPaths: Object.freeze([saved.path, saved.sigPath]), assertCurrent: prepared.assertCurrent };
}
/** Same selected body is parsed and verified; an unreadable sidecar remains an invalid-signature verdict. */
export function readDiagnosticBankForApi(workspace: string, expectedBytes?: Uint8Array) {
  const path = diagnosticBankPath(workspace), sigPath = `${path}.sig`, body = orgPairBytes(captureOrgFiles([path]), path);
  if (body === null) throw new Error("selected diagnostic bank is missing");
  if (expectedBytes !== undefined && !body.equals(Buffer.from(expectedBytes))) throw new Error("selected diagnostic bank changed before response");
  const bank = diagnosticBankSchema.parse(YAML.parse(body.toString("utf8")) as unknown);
  let verdict: { valid: boolean; reason: string | null }, signatureExists = pathExists(sigPath);
  try { const sidecar = orgPairBytes(captureOrgFiles([sigPath]), sigPath); signatureExists = sidecar !== null;
    verdict = sidecar === null ? { valid: false, reason: "signature missing" } : verifyAuditorSignatureBytes(workspace, "BUNDLE", body, sidecar); }
  catch (error) { verdict = { valid: false, reason: String(error) }; }
  return { bank, signature: { ...verdict, signatureExists, path, sigPath } };
}
export class DiagnosticBankFollowupError extends Error {
  readonly code = "DIAGNOSTIC_BANK_FOLLOWUP_INCOMPLETE";
  constructor(readonly completedPaths: readonly string[], cause: unknown) {
    super("diagnostic bank was published before a later consumer phase failed", { cause }); this.name = "DiagnosticBankFollowupError";
  }
}
export function verifyDiagnosticBankSignature(workspace: string) {
  const path = diagnosticBankPath(workspace), sigPath = `${path}.sig`;
  try {
    const previous = captureOrgPairs([path]), body = orgPairBytes(previous, path), signature = orgPairBytes(previous, sigPath);
    if (body === null) return { valid: false, signatureExists: false, reason: "diagnostic bank missing", path, sigPath };
    if (signature === null) return { valid: false, signatureExists: false, reason: "signature missing", path, sigPath };
    return { ...verifyAuditorSignatureBytes(workspace, "BUNDLE", body, signature), signatureExists: true, path, sigPath };
  } catch (error) { return { valid: false, signatureExists: pathExists(sigPath), reason: String(error), path, sigPath }; }
}
