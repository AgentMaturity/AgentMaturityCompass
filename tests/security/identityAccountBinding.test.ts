import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import {
  createHostUser,
  findHostUserById,
  initHostDb,
  openHostDb,
  upsertIdentityUser,
} from "../../src/workspaces/hostDb.js";

const roots: string[] = [];

function hostDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-identity-binding-"));
  roots.push(dir);
  initHostDb(dir);
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("federated identity account binding", () => {
  test("does not merge an OIDC login into a local administrator by email", () => {
    const root = hostDir();
    const local = createHostUser({
      hostDir: root,
      username: "admin@example.com",
      password: "local-admin-password",
      isHostAdmin: true,
    });

    expect(() =>
      upsertIdentityUser({
        hostDir: root,
        username: "admin@example.com",
        email: "admin@example.com",
        authType: "OIDC",
        providerId: "customer-idp",
        subject: "attacker-subject",
        isHostAdmin: false,
      }),
    ).toThrow(/identity|username|collision|already/i);

    expect(findHostUserById(root, local.userId)).toMatchObject({
      userId: local.userId,
      username: "admin@example.com",
      isHostAdmin: true,
      disabled: false,
    });
    const handle = openHostDb(root);
    try {
      const row = handle.db
        .prepare("SELECT auth_type AS authType, provider_id AS providerId, subject FROM users WHERE user_id = ?")
        .get(local.userId) as { authType: string; providerId: string | null; subject: string | null };
      expect(row).toEqual({ authType: "LOCAL", providerId: null, subject: null });
    } finally {
      handle.close();
    }
  });

  test("keys federated users by provider and subject, not mutable email", () => {
    const root = hostDir();
    const created = upsertIdentityUser({
      hostDir: root,
      username: "old@example.com",
      email: "old@example.com",
      authType: "OIDC",
      providerId: "workforce",
      subject: "stable-subject",
      isHostAdmin: true,
    });

    const updated = upsertIdentityUser({
      hostDir: root,
      username: "new@example.com",
      email: "new@example.com",
      authType: "OIDC",
      providerId: "workforce",
      subject: "stable-subject",
      isHostAdmin: false,
    });

    expect(updated.userId).toBe(created.userId);
    expect(updated.username).toBe("new@example.com");
    expect(updated.isHostAdmin).toBe(false);
    expect(findHostUserById(root, created.userId)).toMatchObject({
      username: "new@example.com",
      email: "new@example.com",
      isHostAdmin: false,
    });
  });

  test("rejects cross-provider email collision and incomplete federated identities", () => {
    const root = hostDir();
    upsertIdentityUser({
      hostDir: root,
      username: "person@example.com",
      email: "person@example.com",
      authType: "SAML",
      providerId: "provider-a",
      subject: "subject-a",
    });

    expect(() =>
      upsertIdentityUser({
        hostDir: root,
        username: "person@example.com",
        email: "person@example.com",
        authType: "OIDC",
        providerId: "provider-b",
        subject: "subject-b",
      }),
    ).toThrow(/identity|username|collision|already/i);

    expect(() =>
      upsertIdentityUser({
        hostDir: root,
        username: "missing-subject@example.com",
        email: "missing-subject@example.com",
        authType: "OIDC",
        providerId: "provider-a",
      }),
    ).toThrow(/provider|subject/i);
  });

  test("does not convert an existing SAML binding into OIDC when provider and subject collide", () => {
    const root = hostDir();
    const saml = upsertIdentityUser({
      hostDir: root,
      username: "saml@example.com",
      email: "saml@example.com",
      authType: "SAML",
      providerId: "shared-provider-name",
      subject: "same-subject",
    });

    expect(() =>
      upsertIdentityUser({
        hostDir: root,
        username: "saml@example.com",
        email: "saml@example.com",
        authType: "OIDC",
        providerId: "shared-provider-name",
        subject: "same-subject",
      }),
    ).toThrow(/auth|binding|mismatch|identity/i);

    const handle = openHostDb(root);
    try {
      const row = handle.db
        .prepare("SELECT auth_type AS authType FROM users WHERE user_id = ?")
        .get(saml.userId) as { authType: string };
      expect(row.authType).toBe("SAML");
    } finally {
      handle.close();
    }
  });
});
