# Bounded public validation repair

Native public validation can optionally feed a failed check back to the agent within the same signed turn. Repair is off by default. Select public checks with the existing `--validation-config`, `--validation-config-sha256`, and repeatable `--validate` options, then supply an explicit JSON policy through `--validation-repair` on `amc agent-loop run` or `amc agent-loop chat`:

```json
{
  "maxRounds": 2,
  "maxRequests": 8,
  "maxTokens": 20000,
  "timeoutMs": 60000,
  "allowedEditPaths": ["src/calculation.ts"]
}
```

`maxRounds` permits 0–8 rounds after the initial validation. Zero preserves ordinary validation behavior. `maxRequests` counts every repair model attempt, including request retries, across all rounds. The ordinary turn step limit still applies. `timeoutMs` covers the whole repair phase, including repeated public checks, approval waits, and hook waits. Hooks that ignore cancellation cannot keep the repair turn open after its deadline. A monotonic admission check also stops work after the deadline when timer delivery is delayed. An unresolved, denied, timed-out, or cancelled execution stops repair. Repair-owned feedback and tool context cannot carry into a later turn. Other queued operator work is preserved; a failed signed cancellation stops the driver.

Repair offers only existing `fs.read`, `fs.write`, and `fs.edit` tools, and only for the exact selected existing regular files. It delegates each admitted effect to the original governed tool seam, retaining signed policy, approvals, and read-before-edit requirements. Selected file digest scans stop at 10,000,000 bytes per file. Larger files are refused before repair requests. Shell, delegation, discovery, extensions, and other tools are unavailable during repair. Select implementation files only; keep public check programs, validation configuration, and independent hidden fixtures outside the edit surface. This path does not receive hidden oracle inputs or produce an oracle verdict.

The operator's check IDs, titles, commands, timeouts, and configuration digest are frozen before the first prompt. Every repeated check uses that same plan. No-progress detection compares selected file digests. A repair that changes no selected artifact and still fails stops without another round. Every failed check remains in signed evidence even when a later check passes. Model completion, the public check result, and independent correctness are separate facts.

Token admission uses reported native request usage, including cache tokens. The next serial request reserves the remaining token allowance and caps its requested output; actual input and cache usage settle the reservation. Missing usage stops effects and further requests. This is admission against reported usage, not a guaranteed future total-token ceiling. The existing signed workspace request, token, tool, and known-cost budgets also apply. An optional positive `maxCostUsd` requests a hard spend bound; repair refuses before its first request because current native adapters provide no guaranteed future-cost reservation contract. It never replaces unknown cost with zero.

Direct TypeScript driver callers may set the same policy in `NativeValidationPlan.repair`. The TypeScript SDK accepts the same explicit JSON string as `AMCNativeClientOptions.validationRepair` and forwards it through the existing ACP child command as `--validation-repair`. Supply `validationConfig` and explicit `validate` IDs, with `validationConfigSha256` to pin reviewed bytes. ACP startup admits and freezes the policy through the shared validation selector; wire prompts cannot redefine it.
