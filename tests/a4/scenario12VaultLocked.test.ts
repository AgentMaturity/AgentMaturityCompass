/**
 * P2-35 · design §17 "Vault locked / no-sign". Reason codes: A4_VAULT_LOCKED (423 on envelope writes: gate request and
 * decision), VAULT_LOCKED (readiness `signing.available`), UNSIGNED_STORE (AMC_NO_SIGN=1 refuses reads and writes).
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { lockVault } from "../../src/vault/vault.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { A4Project, a4Workspace, refusal } from "./a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => cleanupGovernanceFixtures());

describe("scenario: vault locked / no-sign", () => {
  test("a locked vault refuses envelope writes with 423 and nothing is recorded; readiness shows VAULT_LOCKED", async () => {
    const { workspace, alice, bob } = a4Workspace();
    const p = await A4Project.create(workspace, alice);
    await p.addMember(alice, bob);
    await p.proposeAspire();
    const gate = await p.openGate(alice);
    const head = p.head;
    lockVault(workspace);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    expect(refusal(await p.decide(bob, gate))).toEqual([423, "A4_VAULT_LOCKED"]);
    expect(refusal(await p.post(alice, "/stages/aspire/gates/completion/request"))).toEqual([423, "A4_VAULT_LOCKED"]);
    const items = (await p.get(alice, "/readiness")).body.data!.items as Array<{ id: string; status: string; reasonCodes: string[] }>;
    expect(items.find((entry) => entry.id === "signing.available")).toMatchObject({ status: "WAITING", reasonCodes: ["VAULT_LOCKED"] });
    expect(((await p.gate(alice, gate.gateId)).decisions as unknown[])).toEqual([]);
    expect((await p.get(alice)).body.data!.headSeq).toBe(head);
  });

  test("AMC_NO_SIGN=1: the store refuses to open for reads and writes", async () => {
    const { workspace, alice } = a4Workspace();
    const p = await A4Project.create(workspace, alice);
    vi.stubEnv("AMC_NO_SIGN", "1");
    expect(refusal(await p.get(alice))).toEqual([503, "UNSIGNED_STORE"]);
    expect(refusal(await p.post(alice, "/hold", { reason: "x" }))).toEqual([503, "UNSIGNED_STORE"]);
  });
});
