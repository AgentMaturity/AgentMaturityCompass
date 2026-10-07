# GRC evidence export

`amc export grc` writes the agent's latest run as labelled evidence against one framework's controls, and can also write a SARIF file of developer findings about that run.

```
amc export grc --framework SOC2 --out grc-soc2.json [--sarif grc.sarif] [--agent <agentId>] [--json]
```

Frameworks: `SOC2`, `NIST_AI_RMF`, `ISO_42001`, `EU_AI_ACT`. Each maps three controls. The mapping is experimental and has not been reviewed by an expert; the framework text controls.

AMC output is evidence of conformity for review. It is not a compliance determination and not a certificate.

## Why every control is "not evaluated" today

A control result needs evidence bound to that control. AMC does not bind evidence to these controls yet, so every control result is `not_evaluated` with reason `UNBOUND_EVIDENCE` and applicability `unresolved`. The export never turns a maturity level, an evidence-coverage ratio or the run's own flags into PASS, PARTIAL or FAIL: those are facts about the run, not results for a control.

Planned work adds the rest:

- P1-11 binds evidence to controls, so a control can pass or fail on its own evidence.
- P1-28 adds an OSCAL export built on those bound results.

## Which run is exported

The export reads the agent's newest run by `ts`, whatever that run's own status says, and never another agent's run. Unlike `amc report latest`, it does not prefer an older run marked `VALID`: the unverified status in a run file never decides which run is exported, so a newer failed run is not hidden behind an older passing one. It then checks the run's seal against the workspace auditor key. A run whose seal does not verify vouches for nothing: its own `VALID` status is ignored, its evidence is `untrusted` and its claim kind is at most `self_reported`. The CLI prints the run id and whether its seal verified.

With no runs, the command prints `No run reports found. Run \`amc\` first.` and exits non-zero.

## Manifest fields (schema `amc.grc-evidence.v2`)

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Always `amc.grc-evidence.v2`. Version 1 never shipped on npm. |
| `framework` | The framework requested with `--framework`. |
| `agentId`, `runId` | The agent and the run that was exported. |
| `generatedAt` | When the manifest was built (epoch milliseconds). |
| `run.claim` | The run's claim envelope: claim kind, five status dimensions, provenance, eligible level and reason codes. See [CLAIM_KINDS.md](CLAIM_KINDS.md). |
| `run.label` | The run's claim label, exactly as `renderClaimLabel` prints it. |
| `run.signals` | Run-level numbers, each labelled with the run's claim kind: `verification` (seal verified, status `VALID` and verification passed), `evidenceCoverage`, `maturityLevel` and `evidenceReadiness` (recomputed, not read from the file). `null` means not evaluated; a run without layer scores has `maturityLevel: null`, never 0. |
| `controls[].controlId`, `title`, `amcSurface` | The mapped control and the AMC surface it relates to. |
| `controls[].claim` | The control's claim envelope. Today its result is always `not_evaluated`. |
| `controls[].label` | The control's claim label, exactly as `renderClaimLabel` prints it. |
| `disclaimer` | States that this is evidence for review, that controls are not evaluated without bound evidence, and that the mapping is experimental. |
| `manifestHash` | SHA-256 of the canonical manifest without this field. The same run and `generatedAt` give the same hash. |

## SARIF findings

The SARIF file reports findings about the run only, never control ids or control results:

| Rule | Level | When |
| --- | --- | --- |
| `AMC-GRC-RUN-UNVERIFIED` | `error` | The seal did not verify, the status is not `VALID` or verification did not pass. |
| `AMC-GRC-EVIDENCE-NOT-READY` | `warning` | Evidence readiness is not `READY`. |
| `AMC-GRC-LOW-COVERAGE` | `note` | Evidence coverage is below 75%. |

A sealed, `READY` run with full coverage produces no findings.
