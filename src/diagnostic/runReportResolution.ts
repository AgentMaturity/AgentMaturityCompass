/**
 * Locating a recorded diagnostic run by id or alias ("latest", "prev").
 *
 * Split from runner.ts with G9-02: these readers SELECT which report a command
 * like `amc report latest` displays — they do not score, which is why they are
 * deliberately permissive where scoring consumers go through
 * `sealedRunReportVerifies` instead. Keeping them in their own module keeps
 * that boundary visible.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { resolveRunAlias } from "./runAliases.js";
import { sealedRunReportVerifies } from "./reportSeal.js";
import { runHashVerificationKeys } from "../ledger/runHashSignature.js";
import { sha256Hex } from "../utils/hash.js";
import type { DiagnosticReport } from "../types.js";

/** A run id names a file (`<runsDir>/<runId>.json`), so nothing that could leave the runs directory is one. */
const RUN_ID = /^[A-Za-z0-9_-]+$/;

export function loadRunReport(workspace: string, runId: string, agentId?: string): DiagnosticReport {
  if (!RUN_ID.test(runId)) throw Object.assign(new Error(`RUN_ID_INVALID: ${JSON.stringify(runId.slice(0, 80))} is not a run id`), { code: "RUN_ID_INVALID" });
  const agentPaths = getAgentPaths(workspace, agentId);
  const scopedFile = join(agentPaths.runsDir, `${runId}.json`);
  if (pathExists(scopedFile)) {
    return JSON.parse(readUtf8(scopedFile)) as DiagnosticReport;
  }
  const legacyFile = join(workspace, ".amc", "runs", `${runId}.json`);
  return JSON.parse(readUtf8(legacyFile)) as DiagnosticReport;
}

export interface ResolvedRunReport {
  requestedRunId: string;
  resolvedRunId: string;
  resolvedBy: "exact" | "latest" | "alias" | "prefix";
  alias?: string;
  report: DiagnosticReport;
}

function listRunReportCandidates(workspace: string, agentId?: string): DiagnosticReport[] {
  const resolvedAgentId = resolveAgentId(workspace, agentId);
  const agentPaths = getAgentPaths(workspace, resolvedAgentId);
  const legacyRunsDir = join(workspace, ".amc", "runs");
  const dirs = Array.from(new Set([agentPaths.runsDir, legacyRunsDir]));
  const reports: DiagnosticReport[] = [];

  for (const dir of dirs) {
    if (!pathExists(dir)) {
      continue;
    }
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) {
        continue;
      }
      // Deliberately UNVERIFIED: this resolves which report a command like
      // `amc report latest` displays — it selects, it does not score. Refusing
      // unsigned files here would brick lookup on noSign workspaces; scoring
      // consumers go through sealedRunReportVerifies instead (G9-02).
      try {
        const report = JSON.parse(readUtf8(join(dir, file))) as DiagnosticReport;
        if (report.agentId && report.agentId !== resolvedAgentId) {
          continue;
        }
        reports.push(report);
      } catch {
        // Ignore corrupt legacy run files when resolving convenience aliases.
      }
    }
  }

  return reports.sort((a, b) => b.ts - a.ts);
}

export function resolveRunReport(workspace: string, runId: string, agentId?: string): ResolvedRunReport {
  const requestedRunId = runId.trim();
  if (!requestedRunId) {
    throw new Error("runId is required.");
  }

  if (requestedRunId.toLowerCase() === "latest") {
    const reports = listRunReportCandidates(workspace, agentId);
    const report = reports.find((row) => row.status === "VALID") ?? reports[0];
    if (!report) {
      throw new Error(`No diagnostic runs found for agent ${resolveAgentId(workspace, agentId)}.`);
    }
    return {
      requestedRunId,
      resolvedRunId: report.runId,
      resolvedBy: "latest",
      report
    };
  }

  try {
    const report = loadRunReport(workspace, requestedRunId, agentId);
    return {
      requestedRunId,
      resolvedRunId: report.runId,
      resolvedBy: "exact",
      report
    };
  } catch {
    const alias = resolveRunAlias(workspace, requestedRunId, agentId);
    if (alias) {
      try {
        const report = loadRunReport(workspace, alias.runId, agentId);
        return {
          requestedRunId,
          resolvedRunId: report.runId,
          resolvedBy: "alias",
          alias: alias.alias,
          report
        };
      } catch {
        throw new Error(`Run alias "${alias.alias}" points to missing run "${alias.runId}".`);
      }
    }

    const matches = listRunReportCandidates(workspace, agentId).filter((report) => report.runId.startsWith(requestedRunId));
    if (matches.length === 1) {
      return {
        requestedRunId,
        resolvedRunId: matches[0]!.runId,
        resolvedBy: "prefix",
        report: matches[0]!
      };
    }
    if (matches.length > 1) {
      throw new Error(`Run ID prefix "${requestedRunId}" is ambiguous; matched ${matches.length} runs.`);
    }
    throw new Error(`No runId found matching "${requestedRunId}".`);
  }
}

