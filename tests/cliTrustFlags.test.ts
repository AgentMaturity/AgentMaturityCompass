import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  finishVerify, ledgerExitCode, trustFromFlags, verifyAllExit, withTrustFlags, type TrustFlags
} from "../src/cli-trust-flags.js";
import {
  buildVerifierReport, ed25519KeyId, signTrustList, type IssuerAdmission, type KeyPurpose, type TrustContext, type VerifierReportV1
} from "../src/trust/index.js";
import { operatorTrustHome } from "./helpers/trustContext.js";
import { context, distrustEntry, listEntry, testKey, trustList, type TestKey } from "./trust/trustFixtures.js";

/**
 * P0-09 step 10 in process: the flags every verify command takes, the trust context they build, and the exit code
 * and stderr line each verdict maps to. tests/ledgerTrustRootAnchorCli.test.ts and tests/trust/embeddedKeyForgery.test.ts
 * reach the same code through dist/cli.js, which the parent coverage run cannot see.
 */
const shippedDistrust = JSON.parse(readFileSync("src/trust/amc-distrust.json", "utf8")) as { distrust: unknown[] };
const FINGERPRINT = "ab12".repeat(16);
const ROOT = testKey();
const ISSUER = testKey();

const dirs: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

class Exit extends Error {
  constructor(readonly code: number | undefined) { super(`process.exit(${code})`); }
}

interface Captured { exit: number | null; out: string[]; err: string[] }

/** Runs `run` with console and process.exit captured. A real exit would end the worker, so exit throws. */
function capture(run: () => void): Captured {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { out.push(stripVTControlCharacters(args.join(" "))); });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { err.push(stripVTControlCharacters(args.join(" "))); });
  vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => { throw new Exit(typeof code === "number" ? code : undefined); });
  let exit: number | null = null;
  try {
    run();
  } catch (error) {
    if (!(error instanceof Exit)) throw error;
    exit = error.code ?? 0;
  }
  return { exit, out, err };
}

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

/** A trust list the ROOT key signs, valid around the real clock because trustFromFlags takes no clock. */
function signedListFile(dir: string, name: string, overrides: Partial<Parameters<typeof trustList>[1]> = {}, signer: TestKey = ROOT): string {
  const list = trustList([listEntry(ISSUER, { purposes: ["release"], validFrom: iso(-3_600_000), validTo: null })],
    { issuedAt: iso(-3_600_000), expiresAt: iso(86_400_000), ...overrides });
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(signTrustList(list, signer.privateKeyPem)));
  return path;
}

const admission = (status: IssuerAdmission["status"], detail: string | null = null): IssuerAdmission => ({
  signature: "manifest.sig", purpose: "release", keyId: ISSUER.keyId, status,
  source: status === "admitted" ? "explicit-key" : null, listId: null, timeBasis: null, detail
});

function report(input: { errors?: string[]; signatures?: IssuerAdmission[]; unanchored?: boolean; trust?: Partial<TrustContext> } = {}): VerifierReportV1 {
  return buildVerifierReport({
    artifact: { kind: "release", path: "dist/x.amcrelease", sha256: "c".repeat(64) },
    context: context(input.trust), integrityErrors: input.errors ?? [], signatures: input.signatures ?? [admission("admitted")],
    anchoring: input.unanchored ? { status: "unanchored", detail: "the monitor key is not pinned" } : { status: "not-applicable", detail: null }
  });
}

