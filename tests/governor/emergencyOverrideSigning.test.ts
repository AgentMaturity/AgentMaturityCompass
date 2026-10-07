import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signHexDigest } from "../../src/crypto/keys.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";
import { initWorkspace } from "../../src/workspace.js";
import {
  activateOverride,
  fileOverridePostmortem,
  getActiveOverrides,
  getOverrideAlerts,
  isOverrideActive,
  logOverrideAction,
  verifyOverrideEntry,
  type EmergencyOverrideEntry
} from "../../src/governor/emergencyOverride.js";
import {
  activateEmergencyOverride,
  filePostmortem,
  generatePolicyCanaryReport,
  getActiveOverrides as getActiveCanaryOverrides,
  getOverridesMissingPostmortem,
  resetPolicyCanaryState
} from "../../src/governor/policyCanary.js";

/**
 * Gap G16: both break-glass paths stored the literal signature "unsigned" when
 * no auditor key was available, and no read checked the signature, so a
 * hand-written JSON file under .amc/governor/ counted as an active override.
 */

const AGENT = "agent-1";
const PARAMS = { agentId: AGENT, reason: "production outage needs a bypass", ttlMs: 3_600_000, mode: "dry-run" as const };
const CANARY_PARAMS = { agentId: AGENT, reason: "outage", actionDescription: "allow deploy", ttlMs: 3_600_000 };
const dirs: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resetPolicyCanaryState();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function bare(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-breakglass-")));
  dirs.push(dir);
  return dir;
}

function keyed(): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "break-glass-test-passphrase");
  const dir = bare();
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  return dir;
}

const overridesDir = (ws: string) => join(ws, ".amc", "governor", "overrides");
const canaryDir = (ws: string) => join(ws, ".amc", "governor", "emergency-overrides");
const filesIn = (dir: string) => (existsSync(dir) ? readdirSync(dir) : []);

function errorCode(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? "NO_CODE";
  }
}

function readEntry(ws: string, id: string): EmergencyOverrideEntry {
  return JSON.parse(readFileSync(join(overridesDir(ws), `${id}.json`), "utf8")) as EmergencyOverrideEntry;
}

function writeEntry(ws: string, entry: EmergencyOverrideEntry): void {
  mkdirSync(overridesDir(ws), { recursive: true });
  writeFileSync(join(overridesDir(ws), `${entry.overrideId}.json`), JSON.stringify(entry, null, 2));
}

/** The activation-time hash, as an attacker who edits a field would recompute it. */
function activationHash(entry: EmergencyOverrideEntry): string {
  return sha256Hex(canonicalize({
    overrideId: entry.overrideId,
    agentId: entry.agentId,
    reason: entry.reason,
    ttlMs: entry.ttlMs,
    mode: entry.mode,
    startedTs: entry.startedTs,
    expiresTs: entry.expiresTs,
    active: true,
    postmortemRequired: true,
    postmortemDueTs: entry.postmortemDueTs,
    postmortemFiled: false,
    postmortemArtifactPath: null,
    prev_override_hash: entry.prev_override_hash
  }));
}

function handWritten(): EmergencyOverrideEntry {
  const now = Date.now();
  const entry: EmergencyOverrideEntry = {
    overrideId: "eor_handwritten1",
    agentId: AGENT,
    reason: "nobody signed this override",
    ttlMs: 3_600_000,
    mode: "execute",
    startedTs: now,
    expiresTs: now + 3_600_000,
    active: true,
    actionLog: [],
    postmortemRequired: true,
    postmortemDueTs: now + 3_600_000 + 48 * 3_600_000,
    postmortemFiled: false,
    postmortemArtifactPath: null,
    prev_override_hash: "GENESIS_OVERRIDES",
    override_hash: "",
    signature: "unsigned"
  };
  // A correct hash, so only the signature check can refuse it.
  return { ...entry, override_hash: activationHash(entry) };
}

function invalidCode(ws: string, entry: EmergencyOverrideEntry): string | null {
  const check = verifyOverrideEntry(ws, entry);
  return check.valid ? null : check.code;
}

