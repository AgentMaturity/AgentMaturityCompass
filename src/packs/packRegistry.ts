/**
 * packs/packRegistry.ts — NPM-style registry for community assurance packs
 *
 * Implements the core registry functionality for publishing, installing, and managing
 * community assurance packs with versioning, ratings, and dependency resolution.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { URL } from "node:url";
import type {
  PackManifest,
  PackRegistryEntry,
  PackInstallRecord,
  PackLock,
  PackSearchParams,
  PackValidationResult
} from "./packTypes.js";
import {
  packManifestSchema,
  packRegistryEntrySchema,
  packLockSchema,
  packSearchParamsSchema
} from "./packTypes.js";
import { ensureDir, pathExists, readUtf8, writeUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { getPrivateKeyPem, signHexDigest, verifyHexDigest } from "../crypto/keys.js";

/* ── Registry storage interface ──────────────────────────────── */

export interface PackRegistryStorage {
  // Package metadata
  getPackage(name: string): Promise<PackRegistryEntry | null>;
  setPackage(name: string, entry: PackRegistryEntry): Promise<void>;
  deletePackage(name: string): Promise<void>;
  listPackages(): Promise<string[]>;
  
  // Package tarballs
  getTarball(name: string, version: string): Promise<Buffer | null>;
  setTarball(name: string, version: string, tarball: Buffer): Promise<void>;
  deleteTarball(name: string, version: string): Promise<void>;
  
  // Search and metadata
  search(params: PackSearchParams): Promise<PackRegistryEntry[]>;
  getDownloadCount(name: string, version?: string): Promise<number>;
  incrementDownloadCount(name: string, version: string): Promise<void>;
}

/* ── File system storage implementation ──────────────────────── */

export class FileSystemPackRegistryStorage implements PackRegistryStorage {
  private registryDir: string;
  private packagesDir: string;
  private tarballsDir: string;

  constructor(registryDir: string) {
    this.registryDir = registryDir;
    this.packagesDir = join(registryDir, "packages");
    this.tarballsDir = join(registryDir, "tarballs");
    
    ensureDir(this.packagesDir);
    ensureDir(this.tarballsDir);
  }

  async getPackage(name: string): Promise<PackRegistryEntry | null> {
    const packageFile = join(this.packagesDir, `${name}.json`);
    if (!pathExists(packageFile)) {
      return null;
    }
    
    try {
      const content = readUtf8(packageFile);
      const parsed = JSON.parse(content);
      return packRegistryEntrySchema.parse(parsed);
    } catch {
      return null;
    }
  }

  async setPackage(name: string, entry: PackRegistryEntry): Promise<void> {
    const packageFile = join(this.packagesDir, `${name}.json`);
    const validated = packRegistryEntrySchema.parse(entry);
    writeUtf8(packageFile, JSON.stringify(validated, null, 2));
  }

  async deletePackage(name: string): Promise<void> {
    const packageFile = join(this.packagesDir, `${name}.json`);
    if (pathExists(packageFile)) {
      require("fs").unlinkSync(packageFile);
    }
  }

  async listPackages(): Promise<string[]> {
    if (!pathExists(this.packagesDir)) {
      return [];
    }
    
    return readdirSync(this.packagesDir)
      .filter(file => file.endsWith('.json'))
      .map(file => file.slice(0, -5)); // Remove .json extension
  }

  async getTarball(name: string, version: string): Promise<Buffer | null> {
    const tarballFile = join(this.tarballsDir, name, `${version}.tgz`);
    if (!pathExists(tarballFile)) {
      return null;
    }
    
    try {
      return readFileSync(tarballFile);
    } catch {
      return null;
    }
  }

  async setTarball(name: string, version: string, tarball: Buffer): Promise<void> {
    const tarballDir = join(this.tarballsDir, name);
    ensureDir(tarballDir);
    
    const tarballFile = join(tarballDir, `${version}.tgz`);
    writeFileSync(tarballFile, tarball);
  }

  async deleteTarball(name: string, version: string): Promise<void> {
    const tarballFile = join(this.tarballsDir, name, `${version}.tgz`);
    if (pathExists(tarballFile)) {
      require("fs").unlinkSync(tarballFile);
    }
  }

  async search(params: PackSearchParams): Promise<PackRegistryEntry[]> {
    const validated = packSearchParamsSchema.parse(params);
    const packages = await this.listPackages();
    const results: PackRegistryEntry[] = [];

    for (const packageName of packages) {
      const entry = await this.getPackage(packageName);
      if (!entry) continue;

      // Apply filters
      if (validated.query && !this.matchesQuery(entry, validated.query)) {
        continue;
      }
      
      if (validated.category && !this.matchesCategory(entry, validated.category)) {
        continue;
      }
      
      if (validated.author && !this.matchesAuthor(entry, validated.author)) {
        continue;
      }
      
      if (validated.keywords && !this.matchesKeywords(entry, validated.keywords)) {
        continue;
      }

      results.push(entry);
    }

    // Sort results
    this.sortResults(results, validated.sortBy ?? 'name');

    // Apply pagination
    const start = validated.offset ?? 0;
    const end = start + (validated.limit ?? 20);
    return results.slice(start, end);
  }

