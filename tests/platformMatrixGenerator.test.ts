import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { desktopStatus, laneStatus, loadLanes, renderMatrix, STATUS } from "../scripts/gen-platform-matrix.mjs";

const COMMIT = "a".repeat(40);
const OTHER = "b".repeat(40);
const PASS_DOCTOR = { checks: [{ id: "native-modules", status: "PASS" }] };
const dirs: string[] = [];

/** One lane folder with lane.json and the reports a workflow lane uploads. */
function lane(root: string, name: string, files: Record<string, unknown>) {
  mkdirSync(join(root, name), { recursive: true });
  for (const [file, body] of Object.entries(files)) writeFileSync(join(root, name, file), JSON.stringify(body));
}
function receipts() {
  const root = mkdtempSync(join(tmpdir(), "amc-platform-lanes-"));
  dirs.push(root);
  return root;
}
const platformLane = (overrides: { commit?: string; nodeMajor?: number; status?: string; supportedNode?: boolean; doctor?: unknown } = {}) => ({
  "lane.json": { schema: "amc.platform-lane/1", kind: "platform", platform: "linux", arch: "arm64", nodeMajor: overrides.nodeMajor ?? 22, commit: overrides.commit ?? COMMIT },
  "report.json": { status: overrides.status ?? "passed", supportedNode: overrides.supportedNode ?? true, sourceCommit: overrides.commit ?? COMMIT },
  "doctor.json": overrides.doctor ?? PASS_DOCTOR
});

afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("platform matrix generator", () => {
  it("qualified needs a passing receipt for the same commit with native-modules PASS", () => {
    const root = receipts();
    lane(root, "arm64-22", platformLane());
    expect(laneStatus(loadLanes(root), COMMIT, "linux-arm64", 22)).toMatchObject({ status: STATUS.qualified, evidence: "arm64-22" });
    expect(laneStatus(loadLanes(root), COMMIT, "linux-arm64", 24).status).toBe(STATUS.notRun);
  });

  it("a receipt from another commit is not run, never qualified", () => {
    const root = receipts();
    lane(root, "old", platformLane({ commit: OTHER }));
    expect(laneStatus(loadLanes(root), COMMIT, "linux-arm64", 22).status).toBe(STATUS.notRun);
  });

  it("unsupported Node is inconclusive; a failed run or a failing native-modules check is not qualified", () => {
    const root = receipts();
    lane(root, "node20", platformLane({ nodeMajor: 20, supportedNode: false }));
    lane(root, "failed", platformLane({ nodeMajor: 24, status: "failed" }));
    const lanes = loadLanes(root);
    expect(laneStatus(lanes, COMMIT, "linux-arm64", 20).status).toBe(STATUS.inconclusive);
    expect(laneStatus(lanes, COMMIT, "linux-arm64", 24)).toMatchObject({ status: STATUS.notQualified, why: "platform qualification failed" });
    const native = receipts();
    lane(native, "native", platformLane({ doctor: { checks: [{ id: "native-modules", status: "FAIL" }] } }));
    expect(laneStatus(loadLanes(native), COMMIT, "linux-arm64", 22)).toMatchObject({ status: STATUS.notQualified, why: "doctor native-modules did not PASS" });
  });

  it("desktop and GUI cells need their own passing receipts; Windows native shell is refused by design", () => {
    const root = receipts();
    lane(root, "desktop-mac", { "lane.json": { schema: "amc.platform-lane/1", kind: "desktop", platform: "darwin", arch: "arm64", nodeMajor: 22, commit: COMMIT },
      "desktop.json": { status: "passed" }, "doctor.json": PASS_DOCTOR });
    lane(root, "gui-win", { "lane.json": { schema: "amc.platform-lane/1", kind: "gui", platform: "win32", arch: "x64", nodeMajor: 22, commit: COMMIT },
      "gui.json": { status: "failed" } });
    const lanes = loadLanes(root);
    expect(desktopStatus(lanes, COMMIT, "darwin-arm64", "desktop").status).toBe(STATUS.qualified);
    expect(desktopStatus(lanes, OTHER, "darwin-arm64", "desktop").status).toBe(STATUS.notRun);
    expect(desktopStatus(lanes, COMMIT, "win32-x64", "gui").status).toBe(STATUS.notQualified);
    const text = renderMatrix({ lanes, commit: COMMIT, source: "receipts" });
    expect(text).toMatch(/\| Windows x64 \|.*refused by design \(until P2-14\) \|/);
  });

  it("docs/PLATFORM_MATRIX.md is exactly what its recorded receipts and commit produce", () => {
    const text = readFileSync("docs/PLATFORM_MATRIX.md", "utf8");
    const commit = /^Commit: `([0-9a-f]{40})`\. Receipts: `([^`]+)`/m.exec(text);
    expect(commit).not.toBeNull();
    expect(renderMatrix({ lanes: loadLanes(commit![2]), commit: commit![1], source: commit![2] })).toBe(text);
  });
});
