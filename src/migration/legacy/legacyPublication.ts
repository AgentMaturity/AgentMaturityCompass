import { appendFileSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync, type Stats } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { assertPolicySignerCurrent, describePolicySigner } from "../../crypto/signing/signer.js";
import { assertKeysetComplete } from "../../keys/keyset.js";
import { captureRunHashAuthority } from "../../ledger/runHashSignature.js";
import { withControlFileLock } from "../../lifecycle/controlFileLock.js";
import { prepareFileSignatureWithAuditor } from "../../org/orgSigner.js";
import { assertOrgPairsCurrent, captureOrgFiles, orgPairBytes, type OrgPairsSnapshot } from "../../org/preparedOrgPairs.js";
import { loadTrustConfig } from "../../trust/trustConfig.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { isWithin, physicalPathWithMissingSuffix } from "../../utils/pathSafety.js";
import { prepareReceipt, RECEIPTS_DIR, type MigrationReceipt } from "./receipt.js";
import { RELABEL_LOG, verifyRelabelLog, type RelabelLogCheck } from "./relabelLog.js";

const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const identity = (stat: { dev: number; ino: number }) => `${stat.dev}:${stat.ino}`;
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

/** Point-in-time input selection; existing symlink inputs retain their original physical choice. No verifier is fabricated. */
export function captureLegacySources(workspace: string, paths: readonly string[]) {
  const logPath = physicalPathWithMissingSuffix(join(workspace, RELABEL_LOG));
  const receipts = physicalPathWithMissingSuffix(join(workspace, RECEIPTS_DIR));
  const migrationNamespace = physicalPathWithMissingSuffix(dirname(join(workspace, RELABEL_LOG)));
  const lock = physicalPathWithMissingSuffix(join(workspace, ".amc", ".legacy-relabel-publication.lock"));
  const contenders = physicalPathWithMissingSuffix(join(workspace, ".amc", ".legacy-relabel-publication-locks"));
  const logStat = lstatSync(join(workspace, RELABEL_LOG), { throwIfNoEntry: false });
  const observe = (path: string) => {
    const physical = physicalPathWithMissingSuffix(path);
    if (physical === migrationNamespace || physical === logPath || isWithin(receipts, physical) || physical === lock || isWithin(contenders, physical))
      throw new Error("legacy relabel input aliases its publication setup directory, log, receipt namespace or lock controls");
    let first: Stats;
    try { first = lstatSync(physical); }
    catch (error) { if (missing(error)) return { path, physical, absent: true }; throw error; }
    if (logStat?.isFile() && identity(first) === identity(logStat))
      throw new Error("legacy relabel input is a hard-link alias of its publication log");
    const metadata = { path, physical, mode: first.mode, identity: identity(first), type: first.isFile() ? "file" : "other" };
    if (!first.isFile()) return metadata; // The existing scanner still reports its own unreadable/non-result verdict.
    let bytes: Buffer;
    try { bytes = readFileSync(physical); }
    catch (error) { return { ...metadata, unreadable: message(error) }; }
    const last = lstatSync(physical);
    if (identity(first) !== identity(last) || first.size !== last.size || first.mtimeMs !== last.mtimeMs || first.mode !== last.mode)
      throw new Error("legacy relabel source changed while being captured");
    return { ...metadata, sha256: sha256Hex(bytes) };
  };
  const selected = [...new Set(paths.map(path => resolve(workspace, path)))];
  const rows = selected.map(observe), original = canonicalize(rows);
  const hashes = new Map(rows.map(row => [row.path, "sha256" in row ? row.sha256 : null]));
  return Object.freeze({ assertCurrent() {
    if (canonicalize(selected.map(observe)) !== original) throw new Error("original legacy relabel source changed while preparing publication");
  }, assertScanned(path: string, hash: string | null) {
    const selectedPath = resolve(workspace, path);
    if (!hashes.has(selectedPath) || hashes.get(selectedPath) !== hash)
      throw new Error("legacy relabel scan did not observe the originally selected source bytes");
  } });
}

interface Directory {
  path: string; physical: string; identity: string | null; mode: number | null; names: string[] | null;
}
function directory(path: string, roster: boolean): Directory {
  const physical = physicalPathWithMissingSuffix(path);
  let stat: Stats;
  try { stat = lstatSync(physical); }
  catch (error) { if (missing(error)) return { path, physical, identity: null, mode: null, names: roster ? [] : null }; throw error; }
  if (!stat.isDirectory()) throw new Error("legacy relabel publication namespace must be a directory");
  const names = roster ? readdirSync(physical).sort() : null;
  const last = lstatSync(physical);
  if (identity(stat) !== identity(last) || stat.mode !== last.mode) throw new Error("legacy relabel publication namespace changed while reading");
  return { path, physical, identity: identity(last), mode: last.mode & 0o777, names };
}