describe("activation refuses to record an override it cannot sign", () => {
  it("throws BREAK_GLASS_UNSIGNED without a vault and writes nothing", () => {
    const ws = bare();
    expect(errorCode(() => activateOverride(ws, PARAMS))).toBe("BREAK_GLASS_UNSIGNED");
    expect(filesIn(overridesDir(ws))).toEqual([]);
    expect(errorCode(() => activateEmergencyOverride(CANARY_PARAMS, ws))).toBe("BREAK_GLASS_UNSIGNED");
    expect(filesIn(canaryDir(ws))).toEqual([]);
  });

  it("throws in no-sign mode even when the workspace holds a key", () => {
    const ws = keyed();
    vi.stubEnv("AMC_NO_SIGN", "1");
    expect(errorCode(() => activateOverride(ws, PARAMS))).toBe("BREAK_GLASS_UNSIGNED");
    expect(filesIn(overridesDir(ws))).toEqual([]);
    expect(errorCode(() => activateEmergencyOverride(CANARY_PARAMS, ws))).toBe("BREAK_GLASS_UNSIGNED");
    expect(filesIn(canaryDir(ws))).toEqual([]);
  });

  it("throws for a library call without a workspace and keeps nothing in memory", () => {
    expect(errorCode(() => activateEmergencyOverride(CANARY_PARAMS))).toBe("BREAK_GLASS_UNSIGNED");
    const ws = keyed();
    // An unsigned override left in the in-process register would surface here as invalid.
    const report = generatePolicyCanaryReport(AGENT, ws);
    expect(report.activeOverrides).toBe(0);
    expect(report.invalidOverrides).toBe(0);
  });

  it("refuses both CLI commands with exit 1 and writes nothing", () => {
    const ws = bare();
    const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
    delete env.AMC_VAULT_PASSPHRASE;
    delete env.AMC_VAULT_PASSPHRASE_FILE;
    const cli = resolve(process.cwd(), "dist/cli.js");
    for (const args of [
      ["governor-override", "--agent", AGENT, "--reason", PARAMS.reason],
      ["emergency-override", "--agent", AGENT, "--reason", "outage", "--action", "allow deploy"]
    ]) {
      const result = spawnSync(process.execPath, [cli, ...args], { cwd: ws, env, encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Emergency override refused");
    }
    expect(filesIn(overridesDir(ws))).toEqual([]);
    expect(filesIn(canaryDir(ws))).toEqual([]);
  });
});

describe("a signed override", () => {
  it("is active, and stays valid after a postmortem and auto-expiry", () => {
    const ws = keyed();
    const entry = activateOverride(ws, PARAMS);
    expect(verifyOverrideEntry(ws, entry)).toEqual({ valid: true });
    expect(isOverrideActive(ws, AGENT)).toBe(true);
    expect(logOverrideAction(ws, entry.overrideId, "deploy", "hotfix")).not.toBeNull();
    expect(getOverrideAlerts(ws, AGENT).map((a) => a.alertType)).not.toContain("INVALID_SIGNATURE");

    expect(fileOverridePostmortem(ws, entry.overrideId, "postmortem.md")).toBe(true);
    expect(verifyOverrideEntry(ws, readEntry(ws, entry.overrideId))).toEqual({ valid: true });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(entry.expiresTs + 1000);
    expect(getActiveOverrides(ws, AGENT)).toEqual([]);
    const expired = readEntry(ws, entry.overrideId);
    expect(expired.active).toBe(false);
    expect(verifyOverrideEntry(ws, expired)).toEqual({ valid: true });
    expect(getOverrideAlerts(ws, AGENT).map((a) => a.alertType)).not.toContain("INVALID_SIGNATURE");
  });

  it("counts in the canary register across processes and after a postmortem", () => {
    const ws = keyed();
    activateEmergencyOverride(CANARY_PARAMS, ws);
    const expired = activateEmergencyOverride({ ...CANARY_PARAMS, ttlMs: -1 }, ws);
    resetPolicyCanaryState();
    expect(getActiveCanaryOverrides(AGENT, ws)).toHaveLength(1);
    expect(getOverridesMissingPostmortem(AGENT, ws).map((o) => o.overrideId)).toEqual([expired.overrideId]);

    expect(filePostmortem(expired.overrideId, "artifact-1", ws)).toBe(true);
    resetPolicyCanaryState();
    expect(getOverridesMissingPostmortem(AGENT, ws)).toEqual([]);
    const report = generatePolicyCanaryReport(AGENT, ws);
    expect(report.activeOverrides).toBe(1);
    expect(report.invalidOverrides).toBe(0);
  });
});

describe("an override whose signature does not verify is never honoured", () => {
  it("refuses a hand-written unsigned file and reports it", () => {
    const ws = keyed();
    const entry = handWritten();
    writeEntry(ws, entry);
    expect(invalidCode(ws, entry)).toBe("UNSIGNED");
    expect(isOverrideActive(ws, AGENT)).toBe(false);
    expect(logOverrideAction(ws, entry.overrideId, "deploy", "hotfix")).toBeNull();
    const alerts = getOverrideAlerts(ws, AGENT);
    expect(alerts.map((a) => a.alertType)).toEqual(["INVALID_SIGNATURE"]);
    expect(alerts[0]!.message).toContain(`Override ${entry.overrideId} is not honoured: UNSIGNED`);
    // The file stays on disk as an audit trail.
    expect(filesIn(overridesDir(ws))).toEqual([`${entry.overrideId}.json`]);
  });

  it("refuses a hand-written canary record and counts it as invalid", () => {
    const ws = keyed();
    const now = Date.now();
    mkdirSync(canaryDir(ws), { recursive: true });
    writeFileSync(join(canaryDir(ws), "emo_handwritten1.json"), JSON.stringify({
      ...CANARY_PARAMS, overrideId: "emo_handwritten1", startedTs: now, expiresTs: now + 3_600_000,
      postmortemFiled: false, postmortemArtifactId: null, signature: "unsigned"
    }));
    expect(getActiveCanaryOverrides(AGENT, ws)).toEqual([]);
    const report = generatePolicyCanaryReport(AGENT, ws);
    expect(report.activeOverrides).toBe(0);
    expect(report.invalidOverrides).toBe(1);
  });

  it.each([
    ["expiresTs plus one hour", (e: EmergencyOverrideEntry) => ({ ...e, expiresTs: e.expiresTs + 3_600_000 })],
    ["agentId changed", (e: EmergencyOverrideEntry) => ({ ...e, agentId: "agent-2" })],
    ["reason changed", (e: EmergencyOverrideEntry) => ({ ...e, reason: "a different justification" })]
  ])("reports HASH_MISMATCH when tampered after signing: %s", (_label, tamper) => {
    const ws = keyed();
    const entry = tamper(activateOverride(ws, PARAMS));
    writeEntry(ws, entry);
    expect(invalidCode(ws, entry)).toBe("HASH_MISMATCH");
    expect(getActiveOverrides(ws, entry.agentId)).toEqual([]);
    expect(getOverrideAlerts(ws, entry.agentId).map((a) => a.alertType)).toEqual(["INVALID_SIGNATURE"]);
  });

  it("reports SIGNATURE_INVALID when the attacker recomputes the hash", () => {
    const ws = keyed();
    const changed = { ...activateOverride(ws, PARAMS), expiresTs: Date.now() + 10 * 3_600_000 };
    const entry = { ...changed, override_hash: activationHash(changed) };
    writeEntry(ws, entry);
    expect(invalidCode(ws, entry)).toBe("SIGNATURE_INVALID");
    expect(isOverrideActive(ws, AGENT)).toBe(false);
  });

  it("reports SIGNATURE_INVALID for an override replayed from another workspace", () => {
    const a = keyed();
    const b = keyed();
    const entry = activateOverride(a, PARAMS);
    writeEntry(b, entry);
    expect(invalidCode(a, entry)).toBeNull();
    expect(invalidCode(b, entry)).toBe("SIGNATURE_INVALID");
    expect(isOverrideActive(b, AGENT)).toBe(false);
  });

  it("reports SIGNATURE_INVALID for a foreign key over the correct hash", () => {
    const ws = keyed();
    const foreign = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const unsigned = handWritten();
    const entry = { ...unsigned, signature: signHexDigest(unsigned.override_hash, foreign) };
    writeEntry(ws, entry);
    expect(invalidCode(ws, entry)).toBe("SIGNATURE_INVALID");
    expect(isOverrideActive(ws, AGENT)).toBe(false);
  });

  it("refuses a canary record tampered after signing", () => {
    const ws = keyed();
    const override = activateEmergencyOverride(CANARY_PARAMS, ws);
    resetPolicyCanaryState();
    const file = join(canaryDir(ws), `${override.overrideId}.json`);
    const stored = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    writeFileSync(file, JSON.stringify({ ...stored, expiresTs: override.expiresTs + 3_600_000 }));
    const report = generatePolicyCanaryReport(AGENT, ws);
    expect(report.activeOverrides).toBe(0);
    expect(report.invalidOverrides).toBe(1);
  });
});
