/**
 * SR-I1: signed evidence that forbids `amc verify --repair` from sealing a missing seal (LIVE-INTEGRITY-05).
 *
 * A writer without the monitor key can delete a sealed session's newest rows, when they end the ledger, and erase its
 * seal; the session then reads exactly like a crashed one. No signed row can tell the two apart (a row that witnessed the
 * seal comes after it and is deleted with it), so the only evidence is a signed ledger checkpoint (time/checkpoint.ts):
 * it commits to the head row. A session that started at or before the latest checkpoint's head is not sealed: the
 * checkpoint shows the ledger moved past it while it stood unsealed or sealed, and nothing says which. A ledger that no
 * longer holds that head lost rows signed before it. A timestamped checkpoint also leaves a signed `time/checkpoint` row,
 * so a row naming a checkpoint the files no longer hold shows checkpoint files were deleted. Checkpoints that do not
 * verify refuse every seal (fail closed). Without checkpoints nothing is refused here; the plan states the limit and the
 * operator confirms by typing.
 */
import { readCheckpointChain } from "../time/checkpoint.js";
import { workspaceSelfTrust } from "../trust/trustContext.js";
import type { Ledger } from "./ledger.js";

export function checkpointSealRefusals(workspace: string, ledger: Ledger, sessionIds: readonly string[]): string[] {
  let latest: ReturnType<typeof readCheckpointChain>[number] | undefined;
  try {
    latest = readCheckpointChain(workspace, workspaceSelfTrust(workspace)).at(-1);
  } catch (error) {
    return [`the signed ledger checkpoints do not verify (${error instanceof Error ? error.message : String(error)})`];
  }
  const stamped = (ledger.db.prepare(`SELECT MAX(CAST(json_extract(meta_json, '$.checkpointSequence') AS INTEGER)) AS n
    FROM evidence_events WHERE event_type = 'time/checkpoint'`).get() as { n: number | null }).n ?? 0;
  if (stamped > (latest?.checkpoint.sequence ?? 0)) {
    return [`the ledger records signed checkpoint ${stamped}, which the checkpoint files no longer hold`];
  }
  if (!latest) return [];
  const { sequence, claimedAt, ledger: head } = latest.checkpoint;
  const headRow = ledger.db.prepare("SELECT rowid AS r FROM evidence_events WHERE event_hash = ?").get(head.headEventHash) as { r: number } | undefined;
  if (!headRow) return [`the ledger no longer holds the head of signed checkpoint ${sequence} (${claimedAt}): rows signed before it were removed`];
  const firstRow = ledger.db.prepare("SELECT MIN(rowid) AS r FROM evidence_events WHERE session_id = ?");
  return sessionIds.filter((id) => ((firstRow.get(id) as { r: number | null }).r ?? Infinity) <= headRow.r)
    .map((id) => `Session ${id} started before signed checkpoint ${sequence} (${claimedAt})`);
}
