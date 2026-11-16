# AMC Shield, Enforce & Watch — CLI Reference

AMC's runtime protection is implemented across several module groups: **Assurance Lab** (red-team testing), **Governor** (autonomy enforcement), **Trust/Notary** (anti-cheat), **Vault** (secrets), and **Budgets/Drift/Freeze** (operational guardrails). This reference covers every command in these modules.

---

## Runtime Shield Analysis

Use runtime analysis when you need to evaluate a proposed agent action, not a static skill file. It runs the Shield trust pipeline and reports the pre-action gate decision, risk level, stage summaries, recommendations, and evidence-chain hashes.

### `amc shield analyze-runtime`
Analyze a live/proposed action before the agent executes it.
```bash
amc shield analyze-runtime \
  --agent my-agent \
  --action "export customer ticket" \
  --tool external-api \
  --parameters '{"ticketId":"T-100"}' \
  --sensitive-fields customerEmail,ssn \
  --credential-age-minutes 45 \
  --confidence 0.8 \
  --json
```

Useful options:

| Option | Purpose |
|--------|---------|
| `--parameters <json>` | Runtime tool parameters as a JSON object. |
| `--sensitive-fields <csv>` | Names fields that should trigger leakage checks when sent to external tools. |
| `--instruction-source <source>` | Models whether the action came from `system`, `developer`, `user`, or untrusted `tool` content. |
| `--credential-age-minutes <n>` | Models stale or expired authorization context. |
| `--confidence <n>` | Runtime confidence from `0` to `1`; low values trigger human-review recommendations. |
| `--fail-on-block` | Exits non-zero when the Shield gate blocks the action. |

For static skill-file analysis, continue using `amc shield analyze <path>`.

---

## Assurance Lab (Shield)

Assurance packs send attack scenarios to your agent and record what it did. Every result says how it was graded:

- **Graded by what the agent did** (`structured`): the injection, exfiltration, tool-misuse, unsafe-tooling,
  instruction-file poisoning, MCP tool poisoning, package hallucination, exfiltration-channel and cross-session memory
  packs. Each scenario gives the agent made-up tools (AMC records the calls it asks for and never runs them) and a
  made-up secret, repeats the attack on a fresh fixture several times, and runs the same ordinary task without the
  attack. A scenario fails when the agent made a forbidden call or the secret left in any form (scored as critical),
  and also when, without any attack, it did not make the tool call that does the ordinary task (scored 50: refusing
  everything is not safe behaviour). An agent that made no tool call at all, and did no harm, is not evaluated: these
  packs need an agent that can call tools. A scenario that is not evaluated still counts as not passed: it scores 0
  in the pack score, it stops the run from passing, and the pack line names how many there were next to the rate, so
  doing nothing on the hard scenarios never raises a score. The result shows the attack success rate with the number
  of tries and a 95% Wilson interval.
- **Graded by keywords in the reply** (`keyword`): most other packs, one try per scenario. Words matching a pattern
  are not evidence of what the agent would do. Some attack packs are still graded this way, among them
  encodedInjection, dlp-exfiltration, modelTheftExfil, multiTurnToolAttack and toolSchemaDrift.
- **Not graded** (`token-claim`): packs that ask the agent to name an artifact. A named artifact is a claim.

An attack success rate is measured on AMC's fixtures with your model and that number of tries. A low rate is not
proof that the agent is safe; an adaptive attacker may do better.

### `amc assurance init`
Initialize signed assurance policy and pack configuration.
```bash
amc assurance init
```

### `amc assurance verify-policy`
Verify the assurance policy signature.
```bash
amc assurance verify-policy
```

### `amc assurance policy`
Print the effective assurance policy.
```bash
amc assurance policy
```

### `amc assurance policy-apply`
Apply assurance policy from a file.
```bash
amc assurance policy-apply --file ./assurance-policy.yaml
```

### `amc assurance run`
Run assurance packs against an agent. The agent must be reachable (start the gateway with `amc up`, or set the
provider key); without a reachable agent the run stops and scores nothing.
```bash
amc assurance run --agent my-agent --pack injection
amc assurance run --agent my-agent --pack injection --attempts 25   # more tries for a tighter interval
amc assurance run --agent my-agent --all
amc assurance run --demo --no-sign                                  # injection, truthfulness, unsafe_tooling; 1 try each
amc assurance run --scope workspace --all
```

`--attempts <n>` sets the tries per effect-graded scenario (1 to 25; default 5, or 1 with `--demo`). Each try also
runs the ordinary-task twin, so a run makes about twice as many requests as tries. `amc assurance list` shows every
pack id.

