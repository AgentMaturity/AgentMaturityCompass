# Industry Operating Profiles

> **Experimental.** This page and the profile sources cite regulations and
> standards. An AI agent drafted them; they stay experimental until a named
> expert signs them off (D-08). A profile is self-reported configuration, never
> a compliance verdict.

`amc domain apply` turns a station's industry packs, frameworks and assurance
packs into an **operating profile**: one JSON file per station and agent that
names the tool allowlist posture, firewall mode, approval classes, budget
ceilings, retention windows, audit-sampling rate, human-oversight requirements
and incident-reporting clocks, each entry carrying the rule it rests on and
the date that rule was read.

The profile is a **proposal**. Emitting it writes nothing under `.amc/`. The
operator reviews it, signs it with `--sign-profile` and activates it with
`--activate-profile` (see [Sign and activate](#sign-and-activate)), or adopts
each fragment by hand with the signing commands that already exist. This page
records the commands that were run while building the feature, what they
produced, and the boundaries of that evidence.

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

`--activate-profile` writes and signs all six signed files in the table in one
step; the "Existing sign path" column is the manual alternative.

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
  came from;
- every setting and clock has a known fact status (below), a `reviewed` fact
  names `reviewedBy` and `reviewedAt`, and `profileFacts` matches the counts.

## Fact status (the compiler's input contract)

Every sourced setting and every incident clock carries
`fact: { status, reviewedBy?, reviewedAt? }`, and the profile carries
`profileFacts: { asserted, observed, reviewed }`. The status says how the value
is known:

| Status | Meaning |
|---|---|
| `asserted` | Proposed from the cited source; nothing was measured. Every value is `asserted` when a profile is emitted. |
| `observed` | Measured from evidence. Nothing sets this yet. |
| `reviewed` | A named person reviewed the value (`reviewedBy`, `reviewedAt`). |

A status is a claim kind, not a verdict: `reviewed` records that someone looked,
not that the value is correct. Profiles written from P1-15 on have
`schemaVersion: "2026-10-07"`. `readOperatingProfile` (in
`operatingProfileBuilder.ts`) still reads a `"2026-10-03"` profile, which has no
fact statuses, and reads each of its values as `asserted`. It refuses a profile
whose `riskTier` does not match its station. The applicability compiler (P1-10)
reads profiles through this function.

## Sign and activate

```sh
# 1. Review the emitted profile (and, if you reviewed a value, set its fact to
#    { "status": "reviewed", "reviewedBy": "<name>", "reviewedAt": "<YYYY-MM-DD>" }
#    and update profileFacts).

# 2. Sign it with the workspace auditor key: writes <profile>.sig
amc domain apply --agent default \
  --sign-profile amc-operating-profiles/default/wealth.operating-profile.json

# 3. Preview the activation: target paths and digests, nothing written
amc domain apply --agent default --dry-run \
  --activate-profile amc-operating-profiles/default/wealth.operating-profile.json

# 4. Activate: writes and signs the six configs under .amc/
amc domain apply --agent default \
  --activate-profile amc-operating-profiles/default/wealth.operating-profile.json
```

Both flags are blocked in agent mode (`amc mode agent`), like the other
commands that write or sign configs, so an agent cannot rewrite the policies
that govern it. `--allow-widening` does not lift that block.

Signing re-runs the consistency check and refuses an inconsistent profile
(`operating profile is inconsistent: <violations>`) or a profile under `.amc/`.
The `.sig` file has the same shape as the signed-config signatures:
`{ digestSha256, signature, signedTs, signer: "auditor" }`.

Activation reads the profile once and refuses it when:

- `<path>.sig` is missing: `operating profile is not signed: <path>.sig missing`;
- the bytes changed after signing: `operating profile changed after signing (digest mismatch)`;
- no auditor key in the workspace key history made the signature, the key is
  distrusted or revoked, or an operator trust list exists (P0-09) and does not
  admit the key for `config-signature`:
  `operating profile signature does not verify against an authorized key`;
- the recomputed consistency check fails: `operating profile is inconsistent: <violations>`;
- the profile is for a different `--agent`;
- a current signed config exists and fails its own signature check;
- a fragment is weaker than the current verified config:
  `activation would weaken <config>: <field> <old> -> <new>; pass --allow-widening after review`.

Every field of every config is compared with the current verified config.
Any change to a field the comparison cannot rank counts as weaker (fail
closed). The ranked changes that count as weaker are:

| Config | Weaker |
|---|---|
| approval policy | for any action class: fewer required approvals, distinct users dropped, a role added, a longer approval TTL, an assurance-pack requirement removed or relaxed, or the class's rule removed; `simulateAlwaysAllowed` turned on |
| budgets | for this agent: any limit raised or removed (unlimited), `unknownTokenUsage` relaxed to `ALLOW_WITH_WARNING`, an `onExceed` consequence removed |
| tools | `denyByDefault` turned off; a tool added; an allow entry (path, host, binary) added; a deny entry removed; `maxBytes` raised or removed; `requireExecTicket` or a tool's `denyByDefault` turned off |
| action policy | `defaultMode` from `DENY` to `ALLOW`; a sandbox requirement dropped; an action rule added or removed; for a rule, `allowExecute` turned on, `requireExecTicket` turned off, a lower trust tier, a lower or removed question-level minimum, an assurance-pack requirement removed or relaxed |
| ops policy | shorter payload or archive retention, guard-event pruning added or shortened, blob or backup encryption turned off, longer key rotation or backup-age warning, a backup exclude path added or include path removed |
| firewall | a mode below the current one, the policy disabled, fail-open on a missing policy, a rule turned off, a higher threshold, payload or preview limit, secret redaction turned off |

When no approval or ops policy is written, the comparison uses the default the
runtime applies. When no budgets, tools or action-policy file or firewall
policy exists, the runtime fails closed, so activating one counts as weaker.
Station profiles keep audit logs for the period their sources require (for
example 6 years for wealth), which is shorter than the default ops policy's
3,650-day archive retention, so on a workspace with the default ops policy
activation needs `--allow-widening`. Every weakening that `--allow-widening`
accepts is listed in the activation record.

Checking and writing happen under the action-policy writer lock that
`amc policy pack apply` also holds. Activation then writes and signs
`.amc/approval-policy.yaml`, `.amc/budgets.yaml` (only
this agent's entry changes), `.amc/tools.yaml`, `.amc/action-policy.yaml`,
`.amc/ops-policy.yaml` and the runtime firewall policy (mode and fail-closed;
every firewall rule stays on), each with its existing sign function, and
records `amc-operating-profiles/<agent>/<station>.activation.json`:
`profileSha256`, `signerFingerprint`, `activatedTs`, `configs` (path, sha256,
sigPath), `widenings`, `reviewedFacts` and `claimKind: "self_reported"`. The
profile file never changes. Fragments are validated before the first write; a
crash during the writes can leave the earlier configs activated, each signed.

A signature proves who signed the profile and that its bytes are unchanged. It
does not make a value true, and a signature by the same workspace auditor key
does not show that a second person reviewed it (two-person review is P1-20).

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

`runDomainAssurance` in `domainCliIntegration.ts` runs only the registry's
`assurancePacks`. It invokes no agent, so its result is `not_evaluated`; with
`--example` it grades a built-in synthetic reply that is labelled as an example
and never counts as evidence (P0-15). The mapped industry packs are listed in
each profile's `derivedFrom.assurancePacks` with `mappedBy: "industryMap"`.

`INDUSTRY_PACK_MANIFEST` (`src/assurance/packs/industryPackManifest.ts`) labels
each pack with one station this map gives it, or `cross-framework` only when the
map gives it two or more stations; `tests/domainRegistry.test.ts` holds that.

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
  the approval fragment is adoptable through `--activate-profile` or by code
  (`initApprovalPolicy(workspace, policy)`).
- `.amc/guardrails.yaml`, which `amc domain apply` writes, is not signed.
  Signing it is a proposed follow-up, outside P1-15.
- `src/cli.ts` firewall: rule toggles (`piiLeakage`, `destructiveAction`, ...)
  are not settable from the CLI; `writeRuntimeFirewallPolicy` takes mode,
  enabled and fail-closed only.
- `src/domains/domainCliIntegration.ts` `runDomainAssurance`: an opt-in flag
  to include `getIndustryAssurancePacksForStation(domain)` in the run.

## Sources

Every source is in `src/domains/operatingProfiles/operatingProfileSources.ts`
with `retrievedAt: "2026-10-03"`, except `frb_sr_26_2` (below). CFR text was read from the GPO govinfo annual
edition XML (CFR-2024; 16 CFR 461 from CFR-2025); eCFR redirected to a bot wall
and was not read. EUR-Lex returned empty content on three URL forms, so every
EU citation is `verified: false` with the Official Journal reference and the
europa.eu policy page that was read. iso.org, unece.org, nhtsa.gov, fcc.gov and
hhs.gov returned HTTP 403; those citations are `verified: false` and say so.
Numeric ceilings and sampling rates are AMC operating choices and cite
`amc_operating_choice` beside the rule that sets the duty.

### SR 26-2 scope

Federal Reserve SR 26-2 (17 April 2026, with the OCC and FDIC) superseded SR
11-7. `frb_sr_26_2` comes from catalogue record `us-sr-26-2`: the letter page
and attachment `SR2602a1.pdf` were read on 2026-10-07 under P0-24. The
guidance covers inventory, validation and effective challenge for the
traditional and non-generative, non-agentic models an agent calls; its
footnote 3 puts generative and agentic AI models outside its scope. It does
not regulate the agent. The wealth profile therefore cites SR 26-2 only for
the model-validation basis of its audit-sampling method. The FINANCIAL and
DEPLOY approval counts, the FINANCIAL budget, the reviewer roles and the
override path keep their values, cite `amc_operating_choice` and are flagged
for expert review (D-08).
