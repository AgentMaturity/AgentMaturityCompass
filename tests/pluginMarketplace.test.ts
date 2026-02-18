import { createPrivateKey, sign } from "node:crypto";
import { createServer, type Server } from "node:http";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { pluginKeygen, pluginPack, verifyPluginPackage } from "../src/plugins/pluginPackage.js";
import { initPluginRegistry, publishPluginToRegistry, servePluginRegistry, verifyPluginRegistry } from "../src/plugins/pluginRegistry.js";
import { initPluginWorkspace, requestPluginInstall, executePluginRequest } from "../src/plugins/pluginApi.js";
import { savePluginRegistriesConfig, defaultInstalledPluginsLock, pendingActionPath, pluginInstalledPackagePath, saveInstalledPluginsLock, verifyInstalledPluginsLock, savePluginOverrides } from "../src/plugins/pluginStore.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { decideApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { loadInstalledPluginAssets } from "../src/plugins/pluginLoader.js";
import { ensureDir, readUtf8 } from "../src/utils/fs.js";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-plugin-market-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "plugin-market-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function pluginSource(params: {
  root: string;
  pluginId: string;
  version: string;
  contentFiles: Array<{ path: string; content: string }>;
  risk?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  touches?: Array<"policy" | "assurance" | "compliance" | "adapters" | "learn" | "transform" | "outcomes" | "casebooks">;
}): string {
  const dir = join(params.root, `${params.pluginId.replaceAll(".", "_")}-${params.version}`);
  mkdirSync(join(dir, "content"), { recursive: true });
  for (const file of params.contentFiles) {
    const target = join(dir, "content", file.path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, file.content);
  }
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify(
      {
        v: 1,
        plugin: {
          id: params.pluginId,
          name: params.pluginId,
          version: params.version,
          description: "fixture plugin",
          publisher: {
            org: "Fixture Org",
            contact: "ops@example.com",
            website: "https://example.com",
            pubkeyFingerprint: "0".repeat(64)
          },
          compatibility: {
            amcMinVersion: ">=1.0.0",
            nodeMinVersion: ">=20",
            schemaVersions: {
              policyPacks: 1,
              assurancePacks: 1,
              complianceMaps: 1,
              adapters: 1,
              outcomes: 1,
              casebooks: 1,
              transform: 1
            }
          },
          risk: {
            category: params.risk ?? "LOW",
            notes: "fixture",
            touches: params.touches ?? ["learn"]
          }
        },
        artifacts: [],
        generatedTs: Date.now(),
        signing: {
          algorithm: "ed25519",
          pubkeyFingerprint: "0".repeat(64)
        }
      },
      null,
      2
    )
  );
  return dir;
}

async function pickPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  const addr = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!addr || typeof addr === "string") {
    throw new Error("failed to allocate port");
  }
  return addr.port;
}

async function httpGet(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url);
  return {
    status: response.status,
    body: await response.text()
  };
}

function reSignRegistryIndex(registryDir: string): void {
  const indexPath = join(registryDir, "index.json");
  const keyPath = join(registryDir, "registry.key");
  const index = JSON.parse(readUtf8(indexPath)) as unknown;
  const payload = Buffer.from(canonicalize(index), "utf8");
  const signature = sign(null, payload, createPrivateKey(readUtf8(keyPath))).toString("base64");
  writeFileSync(
    join(registryDir, "index.sig"),
    `${JSON.stringify({
      digestSha256: sha256Hex(payload),
      signature,
      signedTs: Date.now(),
      signer: "registry"
    })}\n`
  );
}

