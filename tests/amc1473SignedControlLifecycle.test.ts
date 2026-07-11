import type { IncomingMessage, ServerResponse } from "node:http";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";
import YAML from "yaml";
import { handleApiRoute } from "../src/api/index.js";
import {
  applyEnforceResourceLifecycle,
  inspectEnforceResource,
  listEnforceResources,
  loadEnforceResourceManifest,
  projectEnforceResourceLifecycleStatus,
  restoreEnforceResourceSnapshot,
  verifyEnforceResourceManifest,
  writeEnforceResourceManifest,
  type EnforceResourceIntegrityReasonCode,
} from "../src/enforce/resourceManifest.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { artifactSigPath, signArtifactFile, verifyArtifactFileSignature } from "../src/lifecycle/artifactSignature.js";
import { generateFullOpenApiSpec } from "../src/studio/openapi.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];

function newWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-1473-resource-lifecycle-"));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "amc-1473-test-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

function writeGuardrails(workspace: string, agentId: string, rule: string): string {
  const path = getAgentPaths(workspace, agentId).guardrails;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `rules:\n  - ${rule}\n`, "utf8");
  return path;
}

function mutateJson(path: string, mutate: (value: Record<string, unknown>) => void): void {
  const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  mutate(value);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function snapshotResourcePath(input: {
  snapshotBundlePath: string;
  resourcePath: string;
}): string {
  return join(input.snapshotBundlePath, "files", input.resourcePath);
}

function expectIntegrityCode(fn: () => unknown, code: EnforceResourceIntegrityReasonCode): void {
  try {
    fn();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toEqual(expect.objectContaining({ code }));
  }
}

function mockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload ? [Buffer.from(payload, "utf8")] : []) as unknown as IncomingMessage;
  (req as { method?: string; url?: string }).method = method;
  (req as { method?: string; url?: string }).url = url;
  return req;
}

function mockRes(): { res: ServerResponse; state: { statusCode: number; body: string } } {
  const state = { statusCode: 0, body: "" };
  const res = {
    writeHead: (statusCode: number) => {
      state.statusCode = statusCode;
      return res;
    },
    end: (chunk?: string | Buffer) => {
      if (chunk !== undefined) state.body += chunk.toString();
    },
  } as unknown as ServerResponse;
  return { res, state };
}

