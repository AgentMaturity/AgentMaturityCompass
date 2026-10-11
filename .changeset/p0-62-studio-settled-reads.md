---
"agent-maturity-compass": patch
---

Studio no longer judges a native task from a history read that another writer interrupted. A read refused because the workspace store changed while it was being read (`CHANGED`) is retried with bounded backoff (25 ms doubling to 1 s, for up to 30 s) before a turn is dispatched and after a turn's result arrives. The turn's outcome is decided only from a read taken while the store held still. If the store keeps changing for 30 s, Studio fails closed: the turn is not dispatched, or the task is marked failed with the message "Committed history kept changing while it was read, for 30 s…". The status view keeps the last authenticated snapshot while reads are refused for that reason (verification is reset to not verified), instead of showing "Evidence unavailable" and ending the page's polling. Verification and resume still require a fresh read. Every other refusal still fails closed at once.
