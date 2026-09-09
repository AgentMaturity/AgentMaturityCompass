import { parseDelegationScope } from "../agent/delegationScope.js";
import { parseSubagentStopConditions } from "../agent/subagentStopConditions.js";
import { credentialRef } from "../credentials/credentialRef.js";
import { isActionClass } from "../governor/actionCatalog.js";
import { resolvePreset, type AgentPreset } from "../presets/agentPresets.js";
import type { NativeFirstUseOptions } from "./nativeFirstUseGuide.js";

export interface NativeChatProfileOptions extends NativeFirstUseOptions {
  readonly preset?: string;
  readonly persona?: string;
  readonly delegate?: boolean;
  readonly maxDelegationDepth?: string;
  readonly delegateScope?: string;
  /** False explicitly clears a signed preset's extra stops. Effective values are arrays. */
  readonly delegateStop?: readonly string[] | false;
  readonly tools?: string;
  readonly toolMode?: string;
  readonly maxTokens?: string;
  readonly maxSteps?: string;
  readonly approveTools?: string;
  readonly approveRisk?: string;
}

export interface NativeChatProfile {
  /** Feed these into the existing read-only guide before asking for missing intent. */
  readonly guideOptions: NativeFirstUseOptions;
  /** Explicit flags, then signed preset, then chat's existing bounded defaults. */
  readonly effectiveOptions: NativeChatProfileOptions;
  /** Only identity is public; do not print a whole preset or its persona. */
  readonly presetId: string | null;
  /** Selected signed composition, retained for admission before each later turn. */
  readonly presetSnapshot: AgentPreset | null;
}

export class NativeChatProfileError extends Error {
  constructor(message: string) { super(message); this.name = "NativeChatProfileError"; }
}

function positiveOption(name: string, explicit: string | undefined, fromPreset: number | undefined): string | undefined {
  const raw = explicit ?? (fromPreset === undefined ? undefined : String(fromPreset));
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || raw.trim() === "") {
    throw new NativeChatProfileError(`${name} must be a positive integer for interactive chat.`);
  }
  return String(value);
}

