import { randomUUID } from 'node:crypto';

export interface ActionRecord {
  actionId: string;
  payload: unknown;
  reversePayload: unknown;
  timestamp: string;
  undone: boolean;
}

export interface UndoResult { undone: boolean; actionId: string; reversePayload: unknown; }
export interface RedoResult { redone: boolean; actionId: string; payload: unknown; }

export class UndoLayer {
  private readonly history: ActionRecord[] = [];

  recordAction(actionId: string, payload: unknown, reversePayload: unknown): ActionRecord {
    const record: ActionRecord = { actionId, payload, reversePayload, timestamp: new Date().toISOString(), undone: false };
    this.history.push(record);
    return record;
  }

  undoAction(actionId: string): UndoResult {
    const record = this.history.find(r => r.actionId === actionId && !r.undone);
    if (!record) return { undone: false, actionId, reversePayload: null };
    record.undone = true;
    return { undone: true, actionId, reversePayload: record.reversePayload };
  }

  redoAction(actionId: string): RedoResult {
    const record = this.history.find(r => r.actionId === actionId && r.undone);
    if (!record) return { redone: false, actionId, payload: null };
    record.undone = false;
    return { redone: true, actionId, payload: record.payload };
  }

  getHistory(): ActionRecord[] {
    return [...this.history];
  }

  canUndo(actionId: string): boolean {
    return this.history.some(r => r.actionId === actionId && !r.undone);
  }

  canRedo(actionId: string): boolean {
    return this.history.some(r => r.actionId === actionId && r.undone);
  }
}

/**
 * Process-wide undo history backing the convenience wrappers below.
 */
const defaultUndoLayer = new UndoLayer();

/**
 * Records a reversible change against the module-level history.
 *
 * This previously discarded `data` and returned `canUndo: true` without
 * recording anything, so undoChange could never restore what it claimed to.
 */
export function snapshotBeforeChange(resourceId: string, operation: string, data: unknown) {
  const snapshotId = randomUUID();
  defaultUndoLayer.recordAction(snapshotId, { resourceId, operation }, data);
  return {
    snapshotId,
    resourceId,
    operation,
    canUndo: defaultUndoLayer.canUndo(snapshotId)
  };
}

/**
 * Reverses a change recorded by {@link snapshotBeforeChange}.
 *
 * Returns `restored: false` for an unknown or already-undone snapshot; this
 * previously always reported success.
 */
export function undoChange(snapshotId: string) {
  const result = defaultUndoLayer.undoAction(snapshotId);
  return { restored: result.undone, snapshotId, reversePayload: result.reversePayload };
}
