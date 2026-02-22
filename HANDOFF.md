# Handoff: FIX-8 Compliance Expansion

## Summary
Expanded AMC compliance coverage by decomposing previously rolled-up controls and introducing first-class question-level controls with evidence-gated scoring behavior.

## Implemented Changes

### 1) OWASP decomposition (10 sub-questions)
Replaced `AMC-OWASP-1` with ten OWASP LLM Top 10 controls:
- `AMC-5.8` LLM01 Prompt Injection
- `AMC-5.9` LLM02 Insecure Output Handling
- `AMC-5.10` LLM03 Training Data Poisoning
- `AMC-5.11` LLM04 Model Denial of Service
- `AMC-5.12` LLM05 Supply Chain Vulnerabilities
- `AMC-5.13` LLM06 Sensitive Information Disclosure
- `AMC-5.14` LLM07 Insecure Plugin Design
- `AMC-5.15` LLM08 Excessive Agency
- `AMC-5.16` LLM09 Overreliance
- `AMC-5.17` LLM10 Model Theft

### 2) EU AI Act decomposition (6 sub-questions)
Replaced `AMC-EUAI-1` with six controls:
- `AMC-2.6` FRIA completion
- `AMC-2.7` Serious incident lifecycle/reporting
- `AMC-2.8` Post-market monitoring
- `AMC-2.9` Technical documentation governance
- `AMC-2.10` Human oversight implementation
- `AMC-2.11` Conformity assessment readiness

### 3) ISO/IEC 42005 impact assessment questions (3)
Added:
- `AMC-2.12` Impact assessment scope
- `AMC-2.13` Impact severity/likelihood quantification
- `AMC-2.14` Impact mitigation traceability

### 4) Bias/fairness sub-controls (3)
Added:
- `AMC-3.4.1` Demographic parity
- `AMC-3.4.2` Counterfactual fairness
- `AMC-3.4.3` Disparate impact

### 5) Evidence gate hardening for all new compliance controls
In `src/diagnostic/questionBank.ts`:
- Added gate specialization for:
  - EU AI sub-controls (`AMC-2.6`..`AMC-2.11`)
  - ISO 42005 controls (`AMC-2.12`..`AMC-2.14`)
  - OWASP controls (`AMC-5.8`..`AMC-5.17`)
  - Fairness controls (`AMC-3.4.1`..`AMC-3.4.3`)
- L3+ now requires control-scoped audit/metric/test/artifact evidence.
- L4/L5 enforces observed-trust progression and stronger control-verification signals.

### 6) Schema and canonical bank updates
Updated total bank size and per-dimension counts:
- Total questions: **87**
- D1 Strategic Agent Operations: **13**
- D2 Leadership: **18**
- D3 Culture: **20**
- D4 Resilience: **16**
- D5 Skills: **20**

Files updated:
- `src/diagnostic/bank/bankSchema.ts`
- `src/diagnostic/bank/bankV1.ts`
- `src/canon/canonSchema.ts`
- `src/canon/canonBuiltin.ts`
- `src/mechanic/mechanicSchema.ts`

### 7) Standards mapping docs
Updated `docs/STANDARDS_MAPPING.md` with a dedicated compliance decomposition section covering:
- EU AI Act decomposed mappings
- OWASP LLM Top 10 one-per-risk mappings
- ISO/IEC 42005 and ISO/IEC 42006 linkage
- Bias/fairness sub-control mappings

### 8) Cross-framework mapping runtime updates
Updated `src/score/crossFrameworkMapping.ts` to:
- Remove stale/non-existent QIDs
- Map NIST bias/impact controls to new valid QIDs
- Add ISO 42005 and ISO 42006 control mapping entries
- Map EU FRIA/incident/post-market/technical doc/human oversight/conformity to decomposed controls

## Tests and Validation

### Typecheck
- Command: `npm run typecheck`
- Result: **PASS**

### Focused question bank test
- Command: `npm test -- tests/questionBank.test.ts --reporter=verbose`
- Result: **PASS** (3/3)

### Requested full-suite tail command
- Command: `npm test -- --reporter=verbose 2>&1 | tail -30`
- Result: command executed; tail captured failures due sandbox restrictions (`listen EPERM`) in tests that open local listeners.
- Tail summary at completion:
  - `Test Files  27 failed | 81 passed (108)`
  - `Tests  78 failed | 1744 passed (1822)`
  - `Errors  66 errors`
  - Dominant failure mode: `Error: listen EPERM: operation not permitted ...` in network/listener-based tests.

## Files Changed
- `docs/STANDARDS_MAPPING.md`
- `src/canon/canonBuiltin.ts`
- `src/canon/canonSchema.ts`
- `src/diagnostic/bank/bankSchema.ts`
- `src/diagnostic/bank/bankV1.ts`
- `src/diagnostic/questionBank.ts`
- `src/mechanic/mechanicSchema.ts`
- `src/score/crossFrameworkMapping.ts`
- `tests/compassCanonCgxTruthguard.test.ts`
- `tests/mechanicWorkbench.test.ts`
- `tests/questionBank.test.ts`
- `tests/universalAgentIntegrationLayer.test.ts`
