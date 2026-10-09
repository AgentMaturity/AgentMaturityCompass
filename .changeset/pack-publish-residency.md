---
"agent-maturity-compass": patch
---

Check pack registry uploads against the captured operation workspace immediately before the prepared PUT, and return redirects without following them. Existing dry-run/local-bundle paths, pack-directory defaults, tarball creation and publish result fields remain unchanged.

Partial, unqualified P2-01 source. Local bundle writes precede admission and a failed response does not prove an undispatched upload; delivery/residency qualification remains separate.
