# Chosen contract: native managed controller reattachment

Existing coverage: AMC-1511, with AMC-1538 public validation and AMC-1540 immutable
submission identity retained as acceptance boundaries. No duplicate issue.

The current native ACP factory can reconstruct its own fixed approval gate and
operator-pinned validation/tool configuration. It cannot reconstruct arbitrary
external callbacks or an absent parent controller. Those refusals remain intact.

Two concrete implementation defects, read at runtime baseline
`b516869eeaa275fe31248024a02596d71255add0`:

1. `AMCNativeClient` observes its real child's close event, but Studio retains the
   dead client/session objects. An idle task remains falsely active and explicit
   resume returns that dead handle. Add read-only observed closure and serial
   reconciliation after preparation/turn/cleanup settle. Inspection must not
   append evidence, replay a submission, or claim a signed release. Explicit
   resume recreates only the existing native factory under original controls.
2. SQLite `resumeSession` verifies the chain and agent but not the original
   composition/policy or parent/hook/delegation controls that JSONL preserves.
   Enforce those controls before recovery/ownership append. Share the controller
   refusal logic rather than reconstructing callbacks or granting standalone
   authority to a delegated child. Ordinary explicit user cancellation remains
   resumable. Keep verified forks and non-executing recovery semantics separate.

Exact serial source/test/doc paths are in ownership.json. No CLI, StudioServer,
production policy, package, other-owner or central-status mutation is planned.
New helper writes are limited to the declared research files and scratch prefix.

Acceptance at the end: a fresh committed candidate; actual local writer death;
same-Studio refresh and explicit same-session resume; unchanged signed history,
submissions and model-header count until a new explicit turn; native approval
quorum and public validation after reattachment; changed settings/parent stop/
delegated/unresolved-child refusals before append; security mutations with exact
restoration. Cookie/browser/installed qualification is separate and will be named
only when actually exercised. No automatic retry, detached work, real provider,
full-suite, release, platform-matrix, publication or deployment claim.
