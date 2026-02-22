import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  defaultSsoConfig,
  mapSsoGroupsToRole,
  normalizeEnterpriseRole,
  resolveSsoRole
} from "../src/auth/ssoConfig.js";
import { ApiKeyManager } from "../src/auth/apiKeyManager.js";
import {
  buildEnterpriseAuditPayload,
  exportEnterpriseAuditFromRecords,
  type EnterpriseAuditRecord
} from "../src/audit/enterpriseAuditExport.js";
import { createScimAdapter, handleScimRequest, InMemoryScimUserStore } from "../src/integrations/scimAdapter.js";
import {
  computeBackoffDelayMs,
  deliverTrackedWebhook,
  deliverWebhookWithRetry,
  signWebhookPayload,
  verifyWebhookSignature,
  WebhookDeliveryTracker
} from "../src/integrations/webhookDelivery.js";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("enterprise sso config", () => {
  test("normalizes known enterprise roles", () => {
    expect(normalizeEnterpriseRole("ADMIN")).toBe("admin");
    expect(normalizeEnterpriseRole("developer")).toBe("developer");
    expect(normalizeEnterpriseRole("unknown")).toBeNull();
  });

  test("maps SSO groups to highest role priority", () => {
    const config = defaultSsoConfig();
    const role = mapSsoGroupsToRole(["amc-viewers", "amc-auditors"], config.roleMapping);
    expect(role).toBe("auditor");
  });

  test("resolveSsoRole combines explicit and mapped roles", () => {
    const config = defaultSsoConfig();
    const role = resolveSsoRole({
      explicitRoles: ["viewer", "developer"],
      groups: ["amc-admins"],
      mapping: config.roleMapping
    });
    expect(role).toBe("admin");
  });
});

