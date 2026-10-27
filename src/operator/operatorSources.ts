/**
 * The operator workflow's read of A4 Forge (P2-22): every A4 project's verified state, through the same store, loader and
 * readiness evaluator the A4 routes use (P1-61's plan-diff and blocker-inbox panels read the same rows). Nothing here
 * writes. Without `AMC_A4_PREVIEW=1`, or when the store cannot be opened, this throws: callers report the source as
 * unavailable, never as empty.
 */
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { evaluateFor, loadA4State } from "../a4/a4Gates.js";
import type { A4ReadinessItem, A4ReadinessState } from "../a4/a4Readiness.js";
import { headStage } from "../a4/a4Router.js";
import { a4PreviewEnabled } from "../a4/a4Schema.js";
import { openA4Store } from "../a4/a4Store.js";
import { verifyAmcConfigSignature } from "../config/amcConfigSignature.js";
import { pathExists, readUtf8 } from "../utils/fs.js";

export interface OperatorA4Project {
  readonly projectId: string;
  readonly agentId: string;
  readonly name: string;
  readonly state: A4ReadinessState;
  /** The readiness the A4 routes would return to a read-only caller (no principal) now. */
  readonly readiness: () => { status: string; evaluatedAt: string; items: readonly A4ReadinessItem[] };
}

class OperatorSourceError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "OperatorSourceError";
  }
}

const operatorConfigSchema = z.strictObject({
  inbox: z.strictObject({ expiryWindowDays: z.number().int().min(1).max(365).default(14) }).default({ expiryWindowDays: 14 }),
  reviewTiming: z.strictObject({ enabled: z.boolean().default(false) }).default({ enabled: false })
});
export type OperatorConfig = z.infer<typeof operatorConfigSchema>;
const DEFAULT_OPERATOR_CONFIG: OperatorConfig = { inbox: { expiryWindowDays: 14 }, reviewTiming: { enabled: false } };

/**
 * `operator:` in amc.config.yaml, read only when the file's signature verifies; otherwise, or when the section does not
 * parse, the defaults: a 14-day expiry window and review timing off (personal data stays off unless signed on).
 */
export function loadOperatorConfig(workspace: string): OperatorConfig {
  const path = join(workspace, ".amc", "amc.config.yaml");
  if (!pathExists(path)) return DEFAULT_OPERATOR_CONFIG;
  try {
    // The bytes parsed are the bytes the signature check read: unchanged before and after it.
    const text = readUtf8(path);
    if (!verifyAmcConfigSignature(workspace).valid || readUtf8(path) !== text) return DEFAULT_OPERATOR_CONFIG;
    const raw = (YAML.parse(text) as { operator?: unknown } | null)?.operator;
    const parsed = operatorConfigSchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : DEFAULT_OPERATOR_CONFIG;
  } catch {
    return DEFAULT_OPERATOR_CONFIG;
  }
}

/** Runs `read` over every A4 project, verified, in one open store; the store is closed afterwards. */
export function readA4Projects<T>(workspace: string, now: number, read: (projects: readonly OperatorA4Project[]) => T): T {
  if (!a4PreviewEnabled()) throw new OperatorSourceError("A4_PREVIEW_DISABLED", "A4 Forge is not enabled in this workspace (AMC_A4_PREVIEW=1)");
  const store = openA4Store(workspace);
  try {
    const projects = store.listProjects().map((row): OperatorA4Project => {
      const state = loadA4State(store, row.project_id, now);
      let cached: ReturnType<OperatorA4Project["readiness"]> | null = null;
      return {
        projectId: row.project_id, agentId: row.agent_id, name: row.name, state,
        readiness: () => (cached ??= evaluateFor(store, state, null, {}, headStage(row), now).readiness)
      };
    });
    return read(projects);
  } finally {
    store.close();
  }
}
