import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { RUN_CODE_TOOL } from "./toolPipeline.js";
import type {
  LabelledToolGuard,
  ToolDefinition,
  ToolExecution,
  ToolGuard,
  ToolRestriction,
  ToolStepContext
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
interface ToolRegistration {
  readonly definition: ToolDefinition;
  readonly available: ToolDefinition["available"];
  readonly exposure: ToolDefinition["exposure"];
}

interface StepAvailability {
  readonly admitted: Set<ToolRegistration>;
  ready: boolean;
}

export interface ToolActivationRequest {
  readonly name: string;
  readonly schemaDigestSha256: string;
}

export interface ToolActivation extends ToolActivationRequest {
  readonly revision: number;
}

const loadoutFailureMessages = {
  UNAUTHORIZED: "Tool activation is not authorized for this session.",
  CATALOG_UNAVAILABLE: "Tool catalog is unavailable for this session.",
  STALE_ACTIVATION: "Tool activation is stale. Search again before activating.",
  LOADOUT_LIMIT: "Tool loadout limit reached (20).",
  EVIDENCE_UNAVAILABLE: "Tool activation evidence is unavailable.",
  INVALID_ARGUMENTS: "Invalid tool search arguments.",
  CANCELLED: "Tool discovery or activation cancelled."
} as const;

export type ToolLoadoutErrorCode = keyof typeof loadoutFailureMessages;

/** Finite, fixed public failures; internal policy, schema and writer errors never become model-visible messages. */
export class ToolLoadoutError extends Error {
  readonly code: ToolLoadoutErrorCode;

  constructor(code: ToolLoadoutErrorCode) {
    const safeCode = typeof code === "string" && Object.hasOwn(loadoutFailureMessages, code) ? code : "CATALOG_UNAVAILABLE";
    super(loadoutFailureMessages[safeCode]);
    this.code = safeCode;
    this.name = "ToolLoadoutError";
    Object.freeze(this);
  }
}

interface LoadoutEntry {
  readonly registration: ToolRegistration;
  readonly schemaDigestSha256: string;
}

interface ToolLoadout {
  readonly identity: string;
  readonly discovered: Map<string, LoadoutEntry>;
  readonly active: Map<string, LoadoutEntry>;
  revision: number;
}

interface ToolLayer {
  readonly tools: Map<string, ToolRegistration>;
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
  private readonly steps = new Map<string, StepAvailability>();
  private readonly loadouts = new Map<string, ToolLoadout>();

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
    // The registration object is a generation: re-registering even the same definition cannot reuse an old admission.
    const registration = { definition: tool, available: tool.available, exposure: tool.exposure };
    layer.tools.set(tool.name, registration);
    this.pruneLoadouts();
    return () => {
      if (layer.tools.get(tool.name) === registration) layer.tools.delete(tool.name);
      this.pruneLoadouts();
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
    this.pruneLoadouts();
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
  private permitted(scope?: string): ReadonlyMap<string, ToolRegistration> {
    const merged = new Map(this.global.tools);
    const scopeLayer = scope === undefined ? undefined : this.scopes.get(scope);
    if (scopeLayer) {
      for (const [name, tool] of scopeLayer.tools) merged.set(name, tool);
    }
    let names = new Set(merged.keys());
    for (const restriction of this.global.restrictions) names = narrow(names, restriction);
    for (const restriction of scopeLayer?.restrictions ?? []) names = narrow(names, restriction);
    const out = new Map<string, ToolRegistration>();
    for (const name of names) {
      const tool = merged.get(name);
      if (tool) out.set(name, tool);
    }
    return out;
  }

  /** Execution eligibility, always narrowed by current policy, including after asynchronous admission. */
  visible(scope?: string): ReadonlyMap<string, ToolDefinition> {
    const state = scope === undefined ? undefined : this.steps.get(scope);
    return new Map([...this.permitted(scope)].filter(([, registration]) =>
      registration.available === undefined || (state?.ready === true && state.admitted.has(registration)))
      .map(([name, registration]) => [name, registration.definition]));
  }

  /** Exposure narrows through both registration layers; a scoped replacement cannot opt out of global presentation. */
  private exposures(name: string, scope?: string): readonly ToolDefinition["exposure"][] {
    return [this.global.tools.get(name)?.exposure, scope === undefined ? undefined : this.scopes.get(scope)?.tools.get(name)?.exposure];
  }

  /** Modeled invocation routes are subordinate to the same global and scoped exposure restrictions. */
  invocationDenial(name: string, scope: string, nested: boolean): string | undefined {
    const exposures = this.exposures(name, scope);
    if (exposures.includes("hidden")) return "hidden tools cannot be invoked by the model";
    if (!nested && exposures.includes("code-only")) return "code-only tools require a Code Mode sub-call";
    if (nested && exposures.includes("model-only")) return "model-only tools cannot be invoked by Code Mode";
    return undefined;
  }

  private discoverable(name: string, scope?: string): boolean {
    const exposures = this.exposures(name, scope);
    return !exposures.includes("hidden") && !exposures.includes("code-only");
  }

  private deferred(name: string, scope: string): boolean {
    return this.discoverable(name, scope) && this.exposures(name, scope).includes("deferred");
  }

  /** Direct schemas plus explicitly activated deferred schemas; presentation never grants execution authority. */
  offered(scope?: string): ReadonlyMap<string, ToolDefinition> {
    this.pruneLoadouts();
    const active = scope === undefined ? undefined : this.loadouts.get(scope)?.active;
    return new Map([...this.visible(scope)].filter(([name]) => this.discoverable(name, scope)
      && (!this.exposures(name, scope).includes("deferred") || active?.has(name) === true)));
  }

  /** Finite metadata only; this view contains neither dispatch functions nor hidden/internal schemas. */
  catalog(scope?: string): readonly { name: string; description: string; parameters: Record<string, unknown> }[] {
    return [...this.visible(scope).values()]
      .filter(tool => this.discoverable(tool.name, scope) && tool.parameters !== undefined)
      .map(tool => ({ name: tool.name, description: tool.description, parameters: structuredClone(tool.parameters!) }));
  }

  /** Stable registration metadata identity; step availability never changes the catalog's reviewed schema bytes. */
  catalogDigest(scope?: string): string {
    const catalog = [...this.permitted(scope)].filter(([name, registration]) => this.discoverable(name, scope)
      && registration.definition.parameters !== undefined)
      .map(([name, registration]) => ({ name, description: registration.definition.description,
        parameters: registration.definition.parameters, actionClass: registration.definition.actionClass,
        exposure: this.exposures(name, scope).map(exposure => exposure ?? "direct") })).sort((a, b) => a.name.localeCompare(b.name));
    return sha256Hex(canonicalize(catalog));
  }

  /** One bounded in-memory loadout per agent. New session, policy or catalog identity starts empty. */
  synchronizeLoadout(scope: string, identity: string): void {
    const previous = this.loadouts.get(scope);
    if (previous?.identity === identity) return;
    this.loadouts.set(scope, { identity, discovered: new Map(), active: new Map(), revision: previous?.revision ?? 0 });
  }

  /** Remember only the last bounded discovery result, bound to current registration and exact schema bytes. */
  rememberDiscovery(scope: string, schemas: readonly { name: string; parameters: Record<string, unknown> }[]): void {
    const state = this.loadouts.get(scope);
    if (!state) return;
    state.discovered.clear();
    const permitted = this.permitted(scope);
    const visible = this.visible(scope);
    for (const schema of schemas.slice(0, 20)) {
      const registration = permitted.get(schema.name);
      if (!registration || !this.deferred(schema.name, scope) || !visible.has(schema.name)) continue;
      const schemaDigestSha256 = sha256Hex(canonicalize(schema.parameters));
      if (registration.definition.parameters === undefined
        || sha256Hex(canonicalize(registration.definition.parameters)) !== schemaDigestSha256) continue;
      state.discovered.set(schema.name, { registration, schemaDigestSha256 });
    }
  }

  /** Commit evidence before publishing. A guessed name, stale discovery or failed writer grants no schema. */
  activate(scope: string, request: ToolActivationRequest, record: (activation: ToolActivation) => string,
    signal?: AbortSignal): ToolActivation & { readonly evidenceRef: string } {
    signal?.throwIfAborted();
    this.pruneLoadouts();
    const state = this.loadouts.get(scope);
    const entry = state?.discovered.get(request.name);
    if (!state || !entry || entry.schemaDigestSha256 !== request.schemaDigestSha256
      || !this.visible(scope).has(request.name)) {
      throw new ToolLoadoutError(this.visible(scope).has(request.name) && this.deferred(request.name, scope)
        ? "STALE_ACTIVATION" : "UNAUTHORIZED");
    }
    if (state.active.size >= 20 && !state.active.has(request.name)) throw new ToolLoadoutError("LOADOUT_LIMIT");
    // A malformed published schema must not be offered to a provider.
    new AjvJsonSchemaValidator().getValidator(
      entry.registration.definition.parameters as Parameters<AjvJsonSchemaValidator["getValidator"]>[0]);
    const revision = state.revision;
    const activation = { name: request.name, schemaDigestSha256: request.schemaDigestSha256, revision: revision + 1 };
    let evidenceRef: string;
    try {
      evidenceRef = record(Object.freeze(activation));
    } catch (error) {
      if (error instanceof ToolLoadoutError) throw error;
      throw new ToolLoadoutError("EVIDENCE_UNAVAILABLE");
    }
    signal?.throwIfAborted();
    this.pruneLoadouts();
    if (typeof evidenceRef !== "string" || evidenceRef.trim() === "") throw new ToolLoadoutError("EVIDENCE_UNAVAILABLE");
    if (this.loadouts.get(scope) !== state || state.revision !== revision
      || state.discovered.get(request.name) !== entry || !this.visible(scope).has(request.name)) {
      throw new ToolLoadoutError("STALE_ACTIVATION");
    }
    state.active.set(request.name, entry);
    state.revision = activation.revision;
    return { ...activation, evidenceRef };
  }

  /** Revocation never revives after a restriction is lifted, a registration reloads, or a later condition denies. */
  private pruneLoadouts(): void {
    for (const [scope, state] of this.loadouts) {
      const permitted = this.permitted(scope);
      const step = this.steps.get(scope);
      for (const entries of [state.discovered, state.active]) for (const [name, entry] of entries) {
        const registration = permitted.get(name);
        const parameters = registration?.definition.parameters;
        if (registration !== entry.registration || !this.deferred(name, scope) || parameters === undefined
          || sha256Hex(canonicalize(parameters)) !== entry.schemaDigestSha256
          || (registration.available !== undefined && step?.ready === true && !step.admitted.has(registration))) {
          entries.delete(name);
        }
      }
    }
  }

  /** Capture both registration and step identity before a call crosses any await. */
  admissionCheck(name: string, scope: string, nested = false): () => boolean {
    const registration = this.permitted(scope).get(name);
    const state = this.steps.get(scope);
    const routeAdmitted = this.invocationDenial(name, scope, nested) === undefined;
    return () => routeAdmitted && registration !== undefined && this.permitted(scope).get(name) === registration
      && this.invocationDenial(name, scope, nested) === undefined
      && this.visible(scope).get(name) === registration.definition
      && (registration.available === undefined || this.steps.get(scope) === state);
  }

  /** Admit conditions once, atomically. A failed, cancelled or disposed preparation publishes no authority. */
  async prepareStep(input: ToolStepContext): Promise<() => void> {
    const context = Object.freeze({ ...input });
    context.signal.throwIfAborted();
    if (this.steps.has(context.agentId)) throw new Error(`tool step already active for "${context.agentId}"`);
    const state: StepAvailability = { admitted: new Set(), ready: false };
    this.steps.set(context.agentId, state);
    const dispose = (): void => {
      if (this.steps.get(context.agentId) === state) this.steps.delete(context.agentId);
      context.signal.removeEventListener("abort", onAbort);
    };
    let onAbort = (): void => {};
    try {
      const cancelled = new Promise<never>((_resolve, reject) => {
        onAbort = (): void => { dispose(); reject(context.signal.reason); };
        context.signal.addEventListener("abort", onAbort, { once: true });
      });
      // Capture registrations before callbacks run; a reload cannot inherit another generation's condition result.
      const conditional = [...this.permitted(context.agentId).values()].filter(tool => tool.available !== undefined);
      const results = await Promise.race([Promise.all(conditional.map(async registration => {
        // A user callback must not receive the private registration as its `this` receiver.
        const available = registration.available!;
        return { registration, admitted: await available(context) };
      })), cancelled]);
      context.signal.throwIfAborted();
      if (this.steps.get(context.agentId) !== state) throw new Error("tool step admission is stale");
      for (const result of results) if (result.admitted === true) state.admitted.add(result.registration);
      state.ready = true;
      this.pruneLoadouts();
      return dispose;
    } catch (error) {
      dispose();
      throw error;
    }
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
  guardLabelsFor(execution: Pick<ToolExecution, "agentId">): string[] {
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
