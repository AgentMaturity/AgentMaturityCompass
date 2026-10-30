/**
 * WP35c: a delegated Claude Code child's hook forwarder runs without the vault passphrase (WP36 keeps it out of foreign
 * CLI children), so it verifies the Bridge's signed decision with public material only: chain, writer signature, receipt
 * and seal. The decision row's payload blob is encrypted under a vault-held key; there it is listed as not evaluated,
 * never counted as verified, and a blob that does not open under a reachable key still fails.
 */
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "vitest";
import { verifyProviderHookControlResult } from "../src/bridge/hookControl.js";
import { openLedger, verifyEvidenceEventIntegrity } from "../src/ledger/ledger.js";
import { lockVault } from "../src/vault/vault.js";
import { agentId, claudeWorkspace, controlRequest, decide, recorded } from "./helpers/claudeCodeHookFixtures.js";
import { removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

const passphrase = () => process.env.AMC_VAULT_PASSPHRASE;
let saved: string | undefined;
afterEach(() => {
  if (saved !== undefined) process.env.AMC_VAULT_PASSPHRASE = saved;
  saved = undefined;
});
afterAll(() => removeFixtureWorkspaces());

/** A workspace holding one sealed allow decision for a Read, and the request and answer the forwarder would verify. */
function allowedRead(existing?: string, toolUseId = "toolu_vaultless") {
  const workspace = existing ?? claudeWorkspace();
  const payload = { ...recorded("PreToolUse-read", workspace), tool_input: { file_path: join(realpathSync(workspace), "workspace", "public.txt") },
    tool_use_id: toolUseId };
  const rawInput = controlRequest(payload);
  const result = decide(workspace, rawInput);
  expect(result.decision).toBe("allow");
  return { workspace, rawInput, result };
}

/** As in the delegated child: no passphrase in the environment, and no unlocked vault session in this process. */
function withoutVault(workspace: string): void {
  saved = passphrase();
  delete process.env.AMC_VAULT_PASSPHRASE;
  lockVault(workspace);
}

function integrity(workspace: string, eventId: string, blobKeyOptional?: boolean) {
  const ledger = openLedger(workspace);
  try {
    return verifyEvidenceEventIntegrity({ ledger, eventId, requireReceipt: true, requireSealedSession: true, ...(blobKeyOptional ? { blobKeyOptional } : {}) });
  } finally {
    ledger.close();
  }
}

function blobPath(workspace: string, eventId: string): string {
  const ledger = openLedger(workspace);
  try {
    const row = ledger.db.prepare("SELECT payload_path FROM evidence_events WHERE id = ?").get(eventId) as { payload_path: string | null };
    expect(row.payload_path, "the decision's payload is a blob").toBeTruthy();
    return join(workspace, row.payload_path!);
  } finally {
    ledger.close();
  }
}

describe("verifying a hook control decision without the vault", () => {
  test("the forwarder's check accepts the signed decision; its blob is not evaluated, not verified", () => {
    const { workspace, rawInput, result } = allowedRead();
    withoutVault(workspace);
    const verified = verifyProviderHookControlResult({ workspace, authenticatedAgentId: agentId, provider: "claude-code", rawInput, result });
    expect(verified).toEqual({ ok: true, error: null });
    const optional = integrity(workspace, result.eventId, true);
    expect(optional.ok).toBe(true);
    expect(optional.payloadsNotEvaluated).toEqual([`Event ${result.eventId} payload not evaluated: the blob key is unavailable here`]);
    // Every other reader still needs the key: without it the row fails, as before.
    expect(integrity(workspace, result.eventId).errors).toContain(`Event ${result.eventId} payload authentication failed`);
  });

  test("a blob that does not open under a reachable key fails, with or without the option", () => {
    const { workspace, result } = allowedRead();
    const path = blobPath(workspace, result.eventId);
    const bytes = readFileSync(path);
    bytes[bytes.length - 1] ^= 0xff;
    writeFileSync(path, bytes);
    expect(integrity(workspace, result.eventId, true).errors).toContain(`Event ${result.eventId} payload authentication failed`);
  });

  test("without the vault, a blob that is not the row's envelope still fails", () => {
    const { workspace, rawInput, result } = allowedRead();
    writeFileSync(blobPath(workspace, result.eventId), "not a blob envelope");
    withoutVault(workspace);
    // Not an envelope, so read as a plaintext blob: its bytes are not the row's payload.
    expect(integrity(workspace, result.eventId, true).errors).toContain(`Event ${result.eventId} payload hash mismatch`);
    expect(verifyProviderHookControlResult({ workspace, authenticatedAgentId: agentId, provider: "claude-code", rawInput, result }).ok).toBe(false);
  });

  test("without the vault, another row's sealed blob in this row's place still fails", () => {
    const { workspace, rawInput, result } = allowedRead();
    const other = allowedRead(workspace, "toolu_vaultless_other").result;
    writeFileSync(blobPath(workspace, result.eventId), readFileSync(blobPath(workspace, other.eventId)));
    withoutVault(workspace);
    expect(integrity(workspace, result.eventId, true).errors).toContain(`Event ${result.eventId} payload authentication failed`);
    expect(verifyProviderHookControlResult({ workspace, authenticatedAgentId: agentId, provider: "claude-code", rawInput, result }).ok).toBe(false);
  });
});
