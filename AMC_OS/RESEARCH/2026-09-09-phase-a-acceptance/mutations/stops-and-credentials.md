# Prepared delegation-stop and Studio-credential mutation protocol

Authored 2026-09-09 against source `d9d55034b1e856513eea1c68b09e50ecd433063e` for AMC-1545 and AMC-1546. **Authoring only: the helper, mutations, installation and tests have not executed.** Root owns final candidate integration and execution. This document describes intended checks, not measured results or completed issues.

Use `stops-and-credentials.py` only after the implementation batch is committed. Unlike the older managed/portal helper, it creates its own fresh standalone clone and performs a logged frozen pnpm installation. The source repository is read-only. The new clone and output must not already exist and must be outside the source/shared repository and outside each other; their parent directories must already exist. It never reuses an acceptance clone, repairs an old tree, stashes, commits, resets, removes worktrees or deletes a previous receipt.

Supply the final full source SHA and actual absolute Node 22 / pnpm JavaScript entrypoint paths. The pnpm version must match the candidate's `packageManager`. Replace every placeholder deliberately:

```sh
python3 /Users/sid/AgentMaturityCompass/AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/mutations/stops-and-credentials.py \
  --repository /Users/sid/AgentMaturityCompass \
  --source FULL_FORTY_CHARACTER_FINAL_CANDIDATE_SHA \
  --clone /private/tmp/NEW-STOP-AUTH-CLONE \
  --output /private/tmp/NEW-STOP-AUTH-RECEIPT \
  --node /ABSOLUTE/NODE22/bin/node \
  --pnpm /ABSOLUTE/PNPM/bin/pnpm.cjs
```

The runner uses `git clone --no-hardlinks --no-checkout`, detaches at the supplied commit, checks tracked/untracked/index state and index flags, checks every exact mutation/assertion anchor, and installs with `--frozen-lockfile` in a private new pnpm store. Node and pnpm identities, executable/entrypoint hashes, lockfile hashes, helper hash, source/test hashes, exact commands and process durations are retained. Credentials from the calling environment are not forwarded; child processes receive an isolated HOME/TMPDIR, disabled user/global Git/npm configuration and a clearly named test-only vault passphrase. The tests create their own temporary signed fixtures. There is no production key operation, external-provider credential, model request or CoS inspection in this protocol.

The focused baseline runs these source suites directly through Vitest, bypassing the package's broad `pretest` build hook:

- `tests/subagentStopConditions.test.ts`
- `tests/delegateTool.test.ts`
- `tests/kernelDelegationGrant.test.ts`
- `tests/nativeDelegationInheritance.test.ts`
- `tests/cliDelegateFlag.test.ts`
- `tests/studioAgentCredentialBinding.test.ts`

Every named mutation case must appear exactly once and pass in the baseline. Mutations are serial and restored independently. For each, the runner retains original and mutated source bytes, their SHA256 values, the exact patch, logs, raw Vitest JSON and parsed assertion evidence. After confirmed process-group closure it restores all affected files in `finally`, checks cleanliness at the pin, then reruns that mutation's named cases on restored source before another mutation can begin. If closure is unconfirmed, it preserves the available raw and parsed failure records, stops immediately, and leaves the clone and original-byte backups for manual recovery. It launches no restored/new tests or other commands and makes no restoration or clean-at-pin claim in that state. Compilation, import/setup errors, timeouts, unexpected assertion locations, missing cases, additional active cases, unhandled errors or unconfirmed process cleanup do not count as a successful negative test.

## Intended mutation map

The helper's `MUTATIONS` list is the executable exact map, including full describe/test names, unique source anchors and the intended assertion source line derived from the candidate. The owner-guard survival control anchors its specific lease-only execution request, status assertion and sentinel context together; its assertion offset names the status line, avoiding the separate narrower-carrier case's identical status assertion. `mutation-map.json` records the resolved map before installation. The table below explains its bounds.

