# P0-51 proof export independent review — 14 October 2026

No actionable defect was found within the declared static-link refusal and best-effort race scope. This was a read-only source and fixture review; no tests, builds or edits ran.

The helper preserves ordinary caller-selected output outside the workspace and the operator workspace-root alias. It refuses static links below the real workspace root, nonregular leaves and leaves with multiple hard links. The open excludes O_TRUNC and uses O_NOFOLLOW/O_NONBLOCK. It admits the fd only after checking regularity, link count, fd/name device and inode, and realpath. Linux additionally checks the proc-fd path. Only then does ftruncate run. The tar hook writes through that admitted fd and never reopens the destination by name.

The tests cover genuine signed internal and external output, replacement of an ordinary existing file, new nested parents, parent and leaf links with unchanged owned sentinel bytes, hard links, directory/non-directory refusals, and a workspace-root alias. These are static fixture controls, not atomic race proof.

The helper can create directories and a new empty leaf before a later refusal. Swaps after validation remain possible on either operating system because Node exposes no directory-relative open here. Linux has an additional opened-path check; macOS has best-effort parent/name checks. The review supports no absolute no-effects or race-confinement claim.
