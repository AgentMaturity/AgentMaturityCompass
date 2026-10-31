/**
 * pending-checks P1-61 "Remaining low": Adapt's Build wrote the memory policy, the context plugin and the Enforce
 * re-snapshot before the router's governed transition, so a transition refused after the producer ran left workspace
 * files that no revision records. A refused Build leaves nothing on disk; an accepted one publishes exactly the bytes
 * its revision binds.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { loadA4State, pendingExecutors } from "../../src/a4/a4Gates.js";
import { contextPluginPath } from "../../src/a4/adaptContextPlugin.js";
import { memoryPolicyPath } from "../../src/a4/adaptMemoryPolicy.js";
import { openA4Store } from "../../src/a4/a4Store.js";
import { produceAdapt } from "../../src/a4/stages/adapt.js";
import { latestEnforceResourceManifestPath } from "../../src/enforce/resourceManifest.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { ADAPT_ANSWERS, ASSEMBLE_ANSWERS, Journey } from "./a4Journey.js";

vi.setConfig({ testTimeout: 300_000 });
afterEach(() => {
  pendingExecutors.clear();
  cleanupGovernanceFixtures();
});

/** Every file under the workspace and its sha256, minus the ledger database and lock files (their bytes move on every read). */
function files(workspace: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const rel = relative(workspace, path);
      if (/\.sqlite(-wal|-shm|-journal)?$|\.lock$|(^|\/)locks?\//.test(rel)) continue;
      if (statSync(path).isDirectory()) walk(path);
      else out.set(rel, createHash("sha256").update(readFileSync(path)).digest("hex"));
    }
  };
  walk(workspace);
  return out;
}
const changed = (before: Map<string, string>, after: Map<string, string>): string[] =>
  [...new Set([...before.keys(), ...after.keys()])].filter((key) => before.get(key) !== after.get(key)).sort();

/** A project at Adapt with its direction approved and completed: the next step is Build. */
async function atAdaptBuild(): Promise<Journey> {
  const j = await Journey.start();
  await j.throughAspire();
  await j.stage("assemble", ASSEMBLE_ANSWERS);
  await j.propose("adapt", ADAPT_ANSWERS);
  expect((await j.complete("adapt", await j.approve("adapt", "direction"))).status).toBe(200);
  return j;
}

describe("Adapt Build publishes only what a recorded revision binds", () => {
  test("the Build producer stages its writes: running it writes nothing until the governed transition publishes them", async () => {
    const j = await atAdaptBuild();
    const before = files(j.t.workspace);
    const store = openA4Store(j.t.workspace);
    try {
      const now = Date.now();
      const produced = await produceAdapt("build", { workspace: j.t.workspace, state: loadA4State(store, j.p.projectId, now), principal: j.call(j.t.alice).principal, now });
      expect(changed(before, files(j.t.workspace))).toEqual([]);
      expect(typeof produced.publish).toBe("function");
    } finally {
      store.close();
    }
  });

  test("a Build whose transition is refused leaves nothing on disk", async () => {
    const j = await atAdaptBuild();
    const before = files(j.t.workspace);
    // The write-through mirror cannot commit (no Postgres here), so the governed transition refuses after the producer ran.
    vi.stubEnv("AMC_SESSION_STORE", "postgres");
    const reply = await j.p.post(j.t.alice, "/stages/adapt/build");
    vi.stubEnv("AMC_SESSION_STORE", "sqlite");
    expect(reply.status, JSON.stringify(reply.body)).toBeGreaterThanOrEqual(400);
    expect(reply.body.code).toBe("LEDGER_MIRROR_UNAVAILABLE");
    expect(changed(before, files(j.t.workspace))).toEqual([]);
  });

  test("an accepted Build, after a refused one, publishes exactly the bytes its revision binds", async () => {
    const j = await atAdaptBuild();
    vi.stubEnv("AMC_SESSION_STORE", "postgres");
    expect((await j.p.post(j.t.alice, "/stages/adapt/build")).body.code).toBe("LEDGER_MIRROR_UNAVAILABLE");
    vi.stubEnv("AMC_SESSION_STORE", "sqlite");
    // Nothing the refused Build staged moved a slot, so the next Build is not RESOURCE_DRIFTED.
    const reply = await j.p.post(j.t.alice, "/stages/adapt/build");
    expect(reply.status, JSON.stringify(reply.body)).toBe(201);
    const store = openA4Store(j.t.workspace);
    try {
      const head = store.readHead(j.p.projectId)!;
      const revision = store.readRevision(j.p.projectId, head.revision_no)!;
      const built = (JSON.parse(revision.spec_json) as { build: { memoryPolicy: { sha256: string }; context: { fileSha256: string }; manifest: { manifestId: string } } }).build;
      const agentId = head.agent_id;
      const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
      expect(sha(memoryPolicyPath(j.t.workspace, agentId))).toBe(built.memoryPolicy.sha256);
      expect(sha(contextPluginPath(j.t.workspace, agentId))).toBe(built.context.fileSha256);
      expect((JSON.parse(readFileSync(latestEnforceResourceManifestPath(j.t.workspace, agentId), "utf8")) as { manifestId: string }).manifestId).toBe(built.manifest.manifestId);
      const digests = JSON.parse(revision.resource_digests_json) as { context: { memoryPolicySha256: string; contextPluginSha256: string } };
      expect(digests.context.memoryPolicySha256).toBe(built.memoryPolicy.sha256);
    } finally {
      store.close();
    }
  });
});
