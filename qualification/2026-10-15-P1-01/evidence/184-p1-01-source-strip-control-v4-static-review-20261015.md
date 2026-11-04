# P1-01 strip-control v4 static review

No blocking static finding in `01931c4fd626984a21946ed5276df8eed94d7ab716052509c9f67dea7ea4cb59` (11,064 bytes). The complete added block requires successful real compilation and group ESRCH, then accepts only the exact known thin kernel output. It retains that output and restores the accepted parent bundle before any mutant probe.

The thin output is byte-identical to the unchanged kernel source: 1,003 bytes, SHA256 `7960e3a179f94a8ed511eb24176d49da67e8e162919e71878b4cc14c514e14d1`. Normal build explicitly replaces it with `bundle-kernel.mjs`; that script bundles the private core/cordis wrapper. Existing strict manifest comparison follows the replacement, so other unexpected JavaScript changes remain rejected.

All before/mutant/restored contract probes hold the accepted kernel bundle constant. This is a narrow direct-contract control, not a fresh complete mutant build or kernel/installed-CLI qualification. The earlier literal passthrough compile failure remains separate. Existing process and preservation limits remain unchanged.

All reads finished. No product import, parser, build, mutation, restoration or runtime by reviewer. Root retains execution authority; formal acceptance remains open.
