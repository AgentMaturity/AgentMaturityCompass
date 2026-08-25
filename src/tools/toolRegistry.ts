import { RUN_CODE_TOOL } from "./toolPipeline.js";
import type {
  LabelledToolGuard,
  ToolDefinition,
  ToolExecution,
  ToolGuard,
  ToolRestriction
} from "./toolTypes.js";

/**
 * The scoped tool registry (P4.1).
 *
 * A scope is an agent. Registrations made without one are global and visible
 * to every agent; registrations made in a scope are visible only there. Both
 * restrictions and guards compose by NARROWING — a scope can hide a tool the
 * global layer offers, and can deny a call the global layer left alone, but
 * neither can reveal or permit anything the layer above it withheld.
 *
 * That asymmetry is the whole design. A scope that could widen its own view
 * would make per-agent restriction advisory, which is the same failure as a
 * guard that could allow.
 */

/** Which guard denied, and why. */
export interface GuardDenial {
  readonly label: string;
  readonly reason: string;
}

/** One scope's contribution. Absent scope key means the global layer. */
interface ToolLayer {
  readonly tools: Map<string, ToolDefinition>;
  readonly restrictions: ToolRestriction[];
  readonly guards: LabelledToolGuard[];
}

function emptyLayer(): ToolLayer {
  return { tools: new Map(), restrictions: [], guards: [] };
}

/** Apply one restriction to a name set. Deny wins; allow intersects. */
function narrow(names: Set<string>, restriction: ToolRestriction): Set<string> {
  const out = new Set<string>();
  for (const name of names) {
    if (restriction.deny?.has(name)) continue;
    if (restriction.allow !== undefined && !restriction.allow.has(name)) continue;
    out.add(name);
  }
  return out;
}

export class ToolRegistry {
  private readonly global = emptyLayer();
  private readonly scopes = new Map<string, ToolLayer>();
  private transportRegistered = false;

  private layerFor(scope: string | undefined): ToolLayer {
    if (scope === undefined) return this.global;
    const existing = this.scopes.get(scope);
    if (existing) return existing;
    const created = emptyLayer();
    this.scopes.set(scope, created);
    return created;
  }

  /**
   * Register a tool. Returns the disposer that removes exactly this
   * registration, so composition can unwind in LIFO order.
   */
  define(tool: ToolDefinition, scope?: string): () => void {
    if (tool.name === RUN_CODE_TOOL && !this.transportRegistered) {
      // Reserved unconditionally, global and scoped alike. Under code mode
      // this is the ONLY name callable directly, so a plugin that could
      // register or shadow it would become the transport every dispatch flows
      // through -- and would see, and could rewrite, every sub-call the
      // program makes. `defineCodeTransport` is the one door in.
      throw new Error(
        `tool name "${RUN_CODE_TOOL}" is reserved for the Code Mode transport and cannot be registered or shadowed`
      );
    }
    const layer = this.layerFor(scope);
    if (layer.tools.has(tool.name)) {
      throw new Error(
        scope === undefined
          ? `tool "${tool.name}" is already registered globally`
          : `tool "${tool.name}" is already registered in scope "${scope}"`
      );
    }
    layer.tools.set(tool.name, tool);
    return () => {
      if (layer.tools.get(tool.name) === tool) layer.tools.delete(tool.name);
    };
  }

  /**
   * Register the Code Mode transport. The only way `run_code` enters.
   *
   * Separate from `define` so the reservation is not something a caller can
   * opt out of by passing a flag: reaching this function is the opt-in, and it
   * is called by the composition that owns code mode.
   */
  defineCodeTransport(tool: ToolDefinition, scope?: string): () => void {
    if (tool.name !== RUN_CODE_TOOL) {
      throw new Error(`defineCodeTransport is only for "${RUN_CODE_TOOL}"`);
    }
    this.transportRegistered = true;
    try {
      return this.define(tool, scope);
    } finally {
      this.transportRegistered = false;
    }
  }

