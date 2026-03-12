# ECC vs AMC — Exhaustive Gap Analysis, Ruthless Action Plan, and Homepage/Repo Rewrite Plan

_Date: 2026-03-12_

## Purpose

This document converts the earlier competitive teardown into a build-grade operating plan.
It does three things in one place:

1. Enumerates the full gap list between Everything Claude Code (ECC) and Agent Maturity Compass (AMC)
2. Defines a ruthless, severity-tagged action plan with proposed fixes
3. Provides a homepage rewrite plan and repo rewrite plan detailed enough to execute

This is intentionally exhaustive. The goal is not to admire the problem; it is to remove ambiguity and create a practical build order.

---

# Part I — Executive Summary

## Core diagnosis

AMC is not behind ECC in technical depth, rigor, or defensibility.
AMC is behind ECC in:
- packaging
- conversion-oriented messaging
- newcomer readability
- distribution framing
- community/social proof presentation
- monetization clarity
- website polish and emotional accessibility

## Blunt summary

- **AMC = stronger engine, weaker box**
- **ECC = weaker engine, stronger box**

AMC’s main risk is not lack of capability. It is **presentation drag**.
The product asks users to understand too much before they feel the value.

## Strategic mandate

Do **not** simplify by removing substance.
Instead:
- compress the first-touch story
- package the product family more clearly
- improve conversion and onboarding UX
- reduce repo/website cognitive load
- add visible trust/adoption/commercial signals

---

# Part II — Exhaustive Gap List (1–16)

## 1. Positioning and category clarity gap

### What ECC does better
- Uses a simple, immediately understandable wedge
- States the primary job very clearly
- Splits product lines in a way newcomers can parse quickly
- Keeps the first message outcome-oriented rather than architecture-oriented

### AMC current state
- Strong positioning, but dense and multi-threaded
- Introduces too many concepts too early: score, compliance, packs, traces, evidence, adapters, observability, business reporting, cryptographic proof, CI, governance
- Risks overwhelming first-time users before they commit to the first action

### Symptoms
- The first-time visitor may understand that AMC is powerful but not immediately know:
  - whether AMC is for them
  - what the first action is
  - what exact pain AMC solves first
  - whether AMC is a CLI, framework, dashboard, benchmark, compliance suite, or all of the above

### Gap statement
AMC needs a tighter first-10-second category story.

### Proposed fix direction
- Tighten the headline/subheadline pair
- Introduce a layered narrative:
  1. score your agent
  2. find gaps
  3. generate fixes
  4. expand into trust, CI, and compliance

---

## 2. Website look-and-feel and conversion gap

### What ECC does better
- More polished startup-style page flow
- Better section choreography
- Clear product cards and conversion lanes
- More emotionally accessible and less intimidating
- Better visual rhythm and “what next?” progression

### AMC current state
- Improved and serious, but still more technical-product than adoption-product
- Reads like a powerful infrastructure project rather than a conversion-tuned category leader

### Symptoms
- Website is strong in substance but lower in:
  - warmth
  - social proof
  - product framing
  - user segmentation
  - conversion repetition
  - “easy win” feel

### Gap statement
AMC’s site explains more than it converts.

### Proposed fix direction
- Stronger CTA architecture
- More product cards / persona cards / proof cards
- More emotional payoff and confidence-building sections
- Better repeated call paths for browser, CLI, CI, and enterprise

---

## 3. Repo organization and newcomer readability gap

### What ECC does better
- Repo looks modular and browsable at first glance
- Directory semantics are straightforward: agents, commands, hooks, rules, skills, examples
- Easier for a newcomer to infer “how do I use this?”

### AMC current state
- Enormous depth, but more crowded and mixed at the root
- Root includes product, internal operations, generated artifacts, experiments, and multiple stateful areas
- Rich, but visually heavier and less curated

### Symptoms
- Newcomers may struggle to identify:
  - the product’s public entry points
  - what is core vs experimental vs generated
  - where to start browsing

### Gap statement
AMC’s repo is rich but less legible as a productized open-source repo.

### Proposed fix direction
- Curate the repo root
- Move internal or generated clutter downward where possible
- Create a cleaner public-first IA

---

## 4. Installation and distribution story gap

### What ECC does better
- Clear “plugin marketplace” story
- Clear universal installer story
- Clear multi-editor support story
- Easier to explain to a newcomer in one sentence

### AMC current state
- Installation options are actually strong: npm, brew, docker, install script, GitHub Action, browser playground, experimental SEA path
- But the install story is distributed across options rather than packaged into a simple decision tree

### Symptoms
- AMC feels like it has many valid entry points but not one beautifully unified install story

### Gap statement
AMC has install breadth but weaker distribution packaging.

### Proposed fix direction
- Add a stronger “choose your path” install matrix
- Create a universal entry framing: browser / local CLI / CI / self-hosted / enterprise
- Consider a more branded installer narrative

---

## 5. Product architecture storytelling gap

### What ECC does better
- Product family is easy to mentally model
- Open-source repo + GitHub app split is very understandable
- Components feel intentionally bundled

