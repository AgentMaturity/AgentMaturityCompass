/** What AMC is asked about one DSH tool call. */
export interface AmcDshRequest {
  tool: string;
  arguments: unknown;
  callId: string;
  rootCallId: string;
  /** True for a sub-dispatch (for example a call made inside a `run_code` program). */
  nested: boolean;
  dshVersion: string;
}

/** The only answers that are not a denial: exactly `{ decision: "allow" }`, or `{ decision: "deny", reason }`. */
export type AmcDshAnswer = { decision: "allow" } | { decision: "deny"; reason: string };

/** A privacy-minimal record of one finished call: no arguments, no output. */
export interface AmcDshObservation {
  tool: string;
  callId: string;
  rootCallId: string;
  isError: boolean;
}

export interface AmcDshPluginOptions {
  /** Asks AMC; a throw or a timeout denies the call. */
  decide(request: AmcDshRequest, signal?: AbortSignal): AmcDshAnswer | Promise<AmcDshAnswer>;
  observe?(observation: AmcDshObservation): void;
  /** The DSH version this process runs; a version outside `qualifiedVersions` is denied. */
  dshVersion: string;
  qualifiedVersions: readonly string[];
  timeoutMs?: number;
}

/** A Cordis object plugin. */
export interface AmcDshPlugin {
  name: string;
  inject: string[];
  apply(ctx: unknown): void;
}

export const name: string;
export const inject: string[];
export const DENY_NO_ARGUMENTS: string;
export const DENY_UNAVAILABLE: string;
export const DENY_MALFORMED: string;
export const DENY_NOT_ALLOWED: string;
export function createAmcDshPlugin(options: AmcDshPluginOptions): AmcDshPlugin;

/** What the DSH profile entry passes: the AMC workspace, AMC's transport module, DSH's version and the qualified versions. */
export interface AmcDshPluginConfig {
  workspace: string;
  transport: string;
  dshVersion: string;
  qualifiedVersions: readonly string[];
}

/** Cordis entry point: the gate, asking AMC through the transport `config` names; a bad config denies every call. */
export function apply(ctx: unknown, config: AmcDshPluginConfig): void;