  /** Narrow what a scope can see. Never widens. */
  restrict(restriction: ToolRestriction, scope?: string): () => void {
    if (restriction.allow?.has(RUN_CODE_TOOL) === true || restriction.deny?.has(RUN_CODE_TOOL) === true) {
      // Restricting the transport is a category error: it is presentation
      // infrastructure, not a capability. Denying it under code mode would
      // leave an agent unable to call anything at all, and allowing it says
      // nothing about what the program may then dispatch -- which is decided
      // per sub-call by the same guards as any other call.
      throw new Error(
        `restrict() cannot name the reserved Code Mode transport "${RUN_CODE_TOOL}"; restrict the tools it dispatches instead`
      );
    }
    const layer = this.layerFor(scope);
    layer.restrictions.push(restriction);
    return () => {
      const at = layer.restrictions.indexOf(restriction);
      if (at >= 0) layer.restrictions.splice(at, 1);
    };
  }

  /**
   * Register a monotonic guard. A global guard applies to every scope; a
   * scoped guard applies only to that scope. No guard can force-allow a call
   * another guard denied — see `ToolGuard`.
   */
  guard(label: string, guard: ToolGuard, scope?: string): () => void {
    const layer = this.layerFor(scope);
    const entry: LabelledToolGuard = { label, guard };
    layer.guards.push(entry);
    return () => {
      const at = layer.guards.indexOf(entry);
      if (at >= 0) layer.guards.splice(at, 1);
    };
  }

  /**
   * What one scope can see: global tools plus its own, with every restriction
   * in the chain applied. A scoped tool shadows a global one of the same name,
   * which is how a per-agent variant replaces the default.
   */
  visible(scope?: string): ReadonlyMap<string, ToolDefinition> {
    const merged = new Map<string, ToolDefinition>(this.global.tools);
    const scopeLayer = scope === undefined ? undefined : this.scopes.get(scope);
    if (scopeLayer) {
      for (const [name, tool] of scopeLayer.tools) merged.set(name, tool);
    }
    let names = new Set(merged.keys());
    for (const restriction of this.global.restrictions) names = narrow(names, restriction);
    for (const restriction of scopeLayer?.restrictions ?? []) names = narrow(names, restriction);
    const out = new Map<string, ToolDefinition>();
    for (const name of names) {
      const tool = merged.get(name);
      if (tool) out.set(name, tool);
    }
    return out;
  }

  /**
   * The first denial from the global layer, then the scope's.
   *
   * "First" is a reporting choice, not a semantic one: because guards cannot
   * allow, evaluating the rest could only ever produce more denials for a call
   * that is already denied.
   */
  /**
   * The guards composed for this call, in evaluation order.
   *
   * `guardReason` short-circuits on the first denial, so it cannot tell a
   * caller which controls APPLIED to a permitted call. Evidence needs that:
   * "the allowlist evaluated this call and permitted it" is a receipt the
   * question bank explicitly asks for (AMC-5.29 wants "denied/allowed
   * tool-call receipts"), and it is not derivable from a denial that never
   * happened. Pure — it runs no guard.
   */
  guardLabelsFor(execution: ToolExecution): string[] {
    const scopeLayer = this.scopes.get(execution.agentId);
    return [...this.global.guards, ...(scopeLayer?.guards ?? [])].map((entry) => entry.label);
  }

  guardReason(execution: ToolExecution): GuardDenial | undefined {
    const scopeLayer = this.scopes.get(execution.agentId);
    for (const entry of [...this.global.guards, ...(scopeLayer?.guards ?? [])]) {
      const reason = entry.guard(execution);
      if (reason !== undefined) return { label: entry.label, reason };
    }
    return undefined;
  }
}

/** The `defineTool()` DSL — a named constructor, so definitions read as data. */
export function defineTool(definition: ToolDefinition): ToolDefinition {
  if (definition.name.trim().length === 0) {
    throw new Error("a tool must have a name");
  }
  return definition;
}