/**
 * The agent's run files, oldest name first, in the runs directory the runner writes (getAgentPaths): `.amc/runs` for a
 * root-scoped default agent, `.amc/agents/<id>/runs` otherwise. Every "latest run" reader goes through here.
 */
export function agentRunFiles(workspace: string, agentId: string): string[] {
  const runsDir = getAgentPaths(workspace, agentId).runsDir;
  if (!pathExists(runsDir)) return [];
  return readdirSync(runsDir).filter((name) => name.endsWith(".json")).sort((a, b) => a.localeCompare(b))
    .map((name) => join(runsDir, name));
}

/** The newest run file's id (its name), or null when the agent has none. */
export function latestRunId(workspace: string, agentId: string): string | null {
  const latest = agentRunFiles(workspace, agentId).at(-1);
  return latest ? basename(latest, ".json") : null;
}

/** The newest run file's summary, for the "Latest run" lines and `--run latest`. */
export function latestRunSummary(workspace: string, agentId: string): { runId: string; integrityIndex: number; trustLabel: string } | null {
  const latest = agentRunFiles(workspace, agentId).at(-1);
  if (!latest) return null;
  try {
    const parsed = JSON.parse(readUtf8(latest)) as { runId?: string; integrityIndex?: number; trustLabel?: string };
    if (!parsed.runId) return null;
    return { runId: parsed.runId, integrityIndex: Number(parsed.integrityIndex ?? 0), trustLabel: String(parsed.trustLabel ?? "UNKNOWN") };
  } catch {
    return null;
  }
}

/** A run file the verifying reader refused: unparseable, unsealed, or sealed but failing (tampered). */
export interface RefusedRun {
  file: string;
  /** The ts the file claims, or null when unreadable. Attacker-controlled: never trusted to place a tampered file in time. */
  ts: number | null;
  /** Unreadable, or it carries a seal that fails: evidence of tampering rather than an honest unsigned run. */
  tampered: boolean;
}

/** What one run file's exact bytes (by digest) say under one set of verification keys; it holds no report bytes. */
interface RunFileVerdict {
  /** The file's stat identity, or "" while it changed too recently for its stat to vouch for its bytes. */
  stat: string;
  digest: string;
  keys: string;
  /** The scan that last used it: a scan never evicts verdicts it already used (see `remember`). */
  scan: number;
  verified: boolean;
  head: { ts: number; runId: string };
  refused: RefusedRun;
}

/** One file's verdict in one scan, with its bytes when this scan read them. */
interface ScannedFile { file: string; verdict: RunFileVerdict; bytes: Buffer | null }

// Gates re-read every run file at each currentness check (a passport publication does so hundreds of times). A verdict
// is reused without reading the file while its stat identity is unchanged, and without re-verifying while its digest is.
// ponytail: LRU over verdict count, ~300 bytes each; past MAX_CACHED_VERDICTS files in one scan the extra files miss.
const verdicts = new Map<string, RunFileVerdict>();
export const MAX_CACHED_VERDICTS = 4096;
/** A file changed within this window may change again inside one timestamp tick, so its stat does not vouch for it. */
const RACY_MS = 2_000;
let scans = 0;

function statIdentity(file: string): { key: string; changedMs: number } | null {
  try {
    const st = statSync(file, { bigint: true });
    return { key: `${st.dev}:${st.ino}:${st.size}:${st.mtimeNs}:${st.ctimeNs}`, changedMs: Number(st.ctimeMs > st.mtimeMs ? st.ctimeMs : st.mtimeMs) };
  } catch {
    return null;
  }
}