### AMC current state
- Product family is broad and powerful, but mentally heavier
- Multiple sub-products can feel like product sprawl if not grouped clearly

### Symptoms
- New visitors may not immediately understand the role boundaries between:
  - Score
  - Shield
  - Enforce
  - Vault
  - Watch
  - Fleet
  - Passport
  - Comply
- The product names themselves are strong and should be retained.
- The problem is not the naming; the problem is that the relationship between the named products is not explained quickly enough.

### Gap statement
AMC’s product family needs better information architecture, clearer sequencing, and stronger user-facing packaging while retaining the canonical product names:
- Score
- Shield
- Enforce
- Vault
- Watch
- Fleet
- Passport
- Comply

### Proposed fix direction
- Retain the canonical product names everywhere public-facing.
- Introduce a simple explanatory layer that clarifies how they work together without replacing the names.
- Frame the system as a trust stack with recognizable product roles:
  - **Score** — maturity diagnostics and evidence-weighted trust scoring
  - **Shield** — adversarial testing and assurance packs
  - **Enforce** — policy controls, approvals, and action governance
  - **Vault** — keys, signatures, and tamper-evident proof infrastructure
  - **Watch** — observability, traces, anomalies, and monitoring
  - **Fleet** — multi-agent oversight, comparison, and governance at scale
  - **Passport** — portable identity, credentials, and agent portability artifacts
  - **Comply** — regulatory mapping, audit binders, and compliance reporting
- Use these exact names on the homepage, README, docs hubs, and future pricing/edition materials.

---

## 6. Social proof and momentum signal gap

### What ECC does better
- Explicitly shows momentum, contributors, updates, testimonials, ecosystem activity
- Feels socially alive

### AMC current state
- Strong technical proof, weaker visible adoption proof
- More trust infrastructure than visible community motion

### Symptoms
- Less visible “people use this / trust this / contribute to this / talk about this” energy

### Gap statement
AMC under-displays social momentum.

### Proposed fix direction
- Showcase section
- contributor wall
- public benchmark gallery
- testimonials or practitioner quotes
- release highlights section
- sponsor/support page

---

## 7. Sponsorship / monetization / tier clarity gap

### What ECC does better
- Splits free/open and paid/service offerings clearly
- Introduces pricing and free tier framing directly
- Makes commercial ladder legible

### AMC current state
- Feels mostly open-source/platform-first in public presentation
- Business value is evident, but commercial packaging is not explicit enough

### Symptoms
- Visitors may not know:
  - whether there is a hosted offering
  - what teams would pay for
  - what “enterprise” means here
  - what the edition model is

### Gap statement
AMC lacks a crisp commercial packaging narrative.

### Proposed fix direction
- add pricing/editions page
- add hosted vs self-hosted comparison
- add enterprise support/SLAs page
- define team / enterprise / compliance bundle stories

---

## 8. Documentation architecture and pathing gap

### What ECC does better
- More obviously use-case driven for casual users
- Easier path from landing page to “do the thing”

### AMC current state
- Documentation is broad and serious, but pathing can feel like entering a library before knowing which shelf matters

### Symptoms
- Too many docs are valid, but the path to the correct doc can be less obvious than it should be
- Deep references may compete with quick-start docs for attention

### Gap statement
AMC has strong content but weaker onboarding curation.

### Proposed fix direction
- Stronger doc landing pages
- clearer doc personas
- 5-minute path, 30-minute path, deep reference path
- docs index by user type and by task

---

## 9. First-time user UX gap

### What ECC does better
- Gives a very fast sense of “try this now”
- Easier to infer the first useful action

### AMC current state
- First-time journey exists but still demands more cognitive effort

### Symptoms
- Users may ask:
  - am I scoring an agent or an app?
  - when do I use browser vs CLI?
  - what do I get after quickscore?
  - when do I need wrapping?
  - what is the minimum viable flow?

### Gap statement
AMC needs a brutally simplified first-run decision tree.

### Proposed fix direction
- “If you have X, do Y” blocks
- “Start here in under 2 minutes” page for each user archetype
- path-specific examples for browser, CLI, CI, compliance

---

## 10. Ecosystem/editor support framing gap

### What ECC does better
- Explicitly frames multi-editor and multi-harness reach in a highly visible way
- Makes breadth feel accessible and strategic

### AMC current state
- Adapter support is real and substantial, but less aggressively framed as a first-class ecosystem story

### Symptoms
- The ecosystem breadth exists but does not always hit visitors emotionally as “works with what I already use”

### Gap statement
AMC under-markets its compatibility breadth.

### Proposed fix direction
- Compatibility strip on homepage
- “works with your stack” sections
- explicit matrix cards by framework/editor/runtime/CI

---

## 11. Examples, templates, and copy-pasteability gap

### What ECC does better
- Easier to copy components and get a feeling of progress quickly
- Strong drop-in configuration vibe

### AMC current state
- Strong examples and templates exist, but the repo can feel more like a platform than a copyable starter kit

### Symptoms
- Not enough tiny examples for ultra-fast wins
- More “serious platform” than “tiny drop-in help” in feel

