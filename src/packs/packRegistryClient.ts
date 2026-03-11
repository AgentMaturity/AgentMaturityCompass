/**
 * packs/packRegistryClient.ts — Client for interacting with AMC Pack Registries
 *
 * Provides NPM-style registry operations: search, fetch, publish, install.
 * Supports multiple registries with priority-based resolution and caching.
 */

import { createHash } from "node:crypto";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import type {
  PackManifest,
  PackRegistryEntry,
  PackSearchParams,
  PackRegistryConfig,
  PackValidationResult
} from "./packTypes.js";
import { packManifestSchema, packRegistryEntrySchema } from "./packTypes.js";
import { ensureDir, pathExists, readUtf8, writeUtf8 } from "../utils/fs.js";

/* ── Registry client class ────────────────────────────────────── */

export class PackRegistryClient {
  private config: PackRegistryConfig;
  private cacheDir: string;

  constructor(config: PackRegistryConfig, cacheDir: string) {
    this.config = config;
    this.cacheDir = cacheDir;
    ensureDir(cacheDir);
  }

  /* ── Search packs across all registries ─────────────────────── */
  
  async search(params: PackSearchParams): Promise<{
    packages: Array<{
      name: string;
      version: string;
      description: string;
      author: string;
      keywords: string[];
      downloads: number;
      registry: string;
    }>;
    total: number;
  }> {
    const results: any[] = [];
    
    // Search each registry in priority order
    const sortedRegistries = [...this.config.registries].sort((a, b) => b.priority - a.priority);
    
    for (const registry of sortedRegistries) {
      try {
        const registryResults = await this.searchRegistry(registry.url, params);
        results.push(...registryResults.map(r => ({ ...r, registry: registry.name })));
      } catch (error) {
        console.warn(`Failed to search registry ${registry.name}: ${error}`);
      }
    }

    // Deduplicate by package name, preferring higher priority registries
    const seen = new Set<string>();
    const deduped = results.filter(pkg => {
      if (seen.has(pkg.name)) return false;
      seen.add(pkg.name);
      return true;
    });

    // Apply sorting
    const sorted = this.sortSearchResults(deduped, params.sortBy);
    
    // Apply pagination
    const start = params.offset || 0;
    const end = start + (params.limit || 20);
    
    return {
      packages: sorted.slice(start, end),
      total: sorted.length
    };
  }

  /* ── Fetch package metadata ─────────────────────────────────── */
  
  async fetchPackage(name: string, version?: string): Promise<PackRegistryEntry | null> {
    // Try each registry in priority order
    const sortedRegistries = [...this.config.registries].sort((a, b) => b.priority - a.priority);
    
    for (const registry of sortedRegistries) {
      try {
        const cacheKey = `${registry.name}/${name}`;
        const cached = this.getCachedEntry(cacheKey);
        
        if (cached && !this.isCacheExpired(cached.timestamp)) {
          return cached.data;
        }

        const entry = await this.fetchFromRegistry(registry.url, name, registry.auth);
        if (entry) {
          this.setCachedEntry(cacheKey, entry);
          return entry;
        }
      } catch (error) {
        console.warn(`Failed to fetch ${name} from ${registry.name}: ${error}`);
      }
    }
    
    return null;
  }

  /* ── Download package tarball ───────────────────────────────── */
  
  async downloadPackage(name: string, version: string): Promise<{
    tarball: Buffer;
    integrity: string;
    manifest: PackManifest;
  }> {
    const entry = await this.fetchPackage(name);
    if (!entry || !entry.versions[version]) {
      throw new Error(`Package ${name}@${version} not found`);
    }

    const versionData = entry.versions[version];
    const tarballUrl = this.getTarballUrl(name, version);
    
    // Download tarball
    const response = await fetch(tarballUrl);
    if (!response.ok) {
      throw new Error(`Failed to download ${name}@${version}: ${response.statusText}`);
    }
    
    const tarball = Buffer.from(await response.arrayBuffer());
    
    // Verify integrity
    const integrity = createHash('sha256').update(tarball).digest('hex');
    if (versionData._registry?.integrity && versionData._registry.integrity !== integrity) {
      throw new Error(`Integrity check failed for ${name}@${version}`);
    }

    return {
      tarball,
      integrity,
      manifest: versionData
    };
  }

  /* ── Publish package ─────────────────────────────────────────── */
  
