# Evaluation And Assurance Plane

This part covers the systems that turn captured evidence into maturity scores, adversarial findings, compliance mappings, domain overlays, benchmarks, and aggregated org or fleet views.

## What This Subsystem Family Is For

The evaluation and assurance plane is where AMC becomes opinionated about whether an agent or workflow is trustworthy, governed, resilient, and operationally mature.

Its job is to:

- run quickscore and fuller diagnostic evaluations
- interpret evidence against question banks and scoring gates
- execute assurance packs and produce findings
- map evidence and controls to compliance frameworks
- apply sector or domain-specific overlays
- compare agents or workspaces against benchmarks
- roll scores upward into org and fleet views

This is the broadest plane in the repo because AMC's external promise is strongly tied to these outputs.

## Real Entrypoints And Data Or State Boundaries

### Primary Entrypoints

- `src/diagnostic/runner.ts`, `src/diagnostic/quickScore.ts`, `src/diagnostic/fullDiagnostic.ts`, and `src/diagnostic/questionBank.ts` define the diagnostic core.
- `src/diagnostic/autoAnswer/` and `src/diagnostic/contextualizer/` help map evidence and context into scoreable inputs.
- `src/assurance/assuranceRunner.ts`, `src/assurance/assuranceControlPlane.ts`, `src/assurance/report.ts`, and `src/assurance/packs/index.ts` define the assurance execution path.
- `src/compliance/complianceEngine.ts` and related reporting and mapping modules connect evidence to regulatory or standards-oriented outputs.
- `src/domains/industryPacks.ts` and the surrounding `src/domains/` modules apply domain or sector overlays.
- `src/bench/` provides benchmark collection, proof, registry, and comparison surfaces.
- `src/org/` and `src/fleet/` aggregate agent-level or workspace-level results upward.

### State Boundaries

- Diagnostic banks and question catalogs define the scoring vocabulary.
- Diagnostic sessions, auto-answer mappings, and evidence-derived answers define the input state.
- Assurance findings, certificates, and evidence artifacts define the adversarial-testing state.
- Compliance mappings and reports define framework-facing output state.
- Benchmark registries and org or fleet stores define comparative and aggregate state.

The evaluation plane is therefore not a single scoring function. It is a layered interpretation system built on top of captured evidence.

## Runtime Flow

The main evaluation flow usually looks like this:

1. A user runs a quickscore, full diagnostic, assurance run, benchmark comparison, or org-oriented report.
2. AMC loads the relevant question bank, policy, contextualizer, or assurance pack set.
3. Evidence from the runtime and trust planes is read directly or translated into scoreable signals.
4. Diagnostic scoring, calibration, gates, and confidence logic produce maturity outcomes.
5. Assurance runners execute pack logic and turn attack or failure simulations into findings and reports.
6. Compliance mappings translate evidence and control posture into framework-facing outputs.
7. Domain, benchmark, org, and fleet layers add comparison or context around the same underlying evidence.

This plane is where AMC's raw evidence becomes judgment.

## What Looks Mature Versus Thin Or Wrapper-Like

### Mature Or Core

- The diagnostic subsystem is a real engine with runners, question banks, gates, calibration, confidence logic, and contextualization.
- Assurance is also a substantial subsystem, with runners, findings, schedulers, verifiers, and a large pack catalog.
- Compliance mapping is implemented as a real engine rather than only a copywriting layer.

### Broad And High-Churn

- The diagnostic bank, assurance pack registry, and domain overlays are all high-churn catalogs. They are real, but public exact counts around them can drift quickly.
- This is one reason top-level architecture docs should avoid brittle numeric claims unless they are explicitly verified against the current source.

### Real But Later In The Journey

- Benchmarks, org scoring, and fleet aggregation are implemented, but many first-time users will encounter quickscore and assurance first.
- Domain overlays add real context, though some public descriptions of stations, packs, or coverage may need careful maintenance to stay aligned with code.

### Wrapper-Like Or Secondary

- Public examples, marketing pages, or simplified guides that summarize score outputs are downstream of this plane, not replacements for it.
- Wrapper integrations can trigger this plane, but they do not define it.

## How It Connects To Adjacent Planes

- It depends on the **runtime and control plane** to produce the sessions, traces, and operator context it evaluates.
- It depends on the **trust and evidence plane** to give those judgments an evidence-backed foundation.
- It reads from and reinforces the **governance and execution plane** because policy, approvals, identity, and bounded autonomy influence maturity outcomes.
- It is surfaced through the **operations and ecosystem plane** in reports, SDK calls, CI workflows, benchmarks, and buyer-facing or operator-facing artifacts.

This plane is where AMC's outward value proposition becomes visible, but it is only as strong as the planes underneath it.

## Notable Current Inconsistencies Or Caveats

### Count Drift Is A Real Risk Here

This is the easiest plane for public counts to go stale because the question bank, assurance pack catalog, and domain overlays are actively expanding. Durable language is often more honest than pinning exact numbers onto top-level pages.

### Breadth Can Read As Sameness

Quickscore, assurance, compliance, domain packs, benchmarks, org scoring, and fleet analysis all live near each other, but they serve different layers of judgment. Docs should keep those layers distinct.

### Compatibility Lineage Shows Up Inside Catalogs

Some pack names preserve compatibility or naming lineage. That is useful operationally, but readers should not infer multiple parallel assurance engines from naming duplication.

### Evidence Quality Still Governs Evaluation Quality

Auto-answering, contextualization, compliance mapping, and aggregated scoring are only as trustworthy as the evidence routed into AMC. The evaluation plane is strong, but it is not magic.
