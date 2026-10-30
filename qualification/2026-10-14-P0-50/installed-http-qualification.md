# P0-50 installed HTTP qualification — 14 October 2026

PASS for the current privately installed CLI and public SDK native MCP HTTP replay on macOS ARM64, Node v22.23.3. Attempt 3 exited 0 and passed all 15 original checkpoint groups. This is a transport qualification receipt, not full release or hosted CI acceptance.

## Pinned inputs

- Source: `07125b76cb17ecf063f19b914085a5bfc968df35`.
- Tarball: `/private/tmp/p0-50-packed-artifact-20261014/agent-maturity-compass-1.2.0.tgz`; SHA-256 `c3932ba3b2d693c018c874191c608fbb06709e9e83c77c95f7b9a4ff4d8d82aa`.
- Installed package: `1.2.0`; installed CLI SHA-256 `0040e8108d1df88bf377cdab98966ce6130f6d6931cbc6c5b7fd6e27475c3d5f`, matching the current artifact input.
- Actual installed SDK: `1.32.1`, resolved from installed AMC's HTTP transport importer entirely inside the fresh consumer. Transport SHA-256 `a477d0a95a1e1224a009e808d2ce01b1fca32de4f32ada4c589bec0443d41536`; package JSON SHA-256 `0216319ea53177f7ed419d660b2f52ccc7e3327e57f9ee2ef03225ff543aeae4`; consumer lock SHA-256 `d126240d81b1d49fe4cb98d0c79157bf65db665bf891ab52b9a78e29beb0024e`.
- Public SDK import: `agent-maturity-compass/sdk/native`. `@amc/core` does not resolve from this installed package.

## Actual results

37 child commands completed without signals. All four deliberate catalog/grant/redirect/401 refusal commands exited 1. Actual traffic: 33 MCP HTTP requests, 15 SSE replies, 5 DELETEs, five scripted Responses requests, three `tools/call` attempts, zero final active remote sessions and zero second-origin requests. The only committed effects were `CLI_MCP_NOTE` and `SDK_MCP_NOTE`; cancellation produced one signed failed audit with no third effect. Three governed requests were held before authenticated digest-bound approval. Both mandatory SDK `closeAndVerify` calls and four cold CLI ledger/session verification commands passed. All 92 signed rows were retained; eight signed policy files and the pinned MCP configuration remained byte-identical through execution. The original exact-secret guards passed on `signed-events.json`, `sdk-result.json` and `cancel-result.json`.

| Original checkpoint group | Result |
|---|---|
| `catalog-server-disposed` | PASS |
| `17-cli-held-before-authenticated-approval` | PASS |
| `cli-server-disposed` | PASS |
| `cli-governed-mcp-executed` | PASS |
| `drift-server-disposed` | PASS |
| `changed-catalog-and-unsigned-grant-refused-before-dispatch` | PASS |
| `redirect-and-oauth-challenge-refused` | PASS |
| `20-sdk-held-before-authenticated-approval` | PASS |
| `sdk-server-disposed` | PASS |
| `public-sdk-acp-mcp-forwarding` | PASS |
| `20b-cancel-held-before-authenticated-approval` | PASS |
| `cancelled-http-session-disposed` | PASS |
| `public-sdk-cancellation-disposes-http-session` | PASS |
| `cold-evidence-and-policy-pins` | PASS |
| `headers-redaction-sse-and-remote-session-cleanup` | PASS |

## Preserved failed attempts and exact observer changes

Attempt 1 exited 1 after six passed groups. The actual 401 refusal was correct, but the historical public-error regex no longer matched the current typed message. In the new private observer, only `/MCP discovery failed|credential references/` became the stricter anchored `/^MCP HTTP authentication refused\./`, supported by current `src/mcp/nativeMcpHttpTransport.ts:322,361`. The nonzero refusal, no-follow, no-effect and counter assertions remained intact.

Attempt 2 exited 1 after eight passed groups. SDK forwarding completed, then mandatory cold verification correctly refused an unpinned monitor. The same installed verifier exited 1 without the monitor pin and 0 with the existing pre-execution pin; both reports have `ledgerOk:true`. Attempt 3 supplies `AMC_EXPECTED_MONITOR_FINGERPRINT:monitor` to both SDK environments. The fingerprint was read directly from the fixture's public monitor key before any provider or tool effect, separately from session ledger contents, and was already used by the historical cold CLI checks. This admits the local fixture monitor key explicitly; it does not certify an independent third-party trust root. `closeAndVerify` and all trust checks remain mandatory. Current source support is pinned in the JSON report (`src/sdk/nativeAgentClient.ts:754-776`, `src/session/sessionEventHistory.ts:113`, `src/persistence/sessionStoreVerification.ts:270-271`).

The existing configuration field `protocolVersion` is explicitly `2025-11-25` for the preserved legacy helper's initialize/tools/list/tools/call contract. Additional guards assert the current CLI hash and absent private workspace package, and record actual installed SDK resolution/hashes. The current unpinned newer discovery/default protocol path is outside this replay.

Original runner SHA-256 `00b5510f50c2c41ac5e99cb41a53c64baa65c56f8540065333d33ba1a3ae0199` remains unchanged. Adapted runner SHA-256 `345e2fa03ed77ec35dbc68cd208b2e42abecd427f644021284db190e75f67a61`. Removing only the declared observer changes restores every original runner byte exactly, including all 15 checkpoint groups and budget, approval, refusal, cancellation and cold-integrity assertions. The three original helper files remain byte-identical. No production source, original archive, tracker, freeze or qualification configuration was changed.

## Evidence retained outside repository qualification

- Successful fixture: `/private/tmp/p0-50-installed-http-attempt3-1vb61m0h`.
- Attempt 1: `/private/tmp/p0-50-installed-http-attempt1-irfcle_0`.
- Attempt 2: `/private/tmp/p0-50-installed-http-attempt2-hcxxkj0z`.
- Successful receipt: `/private/tmp/p0-50-installed-http-attempt3-1vb61m0h/artifacts/receipt.json`; SHA-256 `5ccab8bf864aef7be233c864324ee42cba5010ec16d0229ebcb5175350d5601b`.
- Complete artifact/input hash inventory: `/private/tmp/p0-50-installed-http-attempt3-1vb61m0h/evidence-manifest.json`; SHA-256 `0df7aabeca981c20cc0a2d3c04cbd88cac4d23c06275c25d650a79fd8bf69562`.
- Exact observer diff: `/private/tmp/p0-50-installed-http-attempt3-1vb61m0h/fixture-adaptation-from-original.patch`.
- Explicit monitor input diff: `/private/tmp/p0-50-installed-http-attempt3-1vb61m0h/fixture-monitor-pin-adaptation.patch`.

Private credential, password, token and key input files were not exported or copied to qualification. Raw files remain in the owned private fixtures.

## Limits and retained release blockers

This execution used a real loopback HTTP/SSE server and a scripted local Responses provider. It did not exercise a live model/vendor, external OAuth enrollment, live TLS, Node24 or another OS. The advertised catalog is a reviewed contract; cancellation proves fixture disposal and no fixture effect, not reversal of a committed remote side effect.

Parent reports the full release gate still exits 1: all 23,125 tests passed with zero failed/pending/todo, but functions coverage is 72.09% against 75%, with 1,270 source duplicates and 2,787 dead-code findings. This receipt does not waive those blockers or promote installed transport success into complete CI/release acceptance.
