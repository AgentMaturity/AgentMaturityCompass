# Codex qualification receipts carried onto the held line (2026-10-18)

This file is an index, not a receipt. It records where each qualification folder that branch `rtd/codex-full-integration` adds to the held line `8022bec4e` came from. Every carried file is byte-identical to its source commit: no path was rewritten and no file was trimmed or dropped. The absolute `/Users/sid/...` paths and the large files inside these receipts are kept as committed; whether they may go to the public origin is an open question for Sid.

## P0-27: two receipts with the same folder name

`codex/p0-27-current-qualification` (c89c5a6e6) and `codex/p0-27-node-runtime-compatibility` (add3b6f59) both wrote `qualification/2026-10-15-P0-27/`, 66 files each, 11 of them with the same path and different bytes. To keep both byte-identical:

- `qualification/2026-10-15-P0-27/` is the copy from `codex/p0-27-current-qualification` at c89c5a6e6.
- `qualification/2026-10-15-P0-27-node-runtime/` is the copy from `codex/p0-27-node-runtime-compatibility` at add3b6f59. Its files still name `qualification/2026-10-15-P0-27/` internally, because they are unchanged.

## Map

"Leaves" means the main-stack leaves `codex/p0-14-bootstrap-qualification` (29e873d26) and `codex/p1-28-qualification` (ad13ae957), merged in 692a22b33 and c3e23b151; both carry the same bytes for every folder below that comes from them. The commit is the last commit that touched the folder on its source branch.

