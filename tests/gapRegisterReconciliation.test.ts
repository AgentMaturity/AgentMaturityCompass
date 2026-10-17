import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const MAIN = "5ea5e866a42acd5c8228a712e9b8c1d9f18c745c";
const groups = { G1: 50, G2: 46, G3: 32, G4: 40, G5: 37, G6: 26, G7: 24, G8: 35 };
const statuses = ["implemented", "deleted", "relabelled", "withdrawn", "deferred", "mitigated", "open"];
const finalWithCommit = new Set(["implemented", "deleted", "relabelled"]);
const nonFinal = new Set(["deferred", "mitigated", "open"]);
const supplementalIds = ["G7-13b", "G8-25b"];
// Preserved draft's routing-key catalog. Membership does not prove matching ownership or human acceptance.
const planKeys = new Set([
  "D-04", "P0-03", "P0-09", "P0-15", "P0-18", "P0-22", "P0-24", "P0-27", "P0-28", "P0-33", "P0-34",
  "P0-35", "P0-37", "P1-01", "P1-08", "P1-12", "P1-51", "P2-01", "P2-07", "P2-09", "P2-27", "P2-29"
]);
const pausedRouteAllowed = (row: Row, paused: string) =>
  (paused === "AMC-1500" && (row.id.startsWith("G4-") || row.id === "G2-45")) ||
  (paused === "AMC-1503" && row.id.startsWith("G7-"));
const lines = (text: string) => text.split("\n");
const cells = (raw: string) => raw.split(/(?<!\\)\|/).slice(1, -1).map(cell => cell.trim());
const register = lines(readFileSync(join(root, "plans/amc-gap-register.md"), "utf8"))
  .flatMap((raw, index) => /^\| (G[1-8]-\d+[a-z]?) \|/.test(raw) ? [{ id: cells(raw)[0], raw, line: index + 1, cells: cells(raw) }] : []);
const registerIds = register.map(row => row.id).sort();

type LogEntry = { line: number; label: string; status: string; commitText: string | null; verification: string;
  raw: string; expandedIds: string[] };
type FileEvidence = { path: string; gitBlob: string; sha256: string; bytes?: number; main?: string;
  firstLine?: number; lastLine?: number; excerpt?: string };
type Row = { id: string; group: string; oldIssue: string; title: string; severity: string; registerDisposition: string;
  registerLine: number; registerRaw: string | null; registerEvidence: string | null; location: string;
  status: string; commits: string[]; reason: string | null; successor: { planKey: string | null; paused: string | null };
  successorResolved: boolean; sourceRefs: string[]; logEntries: LogEntry[];
  mainInventory: { resolvedNamedPaths: FileEvidence[]; absentNamedPaths: string[];
    directories?: Array<{ path: string; main: string; members: string[] }>; unresolvedExpressions?: string[] };
  absenceEvidence: null | { mainTree: string; paths: string[]; presentMembers: string[] } };
type Reconciliation = { schemaVersion: number; verifiedOn: { main: string; date: string }; base: string;
  counts: { rows: number; byGroup: Record<string, number>; byStatus: Record<string, number> };
  rows: Row[]; supplemental: Row[]; needsSuccessor: string[]; sourceEvidence: Record<string, FileEvidence>;
  commitEvidence: Array<{ reference: string; resolved: string; main: string; ancestry: string; exitCode: number }>;
  provenance: { historicalLog: { literalLeadingGRows: number; keyedG1G8Entries: number; entries: LogEntry[];
    excludedLeadingGRows: Array<{ line: number; raw: string }> } } };
const readReconciliation = () => JSON.parse(readFileSync(join(root, "docs/program/gap-register-reconciliation.json"), "utf8")) as Reconciliation;
const allRows = (data: Reconciliation) => [...data.rows, ...data.supplemental];

/** This is the sole guard for candidate row membership, cardinality and duplicates. */
function membershipFailures(rows: Row[]): string[] {
  const actual = rows.map(row => row.id);
  const failures: string[] = [];
  const missing = registerIds.filter(id => !actual.includes(id));
  const extras = actual.filter(id => !registerIds.includes(id));
  const duplicates = actual.filter((id, index) => actual.indexOf(id) !== index);
  if (missing.length) failures.push(`Missing register IDs: ${missing.join(", ")}`);
  if (extras.length) failures.push(`Extra register IDs: ${extras.join(", ")}`);
  if (duplicates.length) failures.push(`Duplicate register IDs: ${duplicates.join(", ")}`);
  if (actual.length !== registerIds.length) failures.push(`Register cardinality: ${actual.length} instead of ${registerIds.length}`);
  return failures;
}