  async getDownloadCount(name: string, version?: string): Promise<number> {
    // Simple implementation - could be enhanced with proper analytics
    const statsFile = join(this.registryDir, "stats", `${name}.json`);
    if (!pathExists(statsFile)) {
      return 0;
    }
    
    try {
      const stats = JSON.parse(readUtf8(statsFile)) as Record<string, number>;
      if (version) {
        return stats[version] || 0;
      }
      return Object.values(stats).reduce((sum, count) => sum + count, 0);
    } catch {
      return 0;
    }
  }

  async incrementDownloadCount(name: string, version: string): Promise<void> {
    const statsDir = join(this.registryDir, "stats");
    ensureDir(statsDir);
    
    const statsFile = join(statsDir, `${name}.json`);
    let stats: Record<string, number> = {};
    
    if (pathExists(statsFile)) {
      try {
        stats = JSON.parse(readUtf8(statsFile));
      } catch {
        // Ignore parse errors, start fresh
      }
    }
    
    stats[version] = (stats[version] || 0) + 1;
    writeUtf8(statsFile, JSON.stringify(stats, null, 2));
  }

  private matchesQuery(entry: PackRegistryEntry, query: string): boolean {
    const searchText = `${entry.name} ${entry.description} ${entry.keywords.join(' ')}`.toLowerCase();
    return searchText.includes(query.toLowerCase());
  }

  private matchesCategory(entry: PackRegistryEntry, category: string): boolean {
    // Extract category from latest version manifest
    const latestVersion = entry["dist-tags"].latest;
    if (!latestVersion || !entry.versions[latestVersion]) {
      return false;
    }
    
    const manifest = entry.versions[latestVersion];
    return manifest.amcPack?.type === category;
  }

  private matchesAuthor(entry: PackRegistryEntry, author: string): boolean {
    return entry.maintainers.some(m => 
      m.name.toLowerCase().includes(author.toLowerCase()) ||
      m.email.toLowerCase().includes(author.toLowerCase())
    );
  }

  private matchesKeywords(entry: PackRegistryEntry, keywords: string[]): boolean {
    return keywords.some(keyword => 
      entry.keywords.some(k => k.toLowerCase().includes(keyword.toLowerCase()))
    );
  }

  private sortResults(results: PackRegistryEntry[], sortBy: string): void {
    switch (sortBy) {
      case "name":
        results.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "downloads":
        // Would need to implement download tracking
        break;
      case "updated":
        results.sort((a, b) => {
          const aTime = Math.max(...Object.values(a.time).map(t => new Date(t).getTime()));
          const bTime = Math.max(...Object.values(b.time).map(t => new Date(t).getTime()));
          return bTime - aTime;
        });
        break;
      default:
        // Keep original order for relevance
        break;
    }
  }
}

/* ── Pack registry server ────────────────────────────────────── */

export class PackRegistryServer {
  private storage: PackRegistryStorage;
  private server: Server | null = null;
  private port: number;
  private host: string;

  constructor(storage: PackRegistryStorage, options: { port?: number; host?: string } = {}) {
    this.storage = storage;
    this.port = options.port || 4873;
    this.host = options.host || "127.0.0.1";
  }

  async start(): Promise<{ host: string; port: number; url: string }> {
    return new Promise((resolve, reject) => {
      this.server = createServer(async (req, res) => {
        try {
          await this.handleRequest(req, res);
        } catch (error) {
          console.error("Registry server error:", error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      });

      this.server.listen(this.port, this.host, () => {
        const url = `http://${this.host}:${this.port}`;
        console.log(`Pack registry server listening on ${url}`);
        resolve({ host: this.host, port: this.port, url });
      });

      this.server.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: any, res: any): Promise<void> {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method?.toLowerCase();
    const pathname = url.pathname;

    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (method === "options") {
      res.statusCode = 200;
      res.end();
      return;
    }

    // Route requests
    if (method === "get" && pathname === "/") {
      await this.handleRegistryInfo(req, res);
    } else if (method === "get" && pathname === "/-/search") {
      await this.handleSearch(req, res);
    } else if (method === "get" && pathname.startsWith("/-/package/")) {
      await this.handlePackageInfo(req, res);
    } else if (method === "get" && pathname.includes("/-/")) {
      await this.handleTarballDownload(req, res);
    } else if (method === "put" && !pathname.includes("/-/")) {
      await this.handlePackagePublish(req, res);
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "Not found" }));
    }
  }

  private async handleRegistryInfo(req: any, res: any): Promise<void> {
    const packages = await this.storage.listPackages();
    const info = {
      name: "AMC Pack Registry",
      version: "1.0.0",
      packages: packages.length,
      uptime: process.uptime()
    };
    
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(info, null, 2));
  }

