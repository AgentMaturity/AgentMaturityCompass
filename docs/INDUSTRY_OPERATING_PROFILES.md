# Industry Operating Profiles

`amc domain apply` turns a station's industry packs, frameworks and assurance
packs into an **operating profile**: one JSON file per station and agent that
names the tool allowlist posture, firewall mode, approval classes, budget
ceilings, retention windows, audit-sampling rate, human-oversight requirements
and incident-reporting clocks, each entry carrying the rule it rests on and
the date that rule was read.

The profile is a **proposal**. Nothing in it is written under `.amc/`; the
operator adopts each fragment with the signing commands that already exist.
This page records the commands that were run while building the feature, what
they produced, and the boundaries of that evidence.

## Where it lands

```
<workspace>/amc-operating-profiles/<agentId>/<station>.operating-profile.json
```

Override with `--profile-out <path>`. Any target under `<workspace>/.amc/` is
refused (`src/domains/operatingProfiles/operatingProfileEmit.ts`,
`assertOutsideSignedConfigTree`), because `.amc/**` holds signed configs and a
file nobody signed must not look like one.

`amc domain apply` still writes exactly what it wrote at `8f57ce63`: the
guardrails block in the agent config file (`AGENTS.md` by default) and
`.amc/guardrails.yaml` for the agent. The profile is additive; every
pre-existing JSON field keeps its name and type (`tests/domainApply.test.ts`).

## Sections and the primitives they drive

| Profile section | AMC primitive it proposes | Signed file | Existing sign path |
|---|---|---|---|
| `toolAllowlist` | `src/toolhub/toolsSchema.ts` (`denyByDefault`, `requireExecTicket`) | `.amc/tools.yaml` | `amc tools init`, edit, `amc tools sign` (or `amc fix-signatures`) |
| `firewall` | `src/runtime/firewall.ts` (`mode`, `failClosedOnMissingPolicy`, rules) | runtime firewall policy | `amc firewall enable --mode block` (mode and fail-closed only; rule toggles are not CLI-settable at HEAD) |
| `approvals` | `src/approvals/approvalPolicySchema.ts` (`requiredApprovals`, `requireDistinctUsers`, roles, TTL) | `.amc/approval-policy.yaml` | `amc policy approval init` writes and signs defaults; **no CLI re-sign of an edited file exists at HEAD** (see Ready to wire) |
| `budgets` | `src/budgets/budgets.ts` (`daily.maxToolExecutes` per action class) | `.amc/budgets.yaml` | `amc budgets init`, edit, `amc budgets sign` |
| `retention` | `src/ops/policy.ts` (`keepArchiveSegmentsDays`, `prunePayloadsAfterDays`) | `.amc/ops-policy.yaml` | `amc ops init`, edit, `amc ops sign` |
| `auditSampling` | `src/audit/posthocAuditSampling.ts` (`samplingMethod`, `riskTier`) | sampling receipts | informational; the receipt builder takes the plan as input |
| `humanOversight` | approval roles and `requireDistinctUsers`; governor emergency-override path | `.amc/approval-policy.yaml` | as for approvals |
| `incidentReportingClocks` | data for the F4 incident-clock track; `src/incidents/**` holds the incident model | — | informational at HEAD |
| `proposedSignedConfigs.actionPolicy` | `src/governor/actionPolicySchema.ts` | `.amc/action-policy.yaml` | `amc policy action init`, edit, `amc fix-signatures` |

Each `proposedSignedConfigs` fragment is built from the module's own default
(`defaultApprovalPolicy()`, `defaultBudgets()`, `defaultToolsConfig()`,
`defaultActionPolicy()`, `defaultRuntimeFirewallPolicy()`, `defaultOpsPolicy()`)
with the profile's values applied, and is parsed by the same zod schema or
loader the signing command uses (`tests/operatingProfiles.test.ts`,
"proposed signed configs parse through the real policy loaders and schemas").

## Risk tiers and the consistency rules

`riskTier` mirrors `riskTierForDomain` in `src/domains/domainCliIntegration.ts`:
a station whose registry `riskLevel` is `critical` (health, environment,
mobility) is `critical`; the others are `high`.

`checkOperatingProfileConsistency` (`operatingProfileConsistency.ts`) fails a
profile when any of these do not hold; `amc domain apply` throws on a failing
profile rather than writing it:

- every setting and clock has a source with title, url, reference and a
  `YYYY-MM-DD` `retrievedAt`, and a non-empty basis sentence; an unverified
  source must say why;
- `WRITE_HIGH` approval exists; critical ⇒ at least 2 approvals from distinct
  users; high ⇒ at least 1;
- critical ⇒ firewall `mode` is `block`; every tier ⇒ `failClosedOnMissingPolicy`;
- `denyByDefault` is true; critical ⇒ `WRITE_HIGH`, `DEPLOY`, `SECURITY` need an
  execution ticket, `SECURITY` daily executes are 0, `DEPLOY` at most 1,
  sampling rate at least 10 percent, distinct human reviewers;
- at least one incident clock, each with a positive deadline, a trigger and an
  authority; `auditLogDays` at least 365 and not below `payloadPruneDays`;
- the proposed approval policy and firewall fragments mirror the sections they
  came from.

## Industry assurance packs per station