function rowFailures(rows: Row[]): string[] {
  return rows.flatMap(row => {
    const failures: string[] = [];
    if (!statuses.includes(row.status)) failures.push(`${row.id}: invalid status ${row.status}`);
    if (finalWithCommit.has(row.status) && row.commits.length === 0) failures.push(`${row.id}: ${row.status} has no commit`);
    if (row.commits.some(commit => !/^[0-9a-f]{8,40}$/.test(commit))) failures.push(`${row.id}: invalid commit`);
    if (row.status === "withdrawn" && !row.reason?.trim()) failures.push(`${row.id}: withdrawal has no reason`);
    return failures;
  });
}

function successorFailures(rows: Row[]): string[] {
  return rows.flatMap(row => {
    const plan = row.successor.planKey;
    const paused = row.successor.paused;
    if (plan && !planKeys.has(plan)) return [`${row.id}: unknown plan key ${plan}`];
    if (paused && !pausedRouteAllowed(row, paused)) return [`${row.id}: invalid paused group ${paused}`];
    if (!nonFinal.has(row.status)) return [];
    const routed = Boolean((plan && planKeys.has(plan)) || (paused && pausedRouteAllowed(row, paused)));
    return routed && row.successorResolved === true ? [] : [`${row.id}: unresolved successor`];
  });
}

/** Disposition checks remain independent of membership so its mutation can be isolated. */
const dispositionFailures = (data: Reconciliation) => [...rowFailures(allRows(data)), ...successorFailures(allRows(data))];
const acceptanceFailures = (data: Reconciliation) => [...membershipFailures(data.rows), ...dispositionFailures(data),
  ...finalEvidenceFailures(allRows(data), mainFiles())];
const git = (...args: string[]) => execFileSync("git", args, { cwd: root,
  env: { ...process.env, GIT_NO_LAZY_FETCH: "1" }, maxBuffer: 32 * 1024 * 1024 });
const textGit = (...args: string[]) => git(...args).toString("utf8").trim();
let pinnedFiles: Set<string> | undefined;
const mainFiles = () => pinnedFiles ??= new Set(textGit("ls-tree", "-r", "--name-only", MAIN).split("\n"));
const directoryMembers = (files: Set<string>, path: string) => [...files]
  .filter(file => file.startsWith(`${path.replace(/\/+$/, "")}/`)).sort();
const isLeafPath = (files: Set<string>, path: string) => path.length > 0 && !isAbsolute(path) &&
  !path.split("/").includes("..") && !path.endsWith("/") && !/[*?\[\]{}≈↔]/.test(path) &&
  !path.startsWith("--") && directoryMembers(files, path).length === 0;

function finalEvidenceFailures(rows: Row[], files: Set<string>): string[] {
  return rows.filter(row => finalWithCommit.has(row.status)).flatMap(row => {
    const absence = row.absenceEvidence;
    const absentWitness = absence !== null && absence.paths.length > 0 && absence.presentMembers.length === 0 &&
      absence.paths.every(path => isLeafPath(files, path) && !files.has(path));
    return row.sourceRefs.length > 0 || absentWitness ? [] : [`${row.id}: ${row.status} has no source or absent-file witness`];
  });
}

function expandLogLabel(label: string): string[] {
  const prefix = /^(G[1-8]-\d+[a-z]?(?:(?:\/|\.\.|,\s*)(?:G[1-8]-)?\d+[a-z]?)*)(?:\s|$)/.exec(label)?.[1];
  if (!prefix) return [];
  let group = "";
  const ids: string[] = [];
  for (const token of prefix.matchAll(/(G[1-8]-)?(\d+[a-z]?)(?:\.\.(G[1-8]-)?(\d+[a-z]?))?/g)) {
    if (token[1]) group = token[1].slice(0, -1);
    if (token[4]) {
      if (token[3] && token[3].slice(0, -1) !== group) throw new Error(`Cross-group range: ${label}`);
      if (!/^\d+$/.test(token[2]) || !/^\d+$/.test(token[4])) throw new Error(`Unsupported range: ${label}`);
      for (let number = Number(token[2]); number <= Number(token[4]); number += 1) ids.push(`${group}-${String(number).padStart(2, "0")}`);
    } else ids.push(`${group}-${token[2].padStart(2, "0")}`);
  }
  return [...new Set(ids)].sort();
}

