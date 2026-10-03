// AMC-1519: the SDK's cold-verification admission guards. The scripted peer
// prints a chosen verifier receipt; it signs nothing and proves no ledger.
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { AMCNativeClient } from "../src/sdk/nativeAgentClient.js";

const PEER = String.raw`
import { appendFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const [receiptPath, logPath] = process.argv.slice(2);
const verify = process.argv.indexOf('verify');
if (process.argv.includes('agent-loop') && verify > 0) {
  appendFileSync(logPath, 'verifier\n');
  process.stdout.write(JSON.stringify({ ...JSON.parse(readFileSync(receiptPath, 'utf8')), sessionId: process.argv[verify + 1] }));
} else {
  const reply = (frame, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result }) + '\n');
  createInterface({ input: process.stdin }).on('line', line => {
    const frame = JSON.parse(line);
    if (frame.method === 'initialize') reply(frame, { protocolVersion: 1, agentInfo: { name: 'agent-maturity-compass' }, agentCapabilities: {} });
    else if (frame.method === 'session/new') reply(frame, { sessionId: 'verify-session' });
    else if (frame.id !== undefined) reply(frame, {});
  });
}
`;

type TrustRoot = { anchored: boolean; monitorFingerprint: string | null; expectedFingerprint: string | null };
const receipt = (trustRoot: TrustRoot) => ({ ok: true, ledgerOk: true, ledgerErrors: [], sessionChainErrors: [], unsignedRowIds: [],
  requests: [{ headerEventId: "header-1", status: "reconstructed" }], trustRoot });
const roots: string[] = [], clients: AMCNativeClient[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function start(trustRoot: TrustRoot) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-native-verify-"))); roots.push(root);
  const peer = join(root, "peer.mjs"), receiptPath = join(root, "receipt.json"), log = join(root, "invocations.log");
  writeFileSync(peer, PEER); writeFileSync(receiptPath, JSON.stringify(receipt(trustRoot))); writeFileSync(log, "");
  const client = await AMCNativeClient.start({ workspace: root, provider: "stub", command: [process.execPath, peer, receiptPath, log], timeoutMs: 10_000 });
  clients.push(client);
  const session = await client.newSession();
  return { client, sessionId: session.sessionId, verifierRuns: () => readFileSync(log, "utf8").split("\n").filter(Boolean).length };
}

describe("native SDK cold verification admission", () => {
  test("a live client never runs or promotes verification before close", async () => {
    const { client, sessionId, verifierRuns } = await start({ anchored: false, monitorFingerprint: null, expectedFingerprint: null });
    await expect(client.verifySession(sessionId)).rejects.toThrow("Close the native client before cold verification");
    expect(verifierRuns()).toBe(0);
    await client.close();
    await expect(client.verifySession(sessionId)).resolves.toMatchObject({ sessionId, state: "verified", scope: "workspace-key-consistency" });
    expect(verifierRuns()).toBe(1);
  });

  test("an anchored receipt with a matching expected fingerprint is externally anchored", async () => {
    const { client, sessionId } = await start({ anchored: true, monitorFingerprint: "f".repeat(64), expectedFingerprint: "f".repeat(64) });
    await client.close();
    await expect(client.verifySession(sessionId)).resolves.toMatchObject({ state: "verified", scope: "externally-anchored" });
  });

  test.each([
    ["a different", "e".repeat(64)],
    ["no", null]
  ])("an anchored receipt with %s expected fingerprint is refused", async (_kind, expectedFingerprint) => {
    const { client, sessionId } = await start({ anchored: true, monitorFingerprint: "f".repeat(64), expectedFingerprint });
    await client.close();
    await expect(client.verifySession(sessionId)).rejects.toThrow("native verifier returned an inconsistent trust anchor");
  });
});