/** Native entry, return and acknowledgment are distinct; setup effects are independent of file attempts. */
export class LegacyRelabelPublicationError extends Error {
  readonly code = "LEGACY_RELABEL_PARTIAL";
  constructor(readonly attemptedPath: string | null, readonly returnedPaths: readonly string[], readonly acknowledgedPaths: readonly string[],
    readonly setupAttempts: readonly string[], readonly setupReturns: readonly string[], cause: unknown) {
    super("legacy relabel publication is incomplete; inspect the log and receipt members before retrying", { cause });
    this.name = "LegacyRelabelPublicationError";
  }
}

/** Capture the actual MIGRATION_RECEIPT operation before the scanner's FIRST await. No signing probe is made. */
export function captureLegacyPublication(workspace: string, originalLog: Extract<RelabelLogCheck, { ok: true }>) {
  if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
  const descriptor = Object.freeze({ ...describePolicySigner(workspace, "MIGRATION_RECEIPT") });
  const rawAuthority = descriptor.mode === "VAULT" ? captureRunHashAuthority(workspace, false) : null;
  const keyset = canonicalize(assertKeysetComplete(workspace)), trust = canonicalize(loadTrustConfig(workspace));
  const mask = process.umask(), logPath = join(workspace, RELABEL_LOG), receiptsPath = join(workspace, RECEIPTS_DIR);
  const namespacePaths = [join(workspace, ".amc"), dirname(logPath), receiptsPath];
  const readNamespace = () => namespacePaths.map(path => directory(path, path === receiptsPath));
  const originalNamespace = readNamespace();
  const names = originalNamespace[2]!.names!.filter(name => name.endsWith(".json"));
  const original = captureOrgFiles([logPath, ...names.flatMap(name => [join(receiptsPath, name), join(receiptsPath, `${name}.sig`)])]);
  const originalLogState = canonicalize(originalLog);
  const assertAuthority = () => {
    assertPolicySignerCurrent(workspace, descriptor); rawAuthority?.();
    if (canonicalize(assertKeysetComplete(workspace)) !== keyset || canonicalize(loadTrustConfig(workspace)) !== trust)
      throw new Error("original MIGRATION_RECEIPT signing authority changed while scanning");
    if (process.umask() !== mask) throw new Error("legacy relabel publication umask changed while scanning");
  };
  const assertNamespace = (expected: readonly Directory[]) => {
    if (canonicalize(readNamespace()) !== canonicalize(expected)) throw new Error("original legacy relabel publication namespace changed");
  };
  const assertPrefix = () => {
    if (canonicalize(verifyRelabelLog(workspace)) !== originalLogState)
      throw new Error("original legacy relabel prefix or receipt admission changed while scanning");
  };
  const assertPreparing = () => {
    assertAuthority(); assertNamespace(originalNamespace); assertOrgPairsCurrent(original); assertPrefix();
    assertNamespace(originalNamespace); assertOrgPairsCurrent(original);
  };
  assertPreparing();
  return Object.freeze({ assertCurrent: assertPreparing,
    async publish(receipt: MigrationReceipt, inputLines: readonly string[], assertInputsCurrent: () => void): Promise<string> {
      const lines = [...inputLines], preparedReceipt = structuredClone(receipt); assertInputsCurrent(); assertPreparing();
      const out = prepareReceipt(workspace, preparedReceipt);
      if (lines.length > 0 && names.length > 0 && basename(out.path) <= names[names.length - 1]!)
        throw new Error("legacy relabel receipt timestamp is not after the original latest receipt; refusing to append");
      const bodyPath = join(workspace, out.path), signaturePath = `${bodyPath}.sig`;
      const targets = captureOrgFiles([bodyPath, signaturePath]);
      if (targets.members.some(row => row.bytes !== null)) throw new Error(`receipt or signature already exists: ${out.path}`);
      if (!isWithin(originalNamespace[2]!.physical, physicalPathWithMissingSuffix(bodyPath)))
        throw new Error("legacy relabel receipt escaped its original namespace");
      const prefix = orgPairBytes(original, logPath) ?? Buffer.alloc(0);
      if (lines.length > 0 && prefix.length > 0 && prefix[prefix.length - 1] !== 10)
        throw new Error("legacy relabel prefix has no final newline; refusing to append before signing");
      const suffix = Buffer.from(lines.length > 0 ? `${lines.join("\n")}\n` : "");
      const logBytes = Buffer.concat([prefix, suffix]);
      const expected: { members: OrgPairsSnapshot["members"][number][] } = { members: [...original.members, ...targets.members].map(row => ({ ...row, bytes: row.bytes === null ? null : Buffer.from(row.bytes) })) };
      let expectedNamespace = originalNamespace.map(row => ({ ...row, names: row.names === null ? null : [...row.names] }));
      const assertExpected = () => {
        assertNamespace(expectedNamespace); assertOrgPairsCurrent(expected);
        const stat = lstatSync(logPath, { throwIfNoEntry: false });
        if (stat !== undefined && (!stat.isFile() || stat.nlink !== 1)) throw new Error("legacy relabel log must be a single-link regular file");
      };
      const beforeSign = () => { assertInputsCurrent(); assertPreparing(); assertExpected(); };
      beforeSign();
      const signed = await prepareFileSignatureWithAuditor(workspace, bodyPath, Buffer.from(out.json), "MIGRATION_RECEIPT", beforeSign);
      beforeSign(); signed.assertCurrent();
      const stable = () => { assertInputsCurrent(); assertAuthority(); signed.assertCurrent(); };
      return withControlFileLock({ root: join(workspace, ".amc"), name: "legacy-relabel-publication", operation: () => {
        const returned: string[] = [], acknowledged: string[] = [], setupAttempts: string[] = [], setupReturns: string[] = [];
        let attempted: string | null = null;
        const gate = () => { stable(); assertExpected(); };
        const setup = (path: string) => {
          attempted = null; gate();
          const before = expectedNamespace;
          setupAttempts.push(path);
          const firstCreated = mkdirSync(path, { recursive: true });
          setupReturns.push(path);
          const next = readNamespace();
          for (let index = 0; index < before.length; index += 1) {
            const old = before[index]!, actual = next[index]!;
            if (old.identity === null && isWithin(old.path, path)) {
              if (firstCreated === undefined || old.physical !== actual.physical || actual.identity === null
                || actual.mode !== (0o777 & ~mask) || canonicalize(old.names) !== canonicalize(actual.names))
                throw new Error("legacy relabel directory setup did not acknowledge the original namespace");
            } else if (canonicalize(old) !== canonicalize(actual)) throw new Error("legacy relabel namespace changed during directory setup");
          }
          expectedNamespace = next; gate();
        };
        const acknowledge = (path: string, bytes: Buffer, preserveIdentity: boolean) => {
          const index = expected.members.findIndex(row => row.path === path);
          if (index < 0) throw new Error("legacy relabel member was not originally selected");
          const old = expected.members[index]!, own = captureOrgFiles([path]).members[0]!;
          const stat = lstatSync(path), mode = old.mode ?? (0o666 & ~mask);
          if (own.bytes === null || !own.bytes.equals(bytes) || own.mode !== mode || stat.nlink !== 1
            || (preserveIdentity && old.identity !== null && own.identity !== old.identity))
            throw new Error("legacy relabel member did not acknowledge exact prepared bytes, mode and identity");
          const next = readNamespace();
          const expectedNames = expectedNamespace.map(row => ({ ...row, names: row.names === null ? null : [...row.names] }));
          if (dirname(path) === receiptsPath) expectedNames[2]!.names = [...expectedNames[2]!.names!, basename(path)].sort();
          if (canonicalize(next) !== canonicalize(expectedNames)) throw new Error("legacy relabel namespace changed during member acknowledgment");
          expected.members[index] = own; expectedNamespace = next; acknowledged.push(path); attempted = null;
          gate();
        };
        try {
          beforeSign(); gate();
          if (lines.length > 0) {
            setup(dirname(logPath)); gate(); attempted = logPath;
            appendFileSync(logPath, suffix); returned.push(logPath);
            acknowledge(logPath, logBytes, true);
          }
          setup(receiptsPath);
          const signatureBytes = Buffer.from(`${signed.signatureBytes}\n`);
          gate(); attempted = signaturePath;
          writeFileSync(signaturePath, signatureBytes, { flag: "wx" }); returned.push(signaturePath);
          acknowledge(signaturePath, signatureBytes, false);
          gate(); attempted = bodyPath;
          writeFileSync(bodyPath, out.json, { flag: "wx" }); returned.push(bodyPath);
          acknowledge(bodyPath, Buffer.from(out.json), false);
          gate();
          const final = verifyRelabelLog(workspace);
          if (!final.ok || final.records.length !== preparedReceipt.relabelLogLines || final.head !== preparedReceipt.relabelLogHead)
            throw new Error("published legacy relabel log and receipt do not attest the prepared chain");
          gate(); return out.path;
        } catch (error) {
          if (attempted === null && returned.length === 0 && setupAttempts.length === 0) throw error;
          throw new LegacyRelabelPublicationError(attempted, Object.freeze([...returned]), Object.freeze([...acknowledged]),
            Object.freeze([...setupAttempts]), Object.freeze([...setupReturns]), error);
        }
      } });
    }
  });
}
