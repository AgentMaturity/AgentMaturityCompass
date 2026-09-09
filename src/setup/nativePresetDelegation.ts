import type { AgentPreset } from "../presets/agentPresets.js";

export interface NativeDelegationOptions {
  delegate?: boolean;
  delegateScope?: string;
  delegateStop?: string[] | false;
  maxDelegationDepth?: string;
  delegateProvider?: string;
  delegateTimeout?: string;
}
export class NativeDelegationSelectionError extends Error {
  constructor() {
    super("--no-delegate cannot be combined with explicit child scope, depth, provider, timeout or stop options. Remove those child options to disable delegation; signed approval and budget controls remain in force.");
    this.name = "NativeDelegationSelectionError";
  }
}

/** An explicit disabled capability cannot be restored by inherited child defaults. */
export function applyNativeDelegationPreset<T extends NativeDelegationOptions>(options: T, preset: AgentPreset["delegate"]): T & NativeDelegationOptions {
  if (options.delegate === false && [options.delegateScope, options.delegateStop, options.maxDelegationDepth, options.delegateProvider, options.delegateTimeout]
    .some(value => value !== undefined)) throw new NativeDelegationSelectionError();
  const inherited = options.delegate === false ? undefined : preset;
  return { ...options,
    delegate: options.delegate ?? inherited?.enabled,
    delegateScope: options.delegateScope ?? inherited?.scope?.join(","),
    delegateStop: options.delegateStop ?? inherited?.stopConditions,
    maxDelegationDepth: options.maxDelegationDepth ?? (inherited?.maxDepth === undefined ? undefined : String(inherited.maxDepth)),
    delegateProvider: options.delegateProvider ?? inherited?.provider,
    delegateTimeout: options.delegateTimeout ?? (inherited?.timeoutMs === undefined ? undefined : String(inherited.timeoutMs))
  };
}
