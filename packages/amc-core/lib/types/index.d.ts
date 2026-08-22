/**
 * @amc/core — AMC's composition kernel.
 *
 * The first package carved out of the monolith under ADR-0001's strangler
 * discipline: the existing `amc` CLI keeps working while the composed runtime
 * grows beside it.
 */
export { boot, BootError, type BootOptions, type BootResult } from "./boot.ts";
export { loadComposition, CompositionError, DEFAULT_COMPOSITION_FILE, type CompositionSource, type CompositionSignatureStatus } from "./composition.ts";
export { dumpComposition, renderCompositionDump, type CompositionDump, type DumpedEntry } from "./dumpConfig.ts";
export { watchFibers, describeUnsettled, type UnsettledFiber } from "./bootAudit.ts";
export { SettingsStore, SettingsConflictError, SettingsPathError, type SettingsSnapshot, type SettingValue, type SettingsWrite, type SettingsLayer, type SettingsStoreOptions } from "./settings.ts";
//# sourceMappingURL=index.d.ts.map