/** Most recently used last. A full cache evicts its least recently used verdict, unless this scan already used it. */
function remember(file: string, verdict: RunFileVerdict): void {
  verdicts.delete(file);
  if (verdicts.size >= MAX_CACHED_VERDICTS) {
    const [oldest, row] = verdicts.entries().next().value as [string, RunFileVerdict];
    if (row.scan === verdict.scan) return;
    verdicts.delete(oldest);
  }
  verdicts.set(file, verdict);
}

function runFileVerdict(workspace: string, file: string, keys: readonly string[] | null, scan: number, trustStat: boolean): ScannedFile | null {
  const keyText = keys === null ? null : JSON.stringify(keys), known = keyText === null ? undefined : verdicts.get(file);
  const stat = statIdentity(file);
  const usable = known !== undefined && known.keys === keyText;
  if (trustStat && usable && stat !== null && known.stat === stat.key && known.stat !== "") {
    const verdict = { ...known, scan };
    remember(file, verdict);
    return { file, verdict, bytes: null };
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch {
    return null;
  }
  const digest = sha256Hex(bytes);
  const statKey = stat !== null && stat.changedMs < Date.now() - RACY_MS ? stat.key : "";
  if (usable && known.digest === digest) {
    const verdict = { ...known, stat: statKey, scan };
    remember(file, verdict);
    return { file, verdict, bytes };
  }
  let parsed: Record<string, unknown> | null, unparseable = false;
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as Record<string, unknown> | null;
  } catch {
    parsed = null; unparseable = true;
  }
  const verified = parsed !== null && typeof parsed === "object" && keys !== null && sealedRunReportVerifies(workspace, parsed, keys);
  const seal = parsed?.runSealSig;
  const verdict: RunFileVerdict = { stat: statKey, digest, keys: keyText ?? "", scan, verified, head: { ts: parsed?.ts as number, runId: parsed?.runId as string },
    refused: unparseable ? { file, ts: null, tampered: true }
      : { file, ts: typeof parsed?.ts === "number" && Number.isFinite(parsed.ts) ? parsed.ts : null,
        tampered: typeof seal === "string" && seal.length > 0 && seal !== "unsigned" } };
  if (keyText !== null) remember(file, verdict);
  return { file, verdict, bytes };
}

/** Every run file's verdict, the sealed ones newest first (the order `scanVerifiedRuns` returns runs in). */
function runFileVerdicts(workspace: string, agentId: string, trustStat: boolean): { sealed: ScannedFile[]; refused: RefusedRun[] } {
  let keys: readonly string[] | null;
  try {
    keys = runHashVerificationKeys(workspace);
  } catch {
    keys = null;
  }
  const scan = ++scans, sealed: ScannedFile[] = [], refused: RefusedRun[] = [];
  for (const file of agentRunFiles(workspace, agentId)) {
    const scanned = runFileVerdict(workspace, file, keys, scan, trustStat);
    if (scanned === null) refused.push({ file, ts: null, tampered: true });
    else if (scanned.verdict.verified) sealed.push(scanned);
    else refused.push({ ...scanned.verdict.refused });
  }
  sealed.sort((a, b) => b.verdict.head.ts - a.verdict.head.ts || b.verdict.head.runId.localeCompare(a.verdict.head.runId));
  return { sealed, refused };
}

/**
 * A fresh report for each caller, parsed from bytes whose digest is the verified one; null when the file changed after
 * its stat vouched for it, and the caller then scans again reading every file.
 */
function sealedRun(scanned: ScannedFile): DiagnosticReport | null {
  let bytes = scanned.bytes;
  if (bytes === null) {
    try {
      bytes = readFileSync(scanned.file);
    } catch {
      return null;
    }
    if (sha256Hex(bytes) !== scanned.verdict.digest) return null;
  }
  return JSON.parse(bytes.toString("utf8")) as DiagnosticReport;
}

