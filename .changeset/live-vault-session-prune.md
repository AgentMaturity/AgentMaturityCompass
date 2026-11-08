---
"agent-maturity-compass": patch
---

Console session records in `.amc/studio/sessions` are now pruned: creating a session deletes records that expired more than a day ago (at most once every five minutes per process), so sign-in checks no longer slow down with every login over a deployment's life. Revoked sessions that have not expired are kept so their tokens keep failing.