### Gap statement
AMC needs more immediate copy-paste examples and starter recipes.

### Proposed fix direction
- mini-recipes library
- “copy this workflow” pages
- framework-specific starters
- before/after examples

---

## 12. Website conversion mechanics gap

### What ECC does better
- Repeats CTAs cleanly
- segments product choices better
- moves users through decision points more naturally

### AMC current state
- Strong content, but some sections still optimize for explanation rather than conversion

### Symptoms
- Users may admire AMC without feeling guided toward the most relevant next click

### Gap statement
AMC needs a more disciplined conversion funnel on the homepage.

### Proposed fix direction
- repeated CTA architecture
- persona-specific CTAs
- install path chooser
- enterprise CTA
- browser try-now CTA
- CI gate CTA

---

## 13. Branding and emotional accessibility gap

### What ECC does better
- Feels friendlier and more approachable
- Builder-community tone softens complexity

### AMC current state
- Strong, sharp, credible, but more intense and infrastructure-heavy in tone

### Symptoms
- Great for trust seriousness, slightly less inviting for curious or lightweight users

### Gap statement
AMC needs more warmth without sacrificing rigor.

### Proposed fix direction
- keep hard-edged thesis, but add more human-readable outcomes
- use more “ship safely” and “see real gaps fast” language alongside “proof chains” language

---

## 14. Public trust signal / proof artifact gap

### What ECC does better
- Combines testimonials, release notes, contributors, sponsor framing, ecosystem surface, and marketplace presence into visible trust cues

### AMC current state
- Has stronger technical proof, but less visible public reassurance for a casual evaluator

### Symptoms
- A technical buyer may be impressed; a casual visitor may not yet feel broad validation

### Gap statement
AMC needs more publicly legible trust and adoption artifacts.

### Proposed fix direction
- public score examples
- case-study stories
- benchmark comparisons
- badge gallery
- “used in” / “works with” / “community examples” sections

---

## 15. Repo hygiene / artifact sprawl gap

### What ECC does better
- More curated repo feel
- Better public-facing signal-to-noise at the top level

### AMC current state
- Mixed product assets, runtime artifacts, internal ops artifacts, strategic files, generated outputs, and working-state files present a busier face

### Symptoms
- Harder to tell which files matter to a new external contributor or evaluator

### Gap statement
AMC needs a cleaner repo surface and lower perceived clutter.

### Proposed fix direction
- move internal ops files deeper
- tighten `.gitignore` and public root curation where possible
- reduce root-level document sprawl

---

## 16. Commercial readiness / buyer journey gap

### What ECC does better
- Easier for an outsider to imagine how this becomes a business
- product ladder and service layer are visible

### AMC current state
- Stronger enterprise substance, but weaker buyer packaging
- Commercial paths are implied rather than concretely productized in public materials

### Symptoms
- Harder to answer quickly:
  - what does a startup buy?
  - what does an enterprise buy?
  - what does hosted AMC include?
  - what is free vs paid?

### Gap statement
AMC needs a sharper buyer journey and commercial packaging system.

### Proposed fix direction
- define product editions
- define packaging by buyer persona
- add hosted/managed story
- add enterprise support and security posture pages

---

# Part III — Tiered Gaps Summary

## Tier 1 — urgent market-facing gaps
1. Packaging gap
2. Website conversion gap
3. Monetization gap
4. Community proof gap
5. Repo IA gap

## Tier 2 — important product perception gaps
6. Simplicity gap
7. Examples gap
8. Ecosystem distribution framing gap
9. Visual polish gap
10. Persona journey gap

## Tier 3 — strategic leverage gaps
11. Public benchmark/showcase gap
12. Commercial narrative gap
13. Social momentum gap
14. Opinionated onboarding gap

---

# Part IV — Ruthless Action Plan

## Severity legend
- **P0 Critical** — blocks growth, adoption, or category capture now
- **P1 High** — materially improves conversion, credibility, or user success
- **P2 Medium** — high leverage but not immediate survival-critical
- **P3 Nice-to-have** — useful polish once core gaps are addressed

## Workstream A — Messaging and positioning

### A1. Rewrite homepage above-the-fold
- Severity: **P0**
- Problem: Too much concept density too early
- Proposed fix:
  - headline: one-liner category statement
  - subheadline: score → gaps → fixes → proof
  - primary CTA: browser try-now
  - secondary CTA: CLI quickscore
  - tertiary CTA: CI gate
- Deliverables:
  - new hero copy
  - new CTA layout
  - compact proof strip
- Success metric:
  - homepage bounce reduction
  - more clicks to quickstart/playground

### A2. Create product-family narrative
- Severity: **P0**
- Problem: AMC sub-products feel broad but under-grouped
- Proposed fix:
  - create “Assess / Observe / Attack / Fix / Govern / Fleet” product buckets
  - map every CLI/docs feature into those buckets
- Deliverables:
  - homepage product section
  - docs product-family page
  - README product architecture section
- Success metric:
  - reduced confusion in first-touch user interviews

### A3. Add persona-based messaging
- Severity: **P1**
- Problem: Different buyers/users aren’t routed cleanly
- Proposed fix:
  - blocks for solo dev, platform engineer, security team, compliance lead, OSS maintainer
