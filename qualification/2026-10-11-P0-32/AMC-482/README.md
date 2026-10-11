# AMC-482 · Safe API errors: Reopen, owner P1-55

- **Commit on main:** `2a42d6b3`, in PR #22. It is an ancestor of origin/main `5ea5e866a`.
- **Focused tests at `60d0255c4`:**
  - `tests/apiRouters.test.ts` 31/31 and `tests/guardrailControlState.test.ts` 12/12, so 43 passed.
  - Also `tests/apiRequestErrorRoutes.test.ts` and `tests/apiRouterResponseParity.test.ts`: 209/209.
- **Decision:** Reopen. The remaining scope goes to P1-55, as the P0-32 spec directs.

## Shipped and tested

- **Safe 400s** on score routes: `tests/apiRouters.test.ts:1272`. The body carries no SQLite or stack text (`:1308-1309`). `scoreRouteError` is at `src/api/scoreRouter.ts:111`.
- **413 for oversized bodies** at `tests/guardrailControlState.test.ts:486`. Also at `tests/apiRequestErrorRoutes.test.ts:64`, on 16 routes across the product, vault, enforce and shield routers, and at `tests/apiRouterResponseParity.test.ts:231` on a score route.

## Step 9 search

**413 or "Internal error" in the API tests:**

```
git grep -n -E "413|Internal error" -- 'tests/api*.test.ts'
```

- Hits are in `tests/apiRequestErrorRoutes.test.ts`: 500 "Internal error" fallbacks for 8 routes, and the 413 case at `:64`.
- There is also one hit at `tests/apiRouterResponseParity.test.ts:231` (413).
- `tests/apiRouters.test.ts:1187` matches only inside a hash.

**Request ids in `src/api`:**

```
git grep -n -i -E "request[ _-]?id" -- src/api
```

- It finds only `bridgeRequestId` (`firewallRouter.ts`) and `approvalRequestId` (`toolsRouter.ts`). There is no request-id logging.

**Score-router 500 fallback in tests:**

```
git grep -n -E "scoring failed|Could not load question sets" -- tests
```

- No match (exit 1). No test reaches `scoreRouteError`'s 500 fallback.

## Remaining scope for P1-55

1. **Request ids.** Resolve a request id, return it in `X-Request-Id` and in every `apiError` body, and write one log line per error.
2. **Generic 500 bodies.** Return a generic 500 body and log the detail server-side.
    - `tests/apiRequestErrorRoutes.test.ts:78` ("preserves the ordinary stream error's status and message") asserts that an Error's message is returned in the 500 body.
    - P1-55 must change that test in the same PR (contract §5.5).
3. **Tests.** Add a 500 test for `scoreRouteError`'s fallback. Add the compliance-router 413 fix that P1-55 already names.

## Correction for P1-55's "Current state"

- **What P1-55 says (verified on main @ 8f57ce63):** no test covers a 500 or a 413 on another route.
- **What is now true:** `aa0870907` (2026-10-05, on main) added `tests/apiRequestErrorRoutes.test.ts`, which covers both. P1-55 should build on that file rather than duplicate it.

## Residual risk

- Until P1-55 lands, a failed `/api/v1` call leaves no id and no log line. Some 500 bodies also carry exception text. Owner: P1-55.
