/** Provider-reported prompt pressure and reviewed, exact-route compaction settings. */
import { z } from "zod";
import { parseModelMetadataSnapshot } from "../../llm/modelCatalog.js";
import type { TokenUsage } from "../../session/sessionTypes.js";
import { PROMPT_TOKENS_FORMULA, promptTokensFor } from "../../session/surfaceCompactionValidation.js";
import type { CompactionConfig } from "../loopTypes.js";

export const DEFAULT_COMPACTION: CompactionConfig = Object.freeze({
  contextWindowTokens: null,
  threshold: 0.8,
  reserveTokens: null,
  keepRecentSteps: 2,
  pruneMinBytes: 4096,
  summarize: true,
  maxPerTurn: 3
});

/** Shared by runtime settings and signed presets; absent fields inherit independently. */
const settingsSchema = z.strictObject({
  contextWindowTokens: z.number().int().positive().safe().nullable().optional(),
  threshold: z.number().min(0.5).max(0.95).optional(),
  reserveTokens: z.number().safe().nonnegative().nullable().optional(),
  keepRecentSteps: z.number().int().min(1).max(1024).optional(),
  pruneMinBytes: z.number().int().min(1).max(1_000_000_000).optional(),
  summarize: z.boolean().optional(),
  maxPerTurn: z.number().int().min(1).max(64).optional()
});
export const compactionPolicySchema = settingsSchema.extend({
  modelOverrides: z.array(settingsSchema.extend({ providerId: z.string().min(1), model: z.string().min(1) })).optional()
}).superRefine((policy, context) => {
  for (const entry of [policy, ...(policy.modelOverrides ?? [])]) {
    if (entry.contextWindowTokens != null && entry.reserveTokens != null && entry.reserveTokens >= entry.contextWindowTokens) {
      context.addIssue({ code: "custom", path: ["reserveTokens"], message: "compaction reserve must be smaller than the context window" });
    }
  }
  const identities = policy.modelOverrides?.map(entry => JSON.stringify([entry.providerId, entry.model])) ?? [];
  if (new Set(identities).size !== identities.length) context.addIssue({ code: "custom", path: ["modelOverrides"], message: "duplicate compaction model override" });
});

/** Fill defaults and refuse invalid settings: a typo must not silently loosen or disable compaction. */
export function resolveCompactionConfig(input: Partial<CompactionConfig>): CompactionConfig {
  const given = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  const parsed = compactionPolicySchema.safeParse(given);
  if (!parsed.success) throw new Error("Automatic compaction needs a positive integer context window, a threshold from 0.5 through 0.95, "
    + "a nonnegative integer token reserve, 1-1024 recent steps kept, a positive prune size and 1-64 compactions per turn: " + parsed.error.message);
  return Object.freeze({ ...DEFAULT_COMPACTION, ...parsed.data });
}

type Selection = { readonly providerId: string; readonly model: string };
function selectedSettings(input: Partial<CompactionConfig>, route: Selection): Partial<CompactionConfig> {
  const { modelOverrides, ...raw } = input;
  const present = (settings: Partial<CompactionConfig>): Partial<CompactionConfig> => Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined));
  const base = present(raw);
  const selected = modelOverrides?.find(entry => entry.providerId === route.providerId && entry.model === route.model);
  if (selected === undefined) return base;
  const { providerId: _provider, model: _model, ...override } = selected;
  return { ...base, ...present(override) };
}

/** Capture defaults only from this selected route's immutable snapshot, never from a model-name guess. */
export function resolveRouteCompaction(input: Partial<CompactionConfig> | undefined, route: Selection, metadata: unknown): CompactionConfig {
  if (input !== undefined) resolveCompactionConfig(input);
  const selected = selectedSettings(input ?? {}, route), snapshot = parseModelMetadataSnapshot(metadata);
  const window = snapshot?.providerId === route.providerId && snapshot.model === route.model ? snapshot.contextWindowTokens : null;
  const effectiveWindow = selected.contextWindowTokens === undefined ? window : selected.contextWindowTokens;
  return resolveCompactionConfig({
    ...(window === null ? {} : { contextWindowTokens: window, reserveTokens: effectiveWindow !== null && effectiveWindow > 16384 ? 16384 : null }),
    ...selected,
    ...(selected.threshold !== undefined && selected.reserveTokens === undefined ? { reserveTokens: null } : {})
  });
}

/** Explicit CLI fields take precedence over exact signed preset fields. The driver supplies catalog defaults later. */
export function compactionFromFlags(flags: { readonly contextWindow?: string | undefined; readonly compactThreshold?: string | undefined;
  readonly autoSummary?: boolean | undefined; readonly autoCompact?: boolean | undefined }, preset?: Partial<CompactionConfig>,
  route?: Selection): Partial<CompactionConfig> | undefined {
  if (preset !== undefined) resolveCompactionConfig(preset);
  if (flags.autoCompact === false) {
    if (flags.contextWindow !== undefined || flags.compactThreshold !== undefined || flags.autoSummary === false) {
      throw new Error("--no-auto-compact turns automatic compaction off; --context-window, --compact-threshold and --no-auto-summary cannot be combined with it.");
    }
    return { contextWindowTokens: null }; // the explicit opt-out wins over reviewed route defaults and signed preset fields
  }
  if (flags.contextWindow === undefined && preset === undefined) {
    if (flags.compactThreshold !== undefined || flags.autoSummary === false) {
      throw new Error("--compact-threshold and --no-auto-summary require --context-window; unused options are not ignored.");
    }
    return undefined;
  }
  const inherited = route === undefined ? preset ?? {} : selectedSettings(preset ?? {}, route);
  const input = { ...inherited,
    ...(flags.contextWindow === undefined ? {} : { contextWindowTokens: Number(flags.contextWindow) }),
    ...(flags.compactThreshold === undefined ? {} : { threshold: Number(flags.compactThreshold), reserveTokens: null }),
    ...(flags.autoSummary === false ? { summarize: false } : {}) };
  resolveCompactionConfig(input);
  return input;
}

export interface PromptPressure {
  readonly promptTokens: number;
  readonly ratio: number;
  readonly formula: typeof PROMPT_TOKENS_FORMULA;
}

/** Null when the provider reported no usage for the step: not measured, never zero. */
export function measurePromptPressure(usage: TokenUsage | null, contextWindowTokens: number): PromptPressure | null {
  const promptTokens = promptTokensFor(usage);
  return promptTokens === null ? null : { promptTokens, ratio: promptTokens / contextWindowTokens, formula: PROMPT_TOKENS_FORMULA };
}
