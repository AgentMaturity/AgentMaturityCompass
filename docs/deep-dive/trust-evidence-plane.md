# Trust And Evidence Plane

This part covers the subsystems that make AMC's claims auditable: ledger storage, receipts, transparency, trust configuration, vault behavior, notary boundaries, and global verification.

## What This Subsystem Family Is For

AMC's trust and evidence plane exists so that scoring, governance, and reporting are attached to preserved evidence rather than to unsupported claims.

Its job is to:

- store what happened in an append-oriented evidence system
- sign or verify critical state transitions
- establish who is trusted to sign, attest, or verify
- expose proofs that survive beyond a single local process
- let operators verify the integrity of the whole chain later

This plane is why AMC is more than a diagnostic questionnaire. It tries to bind claims back to artifacts and cryptographic or policy-backed checks.

## Real Entrypoints And Data Or State Boundaries

### Primary Entrypoints

- `src/ledger/ledger.ts` is the core append-only evidence store.
- `src/ledger/monitor.ts` wraps and supervises evidence-writing behavior.
- `src/receipts/receipt.ts` and `src/receipts/receiptChain.ts` cover receipt creation and chaining.
- `src/trust/trustConfig.ts` defines trust modes and trust-boundary configuration.
- `src/vault/vault.ts`, `src/vault/secretsBroker.ts`, `src/vault/vaultCrypto.ts`, and the surrounding `src/vault/` modules handle secret and trust-adjacent controls.
- `src/notary/notaryServer.ts`, `src/notary/notaryCli.ts`, and `src/notary/notaryVerify.ts` establish the optional external notary boundary.
- `src/transparency/` implements transparency logs, Merkle indexing, proofs, and reports.
- `src/verify/verifyAll.ts` acts as the broad verification gate across multiple trust-related artifacts.

### State Boundaries

- Ledger state is persisted as workspace-level evidence storage.
- Receipt chains and transparency artifacts create externally checkable references to recorded events.
- Trust configuration determines whether AMC is relying on local trust roots, vault-managed trust, or an external notary boundary.
- Vault and notary state introduce stronger boundary assumptions than a plain local-only quickstart.

This matters because the trust plane is not only a crypto layer. It is a boundary-definition layer for the rest of the system.

## Runtime Flow

The trust and evidence flow usually works like this:

1. The control plane or gateway generates runtime events from commands, model calls, or governed execution.
2. The ledger appends those events into AMC's evidence store.
3. Receipts are created or chained so specific requests and responses can be correlated later.
4. Transparency structures record tamper-evident summaries or Merkle-backed proof material.
5. Trust configuration decides which keys, signers, or notary assumptions apply.
6. Operators or automated workflows run `verify all` or related verification commands to confirm the integrity of what was recorded.
7. Downstream systems such as audits, passports, release artifacts, or reports consume that proof-bearing evidence.

The core pattern is simple: capture first, preserve integrity second, verify later and repeatedly.

## What Looks Mature Versus Thin Or Wrapper-Like

### Mature Or Core

- The ledger, trust configuration, transparency, and `verify all` surfaces are central to AMC's current implementation story.
- The notary surface is real and code-backed, not only aspirational documentation.
- Receipt and verification mechanics are woven into gateway-facing flows rather than bolted on as afterthoughts.

### Broad But Uneven

- The vault area is substantial and includes both central trust functions and more specialized privacy or data-governance modules.
- That breadth is real, but not every vault-adjacent capability is equally central to a first deployment or a first-time evaluator.

### Thin Or Dependent

- Any surface that bypasses the AMC gateway or CLI runtime reduces the strength of the evidence story, even if the broader docs describe the resulting output.
- Demo or wrapper surfaces can still be useful, but the trust guarantees depend on whether events actually pass through the evidence path.

## How It Connects To Adjacent Planes

- It receives raw event material from the **runtime and control plane**.
- It strengthens the **governance and execution plane** by making approvals, policy actions, leases, and plugins auditable.
- It supplies the **evaluation and assurance plane** with evidence that can support scoring, compliance judgments, and adversarial findings.
- It supports the **operations and ecosystem plane** through release provenance, attestations, passports, and external trust exchange.

This plane is the binding tissue. Without it, many of AMC's other claims would become much softer.

## Notable Current Inconsistencies Or Caveats

### Trust Mode Matters More Than Some Top-Level Docs Make Obvious

The difference between a local trust path and a notary-backed trust path is meaningful. Readers should not assume every setup gets the same boundary strength automatically.

### Breadth Can Be Mistaken For Uniform Maturity

The vault and privacy-oriented modules cover a wide range of concerns. That is valuable, but architecture docs should avoid implying that every submodule is equally central to the default operator path.

### Verification Is Strongest When AMC Owns The Path

AMC's verification story is best when commands, providers, and governed actions actually pass through AMC-controlled flows. If users adopt only the outermost reporting surface, the trust guarantees are necessarily weaker.

### Transparency And Proof Surfaces Need Routing Clarity

The proof story is compelling, but it depends on readers understanding how ledger append, receipt issuance, transparency logging, and later verification fit together. Those layers should be explained as one chain, not as isolated features.
