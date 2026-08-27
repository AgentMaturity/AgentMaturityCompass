import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { rootIdentity, delegateTo } from "../src/agent/delegationIdentity.js";
import { mintDelegationPacket } from "../src/fleet/delegationPacket.js";
import { loadHandoffPacket, renderHandoffPacketMarkdown } from "../src/fleet/handoffPacket.js";

/**
 * A packet must not print a default as a measurement.
 *
 * `createHandoffPacket` defaulted `trustState` to `{level: 0, confidence: 0,
 * integrityIndex: 0}` and NO call site anywhere in src/ ever supplied one — so
 * every packet AMC has written carries zeros, and the markdown renderer printed
 * them under a `## Trust State` heading as `- Integrity Index: 0`. A reader
 * cannot tell that from an agent that genuinely scored zero on integrity.
 *
 * Same class as `8e7c6351` and `93a1b1e8` on this branch, in P6.1b's own
 * evidence layer.
 */
const PASS = "handoff-trust-state-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-trust-state-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function mintedPacket(dir: string) {
  const parent = rootIdentity("payments-agent");
  const step = delegateTo(parent, "researcher");
  if (!step.ok) throw new Error("setup delegation failed");
  const { packetId } = mintDelegationPacket(dir, { parent, child: step.identity, goal: "check the ledger" });
  return loadHandoffPacket(dir, packetId);
}

describe("an unmeasured trust state says so", () => {
  it("does not render zeros as a finding", () => {
    const dir = workspace();

    const markdown = renderHandoffPacketMarkdown(mintedPacket(dir));

    expect(markdown, "the section is still there").toContain("## Trust State");
    expect(markdown, "but it reports absence, not a score").toContain("not measured");
    expect(markdown, "no zero presented as an integrity finding")
      .not.toContain("Integrity Index: 0");
  });

  it("still renders a trust state that was actually supplied", () => {
    // The honest label must not become a blanket refusal to report: a packet
    // carrying a real measurement has to show it.
    const dir = workspace();
    const packet = {
      ...mintedPacket(dir),
      trustState: { level: 3, confidence: 0.82, integrityIndex: 71 }
    };

    const markdown = renderHandoffPacketMarkdown(packet);

    expect(markdown).toContain("Integrity Index: 71");
    expect(markdown).not.toContain("not measured");
  });
});
