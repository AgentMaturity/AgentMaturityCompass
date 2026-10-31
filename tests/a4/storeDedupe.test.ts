/**
 * P2-35: the store's own request dedupe (a4Store `dedupeRequest`), below the router's `priorReplay`. The router check
 * answers a recorded request before anything runs; this one decides inside the write transaction, so it is what holds
 * when two writers both passed the router check. Driven through `store.transition` with an explicit request key.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { A4_RUNTIME } from "../../src/a4/a4RuntimeLifecycle.js";
import { A4StoreError, openA4Store, type A4Store } from "../../src/a4/a4Store.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { A4Project, a4Workspace } from "./a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });
const stores: A4Store[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  cleanupGovernanceFixtures();
});

const key = (clientRequestId: string, bodyHash = "a".repeat(64)) => ({ principalKey: "amc-runtime", clientRequestId, bodyHash });
const step = (note: string) => () => ({ kind: "STEP" as const, payload: { fixture: note } });
const codeOf = (run: () => unknown): string | null => {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof A4StoreError ? error.code : String(error);
  }
};

async function fixture() {
  const { workspace, alice } = a4Workspace();
  const first = await A4Project.create(workspace, alice, "dedupe one");
  const second = await A4Project.create(workspace, alice, "dedupe two");
  const store = openA4Store(workspace);
  stores.push(store);
  return { store, one: first.projectId, two: second.projectId };
}

describe("store request dedupe (P2-35)", () => {
  test("a repeated request key answers the recorded result and commits nothing", async () => {
    const { store, one } = await fixture();
    const first = store.transition(one, A4_RUNTIME, step("first"), { request: key("dedupe-0001"), response: { attemptId: "a4e_fixture" } });
    expect(first.replay).toBe(false);
    const length = store.readChain(one).length;
    const again = store.transition(one, A4_RUNTIME, step("second"), { request: key("dedupe-0001") });
    expect(again).toMatchObject({ replay: true, response: { attemptId: "a4e_fixture", seq: (first as { seq: number }).seq } });
    expect(store.readChain(one).length).toBe(length);
  });

  test("the same key with another body, or on another project, is REQUEST_CONFLICT and commits nothing", async () => {
    const { store, one, two } = await fixture();
    store.transition(one, A4_RUNTIME, step("first"), { request: key("dedupe-0002") });
    const lengths = [store.readChain(one).length, store.readChain(two).length];
    expect(codeOf(() => store.transition(one, A4_RUNTIME, step("other body"), { request: key("dedupe-0002", "b".repeat(64)) }))).toBe("REQUEST_CONFLICT");
    expect(codeOf(() => store.transition(two, A4_RUNTIME, step("other project"), { request: key("dedupe-0002") }))).toBe("REQUEST_CONFLICT");
    expect([store.readChain(one).length, store.readChain(two).length]).toEqual(lengths);
  });

  test("a response carrying a lease token is refused and the transition rolls back (no credential persisted)", async () => {
    const { store, one } = await fixture();
    const length = store.readChain(one).length;
    const token = `eyJ${"a".repeat(20)}.${"b".repeat(48)}`;
    expect(codeOf(() => store.transition(one, A4_RUNTIME, step("leaky"), { request: key("dedupe-0003"), response: { token } }))).toBe("SECRET_IN_REQUEST_ROW");
    expect(store.readChain(one).length).toBe(length);
    const rows = store.ledger.db.prepare("SELECT response_json FROM a4_requests WHERE client_request_id = ?").all("dedupe-0003");
    expect(rows).toEqual([]);
  });
});
