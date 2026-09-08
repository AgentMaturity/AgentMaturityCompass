import { spawn, type ChildProcess } from "node:child_process";
import { verify } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notaryInitCli, notaryStartCli } from "../src/notary/notaryCli.js";
import { loadNotaryConfig, notaryConfigPath, notaryLogPath, notaryPublicKeyPath, notarySealedKeyPath, saveNotaryConfig } from "../src/notary/notaryConfigStore.js";
import { initWorkspace } from "../src/workspace.js";
import { setVaultSecret } from "../src/vault/vault.js";
import { enableNotaryTrust } from "../src/trust/trustConfig.js";
import { signDigestWithPolicy, verifySignedDigest } from "../src/crypto/signing/signer.js";
import { sha256Hex } from "../src/utils/hash.js";
import { buildNotaryAuthSignature } from "../src/notary/notaryAuth.js";
import { verifyNotarySignResponse } from "../src/notary/notaryVerify.js";

const AUTH = "synthetic-notary-compose-auth";
const roots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-notary-compose-"));
  roots.push(root);
  return root;
}

async function availablePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function preparedNotary(root: string): Promise<{ notaryDir: string; port: number }> {
  const notaryDir = join(root, "notary");
  await notaryInitCli({ notaryDir });
  const config = loadNotaryConfig(notaryDir);
  config.notary.port = await availablePort();
  saveNotaryConfig(notaryDir, config);
  return { notaryDir, port: config.notary.port };
}

function authoritySnapshot(notaryDir: string): string[] {
  return [notaryConfigPath(notaryDir), notarySealedKeyPath(notaryDir), notaryPublicKeyPath(notaryDir)]
    .map(path => sha256Hex(readFileSync(path)));
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
  try { await exited; } finally { clearTimeout(timer); }
}