| Mutation | Intended observable assertion |
| --- | --- |
| Turn ceiling disabled | Initial `max-turns:1` must not expose a retained handle; final permitted continuation must refuse later dispatch. |
| Idle lifetime timer disabled | At the original lifetime boundary, the runner's captured signal must be aborted and its idle resource released. |
| Late-admission deadline disabled | A continuation offered after the monotonic deadline is refused even before the timer callback is delivered. |
| Runner cancellation signal disconnected | The executor's signal must reflect the timeout, even though runtime settlement still uses the correct controller internally. |
| Delegate operator snapshot removed | A caller's subsequent mutation must not change the conditions reaching child execution. |
| Kernel operator snapshot removed | The grant must retain the pre-composition operator declarations. |
| Descendant minimum widened to maximum | The actual nested child's context must retain the narrower turn and timeout declarations. |
| Provider stop forwarding removed | Both the provider-options helper and actual CLI call-through must preserve the selected conditions. |
| Studio mixed identity admitted | The original mixed static-token/lease request must refuse at credential admission with 401. The remaining early owner guard still prevents execution and produces 403 under this mutation. |
| Studio scope intersection removed | A narrower supplied lease must refuse an actual scope-only HTTP request despite the static token's wider authority. |
| Secondary lease ignored | A valid primary lease must not hide a revoked lower-priority supplied lease. |
| Studio revocations ignored | A cryptographically signed but revoked supplied lease must refuse an actual scope-only HTTP request. |
| Duplicate Authorization ignored | Original duplicate raw header pairs must refuse before Node normalization drops a narrower credential. |
| Early owner guard removed, overlap control | Expected **survival**, because the existing execution lease's expected-agent check also covers the selected mismatched request. This is not reported as a killed guard. |
| Owner refusal moved after execution, compound mutation | Mixed-identity admission plus late owner refusal must fail at the actual filesystem sentinel assertion. The diagnostic late response intentionally uses 401 so the earlier HTTP assertion does not mask the forbidden write. |

The final compound mutation changes credential admission and the placement of owner refusal together. It demonstrates a combined path's side-effect ordering when the intended sentinel assertion fails. It must not be described as independent mutation proof of every guard involved, nor as evidence that merely deleting the early owner guard bypasses the remaining lease validation.

Several HTTP cases use loops. Their first intended assertion may stop the test before subsequent routes, approval-state assertions or credential variants execute. A RED at that named line proves only that discrimination. The duplicate-Authorization case stops on its HTTP status assertion; the separate compound owner mutation deliberately reaches the real write sentinel. Native scripted child tests remain in the baseline, but the signal-disconnection mutation uses an injected retained executor and does not claim native transport-abort mutation coverage. No foreign provider process is started. Wildcard static metadata, enabled query credentials, lease expiry and an external platform/provider matrix are outside this mutation map.

## Result interpretation

`intended-assertions-red-review-required` requires every ordinary mutation to fail only its explicitly selected tests with ordinary exit 1, an `AssertionError`, the intended test file/line in the failure stack, any required diagnostic message, and confirmed process-group closure. The expected overlap control must instead pass. Every restored named baseline must pass. An owner still reviews actual/expected values, the retained raw reports and exact patches before accepting the evidence.

A passing ordinary mutant is `survived`. A failing overlap control is `unexpected-control-failure`. Setup/runtime/malformed/timeout or mismatched assertion evidence is `inconclusive`. Any such result prevents qualification. Baseline, source-anchor, installation, restoration or cleanup failures stop the attempt with retained artifacts. The runner returns nonzero for incomplete or unqualified attempts. It does not change tests, relax matching, add builds, repair dependencies or retry failures automatically.

The Vitest JSON/full-name/source-map assumptions are authored but unexecuted. A different report format or assertion stack line should remain inconclusive until the owner inspects the raw output; do not loosen it into accepting any red exit. An assertion raised by fixture setup must never be accepted simply because the process failed.

Each subprocess runs in its own POSIX process group. The runner terminates/reaps any surviving group members, records the signals sent and checks group closure after every command, timeout or interrupt. A closure failure latches a refusal of every further command; an interrupted command's persisted process record also controls this refusal. Final metadata records the unresolved group and explicitly denies clean-at-pin/restoration acceptance. It cannot prove cleanup of a descendant that deliberately detaches into another session. A repeated interrupt, SIGKILL, host crash or failed restoration write can interrupt `finally`; original byte backups and the disposable clone remain for diagnosis. Confirmed final clean-at-pin state is mandatory for qualification. The output tree and test-only artifacts are retained rather than automatically erased.

This is focused source qualification preparation. It does not replace the complete suite, release gate, packaged installation, native platform matrix, managed/portal mutations, human first-use collection, independent review or the standing seven-part Done contract. No pass/fail count, timing result, deployment or superiority claim exists until the final candidate is actually exercised and its receipt reviewed.
