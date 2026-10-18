# P0-30 AMC-1525 supplemental direct readonly guard

This distinct bounded corpus runs the ten unchanged original ledgerVerificationReadOnly.test.ts cases against a separate complete private copied candidate.

Baseline: 10 pass / 0 fail / 0 pending / 0 todo. Mutant: 7 pass / 3 fail / 0 pending / 0 todo. Restored: 10 pass / 0 fail / 0 pending / 0 todo.

Observed classification: assertion-specific behavioral failure in completed ten-case corpus. Exact original case names and assertion failures are retained in the JSON and raw reports.

Actual tsc emits the exact private guard mutation. Only the target JS differs during testing; unrelated emitted kernel output is restored from a pinned baseline. All 7,739 source files and 4,529 compiled files are restored exactly, with protected live pins and native bytes/inode unchanged.

The original full62 fifth run remains 44 passing, three failed and 15 pending after portable fixture refusal. Its receipt, Markdown, 322 references, full copied closure and frozen physical fixtures are unchanged. This supplement does not relabel it. Compatible previously captured fixed-data effects are reused by hash; no redundant effect probe ran.

The supplemental immutable index contains 62 references and the frozen journal contains 8 actual phases. No live source or permanent test was edited.

Broader P0-30/held batch, Node24, full suite, coverage, hosted CI, release, product repair and Done approval remain unqualified.