- Deliverables:
  - persona cards on homepage
  - persona quickstart docs
- Success metric:
  - deeper docs click-through per persona card

---

## Workstream B — Homepage and website conversion

### B1. Redesign site information architecture
- Severity: **P0**
- Problem: Website explains but under-converts
- Proposed fix:
  - enforce a home page structure:
    1. hero
    2. trust gap problem
    3. 3-step quickstart
    4. product family
    5. compatibility strip
    6. proof / why AMC
    7. persona paths
    8. examples / outcomes
    9. enterprise/compliance
    10. FAQ
    11. final CTA
- Deliverables:
  - new homepage wireframe
  - updated homepage HTML/CSS/JS
- Success metric:
  - increased CTA click concentration

### B2. Add “choose your path” install section
- Severity: **P0**
- Problem: Install options exist but are not framed as a simple choice
- Proposed fix:
  - cards for Browser, CLI, CI, Self-hosted, Enterprise
- Deliverables:
  - homepage section
  - docs/install landing page
- Success metric:
  - fewer users bouncing from install docs

### B3. Add trust/proof strip
- Severity: **P1**
- Problem: Technical proof exists but is under-packaged
- Proposed fix:
  - display current counts: tests, adapters, packs, modules, domains, commands
  - add release stability/support signals
- Deliverables:
  - proof component on homepage
  - dynamic or manually maintained counters
- Success metric:
  - higher perceived credibility in user interviews

### B4. Add social proof section
- Severity: **P1**
- Problem: Low visible adoption energy
- Proposed fix:
  - quotes/testimonials
  - community spotlight
  - contributor callout
  - public benchmark/customer story placeholders
- Deliverables:
  - homepage social proof block
  - docs/community showcase page
- Success metric:
  - stronger return visits / community engagement

### B5. Add pricing/editions teaser on homepage
- Severity: **P1**
- Problem: business model unclear
- Proposed fix:
  - open source vs team vs enterprise framing with “coming soon” if necessary
- Deliverables:
  - pricing teaser block
  - full pricing page
- Success metric:
  - more enterprise inquiry readiness

---

## Workstream C — README rewrite and repo face-lift

### C1. Rewrite README for layered onboarding
- Severity: **P0**
- Problem: README carries too much breadth before first action
- Proposed fix:
  - structure:
    1. headline
    2. 15-second value prop
    3. 2-minute quickstart
    4. browser path
    5. CI path
    6. frameworks supported
    7. product family
    8. proof strip
    9. deeper docs links
- Deliverables:
  - rewritten README.md
- Success metric:
  - more stars/click-through from README

### C2. Curate repo root
- Severity: **P0**
- Problem: root feels cluttered
- Proposed fix:
  - move non-public/internal planning docs to internal or archive areas where possible
  - reduce “ops-command-center” feeling at top level
- Deliverables:
  - repo root audit
  - file movement plan
  - root cleanup PR
- Success metric:
  - newcomer can identify core product surfaces in <30 seconds

### C3. Add START_HERE.md / QUICKSTART hub
- Severity: **P1**
- Problem: too many valid entry points
- Proposed fix:
  - one page that routes by user type and goal
- Deliverables:
  - `docs/START_HERE.md`
  - homepage/docs link integration
- Success metric:
  - lower “where do I start?” friction

### C4. Improve examples structure
- Severity: **P1**
- Problem: examples are not sufficiently marketed as starter wins
- Proposed fix:
  - organize examples by framework, persona, and deployment goal
- Deliverables:
  - examples index
  - 5-minute examples
- Success metric:
  - more example usage/adoption

---

## Workstream D — Documentation architecture

### D1. Create docs index by persona and task
- Severity: **P0**
- Problem: docs depth is high but pathing is weaker than needed
- Proposed fix:
  - docs landing pages by:
    - solo dev
    - platform team
    - security/compliance
    - framework user
    - evaluator/researcher
- Deliverables:
  - `docs/INDEX.md`
  - `docs/SOLO_DEV_PATH.md`
  - `docs/PLATFORM_PATH.md`
  - `docs/SECURITY_PATH.md`
- Success metric:
  - improved time-to-first-success in docs testing

### D2. Create “What happens after quickscore?” page
- Severity: **P1**
- Problem: quickscore is a hook, but the next steps aren’t packaged tightly enough
- Proposed fix:
  - score → fix → CI → assurance → compliance → monitoring roadmap
- Deliverables:
  - new doc page
  - homepage link
- Success metric:
  - more downstream feature adoption after quickscore

### D3. Create comparison pages
- Severity: **P2**
- Problem: category differentiation is strong but under-documented for buyers
- Proposed fix:
  - compare against self-reported evals
  - compare against keyword scanners
  - compare against generic prompt-security-only tools
- Deliverables:
  - docs/comparison pages
- Success metric:
  - better sales/positioning collateral

---

## Workstream E — Product packaging and monetization

