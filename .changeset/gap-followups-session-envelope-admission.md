---
"agent-maturity-compass": patch
---

The JSONL and Postgres session stores now refuse, at append, a native session row that has no session envelope. They use the same admission rule as the history verifiers, so the non-session types `work/accepted` and `time/checkpoint` still append without one. Before this change, one such row was written, and the store then refused to reopen that history for writing ("existing history failed authentication").