describe("gap register reconciliation (P0-29)", () => {
  test("the historical register independently yields all 290 original IDs and group counts", () => {
    expect(registerIds).toHaveLength(290);
    expect(new Set(registerIds).size).toBe(290);
    expect(Object.fromEntries(Object.keys(groups).map(group => [group, registerIds.filter(id => id.startsWith(`${group}-`)).length])))
      .toEqual(groups);
    expect(registerIds).toContain("G8-17b");
    expect(registerIds).not.toContain("G7-13b");
    expect(registerIds).not.toContain("G8-25b");
  });

  test("candidate IDs equal the register exactly and supplemental IDs never replace originals", () => {
    const data = readReconciliation();
    expect(membershipFailures(data.rows)).toEqual([]);
    expect(data.supplemental.map(row => row.id).sort()).toEqual(supplementalIds);
    expect(data.schemaVersion).toBe(1);
    // These header counts describe the register, not a second membership guard over mutated candidate rows.
    expect(data.counts.rows).toBe(290);
    expect(data.counts.byGroup).toEqual(groups);
  });

  test("every disposition has a valid enum, necessary commit and withdrawal reason", () => {
    expect(rowFailures(allRows(readReconciliation()))).toEqual([]);
  });

  test("every non-final original and supplemental row records a resolved route using a catalog key or paused group", () => {
    const data = readReconciliation();
    const failures = successorFailures(allRows(data));
    expect(data.needsSuccessor.slice().sort()).toEqual(failures.map(failure => failure.split(":")[0]).sort());
    // A truthful unresolved list is debt, not an acceptance waiver. This fails while any of the 38 routes remain unresolved.
    expect(failures).toEqual([]);
  });

  test("preserves the six cached residual spot checks without treating historical COMPLETE as implementation", () => {
    const rows = readReconciliation().rows;
    const row = (id: string) => rows.find(candidate => candidate.id === id)!;
    expect(row("G6-07")).toMatchObject({ status: "open", successor: { planKey: "P0-09" } });
    expect(row("G5-18")).toMatchObject({ status: "open", successor: { planKey: "D-04" } });
    expect(row("G7-13").status).not.toBe("implemented");
    expect(row("G8-25").status).not.toBe("implemented");
    expect(row("G7-01").successor.paused).toBe("AMC-1503");
    expect(row("G8-02").successor.planKey).toBe("P2-09");
  });

  test("pins every source snippet and inventory observation to current main bytes, full SHA and Git blob", () => {
    const data = readReconciliation();
    expect(data.verifiedOn.main).toBe(MAIN);
    expect(data.base).toBe(MAIN);
    for (const path of ["plans/amc-gap-register.md", "plans/amc-gap-execution-log.md", "plans/amc-state-ledger.md"]) {
      expect(readFileSync(join(root, path)).equals(git("show", `${MAIN}:${path}`)), path).toBe(true);
    }
    const references = [...new Set(allRows(data).flatMap(row => row.sourceRefs))].sort();
    expect(references).toHaveLength(275);
    expect(Object.keys(data.sourceEvidence).sort()).toEqual(references);
    const current = new Map<string, Buffer>();
    const files = mainFiles();
    expect(finalEvidenceFailures(allRows(data), files)).toEqual([]);
    const verifyLeafPath = (path: string) => {
      expect(isLeafPath(files, path), path).toBe(true);
    };
    const verifyFile = (evidence: FileEvidence) => {
      expect(isAbsolute(evidence.path) || evidence.path.split("/").includes("..")).toBe(false);
      let bytes = current.get(evidence.path);
      if (!bytes) {
        // Reconciliation cites accepted main. Generated candidate count markers may differ from that historical source.
        bytes = git("show", `${MAIN}:${evidence.path}`);
        current.set(evidence.path, bytes);
      }
      expect(evidence.sha256, evidence.path).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(evidence.gitBlob, evidence.path).toBe(createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex"));
      if (evidence.bytes !== undefined) expect(evidence.bytes, evidence.path).toBe(bytes.length);
      return bytes;
    };
    for (const [reference, evidence] of Object.entries(data.sourceEvidence)) {
      expect(evidence.main, reference).toBe(MAIN);
      expect(reference).toBe(`${evidence.path}:${evidence.firstLine}-${evidence.lastLine}`);
      const source = lines(verifyFile(evidence).toString("utf8"));
      expect(Number.isInteger(evidence.firstLine) && Number.isInteger(evidence.lastLine)).toBe(true);
      expect(evidence.firstLine).toBeGreaterThanOrEqual(1);
      expect(evidence.lastLine).toBeGreaterThanOrEqual(evidence.firstLine!);
      expect(evidence.lastLine).toBeLessThanOrEqual(source.length);
      expect(evidence.excerpt, reference).toBe(source.slice(evidence.firstLine! - 1, evidence.lastLine).join("\n"));
    }
    for (const row of allRows(data)) {
      for (const evidence of row.mainInventory.resolvedNamedPaths) verifyFile(evidence);
      for (const directory of row.mainInventory.directories ?? []) {
        expect(directory.main, `${row.id}: ${directory.path}`).toBe(MAIN);
        expect(directory.path.length > 0 && !isAbsolute(directory.path) && !directory.path.split("/").includes(".."), directory.path).toBe(true);
        const members = directoryMembers(files, directory.path);
        // An empty tracked prefix is a directory observation, never a missing-leaf witness.
        expect(directory.members, `${row.id}: ${directory.path}`).toEqual(members);
      }
      for (const expression of row.mainInventory.unresolvedExpressions ?? []) {
        expect(typeof expression === "string" && expression.trim().length > 0).toBe(true);
        expect(row.mainInventory.absentNamedPaths).not.toContain(expression);
        expect(row.absenceEvidence?.paths ?? []).not.toContain(expression);
      }
      for (const path of row.mainInventory.absentNamedPaths) {
        verifyLeafPath(path);
        expect(files.has(path), `${row.id}: ${path}`).toBe(false);
      }
      if (row.absenceEvidence) {
        expect(row.absenceEvidence.mainTree).toBe(MAIN);
        for (const path of row.absenceEvidence.paths) verifyLeafPath(path);
        expect(row.absenceEvidence.presentMembers).toEqual(row.absenceEvidence.paths.filter(path => files.has(path)));
      }
    }
  });

  test("raw register/log lines and grouped expansions retain independent historical provenance", () => {
    const data = readReconciliation();
    const original = new Map(register.map(row => [row.id, row]));
    for (const row of data.rows) {
      const registered = original.get(row.id)!;
      expect(row.registerLine).toBe(registered.line);
      expect(row.registerRaw).toBe(registered.raw);
      expect([row.title, row.location, row.registerEvidence, row.severity, row.registerDisposition]).toEqual(registered.cells.slice(1));
      expect(row.group).toBe(row.id.split("-")[0]);
      expect(row.oldIssue).toBe(`AMC-${1496 + Number(row.group.slice(1))}`);
    }
    const log = lines(readFileSync(join(root, "plans/amc-gap-execution-log.md"), "utf8"));
    const leading = log.flatMap((raw, index) => raw.startsWith("| G") ? [{ raw, line: index + 1, columns: cells(raw) }] : []);
    const keyed = leading.filter(entry => expandLogLabel(entry.columns[0]).length > 0);
    const history = data.provenance.historicalLog;
    expect(history.literalLeadingGRows).toBe(leading.length);
    expect(history.keyedG1G8Entries).toBe(keyed.length);
    expect(history.entries.map(entry => entry.line).sort((a, b) => a - b)).toEqual(keyed.map(entry => entry.line).sort((a, b) => a - b));
    expect(history.excludedLeadingGRows.map(entry => ({ line: entry.line, raw: entry.raw })))
      .toEqual(leading.filter(entry => !keyed.includes(entry)).map(entry => ({ line: entry.line, raw: entry.raw })));
    const checkEntry = (entry: LogEntry) => {
      expect(entry.raw).toBe(log[entry.line - 1]);
      const columns = cells(entry.raw);
      expect(entry.label).toBe(columns[0]);
      expect(entry.status).toBe(columns[1]);
      expect(entry.commitText).toBe(columns.length === 4 ? columns[2] : null);
      expect(entry.verification).toBe(columns[columns.length - 1]);
      expect(entry.expandedIds.slice().sort()).toEqual(expandLogLabel(entry.label));
    };
    for (const entry of history.entries) checkEntry(entry);
    for (const row of allRows(data)) for (const entry of row.logEntries) {
      checkEntry(entry);
      expect(entry.expandedIds).toContain(row.id);
      expect(history.entries).toContainEqual(entry);
    }
    for (const entry of history.entries) for (const id of entry.expandedIds) {
      expect(allRows(data).find(row => row.id === id)?.logEntries).toContainEqual(entry);
    }
  });

  test("every original, supplemental and recorded provenance commit is on accepted main without lazy fetching", () => {
    const data = readReconciliation();
    for (const commit of new Set(allRows(data).flatMap(row => row.commits))) {
      expect(commit).toMatch(/^[0-9a-f]{8,40}$/);
      const resolved = textGit("rev-parse", `${commit}^{commit}`);
      git("merge-base", "--is-ancestor", resolved, MAIN);
      expect(data.commitEvidence.some(evidence => evidence.resolved === resolved)).toBe(true);
    }
    for (const evidence of data.commitEvidence) {
      expect(evidence.main).toBe(MAIN);
      expect(evidence.resolved).toBe(textGit("rev-parse", `${evidence.reference}^{commit}`));
      git("merge-base", "--is-ancestor", evidence.resolved, MAIN);
      expect(evidence.ancestry).toBe("ancestor");
      expect(evidence.exitCode).toBe(0);
    }
  });

  test("removing G3-07 is rejected by the same exact-membership guard", () => {
    const data = structuredClone(readReconciliation());
    data.rows = data.rows.filter(row => row.id !== "G3-07");
    expect(acceptanceFailures(data)).toContain("Missing register IDs: G3-07");
  });

  test("the missing G3-07 fixture still retains 37 real unresolved routes and cannot pass whole acceptance", () => {
    const data = structuredClone(readReconciliation());
    data.rows = data.rows.filter(row => row.id !== "G3-07");
    expect(membershipFailures(data.rows)).toContain("Missing register IDs: G3-07");
    // G3-07 was one of 38 unrouted rows. Removing it leaves 37 real route failures, not a passing reconciliation.
    expect(successorFailures(allRows(data))).toHaveLength(37);
    expect(dispositionFailures(data)).not.toEqual([]);
  });

  test("an unknown plan key is rejected even with a resolved flag and a known paused group", () => {
    const data = structuredClone(readReconciliation());
    const row = data.rows.find(candidate => candidate.id === "G4-01")!;
    row.successor.planKey = "P3-99";
    row.successor.paused = "AMC-1500";
    row.successorResolved = true;
    expect(acceptanceFailures(data)).toContain("G4-01: unknown plan key P3-99");
  });

  test("a paused key assigned outside its documented group is rejected even with a known plan", () => {
    const data = structuredClone(readReconciliation());
    const row = data.rows.find(candidate => candidate.id === "G6-07")!;
    row.successor.paused = "AMC-1503";
    row.successorResolved = true;
    expect(acceptanceFailures(data)).toContain("G6-07: invalid paused group AMC-1503");
  });

  test("removing a final row's shared source references fails even when the global snippet set is unchanged", () => {
    const data = structuredClone(readReconciliation());
    const references = [...new Set(allRows(data).flatMap(row => row.sourceRefs))].sort();
    const row = data.rows.find(candidate => candidate.id === "G1-01")!;
    expect(row.status).toBe("implemented");
    expect(row.sourceRefs.length).toBeGreaterThan(0);
    row.sourceRefs = [];
    expect([...new Set(allRows(data).flatMap(candidate => candidate.sourceRefs))].sort()).toEqual(references);
    expect(acceptanceFailures(data)).toContain("G1-01: implemented has no source or absent-file witness");
  });

  test("missing implemented commits and invalid status enums are rejected independently of route debt", () => {
    const noCommit = structuredClone(readReconciliation());
    const implemented = noCommit.rows.find(row => row.status === "implemented")!;
    implemented.commits = [];
    expect(acceptanceFailures(noCommit)).toContain(`${implemented.id}: implemented has no commit`);
    const badEnum = structuredClone(readReconciliation());
    badEnum.rows[0].status = "COMPLETE";
    expect(acceptanceFailures(badEnum)).toContain(`${badEnum.rows[0].id}: invalid status COMPLETE`);
  });
});
