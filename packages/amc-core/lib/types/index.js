/**
 * @amc/core — AMC's composition kernel.
 *
 * The first package carved out of the monolith under ADR-0001's strangler
 * discipline: the existing `amc` CLI keeps working while the composed runtime
 * grows beside it.
 */
export { boot, BootError } from "./boot.js";
export { loadComposition, CompositionError, DEFAULT_COMPOSITION_FILE } from "./composition.js";
export { dumpComposition, renderCompositionDump } from "./dumpConfig.js";
export { watchFibers, describeUnsettled } from "./bootAudit.js";
//# sourceMappingURL=index.js.map