describe("scim adapter scaffold", () => {
  function newAdapter() {
    const sso = defaultSsoConfig();
    const store = new InMemoryScimUserStore();
    const adapter = createScimAdapter({
      bearerToken: "test-token",
      roleMapping: sso.roleMapping,
      userStore: store,
      now: () => new Date("2026-02-22T00:00:00.000Z")
    });
    return { adapter, store };
  }

  test("provisions a user via POST /scim/v2/Users", async () => {
    const { adapter } = newAdapter();
    const response = await adapter.handle({
      method: "POST",
      path: "/scim/v2/Users",
      headers: {
        authorization: "Bearer test-token"
      },
      body: {
        userName: "dev@example.com",
        displayName: "Developer User",
        groups: ["amc-developers"],
        emails: [{ value: "dev@example.com", primary: true }]
      }
    });

    expect(response.status).toBe(201);
    const body = response.body as {
      userName: string;
      roles: Array<{ value: string }>;
      groups: Array<{ value: string }>;
    };
    expect(body.userName).toBe("dev@example.com");
    expect(body.roles[0]?.value).toBe("developer");
    expect(body.groups[0]?.value).toBe("amc-developers");
  });

  test("rejects requests with invalid bearer token", async () => {
    const { adapter } = newAdapter();
    const response = await adapter.handle({
      method: "POST",
      path: "/scim/v2/Users",
      headers: {
        authorization: "Bearer wrong-token"
      },
      body: {
        userName: "a@example.com"
      }
    });
    expect(response.status).toBe(401);
  });

  test("rejects duplicate usernames", async () => {
    const { adapter } = newAdapter();
    const base = {
      method: "POST",
      path: "/scim/v2/Users",
      headers: {
        authorization: "Bearer test-token"
      },
      body: {
        userName: "dup@example.com"
      }
    } as const;
    const first = await adapter.handle(base);
    const second = await adapter.handle(base);
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  test("returns 405 for non-POST method", async () => {
    const { adapter } = newAdapter();
    const response = await adapter.handle({
      method: "GET",
      path: "/scim/v2/Users",
      headers: {
        authorization: "Bearer test-token"
      }
    });
    expect(response.status).toBe(405);
  });

  test("returns 404 for unknown scim path", async () => {
    const sso = defaultSsoConfig();
    const store = new InMemoryScimUserStore();
    const response = await handleScimRequest({
      request: {
        method: "POST",
        path: "/scim/v2/Groups",
        headers: { authorization: "Bearer test-token" },
        body: {}
      },
      options: {
        bearerToken: "test-token",
        roleMapping: sso.roleMapping,
        userStore: store
      }
    });
    expect(response.status).toBe(404);
  });
});

describe("enterprise audit export payloads", () => {
  const records: EnterpriseAuditRecord[] = [
    {
      eventId: "evt_1",
      ts: 1_700_000_000_000,
      timestamp: "2023-11-14T22:13:20.000Z",
      actor: "owner",
      action: "POLICY_APPLY",
      resource: "workspace:main",
      outcome: "success",
      sourceIp: "10.0.0.5",
      userAgent: "amc-cli",
      details: { control: "ACCESS_CONTROL.SSO_SCIM" }
    },
    {
      eventId: "evt_2",
      ts: 1_700_000_010_000,
      timestamp: "2023-11-14T22:13:30.000Z",
      actor: "auditor",
      action: "AUDIT_EXPORT",
      resource: "workspace:main",
      outcome: "failure",
      sourceIp: "10.0.0.8",
      userAgent: "amc-cli",
      details: { reason: "permission denied" }
    }
  ];

  test("builds Splunk HEC export payload", () => {
    const payload = buildEnterpriseAuditPayload("splunk", records) as Array<{ sourcetype: string; event: { action: string } }>;
    expect(payload).toHaveLength(2);
    expect(payload[0]?.sourcetype).toBe("amc:audit");
    expect(payload[1]?.event.action).toBe("AUDIT_EXPORT");
  });

  test("builds Datadog JSON export payload", () => {
    const payload = buildEnterpriseAuditPayload("datadog", records) as Array<{ status: string; message: string }>;
    expect(payload).toHaveLength(2);
    expect(payload[0]?.status).toBe("info");
    expect(payload[1]?.status).toBe("error");
    expect(payload[0]?.message).toContain("POLICY_APPLY");
  });

  test("builds CloudTrail JSON export payload", () => {
    const payload = buildEnterpriseAuditPayload("cloudtrail", records) as { Records: Array<{ eventSource: string }> };
    expect(payload.Records).toHaveLength(2);
    expect(payload.Records[0]?.eventSource).toBe("amc.enterprise.audit");
  });

  test("builds Azure Monitor JSON export payload", () => {
    const payload = buildEnterpriseAuditPayload("azure", records) as Array<{ Category: string; ResultType: string }>;
    expect(payload).toHaveLength(2);
    expect(payload[0]?.Category).toBe("AMC.Audit");
    expect(payload[1]?.ResultType).toBe("Failure");
  });

  test("writes exported payload to output path", () => {
    const root = mkdtempSync(join(tmpdir(), "amc-audit-export-"));
    roots.push(root);
    const output = join(root, "audit.json");
    const out = exportEnterpriseAuditFromRecords({
      records,
      format: "cloudtrail",
      output
    });

    expect(out.eventCount).toBe(2);
    expect(out.outputPath).toBe(output);
    const parsed = JSON.parse(readFileSync(output, "utf8")) as { Records: unknown[] };
    expect(parsed.Records).toHaveLength(2);
  });
});

describe("webhook delivery with retry and receipts", () => {
  test("computes deterministic exponential backoff when jitter is disabled", () => {
    expect(
      computeBackoffDelayMs({
        attempt: 1,
        initialBackoffMs: 100,
        maxBackoffMs: 10_000,
        jitterFactor: 0
      })
    ).toBe(100);
    expect(
      computeBackoffDelayMs({
        attempt: 2,
        initialBackoffMs: 100,
        maxBackoffMs: 10_000,
        jitterFactor: 0
      })
    ).toBe(200);
  });

  test("signs and verifies webhook signature", () => {
    const signature = signWebhookPayload({
      secret: "signing-secret",
      payload: "{\"ok\":true}",
      timestamp: 12345
    });
    expect(
      verifyWebhookSignature({
        secret: "signing-secret",
        payload: "{\"ok\":true}",
        timestamp: 12345,
        signature
      })
    ).toBe(true);
    expect(
      verifyWebhookSignature({
        secret: "wrong-secret",
        payload: "{\"ok\":true}",
        timestamp: 12345,
        signature
      })
    ).toBe(false);
  });

  test("delivers successfully on first attempt", async () => {
    const attempts: number[] = [];
    const receipt = await deliverWebhookWithRetry({
      request: {
        url: "https://hooks.example.com/audit",
        eventType: "AUDIT_EVENT",
        payload: { id: "evt_1" },
        secret: "s3cr3t"
      },
      policy: {
        maxAttempts: 3,
        jitterFactor: 0
      },
      dependencies: {
        client: {
          async post() {
            attempts.push(1);
            return { status: 200, body: "ok" };
          }
        },
        sleep: async () => {},
        now: (() => {
          let t = 100;
          return () => {
            t += 1;
            return t;
          };
        })()
      }
    });

    expect(receipt.delivered).toBe(true);
    expect(receipt.attempts).toHaveLength(1);
    expect(attempts).toHaveLength(1);
  });

  test("retries with exponential backoff and tracks attempts", async () => {
    const sleeps: number[] = [];
    let callCount = 0;
    const receipt = await deliverWebhookWithRetry({
      request: {
        url: "https://hooks.example.com/retry",
        eventType: "INCIDENT",
        payload: { id: "inc_1" },
        secret: "retry-secret"
      },
      policy: {
        maxAttempts: 4,
        initialBackoffMs: 10,
        maxBackoffMs: 100,
        jitterFactor: 0
      },
      dependencies: {
        client: {
          async post() {
            callCount += 1;
            if (callCount < 3) {
              return { status: 500, body: "fail" };
            }
            return { status: 202, body: "accepted" };
          }
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        now: (() => {
          let t = 1_000;
          return () => {
            t += 10;
            return t;
          };
        })()
      }
    });

    expect(receipt.delivered).toBe(true);
    expect(receipt.attempts).toHaveLength(3);
    expect(sleeps).toEqual([10, 20]);
  });

  test("returns failed receipt after max attempts", async () => {
    const tracker = new WebhookDeliveryTracker();
    const receipt = await deliverTrackedWebhook({
      tracker,
      request: {
        url: "https://hooks.example.com/fail",
        eventType: "FAILED_EVENT",
        payload: { id: "evt_fail" },
        secret: "x"
      },
      policy: {
        maxAttempts: 2,
        initialBackoffMs: 1,
        jitterFactor: 0
      },
      dependencies: {
        client: {
          async post() {
            throw new Error("network down");
          }
        },
        sleep: async () => {},
        now: (() => {
          let t = 2_000;
          return () => {
            t += 1;
            return t;
          };
        })()
      }
    });

    expect(receipt.delivered).toBe(false);
    expect(receipt.attempts).toHaveLength(2);
    expect(tracker.get(receipt.deliveryId)?.delivered).toBe(false);
  });
});

describe("api key management", () => {
  test("creates and authenticates a scoped api key", () => {
    const manager = new ApiKeyManager();
    const issued = manager.createKey({
      scope: "read-only",
      label: "reader",
      nowTs: 10_000
    });

    const auth = manager.authenticate({
      apiKey: issued.apiKey,
      requiredScope: "read-only",
      nowTs: 10_001
    });
    expect(auth.ok).toBe(true);
    expect(auth.scope).toBe("read-only");
  });

  test("enforces required scope for api key", () => {
    const manager = new ApiKeyManager();
    const issued = manager.createKey({
      scope: "read-only",
      nowTs: 1
    });
    const auth = manager.authenticate({
      apiKey: issued.apiKey,
      requiredScope: "write",
      nowTs: 2
    });
    expect(auth.ok).toBe(false);
    expect(auth.reason).toBe("insufficient_scope");
  });

  test("supports rotation with grace period", () => {
    const manager = new ApiKeyManager();
    const initial = manager.createKey({
      scope: "write",
      nowTs: 100
    });
    const rotated = manager.rotateKey({
      keyId: initial.keyId,
      gracePeriodMs: 1_000,
      nowTs: 200
    });

    expect(
      manager.authenticate({
        apiKey: initial.apiKey,
        requiredScope: "read-only",
        nowTs: 1_100
      }).ok
    ).toBe(true);
    expect(
      manager.authenticate({
        apiKey: initial.apiKey,
        requiredScope: "read-only",
        nowTs: 1_201
      }).reason
    ).toBe("rotation_grace_expired");
    expect(
      manager.authenticate({
        apiKey: rotated.newApiKey,
        requiredScope: "write",
        nowTs: 1_201
      }).ok
    ).toBe(true);
  });

  test("tracks usage per key", () => {
    const manager = new ApiKeyManager();
    const issued = manager.createKey({
      scope: "admin",
      nowTs: 1_000
    });

    manager.recordUsage({
      keyId: issued.keyId,
      endpoint: "/v1/audit",
      method: "get",
      statusCode: 200,
      ts: 1_010
    });
    manager.recordUsage({
      keyId: issued.keyId,
      endpoint: "/v1/audit",
      method: "get",
      statusCode: 500,
      ts: 1_020
    });
    const summary = manager.getUsageSummary(issued.keyId);
    expect(summary.totalRequests).toBe(2);
    expect(summary.byEndpoint["GET /v1/audit"]).toBe(2);
    expect(summary.byStatusCode["500"]).toBe(1);
  });

  test("revokes key and denies future auth", () => {
    const manager = new ApiKeyManager();
    const issued = manager.createKey({
      scope: "admin",
      nowTs: 100
    });
    manager.revokeKey({
      keyId: issued.keyId,
      nowTs: 200
    });
    const auth = manager.authenticate({
      apiKey: issued.apiKey,
      nowTs: 201
    });
    expect(auth.ok).toBe(false);
    expect(auth.reason).toBe("revoked");
  });
});