  async publishPackage(
    manifest: PackManifest,
    tarball: Buffer,
    options: {
      registry?: string;
      token?: string;
      dryRun?: boolean;
    } = {}
  ): Promise<{
    success: boolean;
    version: string;
    registry: string;
    message: string;
  }> {
    const registryUrl = options.registry || this.config.defaultRegistry;
    const registry = this.config.registries.find(r => r.url === registryUrl);
    
    if (!registry) {
      throw new Error(`Registry ${registryUrl} not configured`);
    }

    // Validate manifest
    const validation = this.validateManifest(manifest);
    if (!validation.valid) {
      throw new Error(`Invalid manifest: ${validation.errors.join(', ')}`);
    }

    if (options.dryRun) {
      return {
        success: true,
        version: manifest.version,
        registry: registry.name,
        message: `[DRY RUN] Would publish ${manifest.name}@${manifest.version} to ${registry.name}`
      };
    }

    // Calculate integrity
    const integrity = createHash('sha256').update(tarball).digest('hex');
    
    // Add registry metadata
    const publishManifest = {
      ...manifest,
      _registry: {
        publishedAt: Date.now(),
        publishedBy: 'cli-user', // TODO: Get from auth context
        downloads: 0,
        integrity
      }
    };

    // Prepare publish payload
    const payload = {
      name: manifest.name,
      version: manifest.version,
      manifest: publishManifest,
      tarball: tarball.toString('base64')
    };

    // Make publish request
    const response = await fetch(`${registryUrl}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${options.token || registry.auth?.token || ''}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Publish failed: ${error}`);
    }

    const result = await response.json();
    
    return {
      success: true,
      version: manifest.version,
      registry: registry.name,
      message: `Published ${manifest.name}@${manifest.version} to ${registry.name}`
    };
  }

  /* ── Private helper methods ──────────────────────────────────── */

  private async searchRegistry(registryUrl: string, params: PackSearchParams) {
    const searchUrl = new URL('/search', registryUrl);
    
    // Add search parameters
    if (params.query) searchUrl.searchParams.set('q', params.query);
    if (params.category) searchUrl.searchParams.set('category', params.category);
    if (params.author) searchUrl.searchParams.set('author', params.author);
    if (params.keywords) searchUrl.searchParams.set('keywords', params.keywords.join(','));
    if (params.riskLevel) searchUrl.searchParams.set('risk', params.riskLevel);
    searchUrl.searchParams.set('limit', String(params.limit || 20));
    searchUrl.searchParams.set('offset', String(params.offset || 0));

    const response = await fetch(searchUrl.toString());
    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.packages || [];
  }

  private async fetchFromRegistry(
    registryUrl: string, 
    name: string, 
    auth?: { token?: string; username?: string; password?: string }
  ): Promise<PackRegistryEntry | null> {
    const packageUrl = `${registryUrl}/${encodeURIComponent(name)}`;
    
    const headers: Record<string, string> = {};
    if (auth?.token) {
      headers['Authorization'] = `Bearer ${auth.token}`;
    } else if (auth?.username && auth?.password) {
      const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    const response = await fetch(packageUrl, { headers });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch package: ${response.statusText}`);
    }

    const data = await response.json();
    return packRegistryEntrySchema.parse(data);
  }

  private getTarballUrl(name: string, version: string): string {
    // Use default registry for tarball downloads
    return `${this.config.defaultRegistry}/${encodeURIComponent(name)}/-/${encodeURIComponent(name)}-${version}.tgz`;
  }

  private validateManifest(manifest: PackManifest): PackValidationResult {
    try {
      packManifestSchema.parse(manifest);
      return {
        valid: true,
        errors: [],
        warnings: [],
        manifest
      };
    } catch (error: any) {
      return {
        valid: false,
        errors: error.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`) || [String(error)],
        warnings: []
      };
    }
  }

  private sortSearchResults(results: any[], sortBy: string) {
    switch (sortBy) {
      case 'downloads':
        return results.sort((a, b) => b.downloads - a.downloads);
      case 'updated':
        return results.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
      case 'name':
        return results.sort((a, b) => a.name.localeCompare(b.name));
      case 'relevance':
      default:
        return results; // Already sorted by registry priority
    }
  }

  private getCachedEntry(key: string): { data: PackRegistryEntry; timestamp: number } | null {
    const cachePath = join(this.cacheDir, `${key.replace('/', '_')}.json`);
    if (!pathExists(cachePath)) return null;
    
    try {
      const cached = JSON.parse(readUtf8(cachePath));
      return {
        data: packRegistryEntrySchema.parse(cached.data),
        timestamp: cached.timestamp
      };
    } catch {
      return null;
    }
  }

  private setCachedEntry(key: string, data: PackRegistryEntry): void {
    const cachePath = join(this.cacheDir, `${key.replace('/', '_')}.json`);
    const cached = {
      data,
      timestamp: Date.now()
    };
    
    try {
      writeUtf8(cachePath, JSON.stringify(cached, null, 2));
    } catch (error) {
      console.warn(`Failed to cache entry ${key}: ${error}`);
    }
  }

  private isCacheExpired(timestamp: number): boolean {
    const ttlMs = this.config.cache.ttl * 1000;
    return Date.now() - timestamp > ttlMs;
  }
}

/* ── Factory function ─────────────────────────────────────────── */

export function createPackRegistryClient(
  config: PackRegistryConfig,
  cacheDir: string
): PackRegistryClient {
  return new PackRegistryClient(config, cacheDir);
}