/** Reads signed preset metadata only. No credential values, watches, sessions or providers. */
export function resolveNativeChatProfile(options: NativeChatProfileOptions): NativeChatProfile {
  let preset: AgentPreset | null = null;
  if (options.preset !== undefined) {
    if (!options.preset.trim() || /[\x00-\x1f\x7f]/.test(options.preset)) {
      throw new NativeChatProfileError("Choose a nonempty preset ID without control characters.");
    }
    const selected = resolvePreset(options.workspace, options.preset);
    if (!selected.ok) {
      // Parser diagnostics can contain literal file values. Keep them out of a
      // terminal which is only asking to select a native composition.
      throw new NativeChatProfileError("The selected preset is missing, invalid or has an unverifiable signature. Review .amc/agents.yaml and its signature before starting chat.");
    }
    preset = selected.preset;
  }

  const provider = options.provider ?? preset?.providerId;
  const model = options.model ?? preset?.model;
  const tools = options.tools ?? preset?.tools;
  const toolMode = options.toolMode ?? preset?.toolMode ?? "native";
  const persona = options.persona ?? preset?.persona;
  const delegate = options.delegate ?? preset?.delegate?.enabled ?? false;
  if (options.credential !== undefined) {
    try { credentialRef(options.credential); }
    catch { throw new NativeChatProfileError("Use a credential reference name, never a key value."); }
  }
  if (tools !== undefined && !["workspace", "echo", "none"].includes(tools)) {
    throw new NativeChatProfileError("Choose --tools workspace, echo or none.");
  }
  if (toolMode !== "native") {
    throw new NativeChatProfileError("Interactive chat currently supports native tool dispatch only. A code-mode preset cannot be silently downgraded or run in an unconfined process.");
  }
  if (persona !== undefined && (persona.trim() === "" || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(persona))) {
    throw new NativeChatProfileError("A persona must contain text without terminal control characters.");
  }
  if (delegate && tools !== "workspace") {
    throw new NativeChatProfileError("Native delegation requires --tools workspace (explicitly or in the signed preset) and an independently signed delegate tool grant.");
  }
  if (delegate && preset?.delegate?.provider !== undefined && preset.delegate.provider !== "in-process") {
    throw new NativeChatProfileError("This preset selects a foreign delegate. Native chat supports in-process delegation only; select a native preset explicitly.");
  }
  if (delegate && preset?.delegate?.timeoutMs !== undefined) {
    throw new NativeChatProfileError("This preset sets a foreign-process delegation timeout. Remove that unused setting from the native preset instead of silently ignoring it.");
  }
  if (!delegate && (options.maxDelegationDepth !== undefined || options.delegateScope !== undefined || options.delegateStop !== undefined)) {
    throw new NativeChatProfileError("Delegation bounds require --delegate or delegate.enabled in the signed preset.");
  }
  const rawStops = !delegate ? undefined : options.delegateStop === false ? [] : options.delegateStop ?? preset?.delegate?.stopConditions;
  const stopConditions = parseSubagentStopConditions(rawStops);
  if (!stopConditions.ok) throw new NativeChatProfileError(`--delegate-stop: ${stopConditions.reason}`);
  const maxTokens = positiveOption("--max-tokens", options.maxTokens, preset?.maxTokens);
  const maxSteps = positiveOption("--max-steps", options.maxSteps, preset?.maxSteps);
  const maxDelegationDepth = delegate
    ? positiveOption("--max-delegation-depth", options.maxDelegationDepth, preset?.delegate?.maxDepth)
    : undefined;
  const scope = options.delegateScope === undefined
    ? preset?.delegate?.scope
    : options.delegateScope.split(",").map(token => token.trim()).filter(Boolean);
  let delegateScope: string | undefined;
  if (delegate && scope !== undefined) {
    const parsed = parseDelegationScope(scope);
    if (!parsed.ok) throw new NativeChatProfileError("Delegation scope must name supported action classes and cannot be empty. No partial scope was accepted.");
    delegateScope = parsed.classes.join(",");
  }
  const approveTools = (options.approveTools ?? preset?.approveTools)?.trim().toUpperCase();
  const approveRisk = options.approveRisk?.trim().toLowerCase();
  if (approveTools !== undefined && !isActionClass(approveTools)) {
    throw new NativeChatProfileError("The approval gate must name a supported action class.");
  }
  if (approveRisk !== undefined && (approveTools === undefined || !["low", "medium", "high", "critical"].includes(approveRisk))) {
    throw new NativeChatProfileError("--approve-risk requires a configured approval class and low, medium, high or critical.");
  }

  const guideOptions: NativeFirstUseOptions = {
    workspace: options.workspace,
    ...(options.agentId === undefined ? {} : { agentId: options.agentId }),
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(provider === undefined ? {} : { provider }),
    ...(model === undefined ? {} : { model }),
    ...(options.credential === undefined ? {} : { credential: options.credential }),
    ...(options.credentialsHome === undefined ? {} : { credentialsHome: options.credentialsHome }),
    ...(options.credentialsFile === undefined ? {} : { credentialsFile: options.credentialsFile }),
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.userEnvPath === undefined ? {} : { userEnvPath: options.userEnvPath })
  };
  const effectiveOptions: NativeChatProfileOptions = {
    ...guideOptions, delegate, toolMode,
    ...(options.preset === undefined ? {} : { preset: options.preset }),
    ...(persona === undefined ? {} : { persona }),
    ...(tools === undefined ? {} : { tools }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(maxSteps === undefined ? {} : { maxSteps }),
    ...(maxDelegationDepth === undefined ? {} : { maxDelegationDepth }),
    ...(delegateScope === undefined ? {} : { delegateScope }),
    ...(rawStops === undefined ? {} : { delegateStop: stopConditions.conditions }),
    ...(approveTools === undefined ? {} : { approveTools }),
    ...(approveRisk === undefined ? {} : { approveRisk })
  };
  return { guideOptions, effectiveOptions, presetId: preset?.id ?? null, presetSnapshot: preset };
}

/**
 * Append these composition-only arguments to chat's existing provider/model/
 * credential/tool/budget/approval arguments, all from effectiveOptions + guide.
 * Free text stays one argv entry; it is never interpolated into a shell.
 */
export function nativeChatProfileArgv(profile: NativeChatProfile, surface: "run" | "chat" = "run"): readonly string[] {
  const options = profile.effectiveOptions;
  return [
    ...(profile.presetId === null ? [] : [`--preset=${profile.presetId}`]),
    ...(options.persona === undefined ? [] : [`--persona=${options.persona}`]),
    ...(surface === "run" ? ["--tool-mode=native"] : []),
    ...(options.delegate ? ["--delegate", ...(surface === "run" ? ["--delegate-provider=in-process"] : []),
      ...(options.maxDelegationDepth === undefined ? [] : [`--max-delegation-depth=${options.maxDelegationDepth}`]),
      ...(options.delegateScope === undefined ? [] : [`--delegate-scope=${options.delegateScope}`]),
      ...(options.delegateStop === undefined ? [] : options.delegateStop === false || options.delegateStop.length === 0
        ? ["--no-delegate-stop"] : options.delegateStop.map(condition => `--delegate-stop=${condition}`))] : ["--no-delegate"])
  ];
}

/** A later turn must not silently adopt a newly edited or unsigned composition. */
export function assertNativeChatProfileCurrent(profile: NativeChatProfile): void {
  if (profile.presetId === null) return;
  const current = resolvePreset(profile.guideOptions.workspace, profile.presetId);
  if (!current.ok || JSON.stringify(current.preset) !== JSON.stringify(profile.presetSnapshot)) {
    throw new NativeChatProfileError("The selected signed preset changed or no longer verifies. Start a new chat after reviewing its current composition; this turn was not started.");
  }
}
