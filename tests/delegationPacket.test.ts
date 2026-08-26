import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { listHandoffPackets, verifyHandoffPacket } from "../src/fleet/handoffPacket.js";
import { UnsignablePacketError, mintDelegationPacket } from "../src/fleet/delegationPacket.js";
import { delegateTo, rootIdentity } from "../src/agent/delegationIdentity.js";

/**
 * The packet that authorises a child to exist (P6.1a).
 *
 * `createHandoffPacket` degrades quietly: if signing throws it writes the file
 * anyway with `signature: "unsigned"`, and `verifyHandoffPacket` reports it
 * invalid later. For a handoff between operators that deferral is survivable —
 * someone verifies before accepting. For a delegation it is not: the packet is
 * what authorises the child to run, so discovering it never verified after the
 * child has executed is discovering it too late.
 */
const PASS = "delegation-packet-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
  delete process.env["AMC_NO_SIGN"];
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-delegation-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

const pair = () => {
  const parent = rootIdentity("payments-agent");
  const child = delegateTo(parent, "researcher");
  if (!child.ok) throw new Error("expected delegation to be allowed");
  return { parent, child: child.identity };
};

describe("a delegation packet is signed or it does not exist", () => {
  it("mints a packet that the product's own verifier accepts", () => {
    const dir = workspace();
    const { parent, child } = pair();

    const packet = mintDelegationPacket(dir, { parent, child, goal: "summarise the ledger" });

    expect(packet.signature, "a real signature, not the degraded placeholder").not.toBe("unsigned");
    const verification = verifyHandoffPacket(dir, packet.packetId);
    expect(verification.valid).toBe(true);
    expect(verification.signatureValid).toBe(true);
  });

  it("carries the governance identity, not just the two names", () => {
    // A reader has to be able to see that both ends are metered as the same
    // root. A packet whose ends disagreed would be a delegation across a
    // governance boundary, which this path does not do.
    const dir = workspace();
    const { parent, child } = pair();

    const packet = mintDelegationPacket(dir, { parent, child, goal: "g" });

    expect(packet.fromAgentId).toBe("payments-agent");
    expect(packet.toAgentId, "the child's own name").toBe("researcher");
    expect(packet.constraints).toContain("governedAs=payments-agent");
    expect(packet.constraints).toContain("depth=1");
  });

  it("refuses a child governed as something other than its parent", () => {
    // Belt to `delegateTo`'s braces: even handed a hand-built identity, the
    // packet will not record a delegation that changes what governs the child.
    const dir = workspace();
    const { parent } = pair();
    const forged = { governedAs: "someone-else", runAs: "researcher", depth: 1, parent: "payments-agent" };

    expect(() => mintDelegationPacket(dir, { parent, child: forged, goal: "g" }))
      .toThrow(/governed as someone-else but parent as payments-agent/);
  });
});

describe("an unsignable delegation leaves nothing behind", () => {
  it("throws rather than writing an unsigned packet", () => {
    // The failure mode that matters: signing unavailable. `createHandoffPacket`
    // would write `signature: "unsigned"` and return happily.
    const dir = workspace();
    const { parent, child } = pair();
    rmSync(join(dir, ".amc", "vault"), { recursive: true, force: true });
    rmSync(join(dir, ".amc", "keys"), { recursive: true, force: true });

    expect(() => mintDelegationPacket(dir, { parent, child, goal: "g" }))
      .toThrow(UnsignablePacketError);
  });

  it("leaves no orphan file when it refuses", () => {
    // An unsigned packet on disk is worse than no packet: a later reader finds
    // a record of an authorisation that never held.
    const dir = workspace();
    const { parent, child } = pair();
    const before = listHandoffPackets(dir);
    rmSync(join(dir, ".amc", "vault"), { recursive: true, force: true });
    rmSync(join(dir, ".amc", "keys"), { recursive: true, force: true });

    try {
      mintDelegationPacket(dir, { parent, child, goal: "g" });
    } catch {
      // expected
    }

    expect(listHandoffPackets(dir), "no packet was left behind").toEqual(before);
  });

  it("names why it refused, so the parent can record it", () => {
    const dir = workspace();
    const { parent, child } = pair();
    rmSync(join(dir, ".amc", "vault"), { recursive: true, force: true });
    rmSync(join(dir, ".amc", "keys"), { recursive: true, force: true });

    try {
      mintDelegationPacket(dir, { parent, child, goal: "g" });
      throw new Error("expected a refusal");
    } catch (error) {
      expect(String(error)).toContain("refusing to authorise a delegation without a signed packet");
      expect(String(error).length, "a refusal with no reason is not auditable").toBeGreaterThan(60);
    }
  });
});