function installPackageDirect(params: {
  workspace: string;
  pluginId: string;
  version: string;
  packageFile: string;
  publisherFingerprint: string;
  registryFingerprint?: string;
}): void {
  const path = pluginInstalledPackagePath(params.workspace, params.pluginId, params.version);
  ensureDir(join(path, ".."));
  copyFileSync(params.packageFile, path);
  const lock = defaultInstalledPluginsLock(params.workspace);
  lock.installed = [
    {
      id: params.pluginId,
      version: params.version,
      sha256: sha256Hex(readFileSync(path)),
      registryFingerprint: params.registryFingerprint ?? "f".repeat(64),
      publisherFingerprint: params.publisherFingerprint,
      installedTs: Date.now()
    }
  ];
  saveInstalledPluginsLock(params.workspace, lock);
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("plugin marketplace", () => {
  test("plugin pack + verify catches tampering", () => {
    const ws = workspace();
    const keys = pluginKeygen({ outDir: join(ws, "keys") });
    const source = pluginSource({
      root: ws,
      pluginId: "amc.plugin.fixture.learn",
      version: "1.0.0",
      contentFiles: [{ path: "learn/questions/AMC-X.1.md", content: "# learn fixture\n" }]
    });
    const outFile = join(ws, "plugin.amcplug");
    pluginPack({
      inputDir: source,
      keyPath: keys.privateKeyPath,
      outFile
    });
    const verified = verifyPluginPackage({ file: outFile });
    expect(verified.ok).toBe(true);

    const tamperDir = mkdtempSync(join(tmpdir(), "amc-plugin-tamper-"));
    try {
      const extract = spawnSync("tar", ["-xzf", outFile, "-C", tamperDir], { encoding: "utf8" });
      if (extract.status !== 0) {
        throw new Error(extract.stderr || extract.stdout || "extract failed");
      }
      writeFileSync(join(tamperDir, "amc-plugin", "content", "learn", "questions", "AMC-X.1.md"), "# tampered\n");
      const tampered = join(ws, "plugin-tampered.amcplug");
      const repack = spawnSync("tar", ["-czf", tampered, "-C", tamperDir, "amc-plugin"], { encoding: "utf8" });
      if (repack.status !== 0) {
        throw new Error(repack.stderr || repack.stdout || "repack failed");
      }
      const check = verifyPluginPackage({ file: tampered });
      expect(check.ok).toBe(false);
    } finally {
      rmSync(tamperDir, { recursive: true, force: true });
    }
  });

  test("registry init/publish/verify/serve works", async () => {
    const ws = workspace();
    const keys = pluginKeygen({ outDir: join(ws, "keys") });
    const source = pluginSource({
      root: ws,
      pluginId: "amc.plugin.fixture.registry",
      version: "1.2.3",
      contentFiles: [{ path: "learn/questions/AMC-R.1.md", content: "# registry fixture\n" }]
    });
    const packageFile = join(ws, "registry-plugin.amcplug");
    pluginPack({ inputDir: source, keyPath: keys.privateKeyPath, outFile: packageFile });

    const registryDir = join(ws, "registry");
    initPluginRegistry({ dir: registryDir, registryId: "local", registryName: "Local Registry" });
    publishPluginToRegistry({
      dir: registryDir,
      pluginFile: packageFile,
      registryKeyPath: join(registryDir, "registry.key")
    });
    const verified = verifyPluginRegistry(registryDir);
    expect(verified.ok).toBe(true);

    const port = await pickPort();
    const server = await servePluginRegistry({ dir: registryDir, host: "127.0.0.1", port });
    try {
      const index = await httpGet(`http://${server.host}:${server.port}/index.json`);
      expect(index.status).toBe(200);
      const plugin = await httpGet(
        `http://${server.host}:${server.port}/packages/amc.plugin.fixture.registry/1.2.3/plugin.amcplug`
      );
      expect(plugin.status).toBe(200);
    } finally {
      await server.close();
    }
  });

  test("install rejects registry publisher metadata mismatch", async () => {
    const ws = workspace();
    initPluginWorkspace({ workspace: ws });
    const keys = pluginKeygen({ outDir: join(ws, "keys") });
    const source = pluginSource({
      root: ws,
      pluginId: "amc.plugin.fixture.registry-mismatch",
      version: "1.0.0",
      contentFiles: [{ path: "learn/questions/AMC-M.1.md", content: "# mismatch\n" }]
    });
    const packageFile = join(ws, "registry-mismatch.amcplug");
    const packed = pluginPack({ inputDir: source, keyPath: keys.privateKeyPath, outFile: packageFile });

    const registryDir = join(ws, "registry");
    const registryInit = initPluginRegistry({ dir: registryDir, registryId: "local", registryName: "Local Registry" });
    publishPluginToRegistry({
      dir: registryDir,
      pluginFile: packageFile,
      registryKeyPath: join(registryDir, "registry.key")
    });

    const indexPath = join(registryDir, "index.json");
    const index = JSON.parse(readUtf8(indexPath)) as {
      plugins: Array<{ id: string; versions: Array<{ version: string; publisherFingerprint: string }> }>;
    };
    index.plugins[0]!.versions[0]!.publisherFingerprint = "b".repeat(64);
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    reSignRegistryIndex(registryDir);

    savePluginRegistriesConfig(ws, {
      pluginRegistries: {
        version: 1,
        registries: [
          {
            id: "local",
            type: "file",
            base: registryDir,
            pinnedRegistryPubkeyFingerprint: registryInit.fingerprint,
            allowPluginPublishers: ["b".repeat(64)],
            allowRiskCategories: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
            autoUpdate: false
          }
        ]
      }
    });

    await expect(
      requestPluginInstall({
        workspace: ws,
        agentId: "default",
        registryId: "local",
        pluginRef: `${packed.manifest.plugin.id}@${packed.manifest.plugin.version}`,
        action: "install"
      })
    ).rejects.toThrow(/publisher fingerprint mismatch/i);
  });

  test("workspace install is dual-control and tamper breaks readiness", async () => {
    const ws = workspace();
    initPluginWorkspace({ workspace: ws });
    const keys = pluginKeygen({ outDir: join(ws, "keys") });
    const source = pluginSource({
      root: ws,
      pluginId: "amc.plugin.fixture.install",
      version: "2.0.0",
      contentFiles: [{ path: "learn/questions/AMC-I.1.md", content: "# install fixture\n" }]
    });
    const packageFile = join(ws, "install-plugin.amcplug");
    const packed = pluginPack({ inputDir: source, keyPath: keys.privateKeyPath, outFile: packageFile });

    const registryDir = join(ws, "registry");
    const registryInit = initPluginRegistry({ dir: registryDir, registryId: "local", registryName: "Local Registry" });
    publishPluginToRegistry({
      dir: registryDir,
      pluginFile: packageFile,
      registryKeyPath: join(registryDir, "registry.key")
    });
    savePluginRegistriesConfig(ws, {
      pluginRegistries: {
        version: 1,
        registries: [
          {
            id: "local",
            type: "file",
            base: registryDir,
            pinnedRegistryPubkeyFingerprint: registryInit.fingerprint,
            allowPluginPublishers: [packed.manifest.signing.pubkeyFingerprint],
            allowRiskCategories: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
            autoUpdate: false
          }
        ]
      }
    });

    const requested = await requestPluginInstall({
      workspace: ws,
      agentId: "default",
      registryId: "local",
      pluginRef: "amc.plugin.fixture.install@2.0.0",
      action: "install"
    });
    expect(requested.approvalRequestId).toMatch(/^apprreq_/);
    decideApprovalForIntent({
      workspace: ws,
      agentId: "default",
      approvalId: requested.approvalRequestId,
      decision: "APPROVED",
      mode: "EXECUTE",
      reason: "owner approval",
      userId: "owner-1",
      username: "owner-1",
      userRoles: ["OWNER"]
    });
    expect(() =>
      executePluginRequest({
        workspace: ws,
        approvalRequestId: requested.approvalRequestId
      })
    ).toThrow(/approval quorum not met/i);

    decideApprovalForIntent({
      workspace: ws,
      agentId: "default",
      approvalId: requested.approvalRequestId,
      decision: "APPROVED",
      mode: "EXECUTE",
      reason: "auditor approval",
      userId: "auditor-1",
      username: "auditor-1",
      userRoles: ["AUDITOR"]
    });
    const executed = executePluginRequest({
      workspace: ws,
      approvalRequestId: requested.approvalRequestId
    });
    expect(executed.action).toBe("install");
    expect(verifyInstalledPluginsLock(ws).valid).toBe(true);

    const lockPath = join(ws, ".amc", "plugins", "installed.lock.json");
    writeFileSync(lockPath, `${readFileSync(lockPath, "utf8")}\n# tampered`);

    const port = await pickPort();
    const token = "test-admin-token";
    const api = await startStudioApiServer({
      workspace: ws,
      host: "127.0.0.1",
      port,
      token
    });
    try {
      const ready = await httpGet(`${api.url}/readyz`);
      expect(ready.status).toBe(503);
      expect(ready.body).toContain("PLUGIN_INTEGRITY_BROKEN");
    } finally {
      await api.close();
    }
  });

  test("pending action tampering cannot bypass publisher/risk checks", async () => {
    const ws = workspace();
    initPluginWorkspace({ workspace: ws });
    const keys = pluginKeygen({ outDir: join(ws, "keys") });
    const source = pluginSource({
      root: ws,
      pluginId: "amc.plugin.fixture.pending-tamper",
      version: "1.0.0",
      contentFiles: [{ path: "learn/questions/AMC-P.1.md", content: "# pending tamper\n" }],
      risk: "HIGH",
      touches: ["learn"]
    });
    const packageFile = join(ws, "pending-tamper-plugin.amcplug");
    const packed = pluginPack({ inputDir: source, keyPath: keys.privateKeyPath, outFile: packageFile });

    const registryDir = join(ws, "registry");
    const registryInit = initPluginRegistry({ dir: registryDir, registryId: "local", registryName: "Local Registry" });
    publishPluginToRegistry({
      dir: registryDir,
      pluginFile: packageFile,
      registryKeyPath: join(registryDir, "registry.key")
    });
    savePluginRegistriesConfig(ws, {
      pluginRegistries: {
        version: 1,
        registries: [
          {
            id: "local",
            type: "file",
            base: registryDir,
            pinnedRegistryPubkeyFingerprint: registryInit.fingerprint,
            allowPluginPublishers: [packed.manifest.signing.pubkeyFingerprint],
            allowRiskCategories: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
            autoUpdate: false
          }
        ]
      }
    });

    const requested = await requestPluginInstall({
      workspace: ws,
      agentId: "default",
      registryId: "local",
      pluginRef: "amc.plugin.fixture.pending-tamper@1.0.0",
      action: "install"
    });

    decideApprovalForIntent({
      workspace: ws,
      agentId: "default",
      approvalId: requested.approvalRequestId,
      decision: "APPROVED",
      mode: "EXECUTE",
      reason: "owner approval",
      userId: "owner-1",
      username: "owner-1",
      userRoles: ["OWNER"]
    });
    decideApprovalForIntent({
      workspace: ws,
      agentId: "default",
      approvalId: requested.approvalRequestId,
      decision: "APPROVED",
      mode: "EXECUTE",
      reason: "auditor approval",
      userId: "auditor-1",
      username: "auditor-1",
      userRoles: ["AUDITOR"]
    });

    const pendingPath = pendingActionPath(ws, requested.approvalRequestId);
    const pending = JSON.parse(readUtf8(pendingPath)) as Record<string, unknown>;
    pending.publisherFingerprint = "a".repeat(64);
    pending.riskCategory = "LOW";
    writeFileSync(pendingPath, JSON.stringify(pending, null, 2));

    expect(() =>
      executePluginRequest({
        workspace: ws,
        approvalRequestId: requested.approvalRequestId
      })
    ).toThrow(/publisher fingerprint mismatch|risk category mismatch/i);
  });

  test("override denied by default and allowed with signed overrides", () => {
    const ws = workspace();
    initPluginWorkspace({ workspace: ws });
    const keys = pluginKeygen({ outDir: join(ws, "keys") });
    const source = pluginSource({
      root: ws,
      pluginId: "amc.plugin.fixture.override",
      version: "1.0.0",
      contentFiles: [{ path: "learn/questions/AMC-1.1.md", content: "# override\n" }]
    });
    const packageFile = join(ws, "override-plugin.amcplug");
    const packed = pluginPack({ inputDir: source, keyPath: keys.privateKeyPath, outFile: packageFile });
    installPackageDirect({
      workspace: ws,
      pluginId: packed.manifest.plugin.id,
      version: packed.manifest.plugin.version,
      packageFile,
      publisherFingerprint: packed.manifest.signing.pubkeyFingerprint
    });

    const blocked = loadInstalledPluginAssets(ws);
    const blockedStatus = blocked.statuses.find((row) => row.id === packed.manifest.plugin.id);
    expect(blockedStatus?.failedValidation).toBe(true);
    expect(blockedStatus?.errors.some((row) => row.includes("PLUGIN_OVERRIDE_DENIED"))).toBe(true);

    savePluginOverrides(ws, {
      overrides: {
        version: 1,
        allow: [
          {
            kind: "learn_md",
            id: "AMC-1.1",
            allowedPublisherFingerprints: [packed.manifest.signing.pubkeyFingerprint]
          }
        ]
      }
    });
    const allowed = loadInstalledPluginAssets(ws);
    const allowedStatus = allowed.statuses.find((row) => row.id === packed.manifest.plugin.id);
    expect(allowedStatus?.loaded).toBe(true);
    expect(allowed.assets.learnDocs.has("AMC-1.1")).toBe(true);
  });

  test("console plugins page serves without CDN or secret leaks", async () => {
    const ws = workspace();
    const port = await pickPort();
    const api = await startStudioApiServer({
      workspace: ws,
      host: "127.0.0.1",
      port,
      token: "console-token"
    });
    try {
      const html = await httpGet(`${api.url}/console/plugins.html`);
      expect(html.status).toBe(200);
      expect(html.body).toContain("data-page=\"plugins\"");
      expect(html.body).not.toMatch(/https?:\/\/cdn/i);

      const js = await httpGet(`${api.url}/console/assets/app.js`);
      expect(js.status).toBe(200);
      expect(js.body).not.toMatch(/https?:\/\/cdn/i);
      expect(js.body).not.toMatch(/BEGIN PRIVATE KEY/i);
      expect(js.body).not.toMatch(/x-amc-lease/i);
    } finally {
      await api.close();
    }
  });

  test("invalid plugin asset schema is flagged as FAILED_VALIDATION without crash", () => {
    const ws = workspace();
    initPluginWorkspace({ workspace: ws });
    const keys = pluginKeygen({ outDir: join(ws, "keys") });
    const source = pluginSource({
      root: ws,
      pluginId: "amc.plugin.fixture.invalid",
      version: "1.0.0",
      contentFiles: [
        {
          path: "adapters/bad.json",
          content: JSON.stringify({ id: "bad-adapter" }, null, 2)
        }
      ],
      touches: ["adapters"]
    });
    const packageFile = join(ws, "invalid-plugin.amcplug");
    const packed = pluginPack({ inputDir: source, keyPath: keys.privateKeyPath, outFile: packageFile });
    installPackageDirect({
      workspace: ws,
      pluginId: packed.manifest.plugin.id,
      version: packed.manifest.plugin.version,
      packageFile,
      publisherFingerprint: packed.manifest.signing.pubkeyFingerprint
    });
    const loaded = loadInstalledPluginAssets(ws);
    const status = loaded.statuses.find((row) => row.id === packed.manifest.plugin.id);
    expect(status).toBeDefined();
    expect(status?.failedValidation).toBe(true);
    expect(status?.errors.some((row) => row.includes("FAILED_VALIDATION"))).toBe(true);
  });
});