`src/domains/domainRegistry.ts` now carries `INDUSTRY_ASSURANCE_PACK_IDS` (18
ids: the 17 the evidence planner measured at `8f57ce63` plus
`financialModelRisk`, which the registry already mapped) and
`INDUSTRY_ASSURANCE_PACK_STATIONS`, a station list with a one-line rationale and
the source read for each. `listUnmappedIndustryAssurancePacks()` returns the ids
no station reaches; `tests/domainRegistry.test.ts` prints
`unmappedIndustryPacks=<n>` and requires 0. The nine ids that were reachable
only by explicit id before 2026-10-03:

| Pack | Station(s) | Why |
|---|---|---|
| `hipaaCompliance` | health | HIPAA Privacy/Security/Breach Rule duties (45 CFR 164.308, .312, .316, .404) |
| `pharmaCompliance` | health | clinical and pharmaceutical practice (21 CFR 11.10, 312.32; DEA 21 CFR 1301-1321 not fetched) |
| `financialSOX` | wealth | securities-law duties (17 CFR 240.17a-4 read; SOX 302/404 not fetched) |
| `legalCompliance` | governance, wealth | civic/legal process and regulated filings; professional-conduct rules are state-level (unverified) |
| `euAiActArticle` | health, education, environment, mobility, governance, wealth | the six stations with `euAIActCategory: high-risk`; Regulation (EU) 2024/1689 primary text unreachable 2026-10-03 |
| `globalAIRegulatory` | governance, technology | AI use case inventory (OMB M-25-21 read) and cross-jurisdiction service providers |
| `iso42005ImpactAssessment` | governance, wealth | deployers obliged to run a fundamental rights impact assessment (Art. 27, unverified; ISO/IEC 42005 catalog page 403) |
| `realtime-voice-safety` | technology, wealth | impersonation (16 CFR 461.3 read) and voice-channel financial fraud; FCC ruling page 403 |
| `sbom-supply-chain` | technology, environment | EO 14028 and NIST SP 800-218 (pages read); NERC CIP-013-2 not fetched |

`runDomainAssurance` in `domainCliIntegration.ts` still runs only the
registry's `assurancePacks` (the existing smoke test requires that set to pass
on the canned response); the mapped industry packs are listed in each profile's
`derivedFrom.assurancePacks` with `mappedBy: "industryMap"`.

## Operator flow

Commands as run on 2026-10-03 in the F1 worktree
(`/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_fc54d4b0-c89-1`,
HEAD `8f57ce63` plus this track's commits, Darwin arm64, Node v25.5.0,
pnpm 10.33.0), each against a fresh `mkdtemp` workspace with a test-only
Industry Packs licence key in the environment:

```sh
# 1. Emit the profile (also writes the guardrails block and .amc/guardrails.yaml, as before)
node dist/cli.js domain apply --agent default --domain health --json
#    -> amc-operating-profiles/default/health.operating-profile.json
#    JSON result gains "operatingProfile": { station, riskTier, path, written, consistency }

# 2. Read it
cat amc-operating-profiles/default/health.operating-profile.json

# 3. Adopt the fragments you accept, one signed file at a time
amc budgets init && $EDITOR .amc/budgets.yaml && amc budgets sign
amc tools init && $EDITOR .amc/tools.yaml && amc tools sign
amc ops init && $EDITOR .amc/ops-policy.yaml && amc ops sign
amc policy action init && $EDITOR .amc/action-policy.yaml && amc fix-signatures
amc firewall enable --mode block
amc policy approval init        # defaults only; see Ready to wire for the edited-file case
```

Step 3 was **not** exercised in this run: the signing commands need the
workspace keys and were out of scope for the track; the profile fragments were
instead parsed through the loaders those commands call
(`tests/operatingProfiles.test.ts`).

## Ready to wire (outside this track's claims)

- `src/cli.ts`: an `amc policy approval sign` subcommand calling
  `signApprovalPolicy(workspace)` from `src/approvals/approvalPolicyEngine.ts`,
  so an edited `.amc/approval-policy.yaml` can be re-signed without
  `amc policy pack apply` (built-ins only) or `init` (defaults only). Until then
  the approval fragment is adoptable only by code (`initApprovalPolicy(workspace, policy)`).
- `src/cli.ts` firewall: rule toggles (`piiLeakage`, `destructiveAction`, ...)
  are not settable from the CLI; `writeRuntimeFirewallPolicy` takes mode,
  enabled and fail-closed only.
- `src/domains/domainCliIntegration.ts` `runDomainAssurance`: an opt-in flag
  to include `getIndustryAssurancePacksForStation(domain)` in the run.

## Sources

Every source is in `src/domains/operatingProfiles/operatingProfileSources.ts`
with `retrievedAt: "2026-10-03"`. CFR text was read from the GPO govinfo annual
edition XML (CFR-2024; 16 CFR 461 from CFR-2025); eCFR redirected to a bot wall
and was not read. EUR-Lex returned empty content on three URL forms, so every
EU citation is `verified: false` with the Official Journal reference and the
europa.eu policy page that was read. iso.org, unece.org, nhtsa.gov, fcc.gov and
hhs.gov returned HTTP 403; those citations are `verified: false` and say so.
Numeric ceilings and sampling rates are AMC operating choices and cite
`amc_operating_choice` beside the rule that sets the duty.