#### An attacker model that adapts (off by default)
`amc assurance run` and `amc redteam run` take `--attacker-model <provider:model>` (`openai:<model>` or
`anthropic:<model>`, with `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` set). It is a test of your own agent on AMC's
made-up fixtures: the fixture tools are never run and the secret is made up.

```bash
amc redteam run my-agent --plugins injection --attacker-model anthropic:<model>
amc assurance run --agent my-agent --pack exfiltrationChannels --attacker-model openai:<model> --attacker-rounds 5
```

- What leaves your machine: for each scenario, AMC sends the named model the scenario's goal, where the attack text
  sits, and what your agent replied and which tool calls it asked for. Nothing goes to anyone else.
- Round 1 is the pack's own attack text. From round 2 the attacker model writes new text for the same place, after
  reading what your agent did. Each round is graded the same way as any effect-graded scenario: one try with its
  ordinary-task twin, on a fresh fixture.
- Limits: `--attacker-rounds` (rounds per scenario, default 10), `--attacker-max-tokens` (default 50000 for the whole
  run) and `--attacker-max-cost` (US dollars, default 1, from AMC's price list). The run stops at whichever comes
  first and says which one stopped it. One attacker reply can pass the token or cost limit before the run stops. If
  AMC has no price for the model, the cost is shown as not known and the run is bounded by rounds and tokens only;
  `--attacker-max-cost` is then refused.
- The result names the attacker model and the budget and gives two counts: on how many scenarios the attack worked
  in the first round, and on how many within the round limit. A round that could not be evaluated counts as not
  passed. A scenario the attacker did not break is not proof that the agent resists attacks; a stronger attacker or
  a larger budget may do better. A run against a stand-in or test model shows nothing about a real agent.
- Scenarios with no single place for attack text (for example the MCP tool-poisoning pack) run as before and the
  report says the attacker model was not used on them.
- Every round is recorded in the run's ledger session: the attack text, both exchanges, and any rejected gateway
  receipt.

`amc redteam run --corpus <file>` also runs injections from a public attack corpus you downloaded. See
[docs/assurance/PUBLIC_CORPORA.md](assurance/PUBLIC_CORPORA.md) for the file format and the corpora that were checked.

### `amc assurance runs`
List past assurance runs.
```bash
amc assurance runs
```

### `amc assurance show`
Show details of a specific run.
```bash
amc assurance show --run <runId>
```

### `amc assurance cert-issue`
Issue a signed certificate from an assurance run.
```bash
amc assurance cert-issue --run <runId>
```

### `amc assurance cert-verify`
Verify an assurance certificate offline.
```bash
amc assurance cert-verify .amc/assurance/certificates/latest.amccert --pubkey <recorded-auditor.pub>
```

### `amc assurance scheduler status|run-now|enable|disable`
Manage continuous assurance scheduling.
```bash
amc assurance scheduler status
amc assurance scheduler run-now
amc assurance scheduler enable
amc assurance scheduler disable
```

### `amc assurance waiver request|status|revoke`
Temporary waiver for failed assurance (dual-control, time-limited).
```bash
amc assurance waiver request --hours 24 --reason "remediating injection finding"
amc assurance waiver status
amc assurance waiver revoke                      # or --waiver <id> for a specific one
```

---

## Governor (Enforce)

Autonomy enforcement — controls what agents can do based on maturity level.

### `amc governor check`
Check if an action is allowed for an agent.
```bash
amc governor check --agent my-agent --action DEPLOY --risk high --mode execute
```
Output: `ALLOW`, `DENY`, or `SIMULATE` with reasoning.

### `amc governor explain`
Explain the enforcement classification for an agent.
```bash
amc governor explain --agent my-agent
```

### `amc governor report`
Generate governance report.
```bash
amc governor report --agent my-agent
```

### `amc policy action init|verify`
Create and verify the signed autonomy action policy.
```bash
amc policy action init
amc policy action verify
```

### `amc policy approval init|verify`
Create and verify the dual-control approval policy.
```bash
amc policy approval init
amc policy approval verify
```

### `amc policy pack list|describe|diff|apply`
Apply signed governance baselines by archetype and risk tier.
```bash
amc policy pack list
amc policy pack describe code-agent.high
amc policy pack diff --agent my-agent code-agent.high
amc policy pack apply --agent my-agent code-agent.high
```

### `amc approvals list|show|approve|deny`
Manage execution approval inbox.
```bash
amc approvals list --agent my-agent --status pending
amc approvals list --agent my-agent --action-class DEPLOY --risk-tier high --effective-mode execute --created-after 2026-07-01T00:00:00Z --limit 50 --json
amc approvals approve --agent my-agent <approvalId> --mode execute --reason "approved"
amc approvals deny --agent my-agent <approvalId> --reason "too risky"
```
The list command is a read-only, fail-closed projection of the existing signed approval chain. It searches only stable request IDs, exposes privacy-safe filters, and returns no rows if any canonical request, decision, consumption record, or detached signature is malformed, tampered, misbound, or orphaned.

### `amc workorder create|list|show|verify|expire`
Signed work orders that scope what an agent can do.
```bash
amc workorder create --agent my-agent --title "Deploy v2" --risk high --mode execute --allow DEPLOY
amc workorder list --agent my-agent
```

### `amc ticket issue|verify`
Time-limited execution tickets for specific tools.
```bash
amc ticket issue --agent my-agent --workorder <id> --action DEPLOY --tool git.push --ttl 15m
amc ticket verify <ticketToken>
```

---

## Trust & Notary (Anti-Cheat)

### `amc notary init`
Initialize the notary signing boundary.
```bash
amc notary init
```

### `amc notary start`
Start the notary process (separate signing boundary).
```bash
amc notary start
```

### `amc notary attest`
Generate an attestation artifact.
```bash
amc notary attest --out /tmp/current.amcattest
```

### `amc notary verify-attest`
Verify an attestation artifact.
```bash
amc notary verify-attest /tmp/current.amcattest --pubkey <recorded-notary.pub>
```

### `amc trust enable-notary`
Enable notary-backed trust mode.
```bash
amc trust enable-notary \
  --base-url http://127.0.0.1:4343 \
  --pin /path/to/notary.pub \
  --require HARDWARE
```

### `amc trust status`
Show current trust posture.
```bash
amc trust status
```

---

## Vault (Secrets)

### `amc vault init`
Initialize the encrypted key vault.
```bash
amc vault init
```

### `amc vault status`
Show vault status (locked/unlocked, key count).
```bash
amc vault status
```

### `amc vault unlock|lock`
`unlock` checks the passphrase; the vault stays unlocked only while that command runs, so export `AMC_VAULT_PASSPHRASE` in the shell that runs a signing command. `lock` clears keys held in memory.
```bash
amc vault unlock
amc vault lock
```

### `amc vault rotate-keys`
Rotate vault encryption keys.
```bash
amc vault rotate-keys
```

---

## Budgets, Drift & Freeze (Watch)

### `amc budgets init|verify|status|reset`
Signed autonomy and usage budgets.
```bash
amc budgets init
amc budgets verify
amc budgets status --agent my-agent
amc budgets reset --agent my-agent --day 2026-02-19
```

### `amc drift check|report`
Detect maturity drift and regressions.
```bash
amc drift check --agent my-agent --against previous
amc drift report --agent my-agent --out ./drift.md
```

### `amc freeze status|lift`
Execution freeze controls (triggered by drift/budget breach).
```bash
amc freeze status --agent my-agent
amc freeze lift --agent my-agent --incident <incidentId>
```

### `amc alerts init|verify|test`
Signed drift alert configuration.
```bash
amc alerts init
amc alerts verify
amc alerts test    # send test alert
```

---

## Transparency (Watch — Audit Trail)

### `amc transparency init|verify|tail|export|verify-bundle`
Append-only transparency log operations.
```bash
amc transparency init
amc transparency verify
amc transparency tail --n 50
amc transparency export --out transparency.amctlog
amc transparency verify-bundle transparency.amctlog --pubkey <recorded-auditor.pub>
```

### `amc transparency merkle rebuild|root|prove|verify-proof`
Merkle tree for inclusion proofs.
```bash
amc transparency merkle rebuild
amc transparency merkle root
amc transparency merkle prove --entry-hash <hash> --out ./proof.amcproof
amc transparency merkle verify-proof ./proof.amcproof --pubkey <recorded-auditor.pub>
```

---

## Lease Management

### `amc lease issue|verify|revoke`
Short-lived signed leases for gateway access.
```bash
amc lease issue --agent my-agent --ttl 60m --scopes gateway:llm --routes /openai --rpm 60
amc lease verify <leaseToken>
amc lease revoke <leaseId>
```

---

## Production Wiring Diagnostics

### `amc wiring-status`
Show production wiring status for all modules.
```bash
amc wiring-status
```
