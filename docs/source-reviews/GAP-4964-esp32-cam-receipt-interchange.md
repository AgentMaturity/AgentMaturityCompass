# GAP-4964 — ESP32-CAM receipt interchange

- Gap: `GAP-4964`
- Dimension: Signed receipt interchange
- AMC surfaces requested: Passport; API; Fleet
- Source reviewed: rzeldent/esp32-cam-ai
- Retrieval: Live GitHub repository API, languages API, license API, and raw README retrieved on 2026-06-25.
- Status: Done

## Relevance decision

This is relevant to AMC because standardized tool protocols and small-device integrations need portable receipts that external consumers can verify without understanding AMC internals. The live source confirms rzeldent/esp32-cam-ai is an ESP32-CAM Model Context Protocol server exposing standardized MCP tools for remote camera control, LED/flash control, system diagnostics, and monitoring. Repository metadata shows C++ as the primary language and MIT license metadata.

AMC should not mirror the device or MCP server. The AMC-native closure is a small signed receipt-interchange envelope for score, policy, tool, audit, and lifecycle events that Passport, API, Fleet, auditors, and external consumers can verify.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant because score claims can be exported as signed interoperable receipts. |
| Shield | Relevant indirectly when security/audit receipts are shared externally. |
| Enforce | Relevant indirectly when policy receipts are shared externally. |
| Vault | Not changed; no new secret storage was required. |
| Watch | Relevant indirectly when audit/lifecycle receipts are shared externally. |
| Fleet | Relevant because fleet and partner systems need receipt verification without local AMC internals. |
| Passport | Primary surface: Passport can expose versioned signed receipt interchange. |
| Comply | Relevant indirectly for auditor-consumable receipt proof. |

## Product closure

Added `src/passport/receiptInterchange.ts` and exported it from `src/index.ts`. The module provides:

- `INTEROPERABLE_RECEIPT_SCHEMA_VERSION`
- `interoperableReceiptJsonSchema`
- `buildInteroperableReceipt`
- `serializeInteroperableReceipt`
- `parseInteroperableReceipt`
- `verifyInteroperableReceipt`

The schema supports `score`, `policy`, `tool`, `audit`, and `lifecycle` receipt kinds. The verifier recomputes payload hash, validates required kind-specific payload fields, checks evidence refs and source citations, and verifies the Ed25519 signature.

Added `docs/RECEIPT_INTERCHANGE.md` as the public external verifier contract.

Acceptance closure: Receipt schema, example receipts, signature verification, and external consumer test are covered through the versioned schema export, build/serialize/parse/verify helpers, public verifier doc, and regression test.

## Fail-closed rule

metadata-only evidence fails closed. Repository name, README claims, GitHub stars, C++ language metadata, MIT license metadata, MCP labels, standardized MCP tools, remote camera control, system diagnostics, local backlog text, and source identity are not enough. AMC requires a versioned schema, payload hash, kind-specific payload, event reference, evidence refs, source citations, signature material, and an external verifier pass.

## No-bloat boundary

No ESP32 adapter, MCP server integration, camera-control wrapper, LED/flash tool, device monitor, PlatformIO config, Arduino/C++ code, copied upstream code, README copy, examples, prompts, screenshots, firmware behavior, new API route, new CLI command, Studio screen, or methodology bump was added.

## Source evidence

- GitHub repository: `https://github.com/rzeldent/esp32-cam-ai`
- GitHub repository API: `https://api.github.com/repos/rzeldent/esp32-cam-ai`
- GitHub languages API: `https://api.github.com/repos/rzeldent/esp32-cam-ai/languages`
- GitHub license API: `https://api.github.com/repos/rzeldent/esp32-cam-ai/license`
- Raw README: `https://raw.githubusercontent.com/rzeldent/esp32-cam-ai/main/README.md`
- Live metadata observed: repository `rzeldent/esp32-cam-ai`, Model Context Protocol server context, ESP32-CAM context, standardized MCP tools, remote camera control, LED and flash control, system diagnostics, monitoring context, C++ primary language, `mcp-server`, `llm`, `esp32-cam`, `home-assistant`, and `node-red` topics, MIT license, default branch `main`, and recent push metadata.

## Verification

- Expected-red focused test: `npx vitest run tests/gap4964Esp32CamReceiptInterchangeBoundary.test.ts --reporter=dot` failed because `src/passport/receiptInterchange.ts` did not exist.
- Product-focused rerun passed 4/6 tests and failed only because this source-review doc and `docs/RECEIPT_INTERCHANGE.md` were absent.
- Focused final: `npx vitest run tests/gap4964Esp32CamReceiptInterchangeBoundary.test.ts --reporter=dot` passed 1 file / 6 tests.
- Related regression: `npx vitest run tests/gap4964Esp32CamReceiptInterchangeBoundary.test.ts tests/receipts.test.ts tests/passportPublicApiAndCli.test.ts tests/trustInterchange.test.ts tests/receiptsCorrelationRuntimeDashboard.test.ts tests/gatewayAndSupervise.test.ts --reporter=dot` passed 6 files / 59 tests.
- Diff hygiene: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed 969 files / 7,880 tests.