/** `pick` over a scan that trusts unchanged stats, or over one that reads every file when a picked file changed since. */
function withSealedRuns<T>(workspace: string, agentId: string,
  pick: (sealed: ScannedFile[], refused: RefusedRun[], read: (row: ScannedFile) => DiagnosticReport) => T): T {
  class Changed extends Error {}
  const read = (row: ScannedFile) => sealedRun(row) ?? (() => { throw new Changed(); })();
  try {
    const { sealed, refused } = runFileVerdicts(workspace, agentId, true);
    return pick(sealed, refused, read);
  } catch (error) {
    if (!(error instanceof Changed)) throw error;
    const { sealed, refused } = runFileVerdicts(workspace, agentId, false);
    return pick(sealed, refused, (row) => sealedRun(row)!);
  }
}

/**
 * The seal-only run reader (WP37): the agent's runs whose seal verifies (`sealedRunReportVerifies`), newest first,
 * and every file it refused. The seal is the only check here: nothing binds a run to this agent or to the ledger.
 * Gates and signers read through `latestTrustedRun` / `scanTrustedRuns` (governor/runTrust.ts), which add the agent
 * binding, the ledger anchor and the rollback guard on top; display reads `agentRunFiles`/`loadRunReport`.
 */
export function scanVerifiedRuns(workspace: string, agentId: string): { runs: DiagnosticReport[]; refused: RefusedRun[] } {
  return withSealedRuns(workspace, agentId, (sealed, refused, read) => ({ runs: sealed.map(read), refused }));
}

/** The sealed runs only, newest first; see `scanVerifiedRuns` for the refused files. */
export function listVerifiedRuns(workspace: string, agentId: string): DiagnosticReport[] {
  return scanVerifiedRuns(workspace, agentId).runs;
}

/**
 * Refused runs that block using `selectedTs` as the latest evidence: anything tampered or unreadable (its claimed ts
 * cannot be trusted), and any honest unsigned run newer than the selection. Non-empty means a consumer would roll
 * back to stale evidence, so signing refuses and gates report INSUFFICIENT_EVIDENCE.
 */
export function refusedRunsBlocking(refused: readonly RefusedRun[], selectedTs: number | null): RefusedRun[] {
  return refused.filter((row) => row.tampered || row.ts === null || selectedTs === null || row.ts > selectedTs);
}

/**
 * The newest sealed run, or null with the refused files that block it: a tampered or newer unverifiable run must not
 * silently roll the consumer back to an older sealed run. Seal-only: a gate or signer uses `latestTrustedRun`.
 */
export function latestVerifiedRun(workspace: string, agentId: string): { run: DiagnosticReport | null; blocking: RefusedRun[] } {
  // Only the newest sealed run is parsed for the caller: the rest are read just to order them and find blockers.
  return withSealedRuns(workspace, agentId, (sealed, refused, read) => {
    const blocking = refusedRunsBlocking(refused, sealed[0]?.verdict.head.ts ?? null);
    return { run: blocking.length > 0 || !sealed[0] ? null : read(sealed[0]), blocking };
  });
}

/**
 * `loadRunReport` with the seal checked and the run bound to what was asked: null when it is missing, unreadable, its
 * seal fails, it names another run id, or (given an agent) another agent. Not ledger-anchored: gates and signers use
 * `latestTrustedRun` / `scanTrustedRuns` (governor/runTrust.ts).
 */
export function loadVerifiedRunReport(workspace: string, runId: string, agentId?: string): DiagnosticReport | null {
  try {
    const report = loadRunReport(workspace, runId, agentId);
    if (report.runId !== runId || (agentId !== undefined && report.agentId !== agentId)) return null;
    return sealedRunReportVerifies(workspace, report as unknown as Record<string, unknown>) ? report : null;
  } catch {
    return null;
  }
}

/**
 * The newest run for display only (dashboards, `unknowns`, `meta-confidence`, rollup claim lines): the permissive
 * `latest` selection plus whether its seal verifies, so the caller labels an unverified run. Never feed it to a gate or
 * a signer; those use `latestTrustedRun` (governor) or `latestVerifiedRun`.
 */
export function latestDisplayRun(workspace: string, agentId: string): { report: DiagnosticReport; verified: boolean } | null {
  let report: DiagnosticReport;
  try {
    report = resolveRunReport(workspace, "latest", agentId).report;
  } catch {
    return null;
  }
  return { report, verified: sealedRunReportVerifies(workspace, report as unknown as Record<string, unknown>) };
}
