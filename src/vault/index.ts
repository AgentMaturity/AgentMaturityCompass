// Dedicated module exports
export { SecretsBroker, mintSecretToken } from './secretsBroker.js';
export type { SecretStoreResult, SecretRetrieveResult, SecretListItem } from './secretsBroker.js';
export { MemoryTtlStore, storeWithTtl } from './memoryTtl.js';
export { checkResidency, checkDataResidency } from './dataResidency.js';
export type { DataRecord, ResidencyPolicy, ResidencyResult } from './dataResidency.js';
export { redactScreenshotMetadata, hasExifData, redactScreenshot } from './screenshotRedact.js';
export type { RedactResult } from './screenshotRedact.js';
export { UndoLayer, snapshotBeforeChange, undoChange } from './undoLayer.js';
export type { ActionRecord, UndoResult, RedoResult } from './undoLayer.js';

// Legacy types
// Legacy types (were in vault/stubs.ts, inlined here)
export type MemoryRecord = { key: string; purpose: string; expiresAt: Date; stored: boolean; };
export type ResidencyCheck = { compliant: boolean; region: string; allowedRegions: string[]; };
export type UndoSnapshot = { snapshotId: string; resourceId: string; operation: string; canUndo: boolean; };
export type { SecretStoreResult as SecretToken } from './secretsBroker.js';
