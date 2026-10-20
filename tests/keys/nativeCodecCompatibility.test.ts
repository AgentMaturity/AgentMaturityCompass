import { sign, verify } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { getSigningKey } from "../../src/crypto/keys.js";
import { issueSessionToken, issueSessionTokenAsync, verifySessionToken } from "../../src/auth/sessionTokens.js";
import { initHostVault, lockHostVault, hostVaultPublicKeyPem, signHostPayload, verifyHostPayload } from "../../src/identity/hostVault.js";
import { issueIdentitySessionToken, verifyIdentitySessionToken } from "../../src/identity/session.js";
import { createWorkOrder } from "../../src/workorders/workorderEngine.js";
import { issueExecTicket, issueExecTicketAsync, parseExecTicket, verifyExecTicket } from "../../src/tickets/execTicketVerify.js";
import { initComplianceMaps, verifyComplianceMapsSignature } from "../../src/compliance/complianceEngine.js";
import { canonicalize } from "../../src/utils/json.js";
import { lockVault } from "../../src/vault/vault.js";

const PASS = "owned-native-codec-compatibility-passphrase";
const roots: Array<{ root: string; workspace: string; hostDir: string }> = [];
afterEach(() => {
  for (const f of roots.splice(0)) {
    lockVault(f.workspace); lockHostVault(f.hostDir); rmSync(f.root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-native-codec-compatibility-"));
  const workspace = join(root, "workspace"), hostDir = join(root, "host");
  roots.push({ root, workspace, hostDir });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return { root, workspace, hostDir };
}

// Independent spelling of the existing wire format, deliberately not Buffer's base64url encoder.
function legacyWire(bytes: Buffer): string { return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function legacySpellings(encoded: string) {
  const base64 = Buffer.from(encoded, "base64").toString("base64");
  return [
    ["standard padded", base64],
    ["URL alphabet padded", base64.replace(/\+/g, "-").replace(/\//g, "_")],
    ["ASCII whitespace", "\t" + base64.slice(0, 4) + " \r\n" + base64.slice(4) + "\n"],
    ["ignored non-alphabet", "!" + base64.slice(0, 4) + "?" + base64.slice(4)]
  ] as const;
}

test("workspace session native codec preserves exact default sync/async wires and existing permissive decoding", async () => {
  const f = fixture(), input = { workspace: f.workspace, userId: "owned-user", username: "codec-🚀", roles: ["OWNER" as const] };
  for (const issued of [issueSessionToken(input), await issueSessionTokenAsync(input)]) {
    const bytes = Buffer.from(canonicalize(issued.payload)), signature = sign(null, bytes, getSigningKey(f.workspace, "session"));
    expect(issued.token).toBe(legacyWire(bytes) + "." + legacyWire(signature));
    expect(verifySessionToken({ workspace: f.workspace, token: issued.token })).toMatchObject({ ok: true, payload: issued.payload });
    const [body, sig] = issued.token.split(".") as [string, string];
    for (const [label, value] of legacySpellings(body)) expect(verifySessionToken({ workspace: f.workspace, token: value + "." + sig }).ok, label).toBe(true);
    for (const [label, value] of legacySpellings(sig)) expect(verifySessionToken({ workspace: f.workspace, token: body + "." + value }).ok, label).toBe(true);
    expect(verifySessionToken({ workspace: f.workspace, token: issued.token + ".extra" }).ok).toBe(false);
    expect(verifySessionToken({ workspace: f.workspace, token: "eA==." + sig }).ok).toBe(false);
    expect(verifySessionToken({ workspace: f.workspace, token: body + "." + Buffer.alloc(64).toString("base64") }).ok).toBe(false);
  }
});

test("host raw payload native codec preserves unpadded output and existing permissive signature decoding", () => {
  const f = fixture(); initHostVault(f.hostDir, PASS);
  const bytes = Buffer.from("owned host codec 🚀"), encoded = signHostPayload(f.hostDir, "session", bytes), raw = Buffer.from(encoded, "base64");
  expect(encoded).toBe(legacyWire(raw)); expect(encoded).toMatch(/^[A-Za-z0-9_-]{86}$/);
  expect(verify(null, bytes, hostVaultPublicKeyPem(f.hostDir, "session"), raw)).toBe(true);
  for (const [label, value] of legacySpellings(encoded)) expect(verifyHostPayload(f.hostDir, "session", bytes, value), label).toBe(true);
  expect(verifyHostPayload(f.hostDir, "session", Buffer.from("changed host bytes"), encoded)).toBe(false);
  expect(verifyHostPayload(f.hostDir, "session", bytes, "!")).toBe(false);
  // Actual raw signature bytes are valid crypto but were never an accepted string wire value.
  expect(verifyHostPayload(f.hostDir, "session", bytes, raw as unknown as string)).toBe(false);
  expect(verifyHostPayload(f.hostDir, "session", bytes, new Uint8Array(raw) as unknown as string)).toBe(false);
});

test("host identity native codec preserves default wire bytes and existing permissive payload decoding", () => {
  const f = fixture(); initHostVault(f.hostDir, PASS);
  const issued = issueIdentitySessionToken({ hostDir: f.hostDir, userId: "identity-🚀", authType: "LOCAL", ttlMinutes: 10 });
  const bytes = Buffer.from(canonicalize(issued.payload)), [body, sig] = issued.token.split(".") as [string, string], raw = Buffer.from(sig, "base64");
  expect(issued.token).toBe(legacyWire(bytes) + "." + legacyWire(raw));
  expect(verify(null, bytes, hostVaultPublicKeyPem(f.hostDir, "session"), raw)).toBe(true);
  expect(verifyIdentitySessionToken({ hostDir: f.hostDir, token: issued.token })).toMatchObject({ ok: true, payload: issued.payload });
  for (const [label, value] of legacySpellings(body)) expect(verifyIdentitySessionToken({ hostDir: f.hostDir, token: value + "." + sig }).ok, label).toBe(true);
  for (const [label, value] of legacySpellings(sig)) expect(verifyIdentitySessionToken({ hostDir: f.hostDir, token: body + "." + value }).ok, label).toBe(true);
  expect(verifyIdentitySessionToken({ hostDir: f.hostDir, token: issued.token + ".extra" }).ok).toBe(false);
  expect(verifyIdentitySessionToken({ hostDir: f.hostDir, token: "eA==." + sig }).ok).toBe(false);
});

test("execution ticket native codec preserves exact default sync/async wires and existing permissive decoding", async () => {
  const f = fixture(), work = createWorkOrder({ workspace: f.workspace, agentId: "default", title: "Owned codec work order",
    description: "Legacy ticket wire control", riskTier: "low", requestedMode: "EXECUTE", allowedActionClasses: ["WRITE_HIGH"] });
  const input = { workspace: f.workspace, agentId: "default", workOrderId: work.workOrder.workOrderId, actionClass: "WRITE_HIGH" as const, toolName: "codec-tool", ttlMs: 600_000 };
  for (const issued of [issueExecTicket(input), await issueExecTicketAsync(input)]) {
    const bytes = Buffer.from(canonicalize(issued.payload)), signature = sign(null, bytes, getSigningKey(f.workspace, "config-signature"));
    expect(issued.ticket).toBe(legacyWire(bytes) + "." + legacyWire(signature));
    expect(verifyExecTicket({ workspace: f.workspace, ticket: issued.ticket, expectedWorkOrderId: input.workOrderId })).toMatchObject({ ok: true, payload: issued.payload });
    const [body, sig] = issued.ticket.split(".") as [string, string];
    expect(parseExecTicket(issued.ticket)).toEqual(issued.payload);
    for (const [label, value] of legacySpellings(body)) {
      const presented = value + "." + sig;
      expect(verifyExecTicket({ workspace: f.workspace, ticket: presented }).ok, label).toBe(true);
      expect(parseExecTicket(presented), label).toEqual(issued.payload);
    }
    for (const [label, value] of legacySpellings(sig)) expect(verifyExecTicket({ workspace: f.workspace, ticket: body + "." + value }).ok, label).toBe(true);
    expect(verifyExecTicket({ workspace: f.workspace, ticket: issued.ticket + ".extra" }).ok).toBe(false);
    expect(() => parseExecTicket(issued.ticket + ".extra")).toThrow("invalid ticket format");
    expect(() => parseExecTicket("eA==." + sig)).toThrow(SyntaxError);
    expect(verifyExecTicket({ workspace: f.workspace, ticket: "eA==." + sig }).ok).toBe(false);
    expect(verifyExecTicket({ workspace: f.workspace, ticket: body + "." + Buffer.alloc(64).toString("base64") }).ok).toBe(false);
  }
});

test("compliance schema reuse retains legacy optional envelope, unknown-key stripping and field refusals", () => {
  const f = fixture(), produced = initComplianceMaps(f.workspace), original = readFileSync(produced.sigPath);
  const sidecar = JSON.parse(original.toString("utf8")) as Record<string, unknown>;
  expect(verifyComplianceMapsSignature(f.workspace)).toMatchObject({ valid: true, signatureExists: true, reason: null });
  try {
    writeFileSync(produced.sigPath, JSON.stringify({ ...sidecar, oldExtraField: "ignored by the existing z.object" }));
    expect(verifyComplianceMapsSignature(f.workspace)).toMatchObject({ valid: true, reason: null });
    const legacy = { ...sidecar }; delete legacy.envelope;
    writeFileSync(produced.sigPath, JSON.stringify(legacy));
    expect(verifyComplianceMapsSignature(f.workspace)).toMatchObject({ valid: true, reason: null });
    for (const patch of [{ signedTs: 0.5 }, { digestSha256: "a".repeat(63) }, { signature: "" }, { signer: "monitor" }, { envelope: {} }]) {
      writeFileSync(produced.sigPath, JSON.stringify({ ...sidecar, ...patch }));
      expect(verifyComplianceMapsSignature(f.workspace)).toMatchObject({ valid: false, signatureExists: true });
    }
  } finally { writeFileSync(produced.sigPath, original); }
  expect(verifyComplianceMapsSignature(f.workspace)).toMatchObject({ valid: true, reason: null });
});
