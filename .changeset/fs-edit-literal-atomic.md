---
"agent-maturity-compass": patch
---

`fs.edit` now replaces text literally: `$$`, `$&`, `` $` `` and `$'` in the replacement are written as typed instead of being expanded as `String.prototype.replace` patterns. `fs.write` and `fs.edit` now write atomically (temporary file in the same directory, fsync, rename) and keep the replaced file's mode, so an interrupted write leaves the previous contents in place. A file the caller may not write is still refused with EACCES.