### E1. Define product editions
- Severity: **P0**
- Problem: commercial packaging unclear
- Proposed fix:
  - Publish a clear edition matrix that preserves the canonical AMC product names rather than hiding them behind generic plan labels.
  - Define the product stack and access model explicitly across editions.
- Proposed edition structure (draft):
  - **Open Source / Free**
    - Score (core CLI quickscore, lite-score, browser playground)
    - Shield (selected starter assurance packs)
    - limited Watch surfaces (basic traces / local inspection)
    - basic Comply mappings/docs references
  - **Pro / Team**
    - Score (advanced scoring workflows, shareable outputs, historical comparisons)
    - Shield (expanded assurance packs and automation workflows)
    - Watch (dashboards, recurring checks, richer observability)
    - Comply (expanded reporting templates and governance artifacts)
    - limited Fleet for small multi-agent teams
  - **Enterprise / Platform / Regulated**
    - full Score
    - full Shield
    - Enforce
    - Vault
    - Watch
    - Fleet
    - Passport
    - Comply
    - enterprise support, SSO/SCIM expectations, policy packs, hosted/on-prem deployment options, audit-ready workflows
- Deliverables:
  - pricing page
  - edition matrix doc
  - homepage summary block
  - docs/product-editions.md
- Success metric:
  - clearer buyer conversations
  - easier explanation of what is free vs paid vs enterprise

### E2. Define pricing tiers and commercial ladder
- Severity: **P0**
- Problem: pricing narrative is absent, so buyers cannot map value to spend
- Proposed fix:
  - Create pricing tiers with explicit buyer intent and included products.
  - Even if exact numbers are provisional, publish a pricing architecture.
- Proposed pricing structure (draft placeholders until finalized):
  - **Free** — solo dev / OSS / evaluation
  - **Starter / Pro** — individual builders and small teams
  - **Team** — collaborative engineering and platform teams
  - **Enterprise** — regulated and large-scale governance buyers
- Each tier should answer:
  - who it is for
  - which AMC products are included (Score, Shield, Enforce, Vault, Watch, Fleet, Passport, Comply)
  - usage limits / deployment rights / support level
  - what unlocks at the next tier
- Deliverables:
  - pricing architecture draft
  - pricing FAQ
  - edition comparison table
- Success metric:
  - buyers understand how AMC becomes a business, not just a cool repo

### E3. Define commercial offers by persona
- Severity: **P1**
- Problem: hard to answer “what do we buy?”
- Proposed fix:
  - packages for:
    - startups
    - AI platforms
    - regulated orgs
    - enterprise security teams
    - open-source maintainers / ecosystem partners
- Deliverables:
  - buyer package matrix
  - enterprise page
  - persona-to-edition map
- Success metric:
  - easier enterprise packaging

### E4. Add support and service story
- Severity: **P1**
- Problem: support/commercial reliability not sufficiently productized
- Proposed fix:
  - support tiers
  - advisory/audit services
  - onboarding packages
  - implementation packages
  - policy-pack/compliance-pack services
- Deliverables:
  - support policy page
  - enterprise support block
  - services/engagement overview
- Success metric:
  - reduced uncertainty for enterprise buyers

### E5. Add sponsorship system and support path
- Severity: **P1**
- Problem: open-source sustainability path is not visible enough
- Proposed fix:
  - Create a formal sponsorship strategy for AMC as open-source trust infrastructure.
  - Add GitHub Sponsors/support messaging for individuals, companies, and ecosystem supporters.
  - Make sponsorship distinct from product pricing: sponsorship supports the open project; pricing buys product/service value.
- Deliverables:
  - `SPONSORING.md`
  - sponsor/support section on homepage
  - sponsor/support section in README
  - docs/community-support.md
- Success metric:
  - improved community sustainability
  - clearer path for supporters who are not yet enterprise buyers

### E6. Create sponsor tier definitions
- Severity: **P2**
- Problem: support CTA without sponsorship structure is vague
- Proposed fix:
  - Define sponsor tiers such as:
    - Supporter
    - Backer
    - Sustainer
    - Ecosystem Partner
    - Strategic Sponsor
  - Define what each tier receives publicly (logo placement, acknowledgments, supporter wall, roadmap briefings, community calls) without compromising product independence.
- Deliverables:
  - sponsor tier matrix
  - sponsor acknowledgements policy
- Success metric:
  - sponsorship becomes legible and actionable instead of decorative

### E7. Publish hosted vs self-hosted vs enterprise deployment comparison
- Severity: **P1**
- Problem: visitors cannot clearly distinguish open-source usage from paid deployment value
- Proposed fix:
  - Create a deployment comparison table covering:
    - browser try-now
    - local CLI
    - CI/GitHub Action
    - self-hosted team deployment
    - managed/hosted AMC
    - enterprise/on-prem
- Deliverables:
  - deployment comparison page
  - pricing page integration
- Success metric:
  - reduced confusion about deployment options and paid value separation

### E8. Add sponsor/support path to roadmap and release cadence
- Severity: **P3**
- Problem: sustainability signals disappear if not integrated into regular product communication
- Proposed fix:
  - Include sponsor/community support as part of roadmap communication, changelogs, and community pages.
