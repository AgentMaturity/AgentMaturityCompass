# Preservation adapter static review

V1 has one bounded pre-execution issue: its inherited Git argv omits `--no-optional-locks`, allowing a status read to refresh index stat data. Root agreed to preserve V1 and obtain a separate one-option successor. No actual index or content change was observed or assumed; this is a static read-only-policy finding, not a runtime failure or new user approval hold.

No other concrete blocker was found. The exact sealed source, full delta, actual metadata shapes and unready template fit. The three successors require exact old rows, same path/dev/inode/nlink and new bytes matching pinned publication expectations. The other 172 protected rows, all thirteen native identities and all 102 source/fresh pairs remain guarded. The pair selection contains only the receipt schema under qualification, so it correctly retains its original rows after the three active packet indices change.

The future template stays false/null. Four ACTIVE/HALTED markers are checked before and after the guard work. Missing reservations are checked only as retained metadata; no path was probed. Source cleanliness is required before metadata and intentionally not claimed during the admitted staged transition afterward. Q and held R remain mandatory checks.

This reviewer did not author or execute the helper. Source, index, QA, original evidence and decisions were untouched. Root must review and adopt the narrow successor before any execution; full metadata publication and quality/commit/export work remain separate.
