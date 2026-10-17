# AMC-1534 retained public-input crypto review

Offline verification completed with **zero failures**. No test or cold reader was rerun. No product module, fixture or SQLite/native binding was imported; no mutation, signing, agent retry or network call occurred.

The calculation independently checked 32 public Ed25519 role keys across four phases and two workspaces. Every raw PEM SHA-256 and exported SPKI DER SHA-256 matches its recorded pre-artifact pin; all 32 SPKI identities differ. All eight exact, fully enumerated cap-one budget YAML files match the retained profile, and their auditor signatures verify over the decoded32-byte SHA-256 of those exact bytes. This is an exact-profile check, not a general YAML/Zod parser.

There are nine reservation rows across eight phase/workspace views:

| Phase | Control pending | Race pending | Executed |
| --- | ---: | ---: | ---: |
| Initial unchanged | 1 | 1 | 0 |
| Matrix baseline | 1 | 1 | 0 |
| Private no-transaction mutant | 1 | 2 | 0 |
| Restored | 1 | 1 | 0 |

All nine reservation event signatures and nine final seal signature checks passed under each view's pre-artifact monitor key. Actual reservation metadata matches actual admitted session/token/call identities bijectively. The nine public admissions have exactly nine reservations; the three exact cap refusals have none. Scoped raw-row pending counts match all saved usage projections, with no tool outcome audits and zero executed counts. The calculation also verified all33 retained row-digest signatures and all21 retained session-seal signatures.

These signature checks authenticate retained digest bytes. They do **not** independently recompute canonical row preimages, re-admit key-history envelopes or rerun global/session chain verification. The product reader's already completed canonical/hash/chain verdicts are retained inputs. Structural metadata matching rests alongside those prior product checks. A one-event journal's event and seal often have identical signature bytes because they sign the same digest; separate role checks are not separate authorities.

Process ordering is precise: each phase has four initializer/worker children and two reader children, six total. Every writer close precedes both actual reader launches; the first reader closes before the second launches; all six children close normally before recorded fixture removal. This reviews recorded times/PIDs and does not perform a current process census or externally attest clocks.

The frozen root receipt and artifact index pins match. All102 inputs were pinned and rechecked unchanged after calculation; every public evidence input matches its frozen artifact-index entry. All reads finished. The result payload SHA-256 is `1f48f5fc3913cdbc2bcb10e500a1d41a456c1c8c165445cd9bd828d5b2c4f85c`. The JSON retains the complete builtin-only calculation source, method, input pins, detailed key/signature/matching outputs and failure list.

Nine rows are retained observations from one supplemental scenario executed four times, not nine new cases. Local fixture keys do not establish external people or deployment authority. Cleaned private vault inputs were neither read nor recreated, so full offline fixture replay is unavailable. No P0-27 corruption repair, source/freeze/ownership closure, original25/held27/historical26 substitution, full P0-30, Node24/full-suite/release/hosted proof or formal Done is implied.