- Deliverables:
  - roadmap support section
  - release notes sponsor acknowledgment pattern
- Success metric:
  - long-term open-source sustainability feels intentional, not accidental.

---

## Workstream F — Social proof, trust, and public momentum

### F1. Add community showcase page
- Severity: **P1**
- Problem: low visible adoption proof
- Proposed fix:
  - showcase agents/projects scored by AMC
  - anonymized examples if necessary
- Deliverables:
  - community showcase page
- Success metric:
  - stronger trust for new visitors

### F2. Add release highlights section/site module
- Severity: **P1**
- Problem: momentum exists but is not surfaced well enough
- Proposed fix:
  - “What’s new” section on homepage/docs
- Deliverables:
  - release highlights component
  - monthly update cadence page
- Success metric:
  - repeat engagement and freshness perception

### F3. Add benchmark gallery and score badge examples
- Severity: **P2**
- Problem: public proof artifacts under-leveraged
- Proposed fix:
  - gallery of score badges, sample reports, example outputs
- Deliverables:
  - benchmark gallery page
- Success metric:
  - more installs from curiosity-driven exploration

---

## Workstream G — Ecosystem and compatibility framing

### G1. Add compatibility strip and matrix on homepage
- Severity: **P1**
- Problem: support breadth exists but is under-marketed
- Proposed fix:
  - show frameworks/editors/runtimes prominently
- Deliverables:
  - compatibility strip component
  - enhanced compatibility matrix page
- Success metric:
  - better first-touch stack relevance recognition

### G2. Create stack-specific landing pages
- Severity: **P2**
- Problem: users want to know “will this work with my stack?”
- Proposed fix:
  - pages for LangChain, OpenAI Agents SDK, Claude Code, OpenClaw, generic CLI, etc.
- Deliverables:
  - adapter-specific landing pages
- Success metric:
  - more qualified adoption by stack

---

## Workstream H — Examples, templates, and quick wins

### H1. Create “copy-paste recipes” hub
- Severity: **P1**
- Problem: not enough tiny, immediate wins
- Proposed fix:
  - recipes for:
    - CI trust gate
    - browser try-now
    - wrap existing CLI agent
    - run adversarial pack
    - create compliance binder
- Deliverables:
  - recipes page
  - README recipe links
- Success metric:
  - higher first-day retention

### H2. Add starter blueprints by persona
- Severity: **P2**
- Problem: blueprints exist but need more productized presentation
- Proposed fix:
  - startup agent team
  - regulated org
  - solo builder
  - evaluator/researcher
- Deliverables:
  - starter blueprint collection
- Success metric:
  - more diverse adoption paths

---

## Workstream I — Repo hygiene and structure

### I1. Audit root-level files and classify them
- Severity: **P0**
- Problem: root clutter dilutes product readability
- Proposed fix:
  - classify every root file as:
    - public product surface
    - contributor surface
    - internal operating artifact
    - generated artifact
    - experimental artifact
- Deliverables:
  - root file inventory
  - move/delete/archive plan
- Success metric:
  - root becomes product-readable

### I2. Move internal operating docs to dedicated area
- Severity: **P1**
- Problem: internal operating artifacts compete with public docs
- Proposed fix:
  - create internal/ops or archive directory for non-user-facing files where appropriate
- Deliverables:
  - repo organization PR
- Success metric:
  - improved repo coherence

### I3. Reduce generated/runtime artifact visibility
- Severity: **P2**
- Problem: stateful/generated data contributes to clutter
- Proposed fix:
  - ensure nonessential artifacts do not dominate public surfaces
- Deliverables:
  - git hygiene and directory cleanup plan
- Success metric:
  - lower visual noise

---

## Workstream J — Brand, narrative, and trust language

### J1. Add more human-readable outcome language
- Severity: **P1**
- Problem: rigor is strong; approachability could improve
- Proposed fix:
  - blend proof-language with operator outcomes:
    - catch dangerous agent gaps fast
    - turn safety theater into evidence
    - ship CI guardrails in minutes
- Deliverables:
  - copy refresh across homepage, README, docs hubs
- Success metric:
  - stronger resonance with non-specialist users

### J2. Keep sharp thesis while softening onboarding tone
- Severity: **P2**
- Problem: first touch can feel intense
- Proposed fix:
  - friendly quickstart framing paired with hard-edged trust argument deeper down
- Deliverables:
  - tone pass on homepage and quickstarts
- Success metric:
  - lower intimidation without losing seriousness

---

# Part V — Homepage Rewrite Plan

## Goal
Create a homepage that converts curiosity into action while preserving AMC’s technical seriousness.

## Core homepage jobs
1. Explain what AMC is in 10 seconds
2. Give a zero-friction first action
3. Make the value legible by persona
4. Prove technical credibility quickly
5. Show expansion path into CI, assurance, and compliance
6. Create confidence that AMC is alive, serious, and worth adopting

## Proposed homepage structure

### Section 1 — Hero
- Headline: one-line category wedge
- Subheadline: score agents from execution evidence, not claims
- Primary CTA: Try in browser
- Secondary CTA: Run quickscore
- Tertiary CTA: Add CI gate
- Small proof line: tests / adapters / packs / license / no API key

