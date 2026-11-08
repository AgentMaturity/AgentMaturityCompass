/**
 * SH-PROVIDERS skeptic fix: the TypeScript SDK's prompt deadline (`timeoutMs`, default 120 s) is invisible to the `acp`
 * child, so the SDK bounds provider-requested waits itself: `--retry-max-provider-delay` is always forwarded, defaulting
 * to the local ceiling (`retryMaxDelayMs`, else 10 s) rather than the CLI's 60 s. A scripted ACP peer captures argv only.
 *
 * Mutation check: drop the `?? options.retryMaxDelayMs ?? 10_000` default → the first two rows fail.
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { AMCNativeClient } from "../src/sdk/nativeAgentClient.js";
import { initWorkspace } from "../src/workspace.js";

const PEER = String.raw`
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const capture = process.argv[2];
createInterface({ input: process.stdin }).on('line', line => {
  const frame = JSON.parse(line);
  writeFileSync(capture, JSON.stringify(process.argv.slice(3)));
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: {
    protocolVersion: 1, agentInfo: { name: 'agent-maturity-compass' },
    agentCapabilities: { _meta: { 'dev.agentmaturity.amc': { executionApi: 1 } } }
  } }) + '\n');
});
`;
const roots: string[] = [], clients: AMCNativeClient[] = [];
afterEach(async () => {
  try { for (const client of clients.splice(0)) await client.close(); }
  finally { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); }
});
const option = (argv: readonly string[], flag: string) => { const at = argv.indexOf(flag); return at < 0 ? undefined : argv[at + 1]; };

test.each([
  [{}, "10000", undefined],
  [{ retryMaxDelayMs: 20_000 }, "20000", "20000"],
  [{ retryMaxDelayMs: 20_000, retryMaxProviderDelayMs: 45_000 }, "45000", "20000"]
] as const)("the SDK forwards a provider-wait ceiling that fits its own deadline: %j", async (options, providerCeiling, localCeiling) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-sdk-retry-ceiling-"))); roots.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  const peer = join(root, "peer.mjs"), capture = join(root, "argv.json");
  writeFileSync(peer, PEER);
  const client = await AMCNativeClient.start({ workspace: root, provider: "stub", command: [process.execPath, peer, capture], timeoutMs: 5000, ...options });
  clients.push(client);
  const argv = JSON.parse(readFileSync(capture, "utf8")) as string[];
  expect(option(argv, "--retry-max-provider-delay")).toBe(providerCeiling);
  expect(option(argv, "--retry-max-delay")).toBe(localCeiling);
});
