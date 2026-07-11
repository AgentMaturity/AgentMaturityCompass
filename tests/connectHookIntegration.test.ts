import { createServer } from "node:http";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";
import { observedAepActionEventSchema } from "../src/bridge/hookIngress.js";
import {
  CLAUDE_CODE_HOOK_SOURCE,
  GEMINI_CLI_HOOK_SOURCE,
  HookIntegrationError,
  forwardProviderHookEvent,
  getHookIntegrationStatus,
  installHookIntegration,
  mapProviderHookEvent,
  removeHookIntegration
} from "../src/adapters/hookIntegration.js";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { openLedger } from "../src/ledger/ledger.js";
import { leasePayloadSchema } from "../src/leases/leaseSchema.js";
import { loadLeaseRevocations } from "../src/leases/leaseStore.js";
import { verifyLeaseToken } from "../src/leases/leaseVerifier.js";
import { verifyReceipt } from "../src/receipts/receipt.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];

function newWorkspace(prefix = "amc-connect-hooks-"): string {
  const workspace = mkdtempSync(join(tmpdir(), prefix));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function hookPaths(workspace: string, provider: "claude-code" | "gemini-cli"): {
  config: string;
  ignore: string;
  token: string;
  manifest: string;
  signature: string;
} {
  const config = provider === "claude-code"
    ? join(workspace, ".claude", "settings.local.json")
    : join(workspace, ".gemini", "settings.json");
  const manifest = join(workspace, ".amc", "hooks", `${provider}.json`);
  return {
    config,
    ignore: join(workspace, ".gitignore"),
    token: join(workspace, ".amc", "hooks", `${provider}.lease`),
    manifest,
    signature: `${manifest}.sig`
  };
}

function decodeLease(token: string): ReturnType<typeof leasePayloadSchema.parse> {
  const payloadPart = token.split(".")[0];
  if (!payloadPart) throw new Error("missing lease payload");
  const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${normalized}${"=".repeat((4 - normalized.length % 4) % 4)}`;
  return leasePayloadSchema.parse(JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as unknown);
}

async function listen(
  handler: Parameters<typeof createServer>[0]
): Promise<{ base: string; close: () => Promise<void> }> {
  const server = createServer(handler);
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolvePromise, rejectPromise) => {
      server.close((error) => error ? rejectPromise(error) : resolvePromise());
    })
  };
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!address || typeof address === "string") throw new Error("server did not bind");
  return address.port;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("AMC provider hook integration", () => {
  test("dry-run is pure and lists every exact file without minting a lease", () => {
    const workspace = newWorkspace();
    const paths = hookPaths(workspace, "claude-code");

    const result = installHookIntegration({
      workspace,
      provider: "claude-code",
      agentId: "research-agent",
      dryRun: true
    });

    expect(result.dryRun).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.files.map((row) => row.path)).toEqual([
      paths.config,
      paths.ignore,
      paths.token,
      paths.manifest,
      paths.signature
    ]);
    expect(result.files.every((row) => row.action === "would-create")).toBe(true);
    expect(existsSync(paths.config)).toBe(false);
    expect(existsSync(paths.ignore)).toBe(false);
    expect(existsSync(paths.token)).toBe(false);
    expect(existsSync(paths.manifest)).toBe(false);
    expect(existsSync(paths.signature)).toBe(false);
  });

  test("installs Claude Code observation hooks without replacing unrelated settings", () => {
    const workspace = newWorkspace();
    const paths = hookPaths(workspace, "claude-code");
    writeJson(paths.config, {
      env: { KEEP_ME: "yes" },
      hooks: {
        PostToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "npm test" }] }]
      }
    });

    const installed = installHookIntegration({
      workspace,
      provider: "claude-code",
      agentId: "research-agent",
      bridgeBase: "http://127.0.0.1:4321",
      ttl: "7d"
    });

    expect(installed.applied).toBe(true);
    expect(installed.source).toEqual(CLAUDE_CODE_HOOK_SOURCE);
    const configText = readFileSync(paths.config, "utf8");
    const config = readJson(paths.config) as {
      env: Record<string, string>;
      hooks: Record<string, Array<{ matcher: string; hooks: Array<Record<string, unknown>> }>>;
    };
    expect(config.env.KEEP_ME).toBe("yes");
    expect(config.hooks.PostToolUse).toHaveLength(1);
    expect(config.hooks.PreToolUse).toHaveLength(1);
    const handler = config.hooks.PreToolUse[0]!.hooks[0]!;
    expect(handler.command).toBe("amc");
    expect(handler.args).toEqual(expect.arrayContaining([
      "connect",
      "hooks",
      "forward",
      "--provider",
      "claude-code",
      "--agent",
      "research-agent"
    ]));
    expect(configText).not.toContain(readFileSync(paths.token, "utf8").trim());
    expect(readFileSync(paths.ignore, "utf8")).toContain(".amc/hooks/");
    expect(statSync(paths.token).mode & 0o077).toBe(0);
    expect(existsSync(paths.manifest)).toBe(true);
    expect(existsSync(paths.signature)).toBe(true);

    const lease = readFileSync(paths.token, "utf8").trim();
    const verified = verifyLeaseToken({
      workspace,
      token: lease,
      expectedAgentId: "research-agent",
      requiredScope: "hook:observe",
      routePath: "/hooks/aep/0.1/events",
      revokedLeaseIds: new Set()
    });
    expect(verified.ok).toBe(true);
    expect(verified.payload?.scopes).toEqual(["hook:observe"]);
    expect(verified.payload?.routeAllowlist).toEqual(["/hooks"]);

    const status = getHookIntegrationStatus({ workspace, provider: "claude-code" });
    expect(status.state).toBe("installed");
    expect(status.configOwned).toBe(true);
    expect(status.leaseValid).toBe(true);
    expect(status.manifestValid).toBe(true);
    expect(status.issues).toEqual([]);
  });

  test("reinstall is byte-idempotent and does not rotate a valid lease", () => {
    const workspace = newWorkspace();
    const paths = hookPaths(workspace, "claude-code");
    const options = {
      workspace,
      provider: "claude-code" as const,
      agentId: "idempotent-agent",
      bridgeBase: "http://localhost:3212"
    };
    installHookIntegration(options);
    const before = Object.fromEntries(
      Object.entries(paths).map(([key, path]) => [key, readFileSync(path)])
    );

    const second = installHookIntegration(options);

    expect(second.applied).toBe(false);
    expect(second.changed).toBe(false);
    for (const [key, path] of Object.entries(paths)) {
      expect(readFileSync(path)).toEqual(before[key]);
    }
    const config = readJson(paths.config) as {
      hooks: { PreToolUse: Array<{ hooks: Array<Record<string, unknown>> }> };
    };
    const owned = config.hooks.PreToolUse.flatMap((group) => group.hooks)
      .filter((handler) => handler.command === "amc");
    expect(owned).toHaveLength(1);
  });

  test("installs and removes Gemini CLI hooks while preserving user config", () => {
    const workspace = newWorkspace();
    const paths = hookPaths(workspace, "gemini-cli");
    writeJson(paths.config, {
      theme: "ANSI",
      hooks: {
        AfterTool: [{ matcher: "write_file", hooks: [{ name: "user-hook", type: "command", command: "npm test" }] }]
      }
    });

    const installed = installHookIntegration({
      workspace,
      provider: "gemini-cli",
      agentId: "gemini-agent"
    });

    expect(installed.source).toEqual(GEMINI_CLI_HOOK_SOURCE);
    const config = readJson(paths.config) as {
      theme: string;
      hooks: Record<string, Array<{ matcher: string; hooks: Array<Record<string, unknown>> }>>;
    };
    expect(config.theme).toBe("ANSI");
    expect(config.hooks.AfterTool).toHaveLength(1);
    const handler = config.hooks.BeforeTool[0]!.hooks[0]!;
    expect(handler.name).toBe("amc-observe-v1");
    expect(handler.command).toContain("amc connect hooks forward");
    expect(handler.command).not.toContain(readFileSync(paths.token, "utf8").trim());

    const removed = removeHookIntegration({ workspace, provider: "gemini-cli" });
    expect(removed.applied).toBe(true);
    const after = readJson(paths.config) as {
      theme: string;
      hooks: Record<string, unknown[]>;
    };
    expect(after.theme).toBe("ANSI");
    expect(after.hooks.AfterTool).toHaveLength(1);
    expect(after.hooks.BeforeTool).toBeUndefined();
    expect(existsSync(paths.token)).toBe(false);
    expect(existsSync(paths.manifest)).toBe(false);
    expect(existsSync(paths.signature)).toBe(false);
    expect(existsSync(paths.ignore)).toBe(false);
    expect(getHookIntegrationStatus({ workspace, provider: "gemini-cli" }).state).toBe("not-installed");
  });

  test("preserves unrelated CRLF gitignore rules across install and removal", () => {
    const workspace = newWorkspace();
    const paths = hookPaths(workspace, "claude-code");
    const original = "node_modules/\r\n.env\r\n";
    writeFileSync(paths.ignore, original, "utf8");

    installHookIntegration({ workspace, provider: "claude-code", agentId: "ignore-preserve-agent" });
    const installed = readFileSync(paths.ignore, "utf8");
    expect(installed).toContain("node_modules/\r\n.env\r\n");
    expect(installed).toContain("# AMC managed hook credentials\r\n.amc/hooks/\r\n");

    removeHookIntegration({ workspace, provider: "claude-code" });
    expect(readFileSync(paths.ignore, "utf8")).toBe(original);
  });

  test("removal preserves post-install user changes and revokes the dedicated lease", () => {
    const workspace = newWorkspace();
    const paths = hookPaths(workspace, "claude-code");
    installHookIntegration({ workspace, provider: "claude-code", agentId: "remove-agent" });
    const payload = decodeLease(readFileSync(paths.token, "utf8").trim());
    const config = readJson(paths.config);
    config.permissions = { deny: ["Bash(rm -rf *)"] };
    writeJson(paths.config, config);

    removeHookIntegration({ workspace, provider: "claude-code" });

    const after = readJson(paths.config) as {
      permissions: { deny: string[] };
      hooks?: Record<string, unknown>;
    };
    expect(after.permissions.deny).toEqual(["Bash(rm -rf *)"]);
    expect(after.hooks?.PreToolUse).toBeUndefined();
    expect(loadLeaseRevocations(workspace).revocations).toContainEqual(expect.objectContaining({
      leaseId: payload.leaseId,
      reason: "AMC provider hook integration removed"
    }));
  });

  test("detects owned-handler drift and refuses destructive removal", () => {
    const workspace = newWorkspace();
    const paths = hookPaths(workspace, "claude-code");
    installHookIntegration({ workspace, provider: "claude-code", agentId: "drift-agent" });
    const config = readJson(paths.config) as {
      hooks: { PreToolUse: Array<{ hooks: Array<Record<string, unknown>> }> };
    };
    const handler = config.hooks.PreToolUse[0]!.hooks[0]!;
    handler.args = [...(handler.args as string[]), "--unexpected"];
    writeJson(paths.config, config);

    const status = getHookIntegrationStatus({ workspace, provider: "claude-code" });
    expect(status.state).toBe("drifted");
    expect(status.issues).toContain("managed hook handler differs from the signed installation manifest");
    expect(() => removeHookIntegration({ workspace, provider: "claude-code" })).toThrowError(
      expect.objectContaining<Partial<HookIntegrationError>>({ code: "HOOK_OWNERSHIP_CONFLICT" })
    );
    expect(existsSync(paths.token)).toBe(true);
    expect(existsSync(paths.manifest)).toBe(true);
  });

  test("fails closed when the installation manifest signature is tampered", () => {
    const workspace = newWorkspace();
    const paths = hookPaths(workspace, "gemini-cli");
    installHookIntegration({ workspace, provider: "gemini-cli", agentId: "signed-agent" });
    const manifest = readJson(paths.manifest);
    manifest.agentId = "attacker";
    writeJson(paths.manifest, manifest);

    const status = getHookIntegrationStatus({ workspace, provider: "gemini-cli" });
    expect(status.state).toBe("invalid");
    expect(status.manifestValid).toBe(false);
    expect(() => removeHookIntegration({ workspace, provider: "gemini-cli" })).toThrowError(
      expect.objectContaining<Partial<HookIntegrationError>>({ code: "HOOK_MANIFEST_INVALID" })
    );
  });

  test("rejects duplicate JSON keys before changing config or issuing a token", () => {
    const workspace = newWorkspace();
    const paths = hookPaths(workspace, "gemini-cli");
    mkdirSync(dirname(paths.config), { recursive: true });
    writeFileSync(paths.config, '{"hooks":{},"hooks":{}}\n', "utf8");

    expect(() => installHookIntegration({
      workspace,
      provider: "gemini-cli",
      agentId: "ambiguous-agent"
    })).toThrowError(expect.objectContaining<Partial<HookIntegrationError>>({ code: "HOOK_CONFIG_AMBIGUOUS" }));
    expect(existsSync(paths.token)).toBe(false);
    expect(existsSync(paths.manifest)).toBe(false);
    expect(readFileSync(paths.config, "utf8")).toBe('{"hooks":{},"hooks":{}}\n');
  });

  test("rejects symlinked provider config directories that escape the workspace", () => {
    const workspace = newWorkspace();
    const outside = mkdtempSync(join(tmpdir(), "amc-hooks-outside-"));
    roots.push(outside);
    symlinkSync(outside, join(workspace, ".claude"));

    expect(() => installHookIntegration({
      workspace,
      provider: "claude-code",
      agentId: "symlink-agent"
    })).toThrowError(expect.objectContaining<Partial<HookIntegrationError>>({ code: "HOOK_PATH_UNSAFE" }));
    expect(existsSync(join(outside, "settings.local.json"))).toBe(false);
  });

  test("recovers a stale installer lock but serializes a current writer", () => {
    const workspace = newWorkspace();
    const lock = join(workspace, ".amc", "hooks", "claude-code.lock");
    mkdirSync(dirname(lock), { recursive: true });
    writeFileSync(lock, '{"pid":999999,"createdTs":1}\n', { encoding: "utf8", mode: 0o600 });
    const stale = new Date(Date.now() - 10 * 60_000);
    utimesSync(lock, stale, stale);

    expect(() => installHookIntegration({
      workspace,
      provider: "claude-code",
      agentId: "stale-lock-agent"
    })).not.toThrow();
    expect(existsSync(lock)).toBe(false);

    writeFileSync(lock, `${JSON.stringify({ pid: process.pid, createdTs: Date.now() })}\n`, { encoding: "utf8", mode: 0o600 });
    expect(() => installHookIntegration({
      workspace,
      provider: "claude-code",
      agentId: "stale-lock-agent"
    })).toThrowError(expect.objectContaining<Partial<HookIntegrationError>>({ code: "HOOK_INSTALL_BUSY" }));
  });

  test("rejects unsupported providers and remote plaintext HTTP", () => {
    const workspace = newWorkspace();
    expect(() => installHookIntegration({
      workspace,
      provider: "codex" as "claude-code",
      agentId: "unsupported-agent"
    })).toThrowError(expect.objectContaining<Partial<HookIntegrationError>>({ code: "HOOK_PROVIDER_UNSUPPORTED" }));
    expect(() => installHookIntegration({
      workspace,
      provider: "claude-code",
      agentId: "secure-agent",
      bridgeBase: "http://example.com:3212"
    })).toThrowError(expect.objectContaining<Partial<HookIntegrationError>>({ code: "HOOK_BRIDGE_INSECURE" }));
    expect(() => installHookIntegration({
      workspace,
      provider: "claude-code",
      agentId: "secure-agent",
      bridgeBase: "https://bridge.example.com",
      dryRun: true
    })).not.toThrow();
  });

  test("maps Claude Code input to a strict privacy-minimal observed event", () => {
    const rawInput = JSON.stringify({
      session_id: "session-private-123",
      transcript_path: "/private/transcript.jsonl",
      cwd: "/private/customer/repository",
      permission_mode: "default",
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_use_id: "toolu_01ABC123",
      tool_input: {
        command: "deploy --token sk-secret-value",
        api_key: "sk-secret-value"
      }
    });

    const event = mapProviderHookEvent({
      provider: "claude-code",
      agentId: "mapped-agent",
      rawInput,
      observedAt: Date.parse("2026-07-10T18:00:00.000Z")
    });

    expect(() => observedAepActionEventSchema.parse(event)).not.toThrow();
    expect(event.type).toBe("action.requested");
    expect(event.hook).toBe("PreToolUse");
    expect(event.agent).toEqual(expect.objectContaining({ slug: "mapped-agent", surface: "claude-code" }));
    expect(event.session?.id).not.toBe("session-private-123");
    expect(event.action.id).toBe("toolu_01ABC123");
    expect(event.tool).toEqual(expect.objectContaining({ type: "native", name: "Bash" }));
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("sk-secret-value");
    expect(serialized).not.toContain("/private/customer/repository");
    expect(serialized).not.toContain("/private/transcript.jsonl");
    expect(serialized).not.toContain("session-private-123");
    expect(serialized).not.toContain("deploy");
  });

  test("maps Gemini CLI input without pretending it has a provider call ID", () => {
    const event = mapProviderHookEvent({
      provider: "gemini-cli",
      agentId: "gemini-mapped-agent",
      observedAt: Date.parse("2026-07-10T18:00:00.000Z"),
      rawInput: JSON.stringify({
        session_id: "gemini-session",
        transcript_path: "/private/gemini.jsonl",
        cwd: "/private/project",
        hook_event_name: "BeforeTool",
        timestamp: "2026-07-10T18:00:00.000Z",
        tool_name: "write_file",
        tool_input: { file_path: "/private/.env", content: "SECRET=hidden" }
      })
    });

    expect(() => observedAepActionEventSchema.parse(event)).not.toThrow();
    expect(event.hook).toBe("BeforeTool");
    expect(event.action.id).toMatch(/^action_[a-f0-9]{32}$/);
    expect(event.tool?.name).toBe("write_file");
    expect(JSON.stringify(event)).not.toContain("SECRET=hidden");
    expect(JSON.stringify(event)).not.toContain("/private/.env");
  });

  test("delivers an installed hook through the real Bridge into a verifiable ledger receipt", async () => {
    const workspace = newWorkspace();
    const paths = hookPaths(workspace, "claude-code");
    const port = await freePort();
    const bridgeBase = `http://127.0.0.1:${port}`;
    const bridge = await startBridgeServer({
      workspace,
      host: "127.0.0.1",
      port,
      gatewayBaseUrl: "http://127.0.0.1:1"
    });
    try {
      installHookIntegration({
        workspace,
        provider: "claude-code",
        agentId: "bridge-e2e-agent",
        bridgeBase
      });
      const delivered = await forwardProviderHookEvent({
        workspace,
        provider: "claude-code",
        agentId: "bridge-e2e-agent",
        bridgeBase,
        tokenFile: paths.token,
        rawInput: JSON.stringify({
          session_id: "private-session",
          hook_event_name: "PreToolUse",
          tool_name: "Read",
          tool_use_id: "toolu_bridge_01",
          tool_input: { file_path: "/private/customer.txt" }
        })
      });

      expect(delivered.status).toBe(201);
      expect(delivered.idempotentReplay).toBe(false);
      const ledger = openLedger(workspace);
      const events = ledger.getAllEvents();
      ledger.close();
      expect(events).toHaveLength(1);
      expect(events[0]?.event_type).toBe("tool_action");
      const metadata = JSON.parse(events[0]!.meta_json) as { receipt: string; receipt_id: string };
      const receipt = verifyReceipt(metadata.receipt, getPublicKeyHistory(workspace, "monitor"));
      expect(receipt.ok).toBe(true);
      expect(metadata.receipt_id).toBe(delivered.receiptId);
      expect(receipt.payload?.receipt_id).toBe(delivered.receiptId);
      expect(JSON.stringify(metadata)).not.toContain("/private/customer.txt");
    } finally {
      await bridge.close();
    }
  });

  test("forwards one byte-identical event across a transient retry without following redirects", async () => {
    const workspace = newWorkspace();
    const tokenFile = hookPaths(workspace, "claude-code").token;
    const bodies: Buffer[] = [];
    const auth: Array<string | undefined> = [];
    let requests = 0;
    const receiver = await listen((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on("end", () => {
        requests += 1;
        bodies.push(Buffer.concat(chunks));
        auth.push(req.headers.authorization);
        if (requests === 1) {
          res.statusCode = 503;
          res.end('{"error":"retry"}');
          return;
        }
        res.statusCode = 201;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true,"observed":true,"receiptId":"receipt-1","idempotentReplay":false}');
      });
    });

    try {
      installHookIntegration({
        workspace,
        provider: "claude-code",
        agentId: "forward-agent",
        bridgeBase: receiver.base
      });
      const delivered = await forwardProviderHookEvent({
        workspace,
        provider: "claude-code",
        agentId: "forward-agent",
        bridgeBase: receiver.base,
        tokenFile,
        rawInput: JSON.stringify({
          session_id: "session-1",
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_use_id: "toolu_01",
          tool_input: { command: "echo secret-value" }
        }),
        observedAt: Date.parse("2026-07-10T18:00:00.000Z"),
        retryDelayMs: 0
      });
      expect(delivered.status).toBe(201);
      expect(delivered.receiptId).toBe("receipt-1");
      expect(requests).toBe(2);
      expect(bodies[1]).toEqual(bodies[0]);
      expect(auth[0]).toMatch(/^Bearer /);
      expect(auth[1]).toBe(auth[0]);
      expect(bodies[0]!.toString("utf8")).not.toContain("secret-value");
    } finally {
      await receiver.close();
    }

    let redirectedRequests = 0;
    const redirectTarget = await listen((_req, res) => {
      redirectedRequests += 1;
      res.statusCode = 200;
      res.end("{}");
    });
    const redirector = await listen((_req, res) => {
      res.statusCode = 307;
      res.setHeader("location", `${redirectTarget.base}/stolen`);
      res.end();
    });
    try {
      installHookIntegration({
        workspace,
        provider: "claude-code",
        agentId: "forward-agent",
        bridgeBase: redirector.base
      });
      await expect(forwardProviderHookEvent({
        workspace,
        provider: "claude-code",
        agentId: "forward-agent",
        bridgeBase: redirector.base,
        tokenFile,
        rawInput: JSON.stringify({
          session_id: "session-2",
          hook_event_name: "PreToolUse",
          tool_name: "Read",
          tool_use_id: "toolu_02",
          tool_input: { file_path: "/private/file" }
        }),
        retryDelayMs: 0
      })).rejects.toMatchObject({ code: "HOOK_DELIVERY_FAILED" });
      expect(redirectedRequests).toBe(0);
    } finally {
      await redirector.close();
      await redirectTarget.close();
    }
  });

  test("forwarding refuses arbitrary workspace secrets and unsigned destinations", async () => {
    const workspace = newWorkspace();
    const paths = hookPaths(workspace, "gemini-cli");
    let requests = 0;
    const receiver = await listen((_req, res) => {
      requests += 1;
      res.statusCode = 500;
      res.end();
    });
    const rawInput = JSON.stringify({
      session_id: "session-guarded",
      hook_event_name: "BeforeTool",
      tool_name: "read_file",
      tool_input: { file_path: "/private/file" }
    });
    try {
      installHookIntegration({
        workspace,
        provider: "gemini-cli",
        agentId: "guarded-forwarder",
        bridgeBase: receiver.base
      });
      const arbitrarySecret = join(workspace, ".env");
      writeFileSync(arbitrarySecret, "valuable-secret\n", { encoding: "utf8", mode: 0o600 });

      await expect(forwardProviderHookEvent({
        workspace,
        provider: "gemini-cli",
        agentId: "guarded-forwarder",
        bridgeBase: receiver.base,
        tokenFile: arbitrarySecret,
        rawInput
      })).rejects.toMatchObject({ code: "HOOK_TOKEN_INVALID" });
      await expect(forwardProviderHookEvent({
        workspace,
        provider: "gemini-cli",
        agentId: "guarded-forwarder",
        bridgeBase: "https://untrusted.example.test",
        tokenFile: paths.token,
        rawInput
      })).rejects.toMatchObject({ code: "HOOK_MANIFEST_INVALID" });
      expect(requests).toBe(0);
    } finally {
      await receiver.close();
    }
  });

  test("rejects malformed, ambiguous, and oversized provider hook input", () => {
    const common = {
      provider: "claude-code" as const,
      agentId: "input-agent",
      observedAt: Date.parse("2026-07-10T18:00:00.000Z")
    };
    expect(() => mapProviderHookEvent({ ...common, rawInput: "not-json" })).toThrowError(
      expect.objectContaining<Partial<HookIntegrationError>>({ code: "HOOK_INPUT_INVALID" })
    );
    expect(() => mapProviderHookEvent({
      ...common,
      rawInput: '{"hook_event_name":"PreToolUse","tool_name":"Read","tool_name":"Write"}'
    })).toThrowError(expect.objectContaining<Partial<HookIntegrationError>>({ code: "HOOK_INPUT_AMBIGUOUS" }));
    expect(() => mapProviderHookEvent({
      ...common,
      rawInput: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: { content: "x".repeat(262_145) }
      })
    })).toThrowError(expect.objectContaining<Partial<HookIntegrationError>>({ code: "HOOK_INPUT_TOO_LARGE" }));
  });

  test("status reports token permission and lease tamper as invalid", () => {
    const workspace = newWorkspace();
    const paths = hookPaths(workspace, "claude-code");
    installHookIntegration({ workspace, provider: "claude-code", agentId: "permission-agent" });
    chmodSync(paths.token, 0o644);
    let status = getHookIntegrationStatus({ workspace, provider: "claude-code" });
    expect(status.state).toBe("invalid");
    expect(status.issues).toContain("lease token permissions must be 0600");

    chmodSync(paths.token, 0o600);
    writeFileSync(paths.token, `${readFileSync(paths.token, "utf8").trim()}tampered\n`, { mode: 0o600 });
    status = getHookIntegrationStatus({ workspace, provider: "claude-code" });
    expect(status.state).toBe("invalid");
    expect(status.leaseValid).toBe(false);
    expect(status.issues.some((issue) => issue.startsWith("lease invalid:"))).toBe(true);
  });

  test("status fails closed if Git ignore protection for the bearer lease is removed", () => {
    const workspace = newWorkspace();
    const paths = hookPaths(workspace, "gemini-cli");
    installHookIntegration({ workspace, provider: "gemini-cli", agentId: "ignore-agent" });
    writeFileSync(paths.ignore, "node_modules/\n", "utf8");

    const status = getHookIntegrationStatus({ workspace, provider: "gemini-cli" });
    expect(status.state).toBe("invalid");
    expect(status.issues).toContain(".amc/hooks/ is not protected by .gitignore");
  });
});
