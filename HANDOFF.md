# W2-3 Handoff — MCP Compliance & Interoperability

## Scope Delivered
Implemented first-class MCP compliance and safety scoring in `/tmp/amc-wave2/agent-3` with:

1. MCP compliance scoring expanded to include:
   - Tool call safety validation (input + output validation)
   - MCP server trust scoring (identity/trust policy/signed metadata)
   - Prompt injection detection via MCP channels
   - Tool permission scope enforcement (declared + enforced + deny-by-default + least privilege)
2. Added AMC diagnostic questions:
   - `AMC-MCP-1`
   - `AMC-MCP-2`
   - `AMC-MCP-3`
3. Added policy pack:
   - Core policy packs: `mcp-safety`
   - Assurance registry packs: `mcp-safety`
4. Added tests (13 new tests in one new file) and updated question-bank tests.

## Key File Changes
- MCP scoring engine:
  - `src/score/mcpCompliance.ts`
  - `src/score/index.ts`
- Diagnostic bank updates:
  - `src/diagnostic/questionBank.ts`
  - `tests/questionBank.test.ts`
- Policy pack updates:
  - `src/policyPacks/builtInPacks.ts`
  - `src/watch/policyPacks.ts`
- New tests:
  - `tests/mcpComplianceSafety.test.ts`

## Behavioral Notes
- `scoreMcpCompliance` now returns additional fields:
  - `safety` (subscores + per-dimension pass/fail)
  - `promptInjection` (detection result from observed MCP messages)
- Added `detectMcpPromptInjection(messages)` helper with heuristic pattern matching for common injection payloads.
- Compliance level thresholds now factor in safety subscores for `full` and `partial` levels.

## Validation
Executed:
- `npm test -- tests/mcpComplianceSafety.test.ts tests/questionBank.test.ts`
  - Result: 17 tests passed

Attempted:
- `npm run typecheck`
  - Blocked by pre-existing unrelated errors in `src/cli.ts`:
    - `TS2451: Cannot redeclare block-scoped variable 'evidence'` (lines ~2592 and ~2601)

## Commit
Planned commit message:
- `feat(mcp): MCP compliance scoring, tool safety, injection detection, permission enforcement`
