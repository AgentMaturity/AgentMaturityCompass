/** Real internally prepared receipt owner fixtures. This is not normal CLI binding. */
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { vi } from "vitest";
import { initWorkspace, signAmcConfig } from "../../src/workspace.js";
import { lockVault } from "../../src/vault/vault.js";
import { getSigningKey } from "../../src/keys/signingKeys.js";
import { prepareReceiptAuthorityOwner } from "../../src/keys/receiptAuthorityOwner.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { initBlobKey } from "../../src/storage/blobs/blobKeys.js";
import { openLedger, type Ledger } from "../../src/ledger/ledger.js";
import { withPins } from "../../src/trust/trustContext.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { workspaceKeyTrust } from "./trustContext.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "../keys/providerFakes.js";
export const RECEIPT_OWNER_PASS = "owned-receipt-child-passphrase";
const roots: Array<{ root: string; workspace: string }> = [];
export function cleanupReceiptAuthorityFixtures(): void {
  for (const f of roots.splice(0)) { closeSqlitePool(`ledger:${resolve(f.workspace)}:${join(f.workspace, ".amc/evidence.sqlite")}`); lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
}
export function makeReceiptAuthorityFixture(configured = true) {
  const root = mkdtempSync(join(tmpdir(), "amc-receipt-authority-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", RECEIPT_OWNER_PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); initBlobKey(workspace);
  const legacyPrivate = getSigningKey(workspace, "receipt"), a = fakeKey("p256"), b = fakeKey("ed25519"), id = AWS_ARN(randomUUID()), nextId = AWS_ARN(randomUUID());
  const fake = awsFake({ [id]: a, [nextId]: b }), provider = awsKmsProvider(fake.call);
  const trust = withPins(workspaceKeyTrust(workspace), [a, b].map(key => ({ keyId: signingKeyId(publicPem(key))!, purposes: ["receipt"] as const, origin: "independent fixture operator before operation certificate" })));
  const configure = (selected: string) => {
    const path = join(workspace, ".amc/amc.config.yaml"), config = YAML.parse(readFileSync(path, "utf8")) as { keys?: { refs?: Record<string, unknown> } };
    config.keys = { ...config.keys, refs: { ...config.keys?.refs, receipt: { provider: "aws-kms", id: selected } } }; writeFileSync(path, YAML.stringify(config)); signAmcConfig(workspace);
  };
  if (configured) configure(id);
  const target = (rel: string) => join(workspace, rel), read = (rel: string) => readFileSync(target(rel));
  const state = () => [".amc/keys/keyset.json", ".amc/keys/receipt-authorities/current.json", ".amc/keys/receipt-child.amcvault", ".amc/keys/receipt-provider.pub", ".amc/keys/receipt_history.json", ".amc/transparency/log.jsonl"]
    .map(rel => existsSync(target(rel)) ? sha256Hex(read(rel)) : null);
  const own = (opts: Parameters<typeof prepareReceiptAuthorityOwner>[1] = {}) => prepareReceiptAuthorityOwner(workspace, { passphrase: RECEIPT_OWNER_PASS, provider, ...opts });
  const withLedger = <T>(fn: (ledger: Ledger) => T): T => { const ledger = openLedger(workspace); try { return fn(ledger); } finally { ledger.close(); } };
  const evidence = (options: { ts?: number; text?: string } = {}) => withLedger(ledger => {
    const sessionId = `receipt-${randomUUID()}`, text = options.text ?? "owned receipt payload";
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "owned-receipt", binarySha256: sha256Hex("owned-receipt") });
    const out = ledger.appendEvidenceWithReceipt({ sessionId, ts: options.ts, runtime: "unknown", eventType: "audit", inline: true, payload: text,
      meta: { trustTier: "OBSERVED" }, receipt: { kind: "guard_check", agentId: "default", providerId: "owned", model: null, bodySha256: sha256Hex(text) } });
    ledger.sealSession(sessionId); return out;
  });
  const outcome = () => withLedger(ledger => ledger.appendOutcomeEvent({ agentId: "default", category: "Functional", metricId: "owned", value: 1, trustTier: "SELF_REPORTED", source: "manual" }));
  return { root, workspace, a, b, id, nextId, provider, fake, trust: () => ({ ...trust, asOf: new Date(Date.now()) }), configure, target, read, state, own, withLedger, evidence, outcome, legacyPrivate };
}