| Folder | Files | Source branch | Commit | Carried by |
| --- | ---: | --- | --- | --- |
| 2026-10-14-P0-22 | 44 | codex/p0-22-current-qualification | 00fd18043 | path checkout |
| 2026-10-14-P0-23 | 57 | codex/p0-23-current-qualification | 874e1131d | path checkout |
| 2026-10-14-P0-29 | 45 | codex/p0-29-current-qualification | 8b8f480ce | path checkout (9923f7d30) |
| 2026-10-14-P0-33 | 26 | codex/p0-33-current-qualification | 7d5d8335b | merge 94aaaf855 |
| 2026-10-14-P0-47 | 89 | codex/p0-47-current-qualification | 13bb8f543 | path checkout |
| 2026-10-14-P0-48 | 37 | codex/p0-48-current-qualification | 22bd7f35f | path checkout |
| 2026-10-14-P0-49 | 14 | codex/p0-49-current-qualification | ab475ec81 | path checkout |
| 2026-10-14-P0-50 | 35 | codex/p0-50-current-qualification | 941f5d243 | path checkout |
| 2026-10-14-P0-51 | 55 | codex/p0-51-current-qualification | d11fcfc66 | path checkout |
| 2026-10-15-P0-11 | 212 | codex/p0-11-current-qualification (in the leaves) | 33a8e20bf | leaf merges |
| 2026-10-15-P0-18 | 63 | codex/p0-18-current-qualification | ba7726c79 | path checkout |
| 2026-10-15-P0-19 | 85 | codex/p0-19-current-qualification | 6e50f7673 | path checkout |
| 2026-10-15-P0-20 | 70 | codex/p0-20-current-qualification | e901e9816 | path checkout |
| 2026-10-15-P0-21 | 260 | codex/p0-21-current-qualification (in the leaves) | 2024f25c7 | leaf merges |
| 2026-10-15-P0-24 | 71 | codex/p0-24-current-qualification | dc1270271 | path checkout |
| 2026-10-15-P0-25 | 57 | codex/p0-25-current-qualification (in the leaves) | f58d88d80 | leaf merges |
| 2026-10-15-P0-27 | 66 | codex/p0-27-current-qualification | c89c5a6e6 | path checkout |
| 2026-10-15-P0-27-node-runtime | 66 | codex/p0-27-node-runtime-compatibility, from its `2026-10-15-P0-27/` | add3b6f59 | renamed path checkout |
| 2026-10-15-P0-30 | 149 | codex/p0-30-current-qualification (in the leaves) | 2d552741d | leaf merges |
| 2026-10-15-P0-41 | 177 | codex/p0-41-current-qualification (in the leaves) | 559fafc4f | leaf merges |
| 2026-10-15-P0-45 | 157 | codex/p0-45-current-qualification (in the leaves) | fa3c3e555 | leaf merges |
| 2026-10-15-P0-46 | 39 | codex/p0-46-current-qualification | 2dedd6c80 | path checkout |
| 2026-10-15-P0-52 | 48 | codex/p0-52-current-qualification | 06217dd2b | path checkout |
| 2026-10-15-P0-54 | 43 | codex/p0-54-current-qualification | 4b6756224 | path checkout |
| 2026-10-15-P1-01 | 198 | codex/p1-01-current-qualification (in the leaves) | 7293e9596 | leaf merges |
| 2026-10-16-P1-04 | 4 | codex/p1-04-qualification (in the leaves) | 3a15c654d | leaf merges |
| 2026-10-16-P1-05 | 3 | codex/p1-05-qualification (in the leaves) | 94d71adc2 | leaf merges |
| 2026-10-16-P1-07 | 319 | codex/p1-07-gate-qualification (in the leaves) | 4f53ff7e5 | leaf merges |
| 2026-10-16-P1-10 | 3 | codex/p1-10-qualification 91c92891e, rewritten on the leaves | 25cd228fe | leaf merges |
| 2026-10-16-P1-17 | 35 | codex/p1-17-qualification (in the leaves) | 6b18871c6 | leaf merges |
| 2026-10-16-P1-19 | 141 | codex/p1-19-qualification (in the leaves) | 6d7631980 | leaf merges |
| 2026-10-16-P1-24 | 34 | codex/p1-24-qualification (in the leaves) | bce7bbbb2 | leaf merges |
| 2026-10-16-P1-35 | 160 | codex/p1-35-legacy-qualification (in the leaves) | bf8836cd3 | leaf merges |
| 2026-10-16-P1-37 | 49 | codex/p1-37-qualification (in the leaves) | 67c4fc34f | leaf merges |
| 2026-10-16-P1-39 | 104 | codex/p1-39-mcp-qualification (in the leaves) | 721e60d75 | leaf merges |
| 2026-10-16-P2-07 | 74 | codex/p2-07-scim-handler-qualification (in the leaves) | 81758acea | leaf merges |
| 2026-10-17-P0-09 | 3 | leaves only | 03be82012 | leaf merges |
| 2026-10-17-P0-15 | 3 | leaves only | b2d5feb05 | leaf merges |
| 2026-10-17-P0-42 | 3 | leaves only | 213ec0f4e | leaf merges |
| 2026-10-17-P0-49 | 3 | leaves only (separate from 2026-10-14-P0-49) | 84f3ada9d | leaf merges |
| 2026-10-17-P0-50 | 3 | leaves only (separate from 2026-10-14-P0-50) | b8b2d9958 | leaf merges |
| 2026-10-17-P1-11 | 270 | codex/p1-11-evidence-qualification (in the leaves) | 85dd9d9bd | leaf merges |
| 2026-10-17-P1-12 | 279 | codex/p1-12-compiled-guard-qualification fc2e64eb6, rewritten on the leaves (test candidate kept as `.source.txt`) | 2aa32d5e4 | leaf merges |
| 2026-10-17-P1-25 | 2,935 | codex/p1-25-producer-qualification (in the leaves) | c3718e6e5 | leaf merges |
| 2026-10-17-P1-26 | 381 | codex/p1-26-tree-qualification (in the leaves) | e2cbdb909 | leaf merges |
| 2026-10-17-P1-28 | 3 | codex/p1-28-qualification | 076e4c794 | leaf merges |
| 2026-10-17-P1-54 | 3 | codex/p1-54-qualification (in the leaves) | 0c9f5beb8 | leaf merges |

Three more folders arrived with merge 94aaaf855 because `codex/p0-33-current-qualification` is based on session 7fccbbfa's int at 990cb586f. They are that session's receipts, not Codex's: 2026-10-12-P1-06 (11 files, 448d8b3ed), 2026-10-12-P1-27 (12 files, 9429437a7) and 2026-10-12-P1-48 (2 files, b4677a5fb).

Earlier versions of the receipts the leaves rewrote (P1-10, P1-12, P1-25, P2-07) stay reachable in the merged history.
