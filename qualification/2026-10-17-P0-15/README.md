# P0-15: synthetic example output boundary

This bounded check qualifies source commit `12f61f0afa44d480273fdbe5d19a6737872059df` on `codex/p1-28-qualification`. Synthetic domain reports are refused before writing into `.amc`, case aliases such as `.AMC`, physical aliases into state, or an externally linked active state directory. Ordinary report output remains allowed. The existing physical-path resolver is shared with the compiler; its algorithm and compiler policy are preserved. Resolution is a point-in-time check and does not guarantee safety against concurrent filesystem changes.

The original example tests retain their assertions, fixtures, timeouts and cleanup. Nine output-boundary cases were added. CLI fixtures and the dashboard input now resolve relative to the test module, so the tested checkout supplies those explicit inputs.

| Context | Cases | Passed | Failed | Meaning |
| --- | ---: | ---: | ---: | --- |
| Original output regression | 29 | 23 | 6 | Actual semantic failures before the fix |
| Added case-alias regression | 30 | 23 | 7 | Actual semantic failures before the fix |
| Initial affected cohort | 87 | 87 | 0 | Earlier mixed fixture bindings, retained separately |
| Checkout-bound cohort | 87 | 87 | 0 | Seven whole files against the rebuilt candidate |
| Fresh committed checkout | 87 | 87 | 0 | Same seven whole files after frozen install and build |

These are repeated populations, not additive unique coverage. The final scoped population is 87 cases. Each run has exact ordered raw/observer joins, clean hooks and no unhandled errors. In failing regression bodies, the first failed assertion prevented later JSON or filesystem assertions; their later success does not rewrite the original reach limits.

The unchanged clean-source check passed frozen installation, build, doctor, initialization, signed keyless tool evidence verification, and cross-process session resume. Source and fresh checkouts were clean at the same commit. All 6,912 regular source and compiled file pairs matched; 17 test, configuration and changeset pairs and 12 direct dependency entry pairs matched. All 15,408 declared finite pins were rechecked after the fresh tests, including preserved native and old qualified inputs. This is not proof of the entire installed dependency closure. Runtime: Node v22.23.3, ABI 127, pnpm 10.33.0, darwin arm64.

Unchanged source/test typechecks, lint, architecture, docs drift, counts and freeze checks passed. Global dead-code remains RED at 2,710 findings and duplicates remain RED at 1,268; no baseline was lowered or check bypassed. Test typechecking was repeated successfully after the fixture-binding repair. The original failed parent suite still has 19 recorded failures; no revised full-suite total is claimed. Existing held decisions, F37, and Claude’s work remain preserved. This packet grants no complete P0-15, plan, hosted CI, merge, deployment or release claim. Earlier mandated fabrication mutation evidence is not renewed by this output-boundary slice.

Historical [PR67](https://github.com/AgentMaturity/AgentMaturityCompass/pull/67) records older fabrication/signing controls as RED and restored, and explicitly left a gateway-demo ledger-label follow-up. This output-boundary slice does not establish that follow-up’s current closure. The old note alone is not treated as a current bug or a new implementation allocation.

`receipt.json` records actual command exits and durations. `audit.json` records ordered cases, original primary hashes, input epochs, refusal reach limits and the source checkpoint. Large raw logs and finite inventories remain private by whole hash; they are not claimed to be embedded here. The source checkpoint is local and unpushed.