### Section 2 — The trust gap
- Visual compare:
  - self-reported score vs verified score
- explain documentation inflation simply
- outcome: AMC closes the gap with observed evidence and proof chains

### Section 3 — Start in 2 minutes
- Card 1: Browser try-now
- Card 2: CLI quickscore
- Card 3: CI trust gate
- Card 4: Wrap existing agent

### Section 4 — What AMC gives you
Use the canonical product names directly and explain each in one sentence:
- **Score** — score trust maturity from evidence, not claims
- **Shield** — run adversarial assurance packs and attack simulations
- **Enforce** — add policy controls, approvals, and action governance
- **Vault** — anchor evidence with signatures, keys, and tamper-evident proof chains
- **Watch** — inspect traces, timelines, anomalies, and operational drift
- **Fleet** — compare and govern multiple agents and systems together
- **Passport** — create portable identity and credential artifacts for agents
- **Comply** — map evidence to frameworks, audit binders, and regulatory outputs
Each card should map to real features without overwhelming detail.
Include a note that these are modules in the AMC trust stack, not random product names.

### Section 4A — Pricing / editions preview
- Add a simple edition preview strip beneath the product cards:
  - Free / Open Source
  - Team / Pro
  - Enterprise / Regulated
- For each edition, summarize which products are typically included.
- Make it obvious that AMC is open source, but that hosted/team/enterprise packaging exists or is planned.

### Section 4B — Sponsor / support preview
- Add a compact support block:
  - Sponsor the open-source trust infrastructure
  - Support the project if you rely on AMC publicly or commercially
  - Distinguish sponsorship from product purchase
- Link this block to a future sponsor/support page and `SPONSORING.md`.

### Section 5 — Works with your stack
- framework/editor/runtime strip
- link to compatibility matrix

### Section 6 — Why AMC is different
- observed evidence > self-report
- cryptographic proof chains
- adversarial assurance
- compliance mapping
- zero code changes

### Section 7 — Persona paths
- Solo builder
- Platform engineer
- Security/compliance
- Open-source maintainer
- AI product team
Each card links to a curated quickstart.

### Section 8 — Proof and momentum
- tests passing
- adapters
- diagnostic questions
- assurance packs
- sector packs
- release notes / latest changes
- contributor/community pointer

### Section 9 — Business and compliance
- EU AI Act
- ISO 42001
- audit binders
- governance evidence
- enterprise CTA

### Section 10 — FAQ
Answer explicitly:
- Is this free?
- Browser vs CLI?
- Does it work with X?
- Do I need to change code?
- What does enterprise get?

### Section 11 — Final CTA
- browser try-now
- install CLI
- CI quickstart
- enterprise contact

## Homepage copy principles
- Every section should answer a user question, not just state a feature
- Use fewer nouns per sentence
- Prefer outcomes over architecture until below the fold
- Repeat key CTAs at least 3 times
- Keep browser path and CLI path visually distinct

---

# Part VI — README Rewrite Plan

## Goal
Make README a frictionless conversion surface for GitHub visitors.

## Proposed README structure
1. Headline + one-line thesis
2. 20-second explanation
3. Quickstart: browser + CLI + CI
4. Why AMC exists
5. What you get after quickscore
6. Works with your stack
7. Product family overview using the canonical names:
   - Score
   - Shield
   - Enforce
   - Vault
   - Watch
   - Fleet
   - Passport
   - Comply
8. Pricing / editions preview
9. Sponsor / support preview
10. Proof strip
11. Example commands
12. Docs hub links
13. Community/contributing

## README principles
- do not start with architecture
- do not dump the entire command surface above the fold
- first screen must answer:
  - what is this?
  - why should I care?
  - what do I do now?

---

# Part VII — Repo Rewrite Plan

## Goal
Make the repository feel as productized and navigable as ECC without losing AMC depth.

## Repo root principles
- public-first
- obvious core surfaces
- fewer internal ops artifacts visible at root
- stronger semantic grouping

## Proposed root structure direction
Keep obvious product/public files at root:
- README.md
- LICENSE
- CONTRIBUTING.md
- CHANGELOG.md
- package.json
- docs/
- website/
- src/
- examples/
- docker/
- amc-action/

Move or reduce visibility of internal/ops-heavy materials where possible:
- internal strategy docs
- operating artifacts
- transient/generated directories
- duplicate or stale top-level planning files

## Repo cleanup tasks
- create inventory of root files
- classify each file
- archive or relocate nonessential public-root files
- ensure examples and docs are easy to discover
- add `docs/START_HERE.md`
- add `docs/USE_CASES.md`

## Examples structure plan
- `examples/browser-first/`
- `examples/cli-quickscore/`
- `examples/ci-gate/`
- `examples/compliance-binder/`
- `examples/frameworks/`

## Docs landing structure plan
- `docs/START_HERE.md`
- `docs/USE_CASES.md`
- `docs/PERSONAS.md`
- `docs/INSTALL.md`
- `docs/WHY_AMC.md`
- `docs/AFTER_QUICKSCORE.md`

