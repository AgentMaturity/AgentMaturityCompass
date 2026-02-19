# AMC Shield, Enforce & Watch — CLI Reference

AMC's runtime protection is implemented across several module groups: **Assurance Lab** (red-team testing), **Governor** (autonomy enforcement), **Trust/Notary** (anti-cheat), **Vault** (secrets), and **Budgets/Drift/Freeze** (operational guardrails). This reference covers every command in these modules.

---

## Assurance Lab (Shield)

Deterministic defensive assurance packs that test agent behavior.

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

### `amc assurance policy print`
Print the effective assurance policy.
```bash
amc assurance policy print
```

### `amc assurance policy apply`
Apply assurance policy from a file.
```bash
amc assurance policy apply --file ./assurance-policy.yaml
```

### `amc assurance run`
Run assurance packs against agents.
```bash
amc assurance run --scope workspace --pack all
amc assurance run --scope agent --id my-agent --pack injection
```

**Packs:** `injection`, `exfiltration`, `toolMisuse`, `truthfulness`, `sandboxBoundary`, `notaryAttestation`

### `amc assurance runs`
List past assurance runs.
```bash
amc assurance runs
```

### `amc assurance show`
Show details of a specific run.
```bash
amc assurance show <runId>
```

### `amc assurance cert issue`
Issue a signed certificate from an assurance run.
```bash
amc assurance cert issue --run <runId>
```

### `amc assurance cert verify`
Verify an assurance certificate offline.
```bash
amc assurance cert verify .amc/assurance/certificates/latest.amccert
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
amc assurance waiver revoke
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
amc approvals approve --agent my-agent <approvalId> --mode execute --reason "approved"
amc approvals deny --agent my-agent <approvalId> --reason "too risky"
```

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
amc notary verify-attest /tmp/current.amcattest
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
Unlock or lock the vault.
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
amc transparency verify-bundle transparency.amctlog
```

### `amc transparency merkle rebuild|root|prove|verify-proof`
Merkle tree for inclusion proofs.
```bash
amc transparency merkle rebuild
amc transparency merkle root
amc transparency merkle prove --entry-hash <hash> --out ./proof.amcproof
amc transparency merkle verify-proof ./proof.amcproof
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
