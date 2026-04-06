/**
 * packs/packTypes.ts — Type definitions for AMC pack registry system
 *
 * Defines interfaces and schemas for the community assurance pack registry
 * with NPM-style functionality including versioning, ratings, and dependencies.
 */

import { z } from "zod";

/* ── Core Pack Types ─────────────────────────────────────────── */

export interface PackManifest {
  name: string;
  version: string;
  description: string;
  category: "assurance" | "policy" | "transform" | "adapter";
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  contributors?: Array<{
    name: string;
    email?: string;
    url?: string;
  }>;
  main: string;
  keywords: string[];
  license: string;
  repository?: {
    type: string;
    url: string;
  };
  homepage?: string;
  bugs?: {
    url: string;
    email?: string;
  };
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  engines?: {
    node?: string;
    amc?: string;
  };
  os?: string[];
  cpu?: string[];
  amcPack: {
    type: "assurance" | "policy" | "transform" | "adapter";
    targets: string[]; // Target agent types or frameworks
    riskLevel: "low" | "medium" | "high";
    executionMode: "sandbox" | "supervised" | "trusted";
    scenarios?: PackScenario[];
    policies?: PackPolicy[];
    transforms?: PackTransform[];
    adapters?: PackAdapter[];
  };
}

export interface PackScenario {
  id: string;
  name: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  tags: string[];
  timeout?: number;
  retries?: number;
  prerequisites?: string[];
}

export interface PackPolicy {
  id: string;
  name: string;
  description: string;
  framework: string;
  rules: Array<{
    id: string;
    condition: string;
    action: "allow" | "deny" | "warn" | "audit";
    message?: string;
  }>;
}

export interface PackTransform {
  id: string;
  name: string;
  description: string;
  inputFormat: string;
  outputFormat: string;
  schema?: any;
}

export interface PackAdapter {
  id: string;
  name: string;
  description: string;
  protocol: string;
  endpoints: string[];
  authentication?: {
    type: "none" | "apikey" | "oauth" | "basic";
    config?: Record<string, any>;
  };
}

/* ── Registry Types ──────────────────────────────────────────── */

export interface PackRegistryConfig {
  registries: Array<{
    name: string;
    url: string;
    priority: number;
    trusted: boolean;
    auth?: {
      token?: string;
      username?: string;
      password?: string;
    };
  }>;
  defaultRegistry: string;
  cache: {
    ttl: number; // seconds
    maxSize: number; // MB
  };
  proxy?: {
    http?: string;
    https?: string;
    noProxy?: string[];
  };
}

export interface PackRegistryEntry {
  name: string;
  description: string;
  "dist-tags": {
    latest: string;
    [tag: string]: string;
  };
  versions: Record<string, PackVersionInfo>;
  time: Record<string, string>; // version -> timestamp
  maintainers: Array<{
    name: string;
    email: string;
  }>;
  keywords: string[];
  license: string;
  repository?: {
    type: string;
    url: string;
  };
  homepage?: string;
  bugs?: {
    url: string;
  };
  readme?: string;
  readmeFilename?: string;
}

export interface PackVersionInfo {
  name: string;
  version: string;
  description: string;
  main: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  os?: string[];
  cpu?: string[];
  keywords: string[];
  license: string;
  author?: {
    name: string;
    email?: string;
    url?: string;
  };
  contributors?: Array<{
    name: string;
    email?: string;
    url?: string;
  }>;
  repository?: {
    type: string;
    url: string;
  };
  homepage?: string;
  bugs?: {
    url: string;
  };
  dist: {
    integrity: string;
    shasum: string;
    tarball: string;
    fileCount?: number;
    unpackedSize?: number;
  };
  amcPack: PackManifest["amcPack"];
}

/* ── Installation Types ──────────────────────────────────────── */

export interface PackInstallRecord {
  name: string;
  version: string;
  resolved: string;
  integrity: string;
  dev: boolean;
}

