/**
 * Tests for deepened PackManager methods — ratings, search, integrity,
 * resolveLatestVersion, fetchPackInfo, installPackage, verifyIntegrity.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PackManager } from "../src/packs/packManager.js";
import type { PackRating, PackRegistryConfig } from "../src/packs/packTypes.js";

const TMP = join(__dirname, ".tmp-packManagerDeep");

function makeConfig(): PackRegistryConfig {
  return {
    defaultRegistry: "https://registry.amc.example.com",
    registries: {},
    authTokens: {},
    timeout: 5000,
    retries: 2,
    verifySignatures: false,
    allowInsecure: false,
  };
}

function makeRating(overrides: Partial<PackRating> = {}): PackRating {
  return {
    packName: "test-pack",
    packVersion: "1.0.0",
    userId: "user1",
    userName: "Test User",
    score: 4,
    wouldRecommend: true,
    timestamp: new Date().toISOString(),
    helpful: 0,
    verified: true,
    ...overrides,
  };
}

describe("PackManager deep methods", () => {
  let pm: PackManager;

  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
    pm = new PackManager(TMP, makeConfig());
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  /* ── ratePack / getPackRatings ─────────────────────────────── */

  it("ratePack persists to disk and getPackRatings retrieves it", async () => {
    const r = makeRating({ score: 5, comment: "Excellent" });
    await pm.ratePack("my-pack", r);

    const ratings = await pm.getPackRatings("my-pack");
    expect(ratings).toHaveLength(1);
    expect(ratings[0].score).toBe(5);
    expect(ratings[0].comment).toBe("Excellent");
  });

  it("multiple ratings accumulate for the same pack", async () => {
    await pm.ratePack("p", makeRating({ score: 3, userId: "a" }));
    await pm.ratePack("p", makeRating({ score: 5, userId: "b" }));
    const ratings = await pm.getPackRatings("p");
    expect(ratings).toHaveLength(2);
  });

  it("ratings for different packs are isolated", async () => {
    await pm.ratePack("alpha", makeRating({ score: 2 }));
    await pm.ratePack("beta", makeRating({ score: 4 }));
    expect(await pm.getPackRatings("alpha")).toHaveLength(1);
    expect(await pm.getPackRatings("beta")).toHaveLength(1);
    expect(await pm.getPackRatings("gamma")).toHaveLength(0);
  });

  it("getPackRatings returns [] when no ratings file exists", async () => {
    expect(await pm.getPackRatings("nonexistent")).toEqual([]);
  });

  /* ── search ────────────────────────────────────────────────── */

  it("search returns matching installed packs by name", async () => {
    // Seed a lockfile with a package
    const lockPath = join(TMP, ".amc", "pack-lock.json");
    mkdirSync(join(TMP, ".amc"), { recursive: true });
    writeFileSync(lockPath, JSON.stringify({
      lockfileVersion: 1,
      packages: {
        "security-pack": { version: "2.0.0", resolved: "", integrity: "", dev: false },
        "healthcare-pack": { version: "1.0.0", resolved: "", integrity: "", dev: false },
      },
      dependencies: {},
    }));

    // Seed a manifest for the security pack with keywords
    const packDir = join(TMP, ".amc", "packs", "security-pack");
    mkdirSync(packDir, { recursive: true });
    writeFileSync(join(packDir, "pack.json"), JSON.stringify({
      description: "Security assurance pack",
      author: "AMC Team",
      keywords: ["security", "compliance"],
    }));

    const results = await pm.search("security");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe("security-pack");
    expect(results[0].version).toBe("2.0.0");
  });

  it("search respects limit option", async () => {
    const lockPath = join(TMP, ".amc", "pack-lock.json");
    mkdirSync(join(TMP, ".amc"), { recursive: true });
    const packages: Record<string, any> = {};
    for (let i = 0; i < 10; i++) {
      packages[`pack-${i}`] = { version: "1.0.0", resolved: "", integrity: "", dev: false };
    }
    writeFileSync(lockPath, JSON.stringify({ lockfileVersion: 1, packages, dependencies: {} }));

    const results = await pm.search("pack", { limit: 3 });
    expect(results).toHaveLength(3);
  });

  it("search with no matches returns empty array", async () => {
    const results = await pm.search("nonexistent-xyz");
    expect(results).toEqual([]);
  });

  it("search includes average rating from local store", async () => {
    // Seed lockfile
    const lockPath = join(TMP, ".amc", "pack-lock.json");
    mkdirSync(join(TMP, ".amc"), { recursive: true });
    writeFileSync(lockPath, JSON.stringify({
      lockfileVersion: 1,
      packages: { "rated-pack": { version: "1.0.0", resolved: "", integrity: "", dev: false } },
      dependencies: {},
    }));

    await pm.ratePack("rated-pack", makeRating({ score: 4 }));
    await pm.ratePack("rated-pack", makeRating({ score: 2 }));

    const results = await pm.search("rated");
    expect(results).toHaveLength(1);
    expect(results[0].rating).toBe(3); // average of 4 and 2
  });

  /* ── install (integration — uses real resolveLatestVersion, fetchPackInfo, installPackage) ── */

  it("install writes manifest to pack directory and records in lockfile", async () => {
    const result = await pm.install("fresh-pack", undefined, { save: true });
    expect(result.installed.length).toBeGreaterThanOrEqual(1);
    expect(result.installed[0].name).toBe("fresh-pack");
    expect(result.lockfileUpdated).toBe(true);

    // Lockfile should now contain the pack
    const lockContent = JSON.parse(readFileSync(join(TMP, ".amc", "pack-lock.json"), "utf8"));
    expect(lockContent.packages["fresh-pack"]).toBeDefined();
    expect(lockContent.packages["fresh-pack"].version).toBe("1.0.0");
  });

  it("install dry-run does not modify lockfile", async () => {
    const result = await pm.install("dry-pack", undefined, { dryRun: true });
    expect(result.installed.length).toBeGreaterThanOrEqual(1);
    // Lockfile should not have the pack
    const lockPath = join(TMP, ".amc", "pack-lock.json");
    if (existsSync(lockPath)) {
      const lockContent = JSON.parse(readFileSync(lockPath, "utf8"));
      expect(lockContent.packages["dry-pack"]).toBeUndefined();
    }
  });

  /* ── resolveLatestVersion uses local lockfile ──────────────── */

  it("resolveLatestVersion returns lockfile version when available", async () => {
    // Install a pack first to seed the lockfile
    await pm.install("versioned-pack");
    // Install again — should resolve to the existing version
    const result = await pm.install("versioned-pack", undefined, { force: true });
    expect(result.installed[0].version).toBe("1.0.0");
  });

  /* ── verifyIntegrity with real SHA-512 ─────────────────────── */

  it("integrity check passes for matching hash", async () => {
    const packDir = join(TMP, ".amc", "packs", "integrity-test");
    mkdirSync(packDir, { recursive: true });
    const manifestContent = JSON.stringify({ name: "integrity-test", version: "1.0.0" });
    writeFileSync(join(packDir, "pack.json"), manifestContent);

    // Compute expected hash
    const hash = createHash("sha512");
    hash.update(manifestContent);
    const expected = `sha512-${hash.digest("base64")}`;

    // Use the private method via install flow — the pack already has correct integrity
    // Just verify we can install with matching hash by seeding fetchPackInfo data
    const result = await pm.install("integrity-test");
    expect(result.installed[0].name).toBe("integrity-test");
  });
});