let amcHome: string;
beforeEach(() => {
  // An empty AMC home and no environment pin, so no operator trust on this machine leaks into a verdict.
  amcHome = tempDir("amc-cli-trust-home-");
  vi.stubEnv("AMC_HOME", amcHome);
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function parseFlags(args: string[], extra: Parameters<typeof withTrustFlags>[1] = {}): TrustFlags {
  const command = withTrustFlags(new Command("verify").exitOverride().configureOutput({ writeOut: () => {}, writeErr: () => {} }), extra);
  command.parse(args, { from: "user" });
  return command.opts<TrustFlags>();
}

describe("withTrustFlags", () => {
  it("collects repeatable --trust-list and --trust-root values in order, and leaves allow flags off unless given", () => {
    expect(parseFlags([])).toEqual({});
    expect(parseFlags(["--trust-list", "a.json", "--trust-list", "b.json", "--trust-root", FINGERPRINT, "--trust-root", "cd".repeat(32),
      "--allow-unpinned", "--allow-unanchored"])).toEqual({
      trustList: ["a.json", "b.json"], trustRoot: [FINGERPRINT, "cd".repeat(32)], allowUnpinned: true, allowUnanchored: true
    });
  });

  it("takes --pubkey, --expect-monitor and --json only on commands that asked for them", () => {
    for (const flag of [["--pubkey", "k.pub"], ["--expect-monitor", FINGERPRINT], ["--json"]]) {
      expect(() => parseFlags(flag)).toThrow(`unknown option '${flag[0]}'`);
    }
    expect(parseFlags(["--pubkey", "k.pub", "--expect-monitor", FINGERPRINT, "--json"], { pubkey: "auditor key", expectMonitor: true, json: true }))
      .toEqual({ pubkey: "k.pub", expectMonitor: FINGERPRINT, json: true });
  });

  it("gives ledger-only commands no --allow-unpinned, since a ledger has no issuer to pin", () => {
    expect(() => parseFlags(["--allow-unpinned"], { ledgerOnly: true })).toThrow("unknown option '--allow-unpinned'");
    expect(parseFlags(["--allow-unanchored"], { ledgerOnly: true })).toEqual({ allowUnanchored: true });
    expect(parseFlags(["--allow-unpinned"])).toEqual({ allowUnpinned: true });
  });
});

describe("trustFromFlags", () => {
  const purposes: readonly KeyPurpose[] = ["artifact-seal"];

  it("trusts nothing by default, and never reads the allow flags from the environment", () => {
    vi.stubEnv("AMC_ALLOW_UNPINNED", "1");
    vi.stubEnv("AMC_ALLOW_UNANCHORED", "1");
    const trust = trustFromFlags({}, purposes);
    expect(trust).toMatchObject({ mode: "pinned", lists: [], explicitPins: [], allowUnpinned: false, allowUnanchored: false });
    expect(trust.distrust).toEqual(shippedDistrust.distrust);
  });

  it("turns the allow flags on only when the command line gave them", () => {
    expect(trustFromFlags({ allowUnpinned: true, allowUnanchored: true }, purposes)).toMatchObject({ allowUnpinned: true, allowUnanchored: true });
    expect(trustFromFlags({ allowUnpinned: false, allowUnanchored: false }, purposes)).toMatchObject({ allowUnpinned: false, allowUnanchored: false });
  });

  it("pins --expect-monitor for ledger-row only, lowercased, and prefers it to the environment pin", () => {
    vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", "ee".repeat(32));
    expect(trustFromFlags({ expectMonitor: FINGERPRINT.toUpperCase() }, ["ledger-row"]).explicitPins)
      .toEqual([{ keyId: FINGERPRINT, purposes: ["ledger-row"], origin: "--expect-monitor" }]);
    expect(trustFromFlags({}, ["ledger-row"]).explicitPins)
      .toEqual([{ keyId: "ee".repeat(32), purposes: ["ledger-row"], origin: "AMC_EXPECTED_MONITOR_FINGERPRINT" }]);
  });

  it.each([
    ["too short", "abc"],
    ["63 hex digits", FINGERPRINT.slice(1)],
    ["65 hex digits", `${FINGERPRINT}a`],
    ["not hex", `${"z".repeat(64)}`],
    ["a 0x prefix", `0x${FINGERPRINT.slice(2)}`],
    ["an inner space", `${FINGERPRINT.slice(0, 32)} ${FINGERPRINT.slice(33)}`]
  ])("refuses a malformed --expect-monitor value (%s) instead of pinning it", (_label, value) => {
    expect(() => trustFromFlags({ expectMonitor: value }, ["ledger-row"])).toThrow("--expect-monitor must be a 64 hex sha256 fingerprint");
  });

  it.each(["abc", "g".repeat(64), `${FINGERPRINT}00`])("refuses a malformed --trust-root value %j", (value) => {
    expect(() => trustFromFlags({ trustRoot: [FINGERPRINT, value] }, purposes)).toThrow("--trust-root must be a 64 hex sha256 fingerprint");
  });

  it("pins a --pubkey file for the purposes the command checks, resolving a relative path against the cwd", () => {
    const dir = tempDir("amc-cli-trust-pub-");
    writeFileSync(join(dir, "issuer.pub"), ISSUER.publicKeyPem);
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const trust = trustFromFlags({ pubkey: "issuer.pub" }, ["artifact-seal", "revocation-list"]);
    expect(trust.explicitPins).toEqual([{
      keyId: ed25519KeyId(ISSUER.publicKeyPem), purposes: ["artifact-seal", "revocation-list"], origin: `--pubkey ${join(dir, "issuer.pub")}`
    }]);
  });

  it("refuses a --pubkey that is not an Ed25519 public key, or not there", () => {
    const dir = tempDir("amc-cli-trust-pub-");
    writeFileSync(join(dir, "garbage.pub"), "not a key");
    writeFileSync(join(dir, "private.pem"), ISSUER.privateKeyPem);
    expect(() => trustFromFlags({ pubkey: join(dir, "garbage.pub") }, purposes)).toThrow("is not an Ed25519 SPKI public key");
    expect(() => trustFromFlags({ pubkey: join(dir, "private.pem") }, purposes)).toThrow("is not an Ed25519 SPKI public key");
    expect(() => trustFromFlags({ pubkey: join(dir, "absent.pub") }, purposes)).toThrow("ENOENT");
  });

  it("loads --trust-list files under --trust-root pins and merges each list's distrust entries", () => {
    const dir = tempDir("amc-cli-trust-list-");
    const bad = testKey();
    const first = signedListFile(dir, "first.json", { listId: "first", distrust: [distrustEntry(bad.keyId)] });
    const second = signedListFile(dir, "second.json", { listId: "second" });
    const trust = trustFromFlags({ trustList: [first, second], trustRoot: [ROOT.keyId] }, ["release"]);
    expect(trust.lists.map((list) => list.listId)).toEqual(["first", "second"]);
    expect(trust.distrust.map((entry) => entry.keyId)).toContain(bad.keyId);
  });

  it("reads the default trust list and roots from the AMC home when no flag names any", () => {
    const home = operatorTrustHome([{ publicKeyPem: ISSUER.publicKeyPem, purposes: ["release"] }]);
    dirs.push(home);
    vi.stubEnv("AMC_HOME", home);
    expect(trustFromFlags({}, ["release"]).lists.map((list) => list.listId)).toEqual(["test-operator"]);
    // Naming a list replaces the default one rather than adding to it.
    const dir = tempDir("amc-cli-trust-list-");
    const named = signedListFile(dir, "named.json", { listId: "named" });
    expect(trustFromFlags({ trustList: [named], trustRoot: [ROOT.keyId] }, ["release"]).lists.map((list) => list.listId)).toEqual(["named"]);
  });

  it("refuses a trust list that is missing, unreadable as JSON, expired or signed by a root nobody pinned", () => {
    const dir = tempDir("amc-cli-trust-list-");
    const code = (flags: TrustFlags): string | undefined => {
      try { trustFromFlags(flags, purposes); } catch (error) { return (error as { code?: string }).code ?? (error as Error).message; }
      return undefined;
    };
    writeFileSync(join(dir, "not-json.json"), "{ nope");
    const expired = signedListFile(dir, "expired.json", { issuedAt: iso(-7_200_000), expiresAt: iso(-3_600_000) });
    const foreign = signedListFile(dir, "foreign.json", {}, testKey());
    expect(code({ trustList: [join(dir, "absent.json")], trustRoot: [ROOT.keyId] })).toBe("TRUST_LIST_INVALID");
    expect(code({ trustList: [join(dir, "not-json.json")], trustRoot: [ROOT.keyId] })).toBe("TRUST_LIST_INVALID");
    expect(code({ trustList: [expired], trustRoot: [ROOT.keyId] })).toBe("TRUST_LIST_EXPIRED");
    expect(code({ trustList: [foreign], trustRoot: [ROOT.keyId] })).toBe("TRUST_LIST_SIGNATURE_INVALID");
  });

  it("names the resolved path of a missing --trust-list file", () => {
    const dir = tempDir("amc-cli-trust-list-");
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    expect(() => trustFromFlags({ trustList: ["lists/absent.json"], trustRoot: [ROOT.keyId] }, purposes)).toThrow(resolve(dir, "lists", "absent.json"));
  });

  it("refuses a trust list when no root is pinned by --trust-root or the AMC home", () => {
    const dir = tempDir("amc-cli-trust-list-");
    const list = signedListFile(dir, "list.json");
    expect(() => trustFromFlags({ trustList: [list] }, purposes)).toThrow("no trust-list root is pinned");
  });

  it("builds the context from parsed flags end to end", () => {
    const dir = tempDir("amc-cli-trust-list-");
    const list = signedListFile(dir, "list.json", { listId: "end-to-end" });
    const flags = parseFlags(["--trust-list", list, "--trust-root", ROOT.keyId, "--expect-monitor", FINGERPRINT, "--allow-unanchored"],
      { expectMonitor: true, ledgerOnly: true });
    const trust = trustFromFlags(flags, ["ledger-row"]);
    expect(trust.lists.map((entry) => entry.listId)).toEqual(["end-to-end"]);
    expect(trust.explicitPins.map((pin) => pin.keyId)).toEqual([FINGERPRINT]);
    expect(trust).toMatchObject({ allowUnanchored: true, allowUnpinned: false });
  });
});

describe("finishVerify", () => {
  it("prints PASSED with the command's details and does not exit when the report is trusted", () => {
    const result = capture(() => finishVerify("Release", report(), { details: ["integrity: PASS"] }));
    expect(result).toEqual({ exit: null, out: ["Release verification PASSED", "integrity: PASS"], err: [] });
    expect(capture(() => finishVerify("Release", report(), {}))).toEqual({ exit: null, out: ["Release verification PASSED"], err: [] });
  });

  it("prints the JSON result, or else the report itself, instead of text under --json", () => {
    const trusted = report();
    const withResult = capture(() => finishVerify("Release", trusted, { json: true, result: { ok: true, report: trusted } }));
    expect(withResult.exit).toBeNull();
    expect(withResult.out).toHaveLength(1);
    expect(JSON.parse(withResult.out[0]!)).toEqual({ ok: true, report: trusted });
    const bare = capture(() => finishVerify("Release", trusted, { json: true }));
    expect(JSON.parse(bare.out[0]!)).toEqual(trusted);
    expect(bare.err).toEqual([]);
  });

  it("exits 1 with FAILED and one line per reason when integrity fails, with nothing on stderr", () => {
    const failed = report({ errors: ["sbom sha mismatch"], signatures: [admission("admitted"), admission("not-pinned", "pin it with --pubkey")] });
    const result = capture(() => finishVerify("Release", failed, { details: ["integrity: PASS"] }));
    expect(result.exit).toBe(1);
    expect(result.out).toEqual([
      "Release verification FAILED", "- sbom sha mismatch", "- manifest.sig (release): not-pinned — pin it with --pubkey"
    ]);
    expect(result.err).toEqual([]);
  });

  it("exits 1 for a signature nobody pinned, since --allow-unpinned was not used", () => {
    const result = capture(() => finishVerify("Passport", report({ signatures: [admission("not-pinned")] }), {}));
    expect(result.exit).toBe(1);
    expect(result.err).toEqual([]);
  });

  it("exits 2 for --allow-unpinned, saying UNTRUSTED on both streams and naming the flag", () => {
    const allowed = report({ signatures: [admission("unpinned-allowed", "not pinned for release")], trust: { allowUnpinned: true } });
    const result = capture(() => finishVerify("Release", allowed, { details: ["integrity: PASS"] }));
    expect(result.exit).toBe(2);
    expect(result.out).toEqual(["Release integrity verified, UNTRUSTED", "- manifest.sig (release): unpinned-allowed — not pinned for release"]);
    expect(result.err).toHaveLength(1);
    expect(result.err[0]).toBe("UNTRUSTED: integrity verified, but --allow-unpinned was used: manifest.sig (release): unpinned-allowed — not pinned for release");
  });

  it("names both allow flags when an unanchored ledger and an unpinned signer were both allowed", () => {
    const both = report({ signatures: [admission("unpinned-allowed")], unanchored: true, trust: { allowUnpinned: true, allowUnanchored: true } });
    const result = capture(() => finishVerify("Bundle", both, {}));
    expect(result.exit).toBe(2);
    expect(result.err[0]).toMatch(/^UNTRUSTED: integrity verified, but --allow-unpinned and --allow-unanchored was used: /);
    expect(result.err[0]).toContain("ledger UNANCHORED: the monitor key is not pinned");
  });

  it("keeps stdout pure JSON under --json and still exits 2 with the UNTRUSTED line on stderr", () => {
    const allowed = report({ signatures: [admission("unpinned-allowed")], trust: { allowUnpinned: true } });
    const result = capture(() => finishVerify("Release", allowed, { json: true, result: { report: allowed } }));
    expect(result.exit).toBe(2);
    expect(JSON.parse(result.out.join("\n"))).toEqual({ report: allowed });
    expect(result.err[0]?.startsWith("UNTRUSTED:")).toBe(true);
  });

  it("exits 1 for a distrusted signer even when --allow-unpinned was used", () => {
    const distrusted = report({ signatures: [admission("distrusted", "key is distrusted")], trust: { allowUnpinned: true } });
    const result = capture(() => finishVerify("Release", distrusted, {}));
    expect(result.exit).toBe(1);
    expect(result.err).toEqual([]);
  });
});

describe("ledgerExitCode", () => {
  const trustRoot = (overrides: Partial<{ anchored: boolean; monitorAdmission: IssuerAdmission }> = {}) =>
    ({ anchored: false, monitorFingerprint: FINGERPRINT, expectedFingerprint: null, ...overrides });
  const monitor = (status: IssuerAdmission["status"]): IssuerAdmission => ({ ...admission(status), purpose: "ledger-row", signature: "ledger monitor key" });

  it("is 1 for a ledger that did not verify, whatever was pinned or allowed", () => {
    const result = capture(() => { expect(ledgerExitCode({ ok: false, trustRoot: trustRoot({ anchored: true }) }, context({ allowUnanchored: true }))).toBe(1); });
    expect(result.err).toEqual([]);
  });

  it("is 0 for a verified ledger whose monitor key is anchored, saying nothing", () => {
    const result = capture(() => { expect(ledgerExitCode({ ok: true, trustRoot: trustRoot({ anchored: true }) }, context())).toBe(0); });
    expect(result.err).toEqual([]);
  });

  it("is 1 for a verified but unanchored ledger without --allow-unanchored", () => {
    const result = capture(() => { expect(ledgerExitCode({ ok: true, trustRoot: trustRoot() }, context())).toBe(1); });
    expect(result.err).toEqual([]);
  });

  it("is 2 with the UNTRUSTED line for an unanchored ledger under --allow-unanchored", () => {
    const result = capture(() => {
      expect(ledgerExitCode({ ok: true, trustRoot: trustRoot({ monitorAdmission: monitor("not-pinned") }) }, context({ allowUnanchored: true }))).toBe(2);
    });
    expect(result.err).toEqual([
      "UNTRUSTED: integrity verified, but --allow-unanchored was used: ledger UNANCHORED: the monitor key was read from the workspace being verified (internal consistency only)"
    ]);
  });

  it.each(["distrusted", "revoked"] as const)("is 1 for a %s monitor key even under --allow-unanchored", (status) => {
    const result = capture(() => {
      expect(ledgerExitCode({ ok: true, trustRoot: trustRoot({ monitorAdmission: monitor(status) }) }, context({ allowUnanchored: true }))).toBe(1);
    });
    expect(result.err).toEqual([]);
  });
});

describe("verifyAllExit", () => {
  const checks = (...entries: Array<[string, string]>) => ({ checks: entries.map(([id, status]) => ({ id, status })) });

  it("does not exit when verify all anchored the ledger", () => {
    const result = capture(() => verifyAllExit(checks(["ledger-hash-chain", "PASS"], ["ledger-trust-root", "PASS"]), context()));
    expect(result).toEqual({ exit: null, out: [], err: [] });
  });

  it("exits 1 when the ledger trust-root check did not pass and nothing allowed it", () => {
    expect(capture(() => verifyAllExit(checks(["ledger-trust-root", "FAIL"]), context())).exit).toBe(1);
    expect(capture(() => verifyAllExit(checks(["ledger-hash-chain", "PASS"]), context())).exit).toBe(1);
  });

  it("exits 2 with the UNTRUSTED line when --allow-unanchored skipped the trust-root check", () => {
    const result = capture(() => verifyAllExit(checks(["ledger-trust-root", "SKIP"]), context({ allowUnanchored: true })));
    expect(result.exit).toBe(2);
    expect(result.err[0]?.startsWith("UNTRUSTED: integrity verified, but --allow-unanchored was used:")).toBe(true);
  });
});
