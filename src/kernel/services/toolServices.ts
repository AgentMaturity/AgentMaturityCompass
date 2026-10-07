/**
 * The tool registry and execution pipeline as a composed service (P4.1).
 *
 * `ctx.amcTools` is where a governed tool call happens. A plugin that declares
 * `inject: ["amcTools"]` stays PENDING until a host has composed one, which is
 * the point: a loop that could not find the pipeline must not fall back to
 * calling tool bodies directly. That fallback is exactly how enforcement
 * becomes advisory again.
 *
 * WHY REGISTRATION RETURNS THROUGH ctx.effect. Every `define`, `restrict` and
 * `guard` here is bound to the CALLING fiber. A plugin that registered a guard
 * and was then unloaded must stop being consulted — a disposed plugin whose
 * guard kept denying (or, worse, kept NOT denying) would be policy from a
 * scope that no longer exists.
 *
 * WHAT DISPOSAL DOES. Nothing beyond those effects. The pipeline holds no
 * resource of its own; the registry is in-memory and dies with the fiber, and
 * an in-flight call is bounded by its own body.
 *
 * THE COMPILED POLICY (P1-12). The service loads the workspace's active
 * compiled plan when it is composed and refuses to compose when that plan does
 * not verify. Its `compiled-policy` guard belongs to the service, not to a
 * fiber: no plugin can unload it. Effective-policy receipts are written by
 * native sessions (`agentToolset`), which own a session writer; this service
 * has none.
 *
 * This module lives under src/kernel/ because it imports workspace packages
 * the published npm tarball does not contain; the architecture-boundaries gate
 * enforces that placement.
 */
import { AmcSeam, defineSeam } from "../amcRuntime.js";
import type { Context } from "../amcRuntime.js";
import { ToolRegistry } from "../../tools/toolRegistry.js";
import { ToolPipeline, type ToolCallInput, type ToolPipelineInit } from "../../tools/toolPipeline.js";
import type { ToolDefinition, ToolGuard, ToolOutcome, ToolRestriction } from "../../tools/toolTypes.js";
import { loadActiveCompiledPolicy } from "../../catalog/compiler/activate.js";
import { ACTION_CLASSES } from "../../governor/actionCatalog.js";
import { compiledApprovalClasses, compiledPolicyFacts, compiledPolicyGuard } from "../../tools/guards/compiledPolicyGuard.js";

export const TOOLS_SEAM = defineSeam("amcTools");

export type ToolServiceConfig = Omit<ToolPipelineInit, "registry">;

export class ToolPipelineService extends AmcSeam {
  private readonly registry = new ToolRegistry();
  private readonly pipeline: ToolPipeline;

  constructor(ctx: Context, config: ToolServiceConfig) {
    super(ctx, TOOLS_SEAM.name);
    // Throws when the active plan does not verify: the service refuses to compose.
    const compiled = loadActiveCompiledPolicy(config.workspace);
    this.registry.guard("compiled-policy", compiledPolicyGuard(config.workspace, compiled));
    const facts = compiled ? compiledPolicyFacts(compiled) : null;
    this.pipeline = new ToolPipeline({ ...config, registry: this.registry, ...(compiled && facts ? {
      authorizeClasses: new Set<string>(ACTION_CLASSES),
      boundApprovalRequiredFor: new Set([...(config.boundApprovalRequiredFor ?? []), ...compiledApprovalClasses(compiled)]),
      authorizationContext: () => ({ ...(config.authorizationContext?.() ?? {}), compiledPolicy: facts })
    } : {}) });
  }

  /** Run a call through the full pipeline. The only way a tool body runs. */
  execute(input: ToolCallInput): Promise<ToolOutcome> {
    return this.pipeline.execute(input);
  }

  /** Register a tool, bound to the calling fiber. */
  define(tool: ToolDefinition, scope?: string): void {
    const remove = this.registry.define(tool, scope);
    this.ctx.effect(() => remove, `amcTools tool ${tool.name}`);
  }

  /** Narrow what a scope sees, bound to the calling fiber. */
  restrict(restriction: ToolRestriction, scope?: string): void {
    const remove = this.registry.restrict(restriction, scope);
    this.ctx.effect(() => remove, "amcTools restriction");
  }

  /** Register a monotonic guard, bound to the calling fiber. */
  guard(label: string, guard: ToolGuard, scope?: string): void {
    const remove = this.registry.guard(label, guard, scope);
    this.ctx.effect(() => remove, `amcTools guard ${label}`);
  }

  /** What one scope can see right now. */
  visible(scope?: string): ReadonlyMap<string, ToolDefinition> {
    return this.registry.visible(scope);
  }
}

/**
 * Registers the tool pipeline.
 *
 * A single-service plugin: it is complete on its own, and what it needs — an
 * approval answerer, a recorder — a host composes first and hands in.
 */
export const toolServices = {
  name: "amc-tool-services",
  apply(ctx: Context, config: ToolServiceConfig): void {
    ctx.plugin(ToolPipelineService, config);
  }
};
