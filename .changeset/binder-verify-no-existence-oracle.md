---
"agent-maturity-compass": patch
---

Security: Studio's binder verify (`GET /audit/binders/:id/verify?file=`) no longer checks that the file exists before it reads it. A missing file now answers 422 `UNREADABLE`, the same as a file reached through a symbolic link, a hard link or anything that is not a regular file. Before, a missing path answered 404 while a linked one answered 422, which revealed whether a link's target existed. A request without a resolvable file (no `?file=` and no export for that binder id) still answers 404.