export interface PackLockfile {
  lockfileVersion: number;
  packages: Record<string, {
    version: string;
    resolved: string;
    integrity: string;
    dependencies?: Record<string, string>;
    dev?: boolean;
    optional?: boolean;
  }>;
  dependencies: Record<string, {
    version: string;
    resolved: string;
    integrity: string;
    requires?: Record<string, string>;
    dependencies?: Record<string, any>;
  }>;
}

export interface PackDependencyTree {
  [name: string]: {
    version: string;
    resolved: string;
    integrity: string;
    dependencies?: Record<string, string>;
    dev?: boolean;
    optional?: boolean;
  };
}

/* ── Search and Discovery Types ──────────────────────────────── */

export interface PackSearchParams {
  query?: string;
  category?: string;
  author?: string;
  keywords?: string[];
  limit?: number;
  offset?: number;
  sortBy?: "relevance" | "downloads" | "updated" | "created" | "rating";
  sortOrder?: "asc" | "desc";
  minRating?: number;
  riskLevel?: "low" | "medium" | "high";
}

export interface PackSearchResult {
  name: string;
  version: string;
  description: string;
  author: string;
  keywords: string[];
  category: string;
  riskLevel: string;
  rating: number;
  downloads: number;
  updated: string;
  created: string;
  license: string;
  repository?: string;
  homepage?: string;
}

/* ── Rating and Review Types ─────────────────────────────────── */

export interface PackRating {
  packName: string;
  packVersion: string;
  userId: string;
  userName: string;
  score: number; // 1-5
  comment?: string;
  pros?: string[];
  cons?: string[];
  wouldRecommend: boolean;
  usageContext?: string;
  timestamp: string;
  helpful: number; // number of helpful votes
  verified: boolean; // verified download/usage
}

export interface PackStats {
  name: string;
  totalDownloads: number;
  weeklyDownloads: number;
  monthlyDownloads: number;
  averageRating: number;
  totalRatings: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  dependents: number;
  lastUpdated: string;
  created: string;
  maintainers: number;
  versions: number;
  size: {
    unpackedSize: number;
    fileCount: number;
  };
}

/* ── Validation Schemas ──────────────────────────────────────── */

export const packManifestSchema = z.object({
  name: z.string().min(1).max(214).regex(/^[a-z0-9]([a-z0-9\-_.])*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9\-_.]+)?$/),
  description: z.string().min(1).max(500),
  category: z.enum(["assurance", "policy", "transform", "adapter"]),
  author: z.object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    url: z.string().url().optional(),
  }),
  contributors: z.array(z.object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    url: z.string().url().optional(),
  })).optional(),
  main: z.string().min(1),
  keywords: z.array(z.string()).max(20),
  license: z.string().min(1),
  repository: z.object({
    type: z.string(),
    url: z.string().url(),
  }).optional(),
  homepage: z.string().url().optional(),
  bugs: z.object({
    url: z.string().url(),
    email: z.string().email().optional(),
  }).optional(),
  dependencies: z.record(z.string(), z.string()),
  devDependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
  engines: z.object({
    node: z.string().optional(),
    amc: z.string().optional(),
  }).optional(),
  os: z.array(z.string()).optional(),
  cpu: z.array(z.string()).optional(),
  amcPack: z.object({
    type: z.enum(["assurance", "policy", "transform", "adapter"]),
    targets: z.array(z.string()),
    riskLevel: z.enum(["low", "medium", "high"]),
    executionMode: z.enum(["sandbox", "supervised", "trusted"]),
    scenarios: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      severity: z.enum(["low", "medium", "high", "critical"]),
      tags: z.array(z.string()),
      timeout: z.number().optional(),
      retries: z.number().optional(),
      prerequisites: z.array(z.string()).optional(),
    })).optional(),
    policies: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      framework: z.string(),
      rules: z.array(z.object({
        id: z.string(),
        condition: z.string(),
        action: z.enum(["allow", "deny", "warn", "audit"]),
        message: z.string().optional(),
      })),
    })).optional(),
    transforms: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      inputFormat: z.string(),
      outputFormat: z.string(),
      schema: z.any().optional(),
    })).optional(),
    adapters: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      protocol: z.string(),
      endpoints: z.array(z.string()),
      authentication: z.object({
        type: z.enum(["none", "apikey", "oauth", "basic"]),
        config: z.record(z.string(), z.any()).optional(),
      }).optional(),
    })).optional(),
  }),
});

