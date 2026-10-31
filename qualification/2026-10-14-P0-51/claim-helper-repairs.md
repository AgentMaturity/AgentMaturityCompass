# P0-51 local verifier claim fields — bounded evidence

All six genuine notary/transparency success cases previously reached exit 70 because JSON lacked the canonical claim fields. The core reports already had `ok: true`, trusted integrity and admitted issuers. The repaired local helpers wrap those unchanged results using existing `artifactClaim` and `withClaimFields`.

The rebuilt observer records exit 0 for the pinned, pinned-with-unused-allows and signed-list variants of both families. Their actual stdout contains the canonical self-reported claim, `result: not_evaluated`, exact status dimensions and matching label. The raw reports remain trusted with passing integrity and admission. All 24 red/green stream hashes were independently rechecked.

The original observer had 76 cases and the final observer has 84, with fresh local keys and paths. The six recurring named recipes prove the specific repair; they are not an identical whole-corpus replay. The final corpus remains 81 passing / 3 failing / zero pending or todo. Three explicit-pin compromise-revocation failures remain active.

Only `src/notary/notaryCli.ts` and `src/transparency/logCli.ts` were changed for this repair. Shared CLI, finishVerify, registry, canonical claim helper, core verifier, manifest and package/lock bytes match the accepted base. The scope and patch hashes are pinned in the companion JSON. Parent-owned licence/F4 changes and final source checks are separate. No full suite, coverage, release, hosted, browser or live licensing acceptance is inferred.
