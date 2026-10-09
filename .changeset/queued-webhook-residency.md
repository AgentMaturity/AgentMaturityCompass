---
"agent-maturity-compass": patch
---

Guard queued webhook native requests and supplied-client attempts with captured workspace and request inputs. Propagate residency refusals before retry or queue-round accounting, leaving the queued head pending.

This is partial, unqualified P2-01 source. Prior attempts, callback failure after successful delivery, partial accounting and trusted supplied-client behavior remain separate; queue states and public interfaces are unchanged.
