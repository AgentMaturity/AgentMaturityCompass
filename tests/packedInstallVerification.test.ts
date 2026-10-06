import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { verifyPackedRun } from "../scripts/packed-evidence-verification.mjs";
import { isolatedInstallEnvironment, verifyPackedComposition } from "../scripts/packed-install-check.mjs";

function fixture() {
  return {
    summary: { sessionId: "installed-session", driverStatus: "idle", unsignedRows: 0,
      events: 24, turns: 1, requests: 2, toolCalls: 1,
      endings: [{ turn: 1, reason: "complete", interrupted: false }] },
    ledger: { ok: true, chain: { ok: true }, errors: [] as string[], sessions: { closed: ["installed-session"] } },
    run: { ok: true, sessionId: "installed-session", ledgerOk: true, ledgerErrors: [] as string[],
      sessionChainErrors: [] as string[], unsignedRowIds: [] as string[],
      requests: [{ headerEventId: "first", status: "reconstructed" }, { headerEventId: "second", status: "reconstructed" }] }
  };
}

describe("packed runtime evidence gate", () => {
  it("requires real composition provenance and entries from the installed command", () => {
    const source = "- id: packed-inspection\n  name: ./not-installed-plugin.mjs\n  disabled: true\n";
    const dump = { composition: { sha256: createHash("sha256").update(source).digest("hex"),
      signed: false, signatureReason: "no signature sidecar" },
    entries: [{ id: "packed-inspection", name: "./not-installed-plugin.mjs", disabled: true }] };
    const result = { ok: true, stdout: JSON.stringify(dump) };
    expect(verifyPackedComposition(result, source)).toBe(true);
    expect(verifyPackedComposition({ ...result, ok: false }, source)).toBe(false);
    expect(verifyPackedComposition({ ok: true, stdout: "inspection succeeded" }, source)).toBe(false);
    expect(verifyPackedComposition(result, `${source}# changed\n`)).toBe(false);
    expect(verifyPackedComposition({ ok: true, stdout: JSON.stringify({ ...dump, entries: [] }) }, source)).toBe(false);
    expect(verifyPackedComposition({ ok: true, stdout: JSON.stringify({ ...dump,
      composition: { ...dump.composition, signed: true } }) }, source)).toBe(false);
  });

  it("invokes both cold verifiers for the exact completed tool session", () => {
    const f = fixture();
    const calls: string[][] = [];
    expect(verifyPackedRun({ summary: f.summary, runCommand: (_label: string, args: string[]) => {
      calls.push(args);
      return { ok: true, stdout: JSON.stringify(calls.length === 1 ? f.ledger : f.run) };
    } })).toBe(true);
    expect(calls).toEqual([["session", "verify", "--json"], ["agent-loop", "verify", "installed-session", "--json"]]);
  });

  it("anchors both cold verifiers to the monitor fingerprint recorded at init (P0-09)", () => {
    const f = fixture();
    const calls: string[][] = [];
    const pin = "a".repeat(64);
    expect(verifyPackedRun({ summary: f.summary, expectMonitor: pin, runCommand: (_label: string, args: string[]) => {
      calls.push(args);
      return { ok: true, stdout: JSON.stringify(calls.length === 1 ? f.ledger : f.run) };
    } })).toBe(true);
    expect(calls).toEqual([["session", "verify", "--json", "--expect-monitor", pin],
      ["agent-loop", "verify", "installed-session", "--json", "--expect-monitor", pin]]);
  });

  it("refuses a completed signed summary when payload verification failed", () => {
    const f = fixture();
    f.ledger.ok = false; f.ledger.chain.ok = false; f.ledger.errors = ["payload authentication failed"];
    expect(verifyPackedRun({ summary: f.summary, runCommand: () => ({ ok: true, stdout: JSON.stringify(f.ledger) }) })).toBe(false);
  });

  it("refuses a ledger whose overall verdict is ok but whose session chain is not", () => {
    // Each ledger verdict must be checked on its own: a reassuring top-level `ok`
    // cannot stand in for a broken chain. This case keeps `ok` true so the chain
    // check is the only thing that can refuse.
    const f = fixture();
    f.ledger.ok = true; f.ledger.chain.ok = false;
    // Route both verifier calls faithfully so the broken chain is the only refusal.
    expect(verifyPackedRun({ summary: f.summary, runCommand: (_label: string, args: string[]) =>
      ({ ok: true, stdout: JSON.stringify(args[0] === "session" ? f.ledger : f.run) }) })).toBe(false);
  });

  it("requires every expected resumed turn and authenticates all of its requests", () => {
    const f = fixture();
    f.summary.turns = 2;
    f.summary.endings.push({ turn: 2, reason: "complete", interrupted: false });
    const verify = () => verifyPackedRun({ summary: f.summary, expectedTurns: 2,
      runCommand: (_label: string, args: string[]) => ({ ok: true, stdout: JSON.stringify(args[0] === "session" ? f.ledger : f.run) }) });
    expect(verify()).toBe(true);
    f.summary.endings[0]!.reason = "cancelled";
    expect(verify()).toBe(false);
    f.summary.endings[0]!.reason = "complete";
    f.summary.endings[1]!.turn = 1;
    expect(verify()).toBe(false);
    f.summary.endings[1]!.turn = 2;
    f.summary.endings[1]!.interrupted = true;
    expect(verify()).toBe(false);
    f.summary.endings[1]!.interrupted = false;
    f.run.requests[0]!.status = "payload-pruned";
    expect(verify()).toBe(false);
  });

  it.each(["exit", "malformed", "session", "unsigned", "unreconstructed", "missing-request", "null-request", "missing-id", "duplicate-id"])("rejects %s verifier results", (kind) => {
    const f = fixture();
    if (kind === "session") f.run.sessionId = "different-session";
    if (kind === "unsigned") f.run.unsignedRowIds = ["unsigned-row"];
    if (kind === "unreconstructed") f.run.requests[0]!.status = "payload-pruned";
    if (kind === "missing-request") f.run.requests.pop();
    if (kind === "null-request") (f.run.requests as unknown[])[0] = null;
    if (kind === "missing-id") f.run.requests[0]!.headerEventId = "";
    if (kind === "duplicate-id") f.run.requests[1]!.headerEventId = f.run.requests[0]!.headerEventId;
    let count = 0;
    expect(verifyPackedRun({ summary: f.summary, runCommand: () => {
      count += 1;
      return count === 1 ? { ok: true, stdout: JSON.stringify(f.ledger) }
        : { ok: kind !== "exit", stdout: kind === "malformed" ? "VERIFIED unsigned 0" : JSON.stringify(f.run) };
    } })).toBe(false);
  });

  it("removes inherited npm destinations and loader/AMC overrides before installing locally", () => {
    const base = { PATH: "/usr/bin", HOME: "/operator", npm_config_global: "true",
      NPM_CONFIG_PREFIX: "/outside", NpM_CoNfIg_UsErCoNfIg: "/operator/.npmrc",
      npm_config_registry: "https://unintended.invalid", AMC_VAULT_PASSPHRASE: "operator-secret",
      AMC_NO_SIGN: "1", NODE_PATH: "/checkout/node_modules", NODE_OPTIONS: "--require=/loader.js" };
    const isolated = isolatedInstallEnvironment(base, "/fresh-home");
    expect(isolated).toEqual({ PATH: "/usr/bin", HOME: "/fresh-home", CI: "1",
      AMC_VAULT_PASSPHRASE: "packed-install-check", npm_config_global: "false",
      npm_config_cache: "/fresh-home/.npm", npm_config_userconfig: "/fresh-home/.npmrc",
      npm_config_globalconfig: "/fresh-home/.npmrc-global" });
    expect(base.npm_config_global).toBe("true");
  });

  it("cannot qualify an unsigned, empty or tool-free run from reassuring assistant text", () => {
    for (const change of [{ unsignedRows: 1 }, { events: 0 }, { toolCalls: 0 }, { requests: 0 }, { endings: [null] }]) {
      const f = fixture();
      const summary = { ...f.summary, ...change, assistantText: ["unsigned 0; turn 1 ended: complete"] };
      expect(verifyPackedRun({ summary, runCommand: () => { throw new Error("invalid summary must not reach verifiers"); } })).toBe(false);
    }
  });
});
