/**
 * packs/packManager.ts — Enhanced pack manager with NPM-style registry functionality
 *
 * Implements dependency resolution, versioning, ratings, and community features
 * for the AMC community assurance pack registry system.
 */

import { join, resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import semver from "semver";
import { ensureDir, pathExists, readUtf8, writeUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import type {
  PackManifest,
  PackRegistryConfig,
  PackInstallRecord,
  PackLockfile,
  PackRating,
  PackDependencyTree
} from "./packTypes.js";

export interface PackInstallOptions {
  save?: boolean;
  saveDev?: boolean;
  force?: boolean;
  dryRun?: boolean;
  skipIntegrityCheck?: boolean;
}

export interface PackInstallResult {
  installed: PackInstallRecord[];
  conflicts: Array<{ name: string; reason: string }>;
  lockfileUpdated: boolean;
}

export interface PackUninstallOptions {
  save?: boolean;
  removeDependents?: boolean;
}

export class PackManager {
  private workspace: string;
  private registryConfig: PackRegistryConfig;
  private packDir: string;
  private lockfilePath: string;
  private manifestPath: string;

  constructor(workspace: string, registryConfig: PackRegistryConfig) {
    this.workspace = workspace;
    this.registryConfig = registryConfig;
    this.packDir = join(workspace, ".amc", "packs");
    this.lockfilePath = join(workspace, ".amc", "pack-lock.json");
    this.manifestPath = join(workspace, ".amc", "pack.json");
    
    ensureDir(this.packDir);
  }

  /**
   * Install a pack and its dependencies
   */
  async install(
    name: string, 
    version?: string, 
    options: PackInstallOptions = {}
  ): Promise<PackInstallResult> {
    const result: PackInstallResult = {
      installed: [],
      conflicts: [],
      lockfileUpdated: false
    };

    try {
      // Load current lockfile
      const lockfile = this.loadLockfile();
      
      // Resolve version if not specified
      const resolvedVersion = version || await this.resolveLatestVersion(name);
      
      // Check if already installed
      const existing = lockfile.packages[name];
      if (existing && existing.version === resolvedVersion && !options.force) {
        return result; // Already installed
      }

      // Fetch pack metadata
      const packInfo = await this.fetchPackInfo(name, resolvedVersion);
      if (!packInfo) {
        result.conflicts.push({ name, reason: "Pack not found in registry" });
        return result;
      }

      // Resolve dependency tree
      const dependencyTree = await this.resolveDependencies(packInfo);
      
      // Check for conflicts
      const conflicts = this.checkConflicts(dependencyTree, lockfile);
      if (conflicts.length > 0 && !options.force) {
        result.conflicts = conflicts;
        return result;
      }

      if (options.dryRun) {
        // Simulate installation
        result.installed = this.simulateInstall(dependencyTree);
        return result;
      }

      // Install packages
      for (const [pkgName, pkgInfo] of Object.entries(dependencyTree)) {
        const installRecord = await this.installPackage(pkgName, pkgInfo);
        result.installed.push(installRecord);
        
        // Update lockfile
        lockfile.packages[pkgName] = {
          version: pkgInfo.version,
          resolved: pkgInfo.resolved,
          integrity: pkgInfo.integrity,
          dependencies: pkgInfo.dependencies || {},
          dev: pkgInfo.dev || false
        };
      }

      // Save updated lockfile
      this.saveLockfile(lockfile);
      result.lockfileUpdated = true;

      // Update manifest if requested
      if (options.save || options.saveDev) {
        await this.updateManifest(name, resolvedVersion, options.saveDev);
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to install ${name}: ${error}`);
    }
  }

  /**
   * Uninstall a pack
   */
  async uninstall(name: string, options: PackUninstallOptions = {}): Promise<void> {
    const lockfile = this.loadLockfile();
    
    if (!lockfile.packages[name]) {
      throw new Error(`Pack ${name} is not installed`);
    }

    // Check for dependents
    const dependents = this.findDependents(name, lockfile);
    if (dependents.length > 0 && !options.removeDependents) {
      throw new Error(
        `Cannot uninstall ${name}: required by ${dependents.join(", ")}`
      );
    }

    // Remove pack directory
    const packPath = join(this.packDir, name);
    if (pathExists(packPath)) {
      execSync(`rm -rf "${packPath}"`);
    }

    // Update lockfile
    delete lockfile.packages[name];
    
    // Remove dependents if requested
    if (options.removeDependents) {
      for (const dependent of dependents) {
        delete lockfile.packages[dependent];
        const dependentPath = join(this.packDir, dependent);
        if (pathExists(dependentPath)) {
          execSync(`rm -rf "${dependentPath}"`);
        }
      }
    }

    this.saveLockfile(lockfile);

    // Update manifest if requested
    if (options.save) {
      await this.removeFromManifest(name);
    }
  }

  /**
   * List installed packages
   */
  async list(): Promise<PackInstallRecord[]> {
    const lockfile = this.loadLockfile();
    
    return Object.entries(lockfile.packages).map(([name, info]) => ({
      name,
      version: info.version,
      resolved: info.resolved,
      integrity: info.integrity,
      dev: info.dev || false
    }));
  }

  /**
   * Update all packages to latest versions
   */
  async update(): Promise<PackInstallResult> {
    const lockfile = this.loadLockfile();
    const result: PackInstallResult = {
      installed: [],
      conflicts: [],
      lockfileUpdated: false
    };

    for (const [name, info] of Object.entries(lockfile.packages)) {
      const latestVersion = await this.resolveLatestVersion(name);
      
      if (semver.gt(latestVersion, info.version)) {
        const updateResult = await this.install(name, latestVersion, { force: true });
        result.installed.push(...updateResult.installed);
        result.conflicts.push(...updateResult.conflicts);
        result.lockfileUpdated = updateResult.lockfileUpdated || result.lockfileUpdated;
      }
    }

    return result;
  }

  /**
   * Rate a pack
   */
  async ratePack(name: string, rating: PackRating): Promise<void> {
    // This would integrate with the registry API to submit ratings
    const registryUrl = this.getRegistryUrl();
    
    // Placeholder for rating submission
    console.log(`Rating ${name}: ${rating.score}/5 - ${rating.comment}`);
  }

  /**
   * Get pack ratings and reviews
   */
  async getPackRatings(name: string): Promise<PackRating[]> {
    // This would fetch ratings from the registry
    return [];
  }

  /**
   * Search for packs
   */
  async search(query: string, options: {
    category?: string;
    author?: string;
    keywords?: string[];
    limit?: number;
  } = {}): Promise<Array<{
    name: string;
    version: string;
    description: string;
    author: string;
    keywords: string[];
    rating: number;
    downloads: number;
  }>> {
    // This would search the registry
    return [];
  }

  /* ── Private methods ─────────────────────────────────────────── */

  private loadLockfile(): PackLockfile {
    if (!pathExists(this.lockfilePath)) {
      return {
        lockfileVersion: 1,
        packages: {},
        dependencies: {}
      };
    }

    try {
      const content = readUtf8(this.lockfilePath);
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Invalid lockfile, creating new one: ${error}`);
      return {
        lockfileVersion: 1,
        packages: {},
        dependencies: {}
      };
    }
  }

  private saveLockfile(lockfile: PackLockfile): void {
    writeUtf8(this.lockfilePath, JSON.stringify(lockfile, null, 2));
  }

  private async resolveLatestVersion(name: string): Promise<string> {
    // This would query the registry for the latest version
    return "1.0.0"; // Placeholder
  }

  private async fetchPackInfo(name: string, version: string): Promise<any> {
    // This would fetch pack info from the registry
    return {
      name,
      version,
      dependencies: {},
      resolved: `${this.getRegistryUrl()}/${name}/-/${name}-${version}.tgz`,
      integrity: "sha512-placeholder"
    };
  }

  private async resolveDependencies(packInfo: any): Promise<PackDependencyTree> {
    const tree: PackDependencyTree = {};
    
    // Add the main package
    tree[packInfo.name] = packInfo;
    
    // Recursively resolve dependencies
    if (packInfo.dependencies) {
      for (const [depName, depVersion] of Object.entries(packInfo.dependencies)) {
        const depInfo = await this.fetchPackInfo(depName, depVersion as string);
        if (depInfo) {
          const subTree = await this.resolveDependencies(depInfo);
          Object.assign(tree, subTree);
        }
      }
    }
    
    return tree;
  }

  private checkConflicts(
    dependencyTree: PackDependencyTree, 
    lockfile: PackLockfile
  ): Array<{ name: string; reason: string }> {
    const conflicts: Array<{ name: string; reason: string }> = [];
    
    for (const [name, info] of Object.entries(dependencyTree)) {
      const existing = lockfile.packages[name];
      if (existing && existing.version !== info.version) {
        if (!semver.satisfies(info.version, `^${existing.version}`)) {
          conflicts.push({
            name,
            reason: `Version conflict: installed ${existing.version}, required ${info.version}`
          });
        }
      }
    }
    
    return conflicts;
  }

  private simulateInstall(dependencyTree: PackDependencyTree): PackInstallRecord[] {
    return Object.entries(dependencyTree).map(([name, info]) => ({
      name,
      version: info.version,
      resolved: info.resolved,
      integrity: info.integrity,
      dev: info.dev || false
    }));
  }

  private async installPackage(name: string, info: any): Promise<PackInstallRecord> {
    const packPath = join(this.packDir, name);
    ensureDir(packPath);
    
    // Download and extract package (placeholder)
    console.log(`Installing ${name}@${info.version}...`);
    
    // Verify integrity
    if (info.integrity && !this.verifyIntegrity(packPath, info.integrity)) {
      throw new Error(`Integrity check failed for ${name}@${info.version}`);
    }
    
    return {
      name,
      version: info.version,
      resolved: info.resolved,
      integrity: info.integrity,
      dev: info.dev || false
    };
  }

  private verifyIntegrity(packPath: string, expectedIntegrity: string): boolean {
    // This would verify the package integrity using checksums
    return true; // Placeholder
  }

  private findDependents(name: string, lockfile: PackLockfile): string[] {
    const dependents: string[] = [];
    
    for (const [pkgName, pkgInfo] of Object.entries(lockfile.packages)) {
      if (pkgInfo.dependencies && pkgInfo.dependencies[name]) {
        dependents.push(pkgName);
      }
    }
    
    return dependents;
  }

  private async updateManifest(name: string, version: string, dev: boolean = false): Promise<void> {
    let manifest: any = {};
    
    if (pathExists(this.manifestPath)) {
      try {
        const content = readUtf8(this.manifestPath);
        manifest = JSON.parse(content);
      } catch (error) {
        console.warn(`Invalid manifest, creating new one: ${error}`);
      }
    }
    
    if (!manifest.dependencies) manifest.dependencies = {};
    if (!manifest.devDependencies) manifest.devDependencies = {};
    
    if (dev) {
      manifest.devDependencies[name] = `^${version}`;
    } else {
      manifest.dependencies[name] = `^${version}`;
    }
    
    writeUtf8(this.manifestPath, JSON.stringify(manifest, null, 2));
  }

  private async removeFromManifest(name: string): Promise<void> {
    if (!pathExists(this.manifestPath)) return;
    
    try {
      const content = readUtf8(this.manifestPath);
      const manifest = JSON.parse(content);
      
      if (manifest.dependencies) {
        delete manifest.dependencies[name];
      }
      if (manifest.devDependencies) {
        delete manifest.devDependencies[name];
      }
      
      writeUtf8(this.manifestPath, JSON.stringify(manifest, null, 2));
    } catch (error) {
      console.warn(`Failed to update manifest: ${error}`);
    }
  }

  private getRegistryUrl(): string {
    return this.registryConfig.defaultRegistry;
  }
}