  private async handleSearch(req: any, res: any): Promise<void> {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const params: PackSearchParams = {
      query: url.searchParams.get("text") || undefined,
      limit: parseInt(url.searchParams.get("size") || "20"),
      offset: parseInt(url.searchParams.get("from") || "0")
    };

    const results = await this.storage.search(params);
    const response = {
      objects: results.map(entry => ({
        package: {
          name: entry.name,
          description: entry.description,
          keywords: entry.keywords,
          version: entry["dist-tags"].latest,
          date: entry.time[entry["dist-tags"].latest]
        }
      })),
      total: results.length
    };

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(response));
  }

  private async handlePackageInfo(req: any, res: any): Promise<void> {
    const packageName = req.url.split("/").pop();
    const entry = await this.storage.getPackage(packageName);
    
    if (!entry) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "Package not found" }));
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(entry, null, 2));
  }

  private async handleTarballDownload(req: any, res: any): Promise<void> {
    const parts = req.url.split("/");
    const filename = parts[parts.length - 1];
    const packageName = parts[parts.length - 2];
    const version = filename.replace(".tgz", "");

    const tarball = await this.storage.getTarball(packageName, version);
    if (!tarball) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "Tarball not found" }));
      return;
    }

    await this.storage.incrementDownloadCount(packageName, version);

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.end(tarball);
  }

  private async handlePackagePublish(req: any, res: any): Promise<void> {
    // Read request body
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    
    await new Promise<void>((resolve) => {
      req.on("end", resolve);
    });

    const body = Buffer.concat(chunks);
    let publishData: any;
    
    try {
      publishData = JSON.parse(body.toString());
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    // Extract package info
    const packageName = publishData.name;
    const version = publishData.version;
    const tarballData = publishData._attachments?.[`${packageName}-${version}.tgz`]?.data;

    if (!packageName || !version || !tarballData) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Missing required fields" }));
      return;
    }

    // Validate manifest
    try {
      packManifestSchema.parse(publishData);
    } catch (error: any) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid manifest", details: error.errors }));
      return;
    }

    // Store tarball
    const tarball = Buffer.from(tarballData, "base64");
    await this.storage.setTarball(packageName, version, tarball);

    // Update package entry
    let entry = await this.storage.getPackage(packageName);
    if (!entry) {
      entry = {
        name: packageName,
        versions: {},
        "dist-tags": { latest: version },
        time: {},
        maintainers: publishData.author ? [publishData.author] : [],
        description: publishData.description || "",
        keywords: publishData.keywords || [],
        license: publishData.license || "MIT"
      };
    }

    entry.versions[version] = publishData;
    entry.time[version] = new Date().toISOString();
    entry["dist-tags"].latest = version;

    await this.storage.setPackage(packageName, entry);

    res.statusCode = 201;
    res.end(JSON.stringify({ success: true, version }));
  }
}

/* ── Pack validation utilities ───────────────────────────────── */

export function validatePackManifest(manifest: unknown): PackValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const validated = packManifestSchema.parse(manifest);
    
    // Additional validation rules
    if (validated.amcPack.type === "assurance" && !validated.amcPack.scenarios) {
      warnings.push("Assurance packs should define scenarios");
    }
    
    if (validated.amcPack.riskLevel === "high" && validated.amcPack.executionMode !== "sandbox") {
      warnings.push("High risk packs should use sandbox execution mode");
    }

    if (errors.length === 0) {
      return {
        valid: true as const,
        warnings,
        manifest: validated,
        integrity: sha256Hex(JSON.stringify(validated))
      };
    }
    return {
      valid: false as const,
      errors,
      warnings,
    };
  } catch (error: any) {
    return {
      valid: false,
      errors: error.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`) || [error.message],
      warnings
    };
  }
}

export function createPackTarball(packDir: string): Buffer {
  if (!existsSync(packDir) || !statSync(packDir).isDirectory()) {
    throw new Error(`pack directory not found: ${packDir}`);
  }

  const result = spawnSync("tar", ["-czf", "-", "-C", packDir, "."], {
    encoding: null,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.status !== 0 || !result.stdout) {
    const errorText = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8")
      : String(result.stderr ?? "unknown tar error");
    throw new Error(`failed to create pack tarball: ${errorText.trim()}`);
  }

  return result.stdout;
}