# Load persisted session evidence after restart

The Node package exports `loadSessionEventHistory` from both
`agent-maturity-compass` and `agent-maturity-compass/sdk/native`. No running
client, internal import, model call or writable session is required.

```ts
import {
  loadSessionEventHistory, SessionHistoryRefused,
} from "agent-maturity-compass/sdk/native";

try {
  const history = loadSessionEventHistory({
    workspace: "/existing/amc-workspace",
    sessionId: "EXACT_RECORDED_SESSION_ID",
    // Optional: require the native signed identity, not a display name.
    agentId: "default",
    requireSealed: true,
    // Supply a real fingerprint obtained independently, not from this workspace.
    expectedMonitorFingerprint: process.env.TRUSTED_AMC_MONITOR_SHA256,
  });
  console.log(history.backend, history.headEventHash, history.verification);
  // Actual persisted rows, including control/audit rows and exact meta_json.
  // Unlike resumedSession.history, these are NOT conversation projections.
  for (const row of history.events) console.log(row.id, row.event_type);
} catch (error) {
  if (error instanceof SessionHistoryRefused) console.error(error.code, error.message);
  else throw error;
}
```

The reader honors the workspace's existing version-one session-store marker.
Conflicting or invalid `AMC_SESSION_STORE` is refused. JSONL requires its marker,
event log and lifecycle log; an operations SQLite database never supplies missing
JSONL history. A legacy SQLite workspace may lack a marker when no JSONL tree is
present. The reader creates no workspace, marker, keys, writer lock or evidence.
Filesystem aliases of the selected workspace resolve to the same directory;
links within the evidence and trust paths are refused.

## What is verified

Every load authenticates **all available events in the selected store before
filtering**: original row hashes, monitor signatures, global ordering, native
session-envelope ordering and existing lifecycle seals. Missing, malformed,
unsigned, modified and unsupported evidence fails visibly; no partial success or
fallback rows are returned. `sessionId` selects the exact persisted identity;
`agentId` additionally matches its signed native `session/open` metadata.
The returned rows, records and verdict are immutable snapshots. Hash and
signature verification applies to AMC's existing event-hash preimage; separately
attached receipt fields and retention annotations do not gain an independent
verification verdict merely by appearing in a returned row.

By default `verification.payloads` is `not-read`. This is deliberately a
**signed-metadata** verdict: it neither reads/decrypts event payload blobs nor
retrieves retained tool output. Set `verifyPayloads: true` for the native stored
event payload/compaction verifier as well. That option can require decryption
keys and refuses missing payloads and retention formats it does not adjudicate.
It still does not verify retained spill objects, request reconstruction,
operator task success or an entire exported archive. Use the dedicated native
run verifier and retained-output APIs for those distinct questions.

No external monitor fingerprint means workspace-key consistency only. An
explicit fingerprint or `AMC_EXPECTED_MONITOR_FINGERPRINT` must be a complete
lowercase SHA-256. A successful pin matches the current monitor trust root and
uses AMC's existing authenticated key-history admission; the loader does not
grant additional keys or upgrade imported provenance.

`requireSealed` is optional. Without it a live/unsealed prefix can be read, but
`sealed: false` is explicit. Even a sealed log and a pinned key do not prove the
absence of an entirely removed session or a rollback to an older valid snapshot.
Supply an independently saved `expectedHeadEventHash` for the requested scope
to detect a different head. `headEventHash` names that scope; `storeHeadEventHash`
names the full selected store. Completeness means **all currently available
events in the requested scope**, not evidence that existed before erasure.

The reader refuses observed append/replacement/trust changes during loading.
It does not lock writers or provide a transaction across files. Quiesce writers
and retention for operational decisions; after a `CHANGED` refusal, deliberately
load a new snapshot rather than automatically repeating a mutation.

## Use the complete workspace history for lifecycle operations

```ts
import { loadSessionEventHistory, inventorySessionSpills } from "agent-maturity-compass";

const history = loadSessionEventHistory({ workspace: "/existing/amc-workspace" });
// Omit sessionId: inventory/transport/erasure need all available references,
// including references outside any proposed exact erasure scope.
const inventory = inventorySessionSpills({ workspace: history.workspace, events: history.events });
console.log(inventory);
```

The metadata loader works with a locked vault and does not restore pruned bytes,
bypass retention, interpret data subjects, erase backups or authorize another
user. Rows may contain sensitive metadata or legacy inline payloads: access is
the local operator's filesystem authority, not a new network authorization grant.
Do not publish raw rows as ordinary logs. Existing spill read/export/restore and
reviewed exact-scope erasure boundaries remain unchanged.

## Qualification boundary

Studio's managed-task reader uses this same selected-store history path for
cold inspection and archival. Non-owning observers refresh authenticated task
admissions before acknowledging an exact retry; they do not automatically
dispatch, resume or grant a new task. Reading JSONL after restart does **not**
add JSONL writer-resume ownership: that separate unsupported operation remains
an explicit refusal.

Managed children preserve an explicitly configured operator
`AMC_CONTROL_CHECKPOINT_DIR`, so signed-policy rollback checks use the same
external checkpoint directory after process start. This is server configuration,
not a task/browser-supplied path or an exception to signed policy verification.

The API and its regressions are source changes. A build or focused source test
is not an installed-consumer, broad platform, full-suite, human or deployment
qualification. A new package exercise must pin a package built from the source
containing this API; historical `a5987643` spill attempts do not include it.
