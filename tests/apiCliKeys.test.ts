import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  apiKeyStorePath,
  createApiKeyForCli,
  listApiKeysForCli,
  parseApiKeyDuration,
  parseApiKeyScope,
  revokeApiKeyForCli
} from "../src/auth/apiKeyCli.js";
import { loadApiKeyManager } from "../src/auth/apiKeyCli.js";

const roots: string[] = [];

function tempWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-api-key-cli-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("api key CLI helpers", () => {
  test("creates and persists a hashed API key without listing the secret", () => {
    const workspace = tempWorkspace();
    const created = createApiKeyForCli({
      workspace,
      scope: "write",
      label: "mobile bridge",
      expiresIn: "1d",
      nowTs: 1_000
    });

    expect(created.apiKey).toMatch(/^amc_key_/);
    expect(created.record).toMatchObject({
      keyId: created.keyId,
      label: "mobile bridge",
      scope: "write",
      status: "active",
      expiresTs: 86_401_000
    });

    const rawStore = readFileSync(apiKeyStorePath(workspace), "utf8");
    expect(rawStore).not.toContain(created.apiKey);
    expect(rawStore).toContain("secretHash");

    const listed = listApiKeysForCli({ workspace });
    expect(listed.keys).toHaveLength(1);
    expect(JSON.stringify(listed.keys)).not.toContain(created.apiKey);

    const manager = loadApiKeyManager(workspace);
    expect(manager.authenticate({ apiKey: created.apiKey, requiredScope: "write", nowTs: 1_001 }).ok).toBe(true);
  });

  test("revokes a persisted API key", () => {
    const workspace = tempWorkspace();
    const created = createApiKeyForCli({
      workspace,
      scope: "read-only",
      label: "reader",
      nowTs: 10
    });

    const revoked = revokeApiKeyForCli({ workspace, keyId: created.keyId, nowTs: 20 });
    expect(revoked.record.status).toBe("revoked");
    expect(revoked.record.revokedTs).toBe(20);

    const manager = loadApiKeyManager(workspace);
    const auth = manager.authenticate({ apiKey: created.apiKey, requiredScope: "read-only", nowTs: 21 });
    expect(auth.ok).toBe(false);
    expect(auth.reason).toBe("revoked");
  });

  test("validates scopes and expiration durations", () => {
    expect(parseApiKeyScope("admin")).toBe("admin");
    expect(() => parseApiKeyScope("owner")).toThrow("Invalid API key scope");

    expect(parseApiKeyDuration("30m")).toBe(1_800_000);
    expect(parseApiKeyDuration("12h")).toBe(43_200_000);
    expect(parseApiKeyDuration("4w")).toBe(2_419_200_000);
    expect(parseApiKeyDuration("never")).toBeUndefined();
    expect(() => parseApiKeyDuration("soon")).toThrow("Invalid duration");
  });
});
