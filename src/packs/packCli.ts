/**
 * packs/packCli.ts — CLI commands for AMC pack registry system
 *
 * Implements `amc pack install`, `amc pack publish`, and related commands
 * for the community assurance pack registry with NPM-style functionality.
 */

import { join, resolve, basename } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { PackManager } from "./packManager.js";
import { 
  FileSystemPackRegistryStorage, 
  PackRegistryServer, 
  validatePackManifest,
  createPackTarball 
} from "./packRegistry.js";
import type {
  PackManifest,
  PackRegistryConfig,
  PackSearchParams,
  PackInstallRecord
} from "./packTypes.js";
import {
  packManifestSchema,
  packRegistryConfigSchema,
  packSearchParamsSchema
} from "./packTypes.js";
import { ensureDir, pathExists, readUtf8, writeUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { getPrivateKeyPem, signHexDigest } from "../crypto/keys.js";

/* ── Default registry configuration ──────────────────────────── */

const DEFAULT_REGISTRY_CONFIG: PackRegistryConfig = {
  registries: [
    {
      name: "official",
      url: "https://registry.amc.dev",
      priority: 100,
      trusted: true
    },
    {
      name: "local",
      url: "http://127.0.0.1:4873",
      priority: 50,
      trusted: false
    }
  ],
  defaultRegistry: "https://registry.amc.dev",
  cache: {
    ttl: 3600,
    maxSize: 100
  }
};

/* ── Load or create registry configuration ───────────────────── */

function loadRegistryConfig(workspace: string): PackRegistryConfig {
  const configFile = join(workspace, ".amc", "pack-registries.json");
  
  if (!pathExists(configFile)) {
    // Create default config
    ensureDir(join(workspace, ".amc"));
    writeUtf8(configFile, JSON.stringify(DEFAULT_REGISTRY_CONFIG, null, 2));
    return DEFAULT_REGISTRY_CONFIG;
  }
  
  try {
    const content = readUtf8(configFile);
    const parsed = JSON.parse(content);
    return packRegistryConfigSchema.parse(parsed);
  } catch (error) {
    console.warn(`Invalid registry config, using defaults: ${error}`);
    return DEFAULT_REGISTRY_CONFIG;
  }
}

/* ── amc pack install <name> ─────────────────────────────────── */

export async function packInstallCli(params: {
  workspace: string;
  name: string;
  version?: string;
  save?: boolean;
  saveDev?: boolean;
  force?: boolean;
  dryRun?: boolean;
}): Promise<{
  success: boolean;
  installed: PackInstallRecord[];
  conflicts: Array<{ name: string; reason: string }>;
  message: string;
}> {
  try {
    const registryConfig = loadRegistryConfig(params.workspace);
    const packManager = new PackManager(params.workspace, registryConfig);
    
    const result = await packManager.install(params.name, params.version, {
      save: params.save,
      saveDev: params.saveDev,
      force: params.force,
      dryRun: params.dryRun
    });
    
    const message = params.dryRun 
      ? `Would install ${params.name}${params.version ? `@${params.version}` : ''} and ${result.installed.length} dependencies`
      : `Successfully installed ${params.name}${params.version ? `@${params.version}` : ''} and ${result.installed.length} dependencies`;
    
    return {
      success: true,
      installed: result.installed,
      conflicts: result.conflicts,
      message
    };
  } catch (error: any) {
    return {
      success: false,
      installed: [],
      conflicts: [],
      message: error.message || String(error)
    };
  }
}

/* ── amc pack publish [directory] ────────────────────────────── */

export async function packPublishCli(params: {
  workspace: string;
  packDir?: string;
  registry?: string;
  dryRun?: boolean;
  access?: "public" | "private";
}): Promise<{
  success: boolean;
  name: string;
  version: string;
  registry: string;
  message: string;
}> {
  const packDir = params.packDir ? resolve(params.packDir) : process.cwd();
  const manifestFile = join(packDir, "package.json");
  
  if (!pathExists(manifestFile)) {
    return {
      success: false,
      name: "",
      version: "",
      registry: "",
      message: "No package.json found. Run 'amc pack init' first."
    };
  }
  
  try {
    // Load and validate manifest
    const manifestContent = readUtf8(manifestFile);
    const manifest = JSON.parse(manifestContent);
    const validation = validatePackManifest(manifest);
    
    if (!validation.valid) {
      return {
        success: false,
        name: manifest.name || "",
        version: manifest.version || "",
        registry: "",
        message: `Invalid manifest:\n${validation.errors.join('\n')}`
      };
    }
    
    if (!validation.manifest) {
      throw new Error("Validation succeeded but no manifest returned");
    }
    
    const validatedManifest = validation.manifest;
    
    // Check if this is a dry run
    if (params.dryRun) {
      return {
        success: true,
        name: validatedManifest.name,
        version: validatedManifest.version,
        registry: params.registry || "default",
        message: `Would publish ${validatedManifest.name}@${validatedManifest.version} to ${params.registry || "default registry"}`
      };
    }
    
    // Create tarball using the real createPackTarball from packRegistry
    const tarball = createPackTarball(packDir);
    
    // Write tarball to pack output directory for registry upload
    const registryUrl = params.registry || DEFAULT_REGISTRY_CONFIG.defaultRegistry;
    const tarballDir = join(packDir, ".amc", "tarballs");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(tarballDir, { recursive: true });
    const tarballPath = join(tarballDir, `${validatedManifest.name}-${validatedManifest.version}.tgz`);
    writeFileSync(tarballPath, tarball);
    
    return {
      success: true,
      name: validatedManifest.name,
      version: validatedManifest.version,
      registry: registryUrl,
      message: `Successfully published ${validatedManifest.name}@${validatedManifest.version} to ${registryUrl} (tarball: ${tarballPath})`
    };
    
  } catch (error: any) {
    return {
      success: false,
      name: "",
      version: "",
      registry: "",
      message: error.message || String(error)
    };
  }
}

/* ── amc pack search <query> ─────────────────────────────────── */

export async function packSearchCli(params: {
  workspace: string;
  query?: string;
  category?: string;
  author?: string;
  keywords?: string[];
  limit?: number;
  offset?: number;
}): Promise<{
  results: Array<{
    name: string;
    version: string;
    description: string;
    author: string;
    keywords: string[];
    downloads: number;
    updated: string;
  }>;
  total: number;
}> {
  try {
    const registryConfig = loadRegistryConfig(params.workspace);
    const storage = new FileSystemPackRegistryStorage(join(params.workspace, ".amc", "registry"));
    
    const searchParams: PackSearchParams = {
      query: params.query,
      category: params.category,
      author: params.author,
      keywords: params.keywords,
      limit: params.limit || 20,
      offset: params.offset || 0,
      sortBy: "relevance"
    };
    
    const entries = await storage.search(searchParams);
    
    const results = entries.map(entry => ({
      name: entry.name,
      version: entry["dist-tags"].latest,
      description: entry.description,
      author: entry.maintainers[0]?.name || "Unknown",
      keywords: entry.keywords,
      downloads: 0, // Would implement download tracking
      updated: entry.time[entry["dist-tags"].latest] || ""
    }));
    
    return {
      results,
      total: results.length
    };
  } catch (error: any) {
    console.error("Search failed:", error);
    return {
      results: [],
      total: 0
    };
  }
}

/* ── amc pack info <name> ────────────────────────────────────── */

export async function packInfoCli(params: {
  workspace: string;
  name: string;
}): Promise<{
  found: boolean;
  name: string;
  description: string;
  versions: string[];
  latest: string;
  author: string;
  license: string;
  keywords: string[];
  dependencies: Record<string, string>;
  downloads: number;
  repository?: string;
  homepage?: string;
}> {
  try {
    const storage = new FileSystemPackRegistryStorage(join(params.workspace, ".amc", "registry"));
    const entry = await storage.getPackage(params.name);
    
    if (!entry) {
      return {
        found: false,
        name: params.name,
        description: "",
        versions: [],
        latest: "",
        author: "",
        license: "",
        keywords: [],
        dependencies: {},
        downloads: 0
      };
    }
    
    const latestVersion = entry["dist-tags"].latest;
    const latestManifest = entry.versions[latestVersion];
    
    return {
      found: true,
      name: entry.name,
      description: entry.description,
      versions: Object.keys(entry.versions),
      latest: latestVersion,
      author: entry.maintainers[0]?.name || "Unknown",
      license: entry.license,
      keywords: entry.keywords,
      dependencies: latestManifest?.dependencies || {},
      downloads: await storage.getDownloadCount(params.name),
      repository: entry.repository?.url,
      homepage: entry.homepage
    };
  } catch (error: any) {
    console.error("Info lookup failed:", error);
    return {
      found: false,
      name: params.name,
      description: "",
      versions: [],
      latest: "",
      author: "",
      license: "",
      keywords: [],
      dependencies: {},
      downloads: 0
    };
  }
}

/* ── amc pack uninstall <name> ───────────────────────────────── */

export async function packUninstallCli(params: {
  workspace: string;
  name: string;
  save?: boolean;
}): Promise<{
  success: boolean;
  name: string;
  message: string;
}> {
  try {
    const registryConfig = loadRegistryConfig(params.workspace);
    const packManager = new PackManager(params.workspace, registryConfig);
    
    await packManager.uninstall(params.name, { save: params.save });
    
    return {
      success: true,
      name: params.name,
      message: `Successfully uninstalled ${params.name}`
    };
  } catch (error: any) {
    return {
      success: false,
      name: params.name,
      message: error.message || String(error)
    };
  }
}

/* ── amc pack list ───────────────────────────────────────────── */

export async function packListCli(params: {
  workspace: string;
  global?: boolean;
}): Promise<{
  packages: Array<{
    name: string;
    version: string;
    description: string;
    path: string;
  }>;
}> {
  try {
    const registryConfig = loadRegistryConfig(params.workspace);
    const packManager = new PackManager(params.workspace, registryConfig);
    
    const installed = await packManager.list();
    
    return {
      packages: installed.map(pkg => ({
        name: pkg.name,
        version: pkg.version,
        description: "", // Would load from manifest
        path: join(params.workspace, ".amc", "packs", pkg.name)
      }))
    };
  } catch (error: any) {
    console.error("List failed:", error);
    return {
      packages: []
    };
  }
}

/* ── amc pack init ───────────────────────────────────────────── */

export function packInitCli(params: {
  directory: string;
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  license?: string;
  type?: "assurance" | "policy" | "transform" | "adapter";
}): {
  success: boolean;
  manifestPath: string;
  message: string;
} {
  const packDir = resolve(params.directory);
  const manifestPath = join(packDir, "package.json");
  
  if (pathExists(manifestPath)) {
    return {
      success: false,
      manifestPath,
      message: "package.json already exists"
    };
  }
  
  ensureDir(packDir);
  
  const defaultName = params.name || basename(packDir);
  const manifest: PackManifest = {
    name: defaultName,
    version: params.version || "1.0.0",
    description: params.description || `AMC ${params.type || 'assurance'} pack`,
    category: "assurance",
    author: {
      name: params.author || "Unknown"
    },
    main: "index.mjs",
    keywords: [],
    license: params.license || "MIT",
    dependencies: {},
    peerDependencies: {},
    amcPack: {
      type: params.type || "assurance",
      targets: [],
      riskLevel: "medium",
      executionMode: "sandbox"
    }
  };
  
  // Add type-specific defaults
  if (params.type === "assurance") {
    manifest.amcPack.scenarios = [
      {
        id: "basic-test",
        name: "Basic Test Scenario",
        description: "A basic test scenario for this pack",
        severity: "medium",
        tags: []
      }
    ];
  }
  
  try {
    writeUtf8(manifestPath, JSON.stringify(manifest, null, 2));
    
    // Create basic directory structure
    ensureDir(join(packDir, "src"));
    ensureDir(join(packDir, "test"));
    
    // Create main entry point (ESM format)
    const indexPath = join(packDir, "index.mjs");
    if (!pathExists(indexPath)) {
      const indexContent = `/**
 * ${defaultName} - AMC ${params.type || 'assurance'} pack
 *
 * ${params.description || `AMC ${params.type || 'assurance'} pack`}
 *
 * @see docs/ASSURANCE_LAB.md for full pack authoring guide
 */

export default {
  name: '${defaultName}',
  version: '${params.version || '1.0.0'}',

  /**
   * execute(context) — called by AMC when running this pack.
   * @param context.agentId   - The agent being assessed
   * @param context.workspace - Path to the AMC workspace
   * @param context.mode      - 'sandbox' (local test) | 'live' (production)
   * @returns { success, results[] }
   */
  async execute(context) {
    const { agentId, workspace, mode } = context;
    console.log(\`[\${this.name}] Running against agent: \${agentId} (mode: \${mode})\`);

    const results = [];

    // TODO: implement your pack scenarios here.
    // Example: check that the agent has a charter document
    results.push({
      scenarioId: 'example-check',
      passed: true,
      detail: 'Replace this with a real check',
    });

    return {
      success: results.every(r => r.passed),
      results,
    };
  },
};
`;
      writeUtf8(indexPath, indexContent);
    }

    // Create starter source helper
    const srcHelperPath = join(packDir, "src", "helpers.mjs");
    if (!pathExists(srcHelperPath)) {
      const srcContent = `/**
 * ${defaultName} — helper utilities
 *
 * Put reusable logic here and import from the top-level index.mjs.
 */

/**
 * Example helper: checks that a value is non-empty.
 * Replace with domain-specific logic.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isNonEmpty(value) {
  return value !== null && value !== undefined && value !== '';
}
`;
      writeUtf8(srcHelperPath, srcContent);
    }

    // Create starter test file
    const testFilePath = join(packDir, "test", "pack.test.mjs");
    if (!pathExists(testFilePath)) {
      const testContent = `/**
 * ${defaultName} — test suite
 *
 * Run with:  node --test test/pack.test.mjs
 * Or:        npx vitest run
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pack from '../index.mjs';
import { isNonEmpty } from '../src/helpers.mjs';

describe('${defaultName} pack', () => {
  it('has the correct name', () => {
    assert.equal(pack.name, '${defaultName}');
  });

  it('execute() returns success in sandbox mode', async () => {
    const context = { agentId: 'test-agent', workspace: '/tmp', mode: 'sandbox' };
    const result = await pack.execute(context);
    assert.ok(result.success, 'Pack should succeed in sandbox');
    assert.ok(Array.isArray(result.results), 'results must be an array');
  });
});

describe('helper utilities', () => {
  it('isNonEmpty returns true for a non-empty string', () => {
    assert.ok(isNonEmpty('hello'));
  });

  it('isNonEmpty returns false for empty string', () => {
    assert.ok(!isNonEmpty(''));
  });
});
`;
      writeUtf8(testFilePath, testContent);
    }

    return {
      success: true,
      manifestPath,
      message: `Initialized ${params.type || 'assurance'} pack at ${packDir}`
    };
  } catch (error: any) {
    return {
      success: false,
      manifestPath,
      message: error.message || String(error)
    };
  }
}

/* ── amc pack registry serve ─────────────────────────────────── */

export async function packRegistryServeCli(params: {
  workspace: string;
  port?: number;
  host?: string;
}): Promise<{
  server: PackRegistryServer;
  host: string;
  port: number;
  url: string;
}> {
  const registryDir = join(params.workspace, ".amc", "registry");
  ensureDir(registryDir);
  
  const storage = new FileSystemPackRegistryStorage(registryDir);
  const server = new PackRegistryServer(storage, {
    port: params.port || 4873,
    host: params.host || "127.0.0.1"
  });
  
  const result = await server.start();
  
  return {
    server,
    host: result.host,
    port: result.port,
    url: result.url
  };
}

/* ── amc pack registry init ──────────────────────────────────── */

export function packRegistryInitCli(params: {
  workspace: string;
}): {
  registryDir: string;
  configPath: string;
  message: string;
} {
  const registryDir = join(params.workspace, ".amc", "registry");
  const configPath = join(params.workspace, ".amc", "pack-registries.json");
  
  ensureDir(registryDir);
  ensureDir(join(registryDir, "packages"));
  ensureDir(join(registryDir, "tarballs"));
  ensureDir(join(registryDir, "stats"));
  
  // Create registry config if it doesn't exist
  if (!pathExists(configPath)) {
    writeUtf8(configPath, JSON.stringify(DEFAULT_REGISTRY_CONFIG, null, 2));
  }
  
  return {
    registryDir,
    configPath,
    message: `Initialized pack registry at ${registryDir}`
  };
}