async function callApi(input: {
  workspace: string;
  pathname: string;
  method?: string;
  url?: string;
  body?: unknown;
}): Promise<{ status: number; json: { ok: boolean; data?: any; error?: string } }> {
  const method = input.method ?? "GET";
  const req = mockReq(method, input.url ?? input.pathname, input.body);
  const { res, state } = mockRes();
  const handled = await handleApiRoute(input.pathname, method, req, res, input.workspace);
  expect(handled).toBe(true);
  return {
    status: state.statusCode,
    json: JSON.parse(state.body) as { ok: boolean; data?: any; error?: string },
  };
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("AMC-1473 signed control version lifecycle", () => {
  test("never reports a tampered manifest as valid", () => {
    const workspace = newWorkspace();
    writeGuardrails(workspace, "default", "allow");
    const snapshot = writeEnforceResourceManifest({ workspace, agentId: "default" });

    mutateJson(snapshot.manifestPath, (manifest) => {
      manifest.createdAt = "2030-01-01T00:00:00.000Z";
    });

    const verification = verifyEnforceResourceManifest({ workspace, agentId: "default" });
    expect(verification.valid).toBe(false);
    expect(verification.signature.valid).toBe(false);
    expect(verification.integrity.reasonCodes).toContain("MANIFEST_SIGNATURE_INVALID");
    expectIntegrityCode(() => listEnforceResources({ workspace, agentId: "default" }), "MANIFEST_SIGNATURE_INVALID");
    expectIntegrityCode(() => inspectEnforceResource({
      workspace,
      agentId: "default",
      selector: snapshot.manifest.resources[0]!.id,
    }), "MANIFEST_SIGNATURE_INVALID");

    const status = projectEnforceResourceLifecycleStatus({ workspace, agentId: "default" });
    expect(status.state).toBe("BLOCKED");
    expect(status.integrity.reasonCodes).toContain("MANIFEST_SIGNATURE_INVALID");
    expect(JSON.stringify(status)).not.toContain(resolve(workspace));
  });

  test("strictly rejects malformed identity, hashes, counts, and duplicate resources", () => {
    const scenarios: Array<{
      code: EnforceResourceIntegrityReasonCode;
      mutate: (manifest: Record<string, unknown>) => void;
    }> = [
      { code: "MANIFEST_HASH_INVALID", mutate: (manifest) => { manifest.resourcesSha256 = "0".repeat(64); } },
      { code: "MANIFEST_ID_INVALID", mutate: (manifest) => { manifest.manifestId = "enforce-resources-deadbeefdeadbeef"; } },
      {
        code: "MANIFEST_ID_INVALID",
        mutate: (manifest) => {
          const resources = manifest.resources as Array<Record<string, unknown>>;
          resources[0]!.id = "guardrail:not-the-resource-path";
        },
      },
      { code: "MANIFEST_COUNT_INVALID", mutate: (manifest) => { manifest.resourceCount = 999; } },
      {
        code: "MANIFEST_SCHEMA_INVALID",
        mutate: (manifest) => {
          const resources = manifest.resources as Array<Record<string, unknown>>;
          resources[0]!.path = String(resources[0]!.path).replaceAll("/", "\\");
        },
      },
      {
        code: "MANIFEST_DUPLICATE_RESOURCE",
        mutate: (manifest) => {
          const resources = manifest.resources as unknown[];
          resources.push(structuredClone(resources[0]));
          manifest.resourceCount = resources.length;
        },
      },
    ];

    for (const scenario of scenarios) {
      const workspace = newWorkspace();
      writeGuardrails(workspace, "default", "allow");
      const snapshot = writeEnforceResourceManifest({ workspace, agentId: "default" });
      mutateJson(snapshot.manifestPath, scenario.mutate);
      expectIntegrityCode(() => loadEnforceResourceManifest(snapshot.manifestPath), scenario.code);
      expect(projectEnforceResourceLifecycleStatus({ workspace, agentId: "default" }).integrity.reasonCodes)
        .toContain(scenario.code);
    }
  });

  test("blocks tampered snapshot bytes before any rollback write or receipt", () => {
    const workspace = newWorkspace();
    const guardrails = writeGuardrails(workspace, "default", "allow");
    const snapshot = writeEnforceResourceManifest({ workspace, agentId: "default" });
    const resource = snapshot.manifest.resources.find((row) => row.path.endsWith("guardrails.yaml"));
    expect(resource).toBeDefined();
    const source = snapshotResourcePath({
      snapshotBundlePath: snapshot.snapshotBundlePath,
      resourcePath: resource!.path,
    });
    writeFileSync(source, "rules:\n  - tampered-snapshot\n", "utf8");
    writeFileSync(guardrails, "rules:\n  - current-change\n", "utf8");

    expectIntegrityCode(() => restoreEnforceResourceSnapshot({
      workspace,
      agentId: "default",
      resource: resource!.id,
      apply: true,
    }), "SNAPSHOT_RESOURCE_INVALID");

    expect(readFileSync(guardrails, "utf8")).toContain("current-change");
    const receiptsDir = join(getAgentPaths(workspace, "default").rootDir, "enforce", "resources", "restore-receipts");
    expect(existsSync(receiptsDir) ? readdirSync(receiptsDir) : []).toEqual([]);
  });

  test("projects signed active/previous versions and makes rollback activate the target", () => {
    const workspace = newWorkspace();
    const guardrails = writeGuardrails(workspace, "default", "allow");
    const v1 = writeEnforceResourceManifest({ workspace, agentId: "default" });
    writeFileSync(guardrails, "rules:\n  - deny-secret\n", "utf8");
    const applied = applyEnforceResourceLifecycle({
      workspace,
      agentId: "default",
      dryRun: false,
    });
    const v2 = applied.acceptedManifest!;

    const activeV2 = projectEnforceResourceLifecycleStatus({ workspace, agentId: "default" });
    expect(activeV2).toEqual(expect.objectContaining({
      state: "ACTIVE",
      active: expect.objectContaining({ manifestId: v2.manifest.manifestId }),
      previous: expect.objectContaining({ manifestId: v1.manifest.manifestId }),
      rollbackTarget: expect.objectContaining({ manifestId: v1.manifest.manifestId }),
    }));
    expect(JSON.stringify(activeV2)).not.toContain(resolve(workspace));

    const rollback = restoreEnforceResourceSnapshot({
      workspace,
      agentId: "default",
      manifestPath: v1.snapshotPath,
      apply: true,
    });
    expect(rollback).toEqual(expect.objectContaining({
      apply: true,
      baselineManifestId: v2.manifest.manifestId,
      targetManifestId: v1.manifest.manifestId,
      integrity: expect.objectContaining({ valid: true, reasonCodes: [] }),
    }));
    expect(readFileSync(guardrails, "utf8")).toContain("allow");
    expect(rollback.receiptPath ? verifyArtifactFileSignature({
      workspace,
      path: rollback.receiptPath,
      artifactKind: "enforce-resource-restore-receipt",
    }).valid : false).toBe(true);

    const activeV1 = projectEnforceResourceLifecycleStatus({ workspace, agentId: "default" });
    expect(activeV1.active?.manifestId).toBe(v1.manifest.manifestId);
    expect(activeV1.previous?.manifestId).toBe(v2.manifest.manifestId);
    expect(activeV1.pendingDiff).toEqual({ added: [], removed: [], changed: [], unchanged: expect.any(Number) });
  });

  test("rollback removes mutable resources that do not exist in the target version", () => {
    const workspace = newWorkspace();
    writeGuardrails(workspace, "default", "allow");
    const v1 = writeEnforceResourceManifest({ workspace, agentId: "default" });
    const modelRoute = join(getAgentPaths(workspace, "default").rootDir, "model-routes.json");
    writeFileSync(modelRoute, '{"provider":"local","model":"small"}\n', "utf8");
    const v2 = applyEnforceResourceLifecycle({ workspace, agentId: "default", dryRun: false });
    expect(v2.acceptedManifest?.manifest.resources.some((row) => row.path.endsWith("model-routes.json"))).toBe(true);

    const preview = restoreEnforceResourceSnapshot({
      workspace,
      agentId: "default",
      manifestPath: v1.snapshotPath,
    });
    expect(preview.entries).toContainEqual(expect.objectContaining({
      path: expect.stringMatching(/model-routes\.json$/),
      status: "would-remove",
    }));
    expect(existsSync(modelRoute)).toBe(true);

    const applied = restoreEnforceResourceSnapshot({
      workspace,
      agentId: "default",
      manifestPath: v1.snapshotPath,
      apply: true,
    });
    expect(applied.entries).toContainEqual(expect.objectContaining({
      path: expect.stringMatching(/model-routes\.json$/),
      status: "removed",
    }));
    expect(existsSync(modelRoute)).toBe(false);
    expect(projectEnforceResourceLifecycleStatus({ workspace, agentId: "default" }).active?.manifestId)
      .toBe(v1.manifest.manifestId);
  });

  test("recovers baseline bytes and active state when post-write verification fails", () => {
    const workspace = newWorkspace();
    writeGuardrails(workspace, "default", "allow");
    const paths = getAgentPaths(workspace, "default");
    const v1 = writeEnforceResourceManifest({ workspace, agentId: "default" });
    writeFileSync(paths.agentConfig, "agentId: default\nmode: changed\n", "utf8");
    writeFileSync(paths.agentConfigSig, '{"signature":"changed"}\n', "utf8");
    const baselineConfig = readFileSync(paths.agentConfig);
    const baselineSig = readFileSync(paths.agentConfigSig);
    const v2 = writeEnforceResourceManifest({ workspace, agentId: "default" });

    expectIntegrityCode(() => restoreEnforceResourceSnapshot({
      workspace,
      agentId: "default",
      manifestPath: v1.snapshotPath,
      apply: true,
    }), "ROLLBACK_STATE_CHANGED");

    expect(readFileSync(paths.agentConfig)).toEqual(baselineConfig);
    expect(readFileSync(paths.agentConfigSig)).toEqual(baselineSig);
    const status = projectEnforceResourceLifecycleStatus({ workspace, agentId: "default" });
    expect(status.state).toBe("ACTIVE");
    expect(status.active?.manifestId).toBe(v2.manifest.manifestId);
    const receiptsDir = join(paths.rootDir, "enforce", "resources", "restore-receipts");
    expect(existsSync(receiptsDir) ? readdirSync(receiptsDir) : []).toEqual([]);
  });

  test("ignores signed transition receipts bound to another agent", () => {
    const workspace = newWorkspace();
    const guardrails = writeGuardrails(workspace, "default", "allow");
    const v1 = writeEnforceResourceManifest({ workspace, agentId: "default" });
    writeFileSync(guardrails, "rules:\n  - deny-secret\n", "utf8");
    const v2 = applyEnforceResourceLifecycle({ workspace, agentId: "default", dryRun: false });
    expect(v2.receiptPath).not.toBeNull();
    rmSync(v2.receiptPath!, { force: true });
    rmSync(artifactSigPath(v2.receiptPath!), { force: true });

    const receiptPath = join(
      getAgentPaths(workspace, "default").rootDir,
      "enforce",
      "resources",
      "lifecycle-receipts",
      "cross-agent.json",
    );
    mkdirSync(dirname(receiptPath), { recursive: true });
    writeFileSync(receiptPath, `${JSON.stringify({
      agentId: "other",
      createdAt: new Date().toISOString(),
      baselineManifestId: v1.manifest.manifestId,
      acceptedManifestId: v2.acceptedManifest!.manifest.manifestId,
    })}\n`, "utf8");
    signArtifactFile({
      workspace,
      path: receiptPath,
      artifactKind: "enforce-resource-lifecycle-receipt",
    });

    expect(projectEnforceResourceLifecycleStatus({ workspace, agentId: "default" }).previous).toBeNull();
  });

  test("rejects outside, cross-agent, and symlink manifest selectors", () => {
    const workspace = newWorkspace();
    writeGuardrails(workspace, "default", "allow");
    const own = writeEnforceResourceManifest({ workspace, agentId: "default" });
    writeGuardrails(workspace, "other", "allow-other");
    const other = writeEnforceResourceManifest({ workspace, agentId: "other" });

    const outside = join(workspace, "outside-manifest.json");
    copyFileSync(own.snapshotPath, outside);
    copyFileSync(artifactSigPath(own.snapshotPath), artifactSigPath(outside));
    expectIntegrityCode(() => restoreEnforceResourceSnapshot({
      workspace,
      agentId: "default",
      manifestPath: outside,
    }), "MANIFEST_PATH_INVALID");

    expectIntegrityCode(() => restoreEnforceResourceSnapshot({
      workspace,
      agentId: "default",
      manifestPath: other.snapshotPath,
    }), "MANIFEST_SCOPE_INVALID");

    const link = join(dirname(own.snapshotPath), "enforce-resources-symlink.json");
    symlinkSync(outside, link);
    expectIntegrityCode(() => restoreEnforceResourceSnapshot({
      workspace,
      agentId: "default",
      manifestPath: link,
    }), "MANIFEST_PATH_INVALID");

    const outsideAgentRoot = mkdtempSync(join(tmpdir(), "amc-1473-outside-agent-"));
    roots.push(outsideAgentRoot);
    const agentsDir = join(workspace, ".amc", "agents");
    mkdirSync(agentsDir, { recursive: true });
    symlinkSync(outsideAgentRoot, join(agentsDir, "escape"));
    expectIntegrityCode(() => writeEnforceResourceManifest({
      workspace,
      agentId: "escape",
    }), "MANIFEST_PATH_INVALID");
  });

  test("force cannot override cryptographic integrity failures", () => {
    const workspace = newWorkspace();
    const guardrails = writeGuardrails(workspace, "default", "allow");
    const snapshot = writeEnforceResourceManifest({ workspace, agentId: "default" });
    mutateJson(snapshot.manifestPath, (manifest) => {
      manifest.createdAt = "2030-01-01T00:00:00.000Z";
    });
    writeFileSync(guardrails, "rules:\n  - changed\n", "utf8");

    expectIntegrityCode(() => applyEnforceResourceLifecycle({
      workspace,
      agentId: "default",
      dryRun: false,
      force: true,
    }), "MANIFEST_SIGNATURE_INVALID");
  });

  test("API exposes bounded status and requires confirmation without leaking local paths", async () => {
    const workspace = newWorkspace();
    const guardrails = writeGuardrails(workspace, "default", "allow");
    const snapshot = writeEnforceResourceManifest({ workspace, agentId: "default" });
    const resource = snapshot.manifest.resources.find((row) => row.path.endsWith("guardrails.yaml"))!;

    for (const request of [
      { pathname: "/api/v1/enforce/resources/status" },
      { pathname: "/api/v1/enforce/resources/verify" },
      { pathname: "/api/v1/enforce/resources/manifest" },
      { pathname: "/api/v1/enforce/resources/history" },
    ]) {
      const response = await callApi({ workspace, ...request });
      expect(response.status).toBe(200);
      expect(JSON.stringify(response.json)).not.toContain(resolve(workspace));
    }

    const missingRollbackTarget = await callApi({
      workspace,
      pathname: "/api/v1/enforce/resources/rollback",
      method: "POST",
      body: { agentId: "default" },
    });
    expect(missingRollbackTarget.status).toBe(409);
    expect(missingRollbackTarget.json.error).toBe("ROLLBACK_TARGET_MISSING");

    writeFileSync(guardrails, "rules:\n  - preview-change\n", "utf8");
    const activationPreview = await callApi({
      workspace,
      pathname: "/api/v1/enforce/resources/apply",
      method: "POST",
      body: { agentId: "default", dryRun: true },
    });
    const previewManifestId = activationPreview.json.data?.proposal?.currentManifestId as string;
    expect(previewManifestId).toMatch(/^enforce-resources-[a-f0-9]{16}$/);
    writeFileSync(guardrails, "rules:\n  - changed-after-preview\n", "utf8");
    const staleActivation = await callApi({
      workspace,
      pathname: "/api/v1/enforce/resources/apply",
      method: "POST",
      body: {
        agentId: "default",
        dryRun: false,
        confirmManifestId: previewManifestId,
      },
    });
    expect(staleActivation.status).toBe(400);
    expect(staleActivation.json.error).toBe("ACTIVATION_CONFIRMATION_REQUIRED");
    expect(projectEnforceResourceLifecycleStatus({ workspace, agentId: "default" }).active?.manifestId)
      .toBe(snapshot.manifest.manifestId);

    const freshPreview = await callApi({
      workspace,
      pathname: "/api/v1/enforce/resources/apply",
      method: "POST",
      body: { agentId: "default", dryRun: true },
    });
    const freshManifestId = freshPreview.json.data?.proposal?.currentManifestId as string;
    const activated = await callApi({
      workspace,
      pathname: "/api/v1/enforce/resources/apply",
      method: "POST",
      body: {
        agentId: "default",
        dryRun: false,
        confirmManifestId: freshManifestId,
      },
    });
    expect(activated.status).toBe(201);
    expect(projectEnforceResourceLifecycleStatus({ workspace, agentId: "default" }).rollbackTarget?.manifestId)
      .toBe(snapshot.manifest.manifestId);

    const noConfirmation = await callApi({
      workspace,
      pathname: "/api/v1/enforce/resources/rollback",
      method: "POST",
      body: { agentId: "default", apply: true },
    });
    expect(noConfirmation.status).toBe(400);

    writeFileSync(snapshotResourcePath({
      snapshotBundlePath: snapshot.snapshotBundlePath,
      resourcePath: resource.path,
    }), "rules:\n  - tampered-snapshot\n", "utf8");
    writeFileSync(guardrails, "rules:\n  - current-change\n", "utf8");
    const blocked = await callApi({
      workspace,
      pathname: "/api/v1/enforce/resources/rollback",
      method: "POST",
      body: {
        agentId: "default",
        apply: true,
        confirmManifestId: snapshot.manifest.manifestId,
      },
    });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error).toBe("SNAPSHOT_RESOURCE_INVALID");
    expect(JSON.stringify(blocked.json)).not.toContain(resolve(workspace));
    expect(readFileSync(guardrails, "utf8")).toContain("current-change");
  });

  test("CLI, Studio, and OpenAPI expose the same bounded lifecycle", () => {
    const workspace = newWorkspace();
    writeGuardrails(workspace, "default", "allow");
    const snapshot = writeEnforceResourceManifest({ workspace, agentId: "default" });
    const cli = resolve(process.cwd(), "src/cli.ts");
    const tsxLoader = resolve(process.cwd(), "node_modules/tsx/dist/loader.mjs");
    const env = { ...process.env, AMC_VAULT_PASSPHRASE: "amc-1473-test-passphrase" };

    const status = spawnSync(process.execPath, [
      "--import",
      tsxLoader,
      cli,
      "resource",
      "status",
      "--agent",
      "default",
      "--json",
    ], { cwd: workspace, env, encoding: "utf8" });
    expect(status.status, status.stderr).toBe(0);
    const statusJson = JSON.parse(status.stdout) as Record<string, unknown>;
    expect(statusJson).toEqual(expect.objectContaining({ state: "ACTIVE" }));
    expect(status.stdout).not.toContain(resolve(workspace));

    const activateHelp = spawnSync(process.execPath, [
      "--import",
      tsxLoader,
      cli,
      "resource",
      "activate",
      "--help",
    ], { cwd: workspace, env, encoding: "utf8" });
    expect(activateHelp.status, activateHelp.stderr).toBe(0);
    expect(activateHelp.stdout).toContain("dry-run unless --yes is set");

    const copiedManifest = join(workspace, "copied-manifest.json");
    copyFileSync(snapshot.snapshotPath, copiedManifest);
    copyFileSync(artifactSigPath(snapshot.snapshotPath), artifactSigPath(copiedManifest));
    const unsafeDiff = spawnSync(process.execPath, [
      "--import",
      tsxLoader,
      cli,
      "resource",
      "diff",
      "--from",
      copiedManifest,
      "--json",
    ], { cwd: workspace, env, encoding: "utf8" });
    expect(unsafeDiff.status).toBe(1);
    expect(unsafeDiff.stderr).toContain("MANIFEST_PATH_INVALID");

    writeGuardrails(workspace, "default", "deny-secret");
    applyEnforceResourceLifecycle({ workspace, agentId: "default", dryRun: false });
    const rollbackPreview = spawnSync(process.execPath, [
      "--import",
      tsxLoader,
      cli,
      "resource",
      "rollback",
      "--agent",
      "default",
      "--json",
    ], { cwd: workspace, env, encoding: "utf8" });
    expect(rollbackPreview.status, rollbackPreview.stderr).toBe(0);
    expect(JSON.parse(rollbackPreview.stdout)).toEqual(expect.objectContaining({
      apply: false,
      targetManifestId: snapshot.manifest.manifestId,
    }));

    const studio = readFileSync(resolve(process.cwd(), "src/console/assets/app.js"), "utf8");
    expect(studio).toContain("/api/v1/enforce/resources/status");
    expect(studio).toContain("const resourceProofReady =");
    expect(studio).toContain("const resourceVerificationReady =");
    expect(studio).toContain("Promise.resolve({ valid: false, error: resourceProofError })");
    expect(studio).toContain("confirmManifestId: targetManifestId");
    expect(studio).toContain("confirmManifestId: rollbackTarget.manifestId");

    const spec = generateFullOpenApiSpec();
    expect(spec.paths["/api/v1/enforce/resources/status"]?.get).toBeDefined();
    expect(spec.paths["/api/v1/enforce/resources/apply"]?.post).toBeDefined();
    expect(spec.paths["/api/v1/enforce/resources/rollback"]?.post).toBeDefined();
    expect(spec.components?.schemas?.EnforceResourceLifecycleStatus).toBeDefined();
    expect(spec.components?.schemas?.EnforceResourceRollbackRequest).toBeDefined();

    const published = YAML.parse(readFileSync(resolve(process.cwd(), "website/openapi.yaml"), "utf8")) as any;
    expect(published.paths["/v1/enforce/resources/status"]?.get).toBeDefined();
    expect(published.paths["/v1/enforce/resources/apply"]?.post).toBeDefined();
    expect(published.paths["/v1/enforce/resources/rollback"]?.post).toBeDefined();
    expect(published.components?.schemas?.EnforceResourceLifecycleStatus).toBeDefined();
    expect(published.components?.schemas?.EnforceResourceRollbackRequest).toBeDefined();
  });
});
