import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { openSessionEventStore } from "../../src/persistence/openSessionEventStore.js";
import { resumeSession } from "../../src/session/sessionResume.js";
import type { SessionService } from "../../src/session/sessionService.js";

/**
 * Resume a released native session as a local writer and append one sealed
 * turn built by `fill`, then release it again. Every row stays within the
 * signed per-event payload cap; what grows is the session's aggregate history,
 * which is the bound ACP replay must refuse without emitting a prefix.
 * Returns the number of rows the turn added.
 */
export function outgrowSession(workspace: string, sessionId: string, fill: (writer: SessionService) => void): number {
  const store = openSessionEventStore(workspace, undefined, { readOnly: true });
  let open;
  try { open = store.readSessionEvents(sessionId).find(row => row.event_type === "session/open"); } finally { store.close(); }
  if (!open) throw new Error(`session ${sessionId} has no session/open row`);
  const meta = JSON.parse(open.meta_json) as { agentId: string; harnessVersion: string; compositionDigest: string; policyDigest: string };
  const { service } = resumeSession({ workspace, sessionId, agentId: meta.agentId, harnessVersion: meta.harnessVersion,
    compositionDigest: meta.compositionDigest, policyDigest: meta.policyDigest,
    claimant: { pid: process.pid, hostId: hostname(), bootId: randomUUID(), startedAt: Date.now() } });
  const before = service.readEvents().length;
  let added = 0;
  try {
    service.startTurn({ trigger: "user" }); service.startStep();
    fill(service);
    service.endStep({ stopReason: "complete", usage: null }); service.endTurn({ reason: "complete" }); service.sealTurn();
    added = service.readEvents().length - before;
  } finally { service.releaseWithoutClosing(); }
  return added;
}

/** Enough rows of `bytes` each, once base64-encoded into replay updates, to exceed the ACP aggregate replay bound. */
export const OUTGROW_ROWS = 150;
export const OUTGROW_BYTES = 45_000;