/** The synchronous policy producer needs a separate service event loop. */
async function startCliNotary(notaryDir: string, port: number): Promise<ChildProcess> {
  const registrarUrl = new URL("../src/cli-notary-commands.ts", import.meta.url).href;
  const script = `import { Command } from 'commander';
import { registerNotaryStartCommand } from ${JSON.stringify(registrarUrl)};
const program = new Command();
registerNotaryStartCommand(program.command('notary'));
await program.parseAsync(['notary','start','--notary-dir',${JSON.stringify(notaryDir)},'--bind','0.0.0.0'], {from:'user'});`;
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: process.cwd(), env: { ...process.env }, stdio: ["ignore", "ignore", "pipe"]
  });
  child.stderr?.resume();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && child.exitCode === null && child.signalCode === null) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/readyz`, { signal: AbortSignal.timeout(500) });
      if (response.ok && (await response.json() as { status?: string }).status === "READY") return child;
    } catch { /* wait only for this owned child's bounded startup */ }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  await stopChild(child);
  throw new Error("Synthetic notary CLI did not become ready within ten seconds.");
}

beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-notary-compose-vault");
  vi.stubEnv("AMC_NOTARY_PASSPHRASE", "synthetic-notary-compose-passphrase");
  vi.stubEnv("AMC_NOTARY_AUTH_SECRET", AUTH);
  for (const key of ["AMC_VAULT_PASSPHRASE_FILE", "AMC_NOTARY_PASSPHRASE_FILE", "AMC_NOTARY_AUTH_SECRET_FILE"]) vi.stubEnv(key, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("optional Compose notary listener and policy signing", () => {
  it("uses an explicit TCP override without changing saved authority, then returns to the loopback default", async () => {
    const { notaryDir, port } = await preparedNotary(fixture());
    expect(loadNotaryConfig(notaryDir).notary.bindHost).toBe("127.0.0.1");
    const before = authoritySnapshot(notaryDir);
    const runtime = await notaryStartCli({ notaryDir, bindHost: "0.0.0.0" });
    try {
      expect(runtime.url).toBe(`http://0.0.0.0:${port}`);
      const ready = await fetch(`http://127.0.0.1:${port}/readyz`);
      expect(ready.status).toBe(200);
      expect((await ready.json() as { status: string }).status).toBe("READY");
      expect(authoritySnapshot(notaryDir)).toEqual(before);
    } finally { await runtime.close(); }
    const local = await notaryStartCli({ notaryDir });
    try {
      expect(local.url).toBe(`http://127.0.0.1:${port}`);
      expect(authoritySnapshot(notaryDir)).toEqual(before);
    } finally { await local.close(); }
  });

  it.each(["", "http://0.0.0.0", "127.0.0.1:4343", "0.0.0.0\n", "--unexpected"])("refuses invalid bind %j before fresh setup writes", async bindHost => {
    const notaryDir = join(fixture(), "absent-notary");
    await expect(notaryStartCli({ notaryDir, bindHost })).rejects.toThrow("requires an IP address or hostname");
    expect(existsSync(notaryDir)).toBe(false);
  });

  it("rejects a TCP override of a saved Unix socket before log or authority mutation", async () => {
    const root = fixture();
    const { notaryDir } = await preparedNotary(root);
    const config = loadNotaryConfig(notaryDir);
    config.notary.unixSocketPath = join(root, "notary.sock");
    saveNotaryConfig(notaryDir, config);
    const before = authoritySnapshot(notaryDir);
    const log = readFileSync(notaryLogPath(notaryDir));
    await expect(notaryStartCli({ notaryDir, bindHost: "0.0.0.0" })).rejects.toThrow("configured Unix socket");
    expect(authoritySnapshot(notaryDir)).toEqual(before);
    expect(readFileSync(notaryLogPath(notaryDir))).toEqual(log);
    expect(existsSync(config.notary.unixSocketPath)).toBe(false);
  });

  it("keeps missing-auth readiness unavailable even with an explicit reachable listener", async () => {
    const { notaryDir, port } = await preparedNotary(fixture());
    vi.stubEnv("AMC_NOTARY_AUTH_SECRET", "");
    const runtime = await notaryStartCli({ notaryDir, bindHost: "0.0.0.0" });
    try {
      const response = await fetch(`http://127.0.0.1:${port}/readyz`);
      expect(response.status).toBe(503);
      const body = await response.json() as { status: string; reasons: string[] };
      expect(body.status).toBe("NOT_READY");
      expect(body.reasons).toContain("NOTARY_AUTH_SECRET_MISSING");
    } finally { await runtime.close(); }
  });

  it("signs the original digest through the actual CLI service and policy producer, retaining auth and payload checks", async () => {
    const root = fixture();
    const workspace = join(root, "workspace");
    initWorkspace({ workspacePath: workspace });
    const { notaryDir, port } = await preparedNotary(root);
    const child = await startCliNotary(notaryDir, port);
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
      setVaultSecret(workspace, "notary/auth", AUTH);
      await enableNotaryTrust({ workspace, baseUrl, pinPubkeyPath: notaryPublicKeyPath(notaryDir), requiredAttestationLevel: "SOFTWARE" });
      const digestHex = sha256Hex("synthetic-original-notary-digest");
      const digestBytes = Buffer.from(digestHex, "hex");
      const signed = signDigestWithPolicy({ workspace, kind: "MERKLE_ROOT", digestHex });
      expect(signed.digestSha256).toBe(digestHex);
      expect(signed.envelope?.signer.type).toBe("NOTARY");
      expect(verifySignedDigest({ workspace, digestHex, signed })).toBe(true);
      const pubkey = readFileSync(notaryPublicKeyPath(notaryDir), "utf8");
      expect(verify(null, digestBytes, pubkey, Buffer.from(signed.signature, "base64"))).toBe(true);
      expect(verify(null, Buffer.from(sha256Hex(digestBytes), "hex"), pubkey, Buffer.from(signed.signature, "base64"))).toBe(false);

      setVaultSecret(workspace, "notary/auth", "synthetic-wrong-secret");
      expect(() => signDigestWithPolicy({ workspace, kind: "MERKLE_ROOT", digestHex })).toThrow("notary sign failed (401)");
      setVaultSecret(workspace, "notary/auth", AUTH);

      const request = async (checksum: string, timestamp: number) => {
        const body = JSON.stringify({ kind: "MERKLE_ROOT", payloadB64: digestBytes.toString("base64"), payloadSha256: checksum });
        const headers = { "content-type": "application/json", "x-amc-notary-ts": String(timestamp),
          "x-amc-notary-auth": buildNotaryAuthSignature({ secret: AUTH, ts: timestamp, method: "POST", path: "/sign", bodyBytes: Buffer.from(body) }) };
        return fetch(`${baseUrl}/sign`, { method: "POST", body, headers });
      };
      const mismatch = await request(digestHex, Date.now());
      expect(mismatch.status).toBe(400);
      expect(await mismatch.json()).toEqual({ error: "payloadSha256 mismatch" });
      const timestamp = Date.now() - 1_000;
      const valid = await request(sha256Hex(digestBytes), timestamp);
      expect(valid.status).toBe(200);
      expect(verifyNotarySignResponse(await valid.json(), digestBytes).ok).toBe(true);
      const replay = await request(sha256Hex(digestBytes), timestamp);
      expect(replay.status).toBe(401);
      expect((await replay.json() as { reason: string }).reason).toBe("replay detected");
    } finally { await stopChild(child); }
  }, 30_000);

  it("wires an internal listener and readiness dependency in the TLS Compose stack", () => {
    const compose = YAML.parse(readFileSync(new URL("../deploy/compose/docker-compose.tls.yml", import.meta.url), "utf8"));
    const notary = compose.services["amc-notary"];
    expect(notary.command.slice(-2)).toEqual(["--bind", "0.0.0.0"]);
    expect(notary.ports).toBeUndefined();
    expect(notary.expose).toEqual(["4343"]);
    expect(notary.healthcheck.disable).not.toBe(true);
    expect(notary.healthcheck.test.slice(0, 3)).toEqual(["CMD", "node", "-e"]);
    expect(compose.services["amc-studio"].depends_on["amc-notary"]).toEqual({ condition: "service_healthy" });
  });
});
