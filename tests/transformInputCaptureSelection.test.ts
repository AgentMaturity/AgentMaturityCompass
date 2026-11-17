import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import YAML from "yaml";
import { captureTransformPlanInputs, captureTransformRelatedFiles, TransformInputCapture } from "../src/transformation/transformInputs.js";

const CHANGED = "transformation selected evidence or input bytes changed while signing; retry";
const DAY = 86_400_000;
let ws: string;
beforeEach(() => { ws = mkdtempSync(join(tmpdir(), "amc-transform-inputs-")); });
afterEach(() => { rmSync(ws, { recursive: true, force: true }); });

function put(path: string, body: unknown): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof body === "string" ? body : JSON.stringify(body));
  return path;
}
const agentDir = (id: string) => join(ws, ".amc", "agents", id);
const run = (id: string, name: string, ts: number, status = "VALID") => put(join(agentDir(id), "runs", `${name}.json`), { ts, status });

describe("captureTransformRelatedFiles", () => {
  it("passes while the files are unchanged and refuses after one changes", () => {
    const a = put(join(ws, "a.txt"), "one"), b = put(join(ws, "b.txt"), "two");
    const assertCurrent = captureTransformRelatedFiles([a, b, a]);
    expect(() => assertCurrent()).not.toThrow();
    writeFileSync(b, "two, edited");
    expect(() => assertCurrent()).toThrow(CHANGED);
  });

  it("treats a missing file as a fixed state and refuses once it appears", () => {
    const missing = join(ws, "later.txt");
    const assertCurrent = captureTransformRelatedFiles([missing]);
    expect(() => assertCurrent()).not.toThrow();
    put(missing, "now here");
    expect(() => assertCurrent()).toThrow(CHANGED);
  });

  it("pins a directory by identity, not content, and refuses when it is replaced by a file", () => {
    const dir = join(ws, "dir"); mkdirSync(dir);
    const assertCurrent = captureTransformRelatedFiles([dir]);
    expect(() => assertCurrent()).not.toThrow();
    rmSync(dir, { recursive: true }); writeFileSync(dir, "file now");
    expect(() => assertCurrent()).toThrow(CHANGED);
  });
});

describe("TransformInputCapture selectors", () => {
  it("pair() pins a file and its signature", () => {
    const reads = new TransformInputCapture(), file = put(join(ws, ".amc", "budgets.yaml"), "a: 1");
    reads.pair(file);
    put(`${file}.sig`, "signature");
    expect(() => reads.assertCurrent()).toThrow(CHANGED);
  });

  it("diagnostic() without a window follows the newest VALID run, ignoring newer invalid ones", () => {
    run("alpha", "r1", 1000);
    const reads = new TransformInputCapture(); reads.diagnostic(ws, "alpha");
    run("alpha", "r2", 2000, "INVALID");
    put(join(agentDir("alpha"), "runs", "broken.json"), "{not json");
    put(join(agentDir("alpha"), "runs", "null.json"), "null");
    expect(() => reads.assertCurrent()).not.toThrow();
    run("alpha", "r3", 3000);
    expect(() => reads.assertCurrent()).toThrow(CHANGED);
  });

  it("diagnostic() without any valid run falls back to the newest run", () => {
    const old = run("alpha", "r1", 1000, "INVALID"); run("alpha", "r2", 2000, "INVALID");
    const reads = new TransformInputCapture(); reads.diagnostic(ws, "alpha");
    writeFileSync(old, JSON.stringify({ ts: 1000, status: "INVALID", note: "edited" }));
    expect(() => reads.assertCurrent()).not.toThrow();
    run("alpha", "r2", 2000, "VALID");
    expect(() => reads.assertCurrent()).toThrow(CHANGED);
  });

  it("diagnostic() with a window only selects VALID runs inside it", () => {
    const reads = new TransformInputCapture(); reads.diagnostic(ws, "alpha", { start: 100, end: 200 });
    run("alpha", "early", 50); run("alpha", "late", 250); run("alpha", "bad", 150, "INVALID");
    expect(() => reads.assertCurrent()).not.toThrow();
    run("alpha", "inside", 150);
    expect(() => reads.assertCurrent()).toThrow(CHANGED);
  });

  it("outcome() pins the last report by name, and with a window the newest report inside it", () => {
    const reports = join(agentDir("alpha"), "outcomes", "reports");
    put(join(reports, "2026-01.json"), { ts: 150 });
    const latest = new TransformInputCapture(); latest.outcome(ws, "alpha");
    const planner = new TransformInputCapture(); planner.outcome(ws, "alpha", undefined, true);
    const windowed = new TransformInputCapture(); windowed.outcome(ws, "alpha", { start: 100, end: 200 });
    put(join(reports, "2025-12.json"), { ts: 300 });
    expect(() => latest.assertCurrent()).not.toThrow();
    expect(() => windowed.assertCurrent()).not.toThrow();
    put(join(reports, "2026-02.json"), { ts: 160 });
    expect(() => latest.assertCurrent()).toThrow(CHANGED);
    expect(() => planner.assertCurrent()).toThrow(CHANGED);
    expect(() => windowed.assertCurrent()).toThrow(CHANGED);
  });

  it("outcome() with no reports folder selects nothing until a report appears", () => {
    const reads = new TransformInputCapture(); reads.outcome(ws, "alpha");
    expect(() => reads.assertCurrent()).not.toThrow();
    put(join(agentDir("alpha"), "outcomes", "reports", "first.json"), { ts: 1 });
    expect(() => reads.assertCurrent()).toThrow(CHANGED);
  });

  it("assurance() keeps the newest report per needed pack for this agent and window", () => {
    const dir = join(agentDir("alpha"), "reports", "assurance");
    const report = (name: string, agentId: string, ts: number, packs: string[]) => put(join(dir, `${name}.json`), { agentId, ts, packResults: packs.map(packId => ({ packId })) });
    report("a", "alpha", 150, ["p1", "p2"]);
    const reads = new TransformInputCapture(); reads.assurance(ws, "alpha", 100, 200, ["p1"]);
    report("other-agent", "beta", 190, ["p1"]);
    report("outside", "alpha", 250, ["p1"]);
    report("unneeded-pack", "alpha", 190, ["p2"]);
    report("older", "alpha", 120, ["p1"]);
    expect(() => reads.assertCurrent()).not.toThrow();
    report("newer", "alpha", 180, ["p1"]);
    expect(() => reads.assertCurrent()).toThrow(CHANGED);
  });

  it("assurance() refuses a malformed report instead of skipping it", () => {
    put(join(agentDir("alpha"), "reports", "assurance", "bad.json"), "{");
    expect(() => new TransformInputCapture().assurance(ws, "alpha", 0, 1)).toThrow(SyntaxError);
  });
});