---

# Part VII-A — Canonical AMC Product Naming Rules

## Naming directive
The following product/module names are canonical and should be retained consistently across:
- homepage
- README
- documentation hubs
- pricing page
- edition matrix
- release notes
- product comparison pages
- future marketing materials

Canonical names:
- Score
- Shield
- Enforce
- Vault
- Watch
- Fleet
- Passport
- Comply

## Rule set
- Do not replace these names with generic substitutes in public-facing materials.
- It is acceptable to add short explanatory subtitles, but not to rename the products.
- Generic grouping language may be used as a secondary explanatory layer only if the canonical names remain primary.
- The homepage should teach the relationship between these modules without flattening them into vague platform jargon.

## Implementation guidance
- On homepage cards: use canonical name + one-line subtitle.
- In README: use a short product family table with canonical names.
- In pricing: show which canonical products are included by tier.
- In docs: each canonical product should have a stable anchor/landing page.
- In community and sponsor materials: use the canonical names to build repetition and memory in the market.

## Why this matters
ECC wins partly because its ecosystem is memorable and easy to repeat. AMC should not throw away its strongest product names in an attempt to simplify. The right move is:
- keep the names
- explain the names faster
- repeat the names consistently

# Part VIII — Sequencing Plan

## Phase 1 — Reposition and convert (P0)
1. Rewrite homepage hero + first 5 sections
2. Rewrite README
3. Add choose-your-path install page
4. Present product family with canonical names:
   - Score
   - Shield
   - Enforce
   - Vault
   - Watch
   - Fleet
   - Passport
   - Comply
5. Draft pricing/edition architecture and place a preview on homepage + README
6. Curate repo root
7. Add docs start hub

## Phase 2 — Social proof and buyer readiness (P1)
8. Add social proof blocks
9. Publish full pricing/edition framework
10. Add sponsorship/support framework and `SPONSORING.md`
11. Add persona quickstarts
12. Add showcase/release highlights
13. Add compatibility strip and stack pages
14. Add recipe hub
15. Add deployment comparison (browser / CLI / CI / self-hosted / hosted / enterprise)

## Phase 3 — Strategic leverage (P2)
16. Add benchmark gallery
17. Add comparison pages
18. Expand public case-study and enterprise materials
19. Add sponsor tier matrix and public supporter wall
20. Add hosted vs enterprise buyer-journey materials

---

# Part IX — Immediate Build Checklist

## Immediate P0 checklist
- [ ] Rewrite homepage hero/subhero/CTA architecture
- [ ] Add trust-gap comparison section
- [ ] Add choose-your-path install section
- [ ] Add product-family cards using the exact canonical names:
  - [ ] Score
  - [ ] Shield
  - [ ] Enforce
  - [ ] Vault
  - [ ] Watch
  - [ ] Fleet
  - [ ] Passport
  - [ ] Comply
- [ ] Add compatibility strip
- [ ] Rewrite README intro + quickstart
- [ ] Add README product-family overview using the exact canonical names
- [ ] Add homepage pricing/editions preview
- [ ] Add README pricing/editions preview
- [ ] Draft explicit pricing tiers
- [ ] Draft edition matrix mapping products to tiers
- [ ] Create docs/START_HERE.md
- [ ] Create docs/AFTER_QUICKSCORE.md
- [ ] Audit root files for cleanup
- [ ] Create edition matrix draft

## Immediate P1 checklist
- [ ] Add social proof/testimonial placeholders
- [ ] Add full pricing page draft
- [ ] Add hosted vs self-hosted vs enterprise comparison page
- [ ] Add sponsorship/support framework
- [ ] Create `SPONSORING.md`
- [ ] Add sponsor/support section to homepage
- [ ] Add sponsor/support section to README
- [ ] Define sponsor tiers
- [ ] Add persona quickstarts
- [ ] Add release highlights section
- [ ] Add examples/recipes hub
- [ ] Add showcase/community page

## Immediate P2 checklist
- [ ] Add comparison pages
- [ ] Add benchmark gallery
- [ ] Add public supporter wall / sponsor acknowledgements section
- [ ] Add enterprise support/packaging page
- [ ] Add buyer-journey pages for startup / team / enterprise / regulated orgs

---

# Part X — Success Criteria

## 30-day success markers
- Homepage clearly routes users into browser, CLI, and CI paths
- README becomes easier to skim and act on
- Repo root becomes visibly cleaner
- Persona quickstarts exist
- Product family is grouped and legible

## 60-day success markers
- Pricing/edition story exists
- Showcase/proof/social sections exist
- Example/recipe hub exists
- Compatibility framing is stronger

## 90-day success markers
- AMC feels like both:
  - a category-defining trust platform
  - a productized adoption-ready ecosystem

---

# Final guidance

The goal is not to imitate ECC’s product surface one-for-one.
The goal is to combine:
- AMC’s stronger technical moat
- with ECC’s stronger packaging discipline

AMC should not become smaller.
AMC should become easier to enter, easier to trust quickly, and easier to buy into.

That is the win condition.
