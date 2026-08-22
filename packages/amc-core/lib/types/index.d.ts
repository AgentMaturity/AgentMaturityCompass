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
export { AmcSeam, defineSeam, type SeamDefinition } from "./seam.ts";
export { checkDisposal, describeDisposal, type DisposalReport, type CheckDisposalOptions, type DisposalProbe } from "./hmrSafety.ts";
export { createAgentScope, emitPlatformEvent, type AgentScope, type Scoped } from "./scope.ts";
export type { AmcEventOrigin, AmcAction, AmcGuardDecision, AmcDenyDecision, AmcScopedEnvelope } from "./events.ts";
export { installInvariants, defaultInvariantMode, InvariantError, type InvariantsService, type InvariantViolation, type InvariantCheck, type InvariantMode } from "./invariants.ts";
export { checkSessionEnclosure, checkFifo, checkPromptReconstruction, checkApprovalPairing, registerSessionInvariants, type SessionEvent } from "./invariantCompanions.ts";
//# sourceMappingURL=index.d.ts.map