describe("captureTransformPlanInputs", () => {
  it("agent scope pins the signed configs, the runs, and the legacy target until the agent's own target exists", () => {
    put(join(ws, ".amc", "targets", "default.target.json"), { legacy: true });
    const reads = captureTransformPlanInputs(ws, { type: "AGENT", agentId: "alpha" }, "14d", Date.now(), true);
    expect(() => reads.assertCurrent()).not.toThrow();
    put(join(agentDir("alpha"), "targets", "default.target.json"), { own: true });
    expect(() => reads.assertCurrent()).toThrow(CHANGED);
  });

  it("agent scope refuses when a signed config changes", () => {
    const reads = captureTransformPlanInputs(ws, { type: "AGENT", agentId: "alpha" }, "14d", Date.now(), false);
    put(join(ws, ".amc", "action-policy.yaml"), "rules: []");
    expect(() => reads.assertCurrent()).toThrow(CHANGED);
  });

  it("node scope pins only member agents with a valid run in the window, including their incidents", () => {
    const now = Date.now();
    put(join(ws, ".amc", "org.yaml"), YAML.stringify({
      version: 1, enterpriseId: "ent_fixture", enterpriseName: "Fixture",
      nodes: [{ id: "enterprise", type: "ENTERPRISE", name: "Fixture", parentId: null }, { id: "team", type: "TEAM", name: "Team", parentId: "enterprise" }],
      memberships: [{ agentId: "alpha", nodeIds: ["team"], weight: 1 }, { agentId: "idle", nodeIds: ["team"], weight: 1 }],
      policies: { inheritance: { enabled: true }, defaultsByNode: {} }
    }));
    run("alpha", "recent", now - DAY);
    const reads = captureTransformPlanInputs(ws, { type: "NODE", nodeId: "team" }, "7d", now, true);
    put(join(agentDir("idle"), "incidents", "i1.json"), { id: "i1" });
    expect(() => reads.assertCurrent()).not.toThrow();
    put(join(agentDir("alpha"), "incidents", "i1.json"), { id: "i1" });
    expect(() => reads.assertCurrent()).toThrow(CHANGED);
  });

  it("node scope refuses when a member's agent config changes", () => {
    const now = Date.now();
    put(join(ws, ".amc", "org.yaml"), YAML.stringify({
      version: 1, enterpriseId: "ent_fixture", enterpriseName: "Fixture",
      nodes: [{ id: "enterprise", type: "ENTERPRISE", name: "Fixture", parentId: null }],
      memberships: [{ agentId: "alpha", nodeIds: ["enterprise"], weight: 1 }],
      policies: { inheritance: { enabled: true }, defaultsByNode: {} }
    }));
    run("alpha", "recent", now - DAY);
    const reads = captureTransformPlanInputs(ws, { type: "NODE", nodeId: "enterprise" }, "14d", now, false);
    put(join(agentDir("alpha"), "agent.config.yaml"), "id: alpha");
    expect(() => reads.assertCurrent()).toThrow(CHANGED);
  });
});
