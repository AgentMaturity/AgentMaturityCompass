import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createIncidentStore, unsignedIncidents, withUnsignedIncidents } from "../../src/incidents/incidentStore.js";
import type { Incident } from "../../src/incidents/incidentTypes.js";
import { UNSIGNED_EVIDENCE_STORE } from "../../src/ledger/ledgerConnection.js";

/** The unsigned incident reader's guards and state lookup (AMC_NO_SIGN=1 incidents, src/incidents/incidentStore.ts). */
let root: string;
let workspace: string;
let storePath: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-unsigned-incidents-")));
  workspace = join(root, "workspace");
  storePath = join(workspace, UNSIGNED_EVIDENCE_STORE);
  mkdirSync(dirname(storePath), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function incident(id: string, createdTs: number): Incident {
  return {
    incidentId: id, agentId: "agent-a", severity: "WARN", state: "OPEN", title: id, description: id, triggerType: "MANUAL",
    triggerId: "manual", rootCauseClaimIds: [], affectedQuestionIds: [], causalEdges: [], timelineEventIds: [], createdTs,
    updatedTs: createdTs, resolvedTs: null, postmortemRef: null, prev_incident_hash: "0", incident_hash: `hash-${id}`, signature: "unsigned"
  };
}

/** A store at `path` holding the given incidents, each with the given transitions (`[toState, ts]`). */
function seed(path: string, rows: Array<{ incident: Incident; transitions?: Array<[Incident["state"], number]> }>): void {
  const db = new Database(path);
  try {
    const store = createIncidentStore(db);
    store.initTables();
    for (const { incident: row, transitions = [] } of rows) {
      store.insertIncident(row);
      for (const [toState, ts] of transitions) {
        store.insertIncidentTransition({ transitionId: `tr-${row.incidentId}-${ts}`, incidentId: row.incidentId, fromState: "OPEN",
          toState, reason: "probe", ts, signature: "unsigned" });
      }
    }
  } finally { db.close(); }
}

describe("the unsigned incident reader", () => {
  test("lists each unsigned incident in the state of its latest transition", () => {
    const now = Date.now();
    seed(storePath, [
      { incident: incident("resolved", now - 2_000), transitions: [["INVESTIGATING", now - 1_500], ["RESOLVED", now - 1_000]] },
      { incident: incident("untouched", now - 3_000) }
    ]);
    const listed = unsignedIncidents(workspace, "agent-a", now);
    expect(listed).toMatchObject({ rejected: 0, unreadable: false });
    expect(listed.incidents.map((row) => [row.incidentId, row.state, row.unsigned])).toEqual([
      ["resolved", "RESOLVED", true], ["untouched", "OPEN", true]
    ]);
    // The list's status filter sees the latest state, not the state the incident was opened in.
    const closed = withUnsignedIncidents(workspace, "agent-a", [], (row) => row.state === "RESOLVED", 50);
    expect(closed.unsigned.map((row) => row.incidentId)).toEqual(["resolved"]);
    expect(closed.warnings).toEqual([]);
  });

  test("reads a store that never held an incident as empty, not unreadable", () => {
    const db = new Database(storePath);
    db.exec("CREATE TABLE evidence_events (id TEXT)");
    db.close();
    expect(unsignedIncidents(workspace, "agent-a")).toEqual({ incidents: [], rejected: 0, unreadable: false });
    expect(withUnsignedIncidents(workspace, "agent-a", [], () => true, 50).warnings).toEqual([]);
  });

  test("never opens a store reached through a symlinked directory that leads out of the workspace", () => {
    const outside = join(root, "outside");
    mkdirSync(outside);
    seed(join(outside, "evidence.sqlite"), [{ incident: incident("planted", Date.now()) }]);
    rmSync(dirname(storePath), { recursive: true });
    symlinkSync(outside, dirname(storePath));
    expect(unsignedIncidents(workspace, "agent-a")).toEqual({ incidents: [], rejected: 0, unreadable: true });
    expect(withUnsignedIncidents(workspace, "agent-a", [], () => true, 50).warnings)
      .toEqual(["the unsigned evidence store could not be read; unsigned incidents are not shown"]);
  });

  test("reads a store path that cannot be inspected as unreadable rather than failing", () => {
    // The store's directory is a regular file, so inspecting the store fails with ENOTDIR rather than "absent".
    rmSync(dirname(storePath), { recursive: true });
    writeFileSync(dirname(storePath), "not a directory");
    expect(unsignedIncidents(workspace, "agent-a")).toEqual({ incidents: [], rejected: 0, unreadable: true });
  });
});
