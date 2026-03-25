# AMC Docs Drift Cleanup Plan

This is the public remediation plan for aligning AMC documentation with current repo reality.

It is intentionally facts-first. It does not rewrite the product to sound cleaner than the code, and it does not treat historical or wrapper surfaces as if they were the same thing as the current core runtime.

The canonical anchors for that work are:

- [ARCHITECTURE_BRIEF.md](ARCHITECTURE_BRIEF.md)
- [IMPLEMENTATION_REALITY_MAP.md](IMPLEMENTATION_REALITY_MAP.md)
- [ARCHITECTURE_MAP.md](ARCHITECTURE_MAP.md)

## What Problem This Plan Addresses

AMC's repo has grown faster than its routing language.

That creates predictable documentation drift:

- some pages keep stale counts after the underlying catalogs expand
- some pages describe capability breadth without making maturity or implementation status clear
- some top-level narratives flatten wrappers, integrations, and the core runtime into one indistinct story
- some legacy wording preserves continuity at the cost of architectural clarity
- some routing pages compete with each other instead of establishing one durable explanation and several supporting paths

This plan exists to fix those issues without losing useful history.

## Current Drift Classes

### 1. Stale Counts

High-churn inventories such as diagnostic questions, assurance packs, and domain overlays can outgrow public copy quickly. This repo already shows that pattern in places where older public counts remain after the source catalogs changed.

### 2. Stale Capability Claims

Some pages imply a surface is broadly operational without distinguishing whether it is central, thin, exploratory, or primarily a wrapper around another path.

### 3. Public-vs-Code Mismatches

Some narratives describe AMC in product-family language that is looser than the underlying runtime boundaries. When that happens, readers can mistake packaging language for architecture.

### 4. Wrapper-vs-Core Ambiguity

SDKs, actions, extensions, examples, and compatibility wrappers are important, but they are not the same thing as the TypeScript runtime. Documentation should make that obvious.

### 5. Legacy Wording That Undermines Trust

Legacy commands, preserved aliases, and historical lineages are useful, but they become harmful when they imply a cleaner or more unified implementation story than the code supports.

### 6. Duplicated or Conflicting Routing Narratives

When multiple top-level pages each try to be the main explanation, readers get different answers depending on where they land. AMC needs one durable architectural explanation and several role-specific entry routes.

## Facts-First Remediation Policy

### Policy 1: High-Churn Counts Need One Canonical Source Or No Top-Level Slot

If a count changes often, public top-level pages should either:

- derive it from one canonical source of truth, or
- stop leading with the exact number

Durable language is usually better than brittle enumeration.

### Policy 2: Code-Backed Docs Win Over Stale Marketing Copy

When public copy and current source disagree, code-backed architecture and implementation docs win. Marketing or positioning language should be revised to match the verified implementation, not the other way around.

### Policy 3: Prefer Durable Statements Over Brittle Precision

Top-level docs should prefer statements like "large and actively expanding assurance catalog" over exact pack counts unless those counts are intentionally generated and maintained.

### Policy 4: Wrapper Surfaces Must Be Labeled Honestly

If a surface is mainly a shell around the CLI, gateway, or Studio runtime, document it that way. This is not a downgrade. It is the clarity readers need when choosing an integration path.

### Policy 5: Legacy Should Stay Visible, But Not Misleading

Preserved lineage, aliases, and compatibility commands should remain documented where users need them, but they should not be mistaken for the preferred current core.

### Policy 6: Top-Level Routing Should Point Back To Canonical Anchors

The architecture brief and implementation reality map should act as the stable interpretive center. Other landing pages can stay specialized, but they should not each redefine what AMC fundamentally is.

## Sequenced Patch Order

The cleanup order matters because high-traffic routing pages create most first impressions.

1. README and top routing docs  
   Align the main entry surfaces first so new readers get the right mental model immediately.

2. Website docs navigation and key landing pages  
   Navigation should expose the canonical architecture brief, the implementation reality map, and the deep-dive series so readers can self-correct from older narratives.

3. Product and commercial pages  
   Update packaging and buyer-facing pages to reflect the real runtime center without flattening capability breadth.

4. Comparison and architecture pages  
   Bring comparison pages, architecture explainers, and system capability pages into the same facts-first frame.

5. Long-tail audit and reference docs only where user-facing confusion remains  
   Historical, audit, or deep reference material should be updated only when it is surfaced publicly and actively confusing current readers.

## Do Not Change In This Wave

- Do not rewrite runtime behavior docs to match aspiration.
- Do not collapse legacy lineage into current-core claims.
- Do not update internal historical or audit files unless they are surfaced publicly and misleading current readers.

Those guardrails keep the cleanup credible.

## Verification Rules For Future Doc Changes

- Verify every numeric claim against source or tests before publishing it.
- If a number cannot be maintained reliably, replace it with durable wording.
- Keep `docs/INDEX.md`, `docs/START_HERE.md`, and website navigation aligned so architecture docs are not orphaned.
- When documenting implementation status, route through [IMPLEMENTATION_REALITY_MAP.md](IMPLEMENTATION_REALITY_MAP.md).
- When documenting architectural shape, route through [ARCHITECTURE_BRIEF.md](ARCHITECTURE_BRIEF.md) and [ARCHITECTURE_MAP.md](ARCHITECTURE_MAP.md).

## Definition Of Done

This cleanup effort is working when:

- a new reader can tell what AMC fundamentally is without reverse-engineering the repo
- a technical evaluator can distinguish core runtime from wrappers and legacy lineage
- a maintainer has a clear order of operations for updating stale pages
- architecture, navigation, and deep-dive docs reinforce each other instead of competing

The goal is not fewer docs. The goal is fewer contradictory explanations.