export const packRegistryConfigSchema = z.object({
  registries: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
    priority: z.number(),
    trusted: z.boolean(),
    auth: z.object({
      token: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
    }).optional(),
  })),
  defaultRegistry: z.string().url(),
  cache: z.object({
    ttl: z.number().positive(),
    maxSize: z.number().positive(),
  }),
  proxy: z.object({
    http: z.string().optional(),
    https: z.string().optional(),
    noProxy: z.array(z.string()).optional(),
  }).optional(),
});

export const packSearchParamsSchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  author: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  limit: z.number().positive().max(100).optional(),
  offset: z.number().nonnegative().optional(),
  sortBy: z.enum(["relevance", "downloads", "updated", "created", "rating"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  minRating: z.number().min(1).max(5).optional(),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
});

export const packRegistryEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
  "dist-tags": z.object({
    latest: z.string(),
  }).catchall(z.string()),
  versions: z.record(z.string(), z.any()),
  time: z.record(z.string(), z.string()),
  maintainers: z.array(z.object({
    name: z.string(),
    email: z.string(),
  })),
  keywords: z.array(z.string()),
  license: z.string(),
  repository: z.object({
    type: z.string(),
    url: z.string(),
  }).optional(),
  homepage: z.string().optional(),
  bugs: z.object({
    url: z.string(),
  }).optional(),
  readme: z.string().optional(),
  readmeFilename: z.string().optional(),
});

export const packRatingSchema = z.object({
  packName: z.string(),
  packVersion: z.string(),
  userId: z.string(),
  userName: z.string(),
  score: z.number().min(1).max(5),
  comment: z.string().max(1000).optional(),
  pros: z.array(z.string()).optional(),
  cons: z.array(z.string()).optional(),
  wouldRecommend: z.boolean(),
  usageContext: z.string().optional(),
  timestamp: z.string(),
  helpful: z.number().nonnegative(),
  verified: z.boolean(),
});

/* ── Utility Types ───────────────────────────────────────────── */

export type PackManifestValidation = {
  valid: true;
  manifest: PackManifest;
  warnings?: string[];
  integrity?: string;
} | {
  valid: false;
  errors: string[];
  warnings?: string[];
  manifest?: undefined;
};

export type PackValidationResult = PackManifestValidation;

export interface PackLock {
  lockfileVersion: number;
  packages: Record<string, {
    version: string;
    resolved: string;
    integrity: string;
    dependencies?: Record<string, string>;
    dev?: boolean;
    optional?: boolean;
  }>;
}

export const packLockSchema = z.object({
  lockfileVersion: z.number(),
  packages: z.record(z.string(), z.object({
    version: z.string(),
    resolved: z.string(),
    integrity: z.string(),
    dependencies: z.record(z.string(), z.string()).optional(),
    dev: z.boolean().optional(),
    optional: z.boolean().optional(),
  })),
});

export interface PackPublishOptions {
  registry?: string;
  access?: "public" | "private";
  tag?: string;
  dryRun?: boolean;
  force?: boolean;
}

export interface PackPublishResult {
  success: boolean;
  name: string;
  version: string;
  registry: string;
  tarball?: string;
  integrity?: string;
  message: string;
}

export interface PackRegistryServerOptions {
  port?: number;
  host?: string;
  storage?: string;
  auth?: {
    enabled: boolean;
    providers?: Array<{
      type: "local" | "github" | "npm";
      config: Record<string, any>;
    }>;
  };
  rateLimit?: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
  };
  cors?: {
    enabled: boolean;
    origins?: string[];
  };
}