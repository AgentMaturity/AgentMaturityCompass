---
"agent-maturity-compass": patch
---

Guard queued webhook native requests and supplied-client attempts with captured workspace and request inputs. Propagate residency refusals before retry or queue-round accounting, leaving the queued head pending.

Isolate a typed residency refusal to its dispatcher channel so other drains and terminal finalization continue. Existing status reads report saved pending rows truthfully as queued.

This is partial, unqualified P2-01 source. Prior attempts, callback failure after successful delivery, partial accounting and trusted supplied-client behavior remain separate; queue states and public interfaces are unchanged.
