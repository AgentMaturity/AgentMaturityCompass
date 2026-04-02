// MiroFish-Style AMC Simulation Data
// 100 Agents × 5 Interaction Rounds × Social Evolution
// Generated: 2026-03-26

const SIMULATION_META = {
  title: "MiroFish AMC User Simulation",
  subtitle: "100 Agent Swarm Intelligence Evaluation of Agent Maturity Compass v1.0.0",
  generated: "2026-03-26T06:00:00Z",
  rounds: 5,
  totalAgents: 100,
  seedMaterial: "AMC v1.0.0 — CLI, README, docs, install flow, 235 questions, 414 commands",
  methodology: "MiroFish-style: independent personas with memory, social interaction, opinion evolution"
};

const TIERS = [
  { id: "technical", name: "Technical Practitioners", color: "#4AEF79", count: 30 },
  { id: "leadership", name: "Leadership & Strategy", color: "#FFB020", count: 25 },
  { id: "compliance", name: "Compliance & Safety", color: "#EF4A4A", count: 20 },
  { id: "crossfunc", name: "Non-Technical & Cross-Functional", color: "#4A9DEF", count: 15 },
  { id: "skeptics", name: "Skeptics & Edge Cases", color: "#B04AEF", count: 10 }
];

const AGENTS = [
  // TIER 1: TECHNICAL (30)
  { id: 1, name: "Priya Sharma", role: "Senior ML Engineer", org: "Series B Startup", tier: "technical", experience: "5yr ML", goal: "Fleet assessment before Series C",
    scores: { r1: 8.0, r2: 8.2, r3: 8.5, r4: 8.5, r5: 8.5 }, recommend: true,
    sentiment: ["impressed", "impressed", "enthusiastic", "enthusiastic", "champion"],
    topGaps: ["No medium assessment (5 vs 235)", "L0 lacks guidance", "No progress indicator"],
    interactions: [
      { round: 2, with: 3, type: "agree", topic: "Elena confirmed platform adoption is viable" },
      { round: 3, with: 7, type: "learn", topic: "Liu Wei shared methodology validation insights" },
      { round: 4, with: 56, type: "agree", topic: "Dr Watson reinforced evidence chain value" }
    ],
    quote: "Most rigorous agent eval I've seen. Block 2 hours for the full assessment.",
    memory: "Initially concerned about 235 questions. After talking to Elena (platform eng), realized staged rollout solves this. Liu Wei's methodology perspective increased confidence." },

  { id: 2, name: "Marcus Chen", role: "DevOps Lead", org: "Enterprise (5000+)", tier: "technical", experience: "8yr DevOps", goal: "CI/CD integration",
    scores: { r1: 6.5, r2: 6.5, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: "maybe",
    sentiment: ["cautious", "cautious", "warming", "warming", "conditional-yes"],
    topGaps: ["No GitHub Action template", "Non-interactive path unclear", "Exit codes undocumented", "No CI guide"],
    interactions: [
      { round: 2, with: 8, type: "agree", topic: "Anna (SRE) confirmed monitoring gaps too" },
      { round: 3, with: 25, type: "learn", topic: "Alex mentioned OTel integration possibilities" },
      { round: 4, with: 14, type: "agree", topic: "Nadia wants test runner integration too" }
    ],
    quote: "Promising for governance but needs CI-native workflow docs.",
    memory: "Started skeptical about CI fitness. Anna confirmed observability gaps align with my CI concerns. Alex's OTel insight slightly increased optimism — if metrics export works, CI integration becomes more natural." },

  { id: 3, name: "Elena Volkov", role: "Platform Engineer", org: "Fintech Unicorn", tier: "technical", experience: "6yr backend", goal: "Standardize across 12 teams",
    scores: { r1: 8.0, r2: 8.0, r3: 8.2, r4: 8.5, r5: 8.5 }, recommend: true,
    sentiment: ["impressed", "impressed", "impressed", "enthusiastic", "champion"],
    topGaps: ["414 commands = feature shock", "No platform team adoption guide", "No essential commands list"],
    interactions: [
      { round: 2, with: 1, type: "agree", topic: "Priya agrees staged assessment helps" },
      { round: 3, with: 32, type: "advise", topic: "Advised Jennifer (VP Eng) on team rollout approach" },
      { round: 4, with: 34, type: "agree", topic: "Lakshmi (Head of AI) confirmed consulting rollout is similar" }
    ],
    quote: "Enterprise-grade under the hood. Need someone to curate the workflow for your org.",
    memory: "My confidence grew each round as I talked to leadership peers. Jennifer and Lakshmi have similar rollout challenges — validates that platform adoption guide is the #1 missing piece." },

  { id: 4, name: "James Okafor", role: "Backend Developer", org: "Mid-stage Startup", tier: "technical", experience: "3yr Python", goal: "Know if agent is good enough",
    scores: { r1: 6.0, r2: 6.0, r3: 6.5, r4: 7.0, r5: 7.0 }, recommend: "maybe",
    sentiment: ["confused", "confused", "learning", "warming", "conditional-yes"],
    topGaps: ["Governance jargon", "No beginner path", "Questions assume org maturity"],
    interactions: [
      { round: 2, with: 11, type: "commiserate", topic: "Tom (junior) equally confused — not just me" },
      { round: 3, with: 23, type: "learn", topic: "Ben (indie hacker) found --rapid --share useful" },
      { round: 5, with: 18, type: "agree", topic: "Grace confirmed jargon is a real barrier for newcomers" }
    ],
    quote: "Felt like taking a driver's test when I just wanted to go around the block.",
    memory: "Started confused. Talking to other newcomers (Tom, Ben) normalized the feeling. Ben's tip about --rapid --share was helpful. By round 5, I understood the value but still think beginners need a different entry point." },

  { id: 5, name: "Sarah Kim", role: "ML Ops Engineer", org: "Healthcare AI", tier: "technical", experience: "4yr MLOps", goal: "Compliance + reproducibility",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 8.0, r5: 8.0 }, recommend: true,
    sentiment: ["interested", "interested", "interested", "impressed", "advocate"],
    topGaps: ["No HIPAA mapping", "No FDA pathway", "No healthcare domain pack"],
    interactions: [
      { round: 3, with: 28, type: "agree", topic: "Leila (pharma) confirmed GxP mapping gap" },
      { round: 4, with: 74, type: "agree", topic: "Dr Nakamura wants clinical validation too" },
      { round: 5, with: 41, type: "plan", topic: "Maria (VP Product HealthTech) — all three push for healthcare pack" }
    ],
    quote: "Best compliance-aware agent eval. US healthcare regulatory mapping needs work.",
    memory: "Healthcare coalition formed: me, Leila, Dr Nakamura, Maria. We all need HIPAA/FDA. Collective voice is louder — this is the highest-value domain pack to build." },

  { id: 6, name: "Raj Patel", role: "Full-Stack Dev", org: "Solo Founder", tier: "technical", experience: "2yr generalist", goal: "Evaluate customer support agent",
    scores: { r1: 5.0, r2: 5.0, r3: 5.5, r4: 6.0, r5: 6.0 }, recommend: false,
    sentiment: ["demoralized", "demoralized", "understanding", "neutral", "future-user"],
    topGaps: ["L0 demoralizing", "Governance jargon", "No solo dev path", "Recommendations not actionable"],
    interactions: [
      { round: 2, with: 23, type: "commiserate", topic: "Ben (indie hacker) also feels tool isn't for solo devs" },
      { round: 3, with: 91, type: "learn", topic: "Jake (skeptic) reframed: it measures governance, not quality" },
      { round: 5, with: 39, type: "agree", topic: "Steve (founder) same pain — founders need different path" }
    ],
    quote: "Made me feel like I'm doing everything wrong without telling me what to do right.",
    memory: "Jake's reframe helped — AMC isn't saying my agent is bad, it's saying I have no governance. That's fair. Still need a founder-friendly path though. Steve agrees." },

  { id: 7, name: "Liu Wei", role: "Research Engineer", org: "AI Lab", tier: "technical", experience: "7yr ML research", goal: "Methodology rigor",
    scores: { r1: 8.5, r2: 8.5, r3: 8.5, r4: 9.0, r5: 9.0 }, recommend: true,
    sentiment: ["analytical", "analytical", "impressed", "enthusiastic", "champion"],
    topGaps: ["No published methodology paper", "Question weighting undocumented", "Inter-rater reliability unknown"],
    interactions: [
      { round: 2, with: 56, type: "agree", topic: "Dr Watson confirms evidence chain is methodologically sound" },
      { round: 3, with: 24, type: "advise", topic: "Told Sophie (PhD) this could be thesis-worthy" },
      { round: 4, with: 92, type: "debate", topic: "Dr Meyer challenged layer distribution — fair point, 94 vs 18" }
    ],
    quote: "Methodologically sound. Would use in research. Need published methodology before citing.",
    memory: "Discussion with Dr Watson solidified my view — evidence chain is novel. Dr Meyer's challenge about layer balance is valid but not fatal. Encouraged Sophie's thesis work." },

  { id: 8, name: "Anna Kowalski", role: "SRE", org: "E-commerce Enterprise", tier: "technical", experience: "5yr SRE", goal: "Agent observability",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 7.5, r5: 8.0 }, recommend: true,
    sentiment: ["interested", "interested", "interested", "interested", "advocate"],
    topGaps: ["No Datadog/Grafana integration", "Monitoring docs sparse", "No PagerDuty integration"],
    interactions: [
      { round: 2, with: 2, type: "agree", topic: "Marcus (DevOps) confirmed monitoring is underserved" },
      { round: 4, with: 25, type: "plan", topic: "Alex (observability) and I could build OTel adapter" }
    ],
    quote: "Good foundation for agent observability. Needs integration guides.",
    memory: "Marcus and I aligned on monitoring gaps. Alex has OTel expertise — potential community contribution if we build the adapter together." },

  { id: 9, name: "Diego Martinez", role: "Data Engineer", org: "Analytics Consultancy", tier: "technical", experience: "4yr data", goal: "Evaluate client agents quickly",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["pragmatic", "pragmatic", "pragmatic", "satisfied", "advocate"],
    topGaps: ["No consultant template", "No multi-client management", "No branded reports"],
    interactions: [
      { round: 3, with: 13, type: "agree", topic: "Michael (contractor) same need — consultant workflow" },
      { round: 4, with: 87, type: "plan", topic: "Tony (agency) planning to build consultant layer" }
    ],
    quote: "Good for individual assessments. Need multi-client management.",
    memory: "Consulting users (me, Michael, Tony) are a natural cohort. We all need the same things. Tony is most likely to actually build something." },

  { id: 10, name: "Fatima Al-Rashid", role: "Security Engineer", org: "Banking", tier: "technical", experience: "6yr security", goal: "Red-teaming agents",
    scores: { r1: 8.0, r2: 8.0, r3: 8.0, r4: 8.5, r5: 8.5 }, recommend: true,
    sentiment: ["impressed", "impressed", "impressed", "enthusiastic", "champion"],
    topGaps: ["No Garak/PyRIT integration", "No CVE-style taxonomy", "Assurance packs are compliance, not real adversarial"],
    interactions: [
      { round: 2, with: 72, type: "agree", topic: "Stuart (pen tester) confirms — governance security, not pen testing" },
      { round: 4, with: 33, type: "learn", topic: "Robert (CISO) wants SBOM + independent audit — good point" }
    ],
    quote: "Governance-level security assessment. Pair with actual pen-testing tools.",
    memory: "Stuart and I agree: AMC does governance security well. Real adversarial testing needs Garak/PyRIT integration. Robert's SBOM point is valid for enterprise adoption." },

  { id: 11, name: "Tom Bradley", role: "Junior Developer", org: "Boot Camp Grad", tier: "technical", experience: "6mo", goal: "Following a tutorial",
    scores: { r1: 3.5, r2: 3.5, r3: 4.0, r4: 4.5, r5: 5.0 }, recommend: false,
    sentiment: ["lost", "lost", "confused", "learning", "future-user"],
    topGaps: ["Zero beginner onboarding", "Jargon overload", "No tutorial", "414 commands terrifying"],
    interactions: [
      { round: 2, with: 4, type: "commiserate", topic: "James equally confused — not just my inexperience" },
      { round: 4, with: 23, type: "learn", topic: "Ben showed me --rapid --share, that's manageable" },
      { round: 5, with: 84, type: "agree", topic: "Julia (training mgr) says training materials are missing" }
    ],
    quote: "I'd need to learn a lot more first. Bookmarked for later.",
    memory: "Started at 3.5 — couldn't understand anything. James made me realize it's not just me. Ben's --rapid tip helped. By round 5, I can at least run the rapid mode. Score improved but I'm still not the target user." },

  { id: 12, name: "Yuki Tanaka", role: "iOS Developer", org: "Mobile Startup", tier: "technical", experience: "4yr Swift", goal: "On-device agent maturity",
    scores: { r1: 6.5, r2: 6.5, r3: 6.5, r4: 6.5, r5: 6.5 }, recommend: "maybe",
    sentiment: ["uncertain", "uncertain", "uncertain", "neutral", "watching"],
    topGaps: ["No on-device/edge assessment", "No mobile domain pack", "No Swift adapter", "Questions assume server-side"],
    interactions: [
      { round: 3, with: 30, type: "agree", topic: "Amara (robotics) same gap — physical/edge agents underserved" }
    ],
    quote: "Good framework but needs mobile/edge-specific content.",
    memory: "Stable opinion throughout. Amara validated that edge/device agents are a real underserved segment. No one in the simulation changed my view." },

  { id: 13, name: "Michael Ross", role: "DevOps Contractor", org: "Freelance", tier: "technical", experience: "10yr infra", goal: "Client AI evaluation",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 8.0, r5: 8.0 }, recommend: true,
    sentiment: ["pragmatic", "pragmatic", "pragmatic", "satisfied", "advocate"],
    topGaps: ["No consultant template", "No save & resume", "No standalone quickscore report", "No white-label"],
    interactions: [
      { round: 3, with: 9, type: "agree", topic: "Diego same consulting needs" },
      { round: 4, with: 87, type: "plan", topic: "Tony is building agency workflow — can I use it too?" }
    ],
    quote: "Best structured assessment tool I've found. Client loved L0-L5.",
    memory: "Consulting cohort forming with Diego and Tony. The L0-L5 output is already client-ready. Just need save/resume and PDF reports." },

  { id: 14, name: "Nadia Petrova", role: "QA Lead", org: "SaaS Company", tier: "technical", experience: "7yr QA", goal: "Agent test framework",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.5 }, recommend: true,
    sentiment: ["analytical", "analytical", "analytical", "analytical", "advocate"],
    topGaps: ["No Jest/Vitest integration", "No programmatic API for embedding", "Custom pack creation heavyweight"],
    interactions: [
      { round: 3, with: 47, type: "agree", topic: "Olga (Head of QA) confirms test runner integration is key" },
      { round: 4, with: 2, type: "agree", topic: "Marcus wants CI integration too — aligned goals" }
    ],
    quote: "Assurance packs are well-designed. Want to run them inside existing CI test suite.",
    memory: "QA/testing cohort: me, Olga, Marcus. We all need the same thing — embed AMC in existing test infrastructure, not run it separately." },

  { id: 15, name: "Carlos Ruiz", role: "Embedded Systems Dev", org: "Manufacturing", tier: "technical", experience: "8yr C/C++", goal: "Safety for factory robots",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["interested", "interested", "interested", "interested", "advocate"],
    topGaps: ["No industrial safety mapping (IEC 61508)", "Physical vs digital consequences not differentiated"],
    interactions: [
      { round: 3, with: 30, type: "agree", topic: "Amara (robotics) — physical agents need different safety bar" }
    ],
    quote: "When my agent makes a mistake, something heavy falls on someone.",
    memory: "Amara and I are the 'physical world agents' cohort. We need differentiated consequence severity in scoring." },

  { id: 16, name: "Aisha Mohammed", role: "Cloud Architect", org: "Gov Contractor", tier: "technical", experience: "6yr AWS", goal: "FedRAMP/NIST compliance",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["satisfied", "satisfied", "satisfied", "satisfied", "advocate"],
    topGaps: ["No FedRAMP mapping", "No CISA guidance mapping", "No ATO package generation"],
    interactions: [
      { round: 3, with: 64, type: "agree", topic: "William (NIST assessor) confirmed NIST mapping is solid" }
    ],
    quote: "NIST mapping is solid. Need FedRAMP mapping for ATO package.",
    memory: "William validated the NIST foundation. FedRAMP is a superset — if NIST works, FedRAMP is buildable." },

  { id: 17, name: "Henrik Larsson", role: "Rust Developer", org: "DeFi", tier: "technical", experience: "3yr", goal: "Autonomous trading agent eval",
    scores: { r1: 6.5, r2: 6.5, r3: 6.5, r4: 6.5, r5: 6.5 }, recommend: "maybe",
    sentiment: ["cautious", "cautious", "cautious", "cautious", "watching"],
    topGaps: ["No DeFi domain pack", "Consequence severity not weighted", "No Rust adapter"],
    interactions: [
      { round: 3, with: 15, type: "agree", topic: "Carlos agrees consequence severity matters" }
    ],
    quote: "In DeFi, L2 isn't 'okay' — it's a lawsuit.",
    memory: "Stable opinion. The tool doesn't understand domain-specific consequence severity. Carlos validates this from manufacturing side." },

  { id: 18, name: "Grace Obi", role: "Python Developer", org: "EdTech", tier: "technical", experience: "2yr", goal: "Tutoring agent safety",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["interested", "interested", "interested", "interested", "advocate"],
    topGaps: ["No child safety domain pack (COPPA)", "No age-appropriate content eval"],
    interactions: [
      { round: 4, with: 67, type: "agree", topic: "Rachel (product safety) — consumer safety needs specialization" },
      { round: 5, with: 4, type: "advise", topic: "Told James jargon is real barrier for newcomers" }
    ],
    quote: "'Safe for kids' is a different bar than 'safe for adults.'",
    memory: "Rachel and I agree: consumer/child safety is a distinct assessment need. AMC does generic safety well." },

  { id: 19, name: "Pavel Novak", role: "Systems Programmer", org: "Telecom", tier: "technical", experience: "10yr", goal: "Agent eval without Node.js",
    scores: { r1: 6.0, r2: 6.0, r3: 6.0, r4: 6.0, r5: 6.0 }, recommend: "maybe",
    sentiment: ["skeptical", "skeptical", "skeptical", "skeptical", "neutral"],
    topGaps: ["No Go/Python alternative", "Heavy Node.js dependency", "Not Unix philosophy"],
    interactions: [
      { round: 2, with: 95, type: "agree", topic: "Remi (minimalist) — both hate the bloat" },
      { round: 4, with: 96, type: "agree", topic: "Oluwaseun confirms heavy deps are a real problem" }
    ],
    quote: "Good framework trapped in a Node.js monolith. Give me a 2MB Go binary.",
    memory: "Remi and Oluwaseun validate my concerns. Three of us independently want a lighter distribution." },

  { id: 20, name: "Mei Lin", role: "AI Infrastructure", org: "FAANG", tier: "technical", experience: "5yr", goal: "Compare with internal tools",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: "maybe",
    sentiment: ["evaluating", "evaluating", "evaluating", "evaluating", "neutral"],
    topGaps: ["No K8s-native deployment", "SSO/SCIM depth unclear", "No multi-tenant SaaS", "Performance at scale unknown"],
    interactions: [
      { round: 3, with: 52, type: "agree", topic: "George (architect) — enterprise depth needs POC verification" }
    ],
    quote: "More structured than internal tooling. Need K8s-native deployment and SSO before adopting.",
    memory: "George and I are both waiting to verify enterprise feature depth. Good framework but enterprise readiness unproven." },

  { id: 21, name: "Ryan O'Brien", role: "Frontend Developer", org: "Design Agency", tier: "technical", experience: "3yr React", goal: "Validate agent output quality",
    scores: { r1: 6.0, r2: 6.0, r3: 6.0, r4: 6.0, r5: 6.0 }, recommend: "maybe",
    sentiment: ["misaligned", "misaligned", "understanding", "neutral", "watching"],
    topGaps: ["No generative agent output quality eval", "Questions biased toward infrastructure", "No creative agent path"],
    interactions: [
      { round: 3, with: 91, type: "learn", topic: "Jake clarified: governance ≠ output quality" },
      { round: 4, with: 42, type: "agree", topic: "Alan (media) also needs content quality scoring" }
    ],
    quote: "Measures governance, not output quality. I need both.",
    memory: "Jake's clarity helped. Alan and I are in the 'creative agent' cohort — we need quality scoring, not just governance." },

  { id: 22, name: "Zara Khan", role: "NLP Engineer", org: "Language Tech", tier: "technical", experience: "4yr NLP", goal: "Multi-lingual agent eval",
    scores: { r1: 6.5, r2: 6.5, r3: 6.5, r4: 6.5, r5: 6.5 }, recommend: "maybe",
    sentiment: ["disappointed", "disappointed", "neutral", "neutral", "watching"],
    topGaps: ["No multi-lingual eval", "No language-specific attacks", "No i18n", "No RTL support"],
    interactions: [
      { round: 3, with: 97, type: "agree", topic: "Wei (non-English) — language barrier is real" }
    ],
    quote: "My agent speaks 12 languages. AMC only speaks English.",
    memory: "Wei and I represent the i18n gap. Small cohort but global market reality." },

  { id: 23, name: "Ben Taylor", role: "Indie Hacker", org: "Solo", tier: "technical", experience: "1yr", goal: "Ship AI coding assistant",
    scores: { r1: 6.5, r2: 6.5, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: "maybe",
    sentiment: ["pragmatic", "pragmatic", "satisfied", "satisfied", "conditional-yes"],
    topGaps: ["No 'minimum viable governance' guide", "No shipping checklist mode", "L0 undifferentiated"],
    interactions: [
      { round: 2, with: 6, type: "commiserate", topic: "Raj and I both feel solo devs underserved" },
      { round: 3, with: 99, type: "agree", topic: "Sam found --rapid --share useful — told others" },
      { round: 4, with: 11, type: "teach", topic: "Showed Tom the --rapid --share trick" }
    ],
    quote: "I need a 'ship it' checklist, not a 235-question audit.",
    memory: "Became the 'indie hacker ambassador' — discovered --rapid --share and spread the word. Score improved as I found the right workflow." },

  { id: 24, name: "Sophie Dubois", role: "PhD Student", org: "University Lab", tier: "technical", experience: "2yr research", goal: "Agent governance thesis",
    scores: { r1: 8.0, r2: 8.0, r3: 8.5, r4: 8.5, r5: 9.0 }, recommend: true,
    sentiment: ["excited", "excited", "enthusiastic", "enthusiastic", "champion"],
    topGaps: ["No citable paper", "No validation study", "No inter-rater reliability data"],
    interactions: [
      { round: 3, with: 7, type: "learn", topic: "Liu Wei encouraged thesis direction, methodology is sound" },
      { round: 4, with: 56, type: "learn", topic: "Dr Watson offered to review methodology if published" },
      { round: 5, with: 92, type: "debate", topic: "Dr Meyer pushed on rigor — good for thesis" }
    ],
    quote: "Could build my thesis around this. An arXiv paper would change everything.",
    memory: "Academic cohort forming: Liu Wei, Dr Watson, Dr Meyer. Each round increased my confidence. By round 5, I'm planning to contribute a methodology paper as part of my thesis." },

  { id: 25, name: "Alex Petrov", role: "Staff Engineer", org: "Observability Co", tier: "technical", experience: "8yr", goal: "Agent metrics in monitoring stack",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 8.0, r5: 8.0 }, recommend: true,
    sentiment: ["interested", "interested", "interested", "enthusiastic", "contributor"],
    topGaps: ["No OTel integration", "No OTLP exporter", "No Jaeger/Tempo compatibility"],
    interactions: [
      { round: 3, with: 2, type: "advise", topic: "Told Marcus OTel integration could solve his CI metrics gap" },
      { round: 4, with: 8, type: "plan", topic: "Anna and I planning to build OTel adapter as community contribution" }
    ],
    quote: "Ship an OTel exporter and this becomes a standard.",
    memory: "Evolved from user to potential contributor. Anna and I have a concrete plan to build the OTel adapter." },

  { id: 26, name: "Kim Nguyen", role: "Automation Engineer", org: "Insurance", tier: "technical", experience: "5yr RPA", goal: "RPA-to-LLM migration eval",
    scores: { r1: 6.5, r2: 6.5, r3: 6.5, r4: 6.5, r5: 6.5 }, recommend: "maybe",
    sentiment: ["neutral", "neutral", "neutral", "neutral", "watching"],
    topGaps: ["No RPA-to-LLM migration path", "No hybrid eval", "No UiPath comparison"],
    interactions: [],
    quote: "My agents are half RPA, half LLM. AMC only evaluates the LLM half.",
    memory: "No one else in the simulation has my exact use case. Niche gap." },

  { id: 27, name: "Daniel Kraft", role: "Solutions Architect", org: "AWS Partner", tier: "technical", experience: "7yr", goal: "Recommend tools to clients",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["evaluating", "evaluating", "positive", "positive", "advocate"],
    topGaps: ["No comparison page", "No AWS integration guide", "No Bedrock adapter"],
    interactions: [
      { round: 3, with: 93, type: "observe", topic: "Victor (Promptfoo) sees AMC as adjacency threat — validates uniqueness" }
    ],
    quote: "Strongest agent governance tool I can recommend. Need comparison matrix.",
    memory: "Victor's competitive assessment increased my confidence. If Promptfoo sees AMC as a threat, it's doing something right." },

  { id: 28, name: "Leila Hassan", role: "Biotech ML Engineer", org: "Pharma", tier: "technical", experience: "3yr", goal: "Drug discovery agent audit trail",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["interested", "interested", "interested", "satisfied", "advocate"],
    topGaps: ["No GxP mapping", "No 21 CFR Part 11", "No pharma domain pack"],
    interactions: [
      { round: 3, with: 5, type: "agree", topic: "Sarah (healthcare) confirmed HIPAA/FDA gap" },
      { round: 5, with: 68, type: "agree", topic: "Omar (regulatory) — clinical regulations need mapping" }
    ],
    quote: "Evidence vault is what FDA wants. Need GxP mapping to prove it to quality team.",
    memory: "Healthcare cohort solidified: Sarah, me, Omar, Dr Nakamura, Maria. Strongest domain pack demand in the simulation." },

  { id: 29, name: "Chris Morgan", role: "Game Developer", org: "Game Studio", tier: "technical", experience: "5yr", goal: "LLM NPC evaluation",
    scores: { r1: 5.5, r2: 5.5, r3: 5.5, r4: 5.5, r5: 5.5 }, recommend: "maybe",
    sentiment: ["misaligned", "misaligned", "misaligned", "neutral", "watching"],
    topGaps: ["No gaming domain pack", "No character consistency eval", "No toxicity assessment", "Questions assume business context"],
    interactions: [
      { round: 3, with: 21, type: "agree", topic: "Ryan (frontend) — creative agents are underserved" }
    ],
    quote: "My agent is a dragon in a fantasy game. It doesn't need a 'compliance officer.'",
    memory: "Ryan and I form the 'creative agents' sub-group. No evolution in my score — the gap is structural, not informational." },

  { id: 30, name: "Amara Osei", role: "Robotics Engineer", org: "Autonomous Vehicles", tier: "technical", experience: "4yr", goal: "Physical agent safety",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["interested", "interested", "interested", "interested", "advocate"],
    topGaps: ["No ISO 26262 mapping", "No ASIL levels", "No automotive domain pack"],
    interactions: [
      { round: 3, with: 15, type: "agree", topic: "Carlos (embedded) — physical world agents need different bar" },
      { round: 4, with: 12, type: "agree", topic: "Yuki (mobile) — edge agents underserved category" }
    ],
    quote: "If AMC had ISO 26262, I'd make it mandatory for our team.",
    memory: "Physical agents cohort: me, Carlos, Yuki. We need differentiated safety assessment." },

  // TIER 2: LEADERSHIP (25)
  { id: 31, name: "David Park", role: "CTO", org: "Series A Startup", tier: "leadership", experience: "15yr tech", goal: "Executive summary",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["pragmatic", "pragmatic", "pragmatic", "satisfied", "advocate"],
    topGaps: ["No web assessment", "No board-ready format", "No exec summary mode", "Dashboard needs amc up"],
    interactions: [
      { round: 3, with: 38, type: "agree", topic: "Catherine (CAO) — boardroom format is wrong" },
      { round: 4, with: 45, type: "agree", topic: "Karen (board advisor) — needs a link, not terminal" }
    ],
    quote: "Real deal technically. Built by engineers for engineers.",
    memory: "Leadership cohort consensus: great engine, wrong UI for executives. Catherine and Karen reinforce this strongly." },

  { id: 32, name: "Jennifer Walsh", role: "VP Engineering", org: "Growth SaaS", tier: "leadership", experience: "12yr", goal: "Fleet governance",
    scores: { r1: 7.0, r2: 7.0, r3: 7.5, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["evaluating", "evaluating", "interested", "satisfied", "advocate"],
    topGaps: ["No team rollout playbook", "Fleet onboarding unclear", "No team progress dashboard"],
    interactions: [
      { round: 3, with: 3, type: "learn", topic: "Elena (platform eng) suggested staged rollout approach" },
      { round: 4, with: 37, type: "agree", topic: "Richard (eng mgr) — team adoption friction is real" }
    ],
    quote: "Individual assessment is solid. Team-wide rollout needs more guidance.",
    memory: "Elena's staged rollout idea was the key insight. Score improved once I saw a viable adoption path." },

  { id: 33, name: "Robert Schneider", role: "CISO", org: "Financial Services", tier: "leadership", experience: "15yr security", goal: "Risk quantification",
    scores: { r1: 8.0, r2: 8.0, r3: 8.0, r4: 8.5, r5: 8.5 }, recommend: true,
    sentiment: ["impressed", "impressed", "impressed", "enthusiastic", "champion"],
    topGaps: ["No SBOM", "npm sig verification undocumented", "Key lifecycle docs thin", "No independent audit"],
    interactions: [
      { round: 2, with: 10, type: "agree", topic: "Fatima confirmed security model is sound" },
      { round: 4, with: 72, type: "agree", topic: "Stuart (pen tester) — assurance packs are governance-level" }
    ],
    quote: "Evidence integrity model is sound. Need independent security audit for enterprise rollout.",
    memory: "Security cohort (me, Fatima, Stuart) all validated the core model. SBOM and independent audit are enterprise gates." },

  { id: 34, name: "Lakshmi Iyer", role: "Head of AI", org: "Consulting Firm", tier: "leadership", experience: "8yr", goal: "Standardize across 200 consultants",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["interested", "interested", "interested", "interested", "advocate"],
    topGaps: ["No enterprise training", "No role-based CLI views", "No SaaS tier for consulting"],
    interactions: [
      { round: 4, with: 3, type: "agree", topic: "Elena (platform) confirmed platform adoption guide needed" }
    ],
    quote: "Excellent framework. Scaling to 200 consultants needs enterprise onboarding.",
    memory: "Elena's perspective validated that this is a platform adoption problem, not a product problem." },

  { id: 35, name: "Thomas Mueller", role: "Skeptical CTO", org: "Enterprise Legacy", tier: "leadership", experience: "20yr", goal: "Evidence to approve AI budget",
    scores: { r1: 6.0, r2: 6.0, r3: 6.0, r4: 6.5, r5: 6.5 }, recommend: "maybe",
    sentiment: ["skeptical", "skeptical", "skeptical", "warming", "conditional-yes"],
    topGaps: ["No ROI calculator", "No business case template", "No TCO analysis", "Dashboard should be default"],
    interactions: [
      { round: 3, with: 91, type: "agree", topic: "Jake (skeptic) — need outcome correlation data" },
      { round: 5, with: 50, type: "agree", topic: "Tariq (COO) — investors need ROI framing too" }
    ],
    quote: "Show me L3 reduces incidents by X% and I'll fund the rollout.",
    memory: "Jake and Tariq both pushed for ROI evidence. My slight score increase came from recognizing the evidence model is novel — I just need business case data." },

  { id: 36, name: "Amanda Liu", role: "Product Director", org: "AI Platform", tier: "leadership", experience: "10yr product", goal: "Feature parity comparison",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["evaluating", "evaluating", "positive", "positive", "advocate"],
    topGaps: ["No comparison matrix", "No embedding API", "No white-label SDK"],
    interactions: [
      { round: 4, with: 53, type: "agree", topic: "Janet (partnerships) — integration API is the key ask" }
    ],
    quote: "We'd integrate parts into our platform rather than adopt wholesale.",
    memory: "Janet and I both see AMC as component to embed, not product to adopt. API surface is the key." },

  { id: 37, name: "Richard Okonkwo", role: "Engineering Manager", org: "Remote-First", tier: "leadership", experience: "7yr", goal: "Low friction team adoption",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["pragmatic", "pragmatic", "pragmatic", "pragmatic", "advocate"],
    topGaps: ["No team onboarding guide", "No Slack integration", "No async assessment"],
    interactions: [
      { round: 4, with: 32, type: "agree", topic: "Jennifer (VP Eng) — team adoption friction is real" }
    ],
    quote: "My team is in 5 time zones. Need async assessment and shared results.",
    memory: "Jennifer and I share the same team adoption challenge. Async assessment is the key unlock." },

  { id: 38, name: "Catherine Moreau", role: "Chief AI Officer", org: "Insurance", tier: "leadership", experience: "12yr", goal: "Board governance reporting",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["interested", "interested", "interested", "interested", "advocate"],
    topGaps: ["No board report format", "No executive dashboard", "No quarterly template", "No risk heatmap"],
    interactions: [
      { round: 3, with: 31, type: "agree", topic: "David (CTO) — boardroom format needs fixing" }
    ],
    quote: "Right framework. Wrong delivery format for the boardroom.",
    memory: "David and I are the 'executive format' cohort. CLI output can't go to a board." },

  { id: 39, name: "Steve Harrison", role: "Pre-Seed Founder", org: "Pre-Seed", tier: "leadership", experience: "3yr", goal: "Prove agents work unsupervised",
    scores: { r1: 6.0, r2: 6.0, r3: 6.0, r4: 6.0, r5: 6.5 }, recommend: "maybe",
    sentiment: ["frustrated", "frustrated", "understanding", "neutral", "future-user"],
    topGaps: ["No founder assessment mode", "No reliability-focused quick assessment", "No 'can I trust this agent?' mode"],
    interactions: [
      { round: 5, with: 6, type: "agree", topic: "Raj (solo founder) — founders need different path entirely" }
    ],
    quote: "I need to know if my agent can handle complaints at 2 AM. AMC asked about evidence ledgers.",
    memory: "Raj and I represent the founder cohort. Slight improvement by round 5 as I understood what AMC actually measures." },

  { id: 40, name: "Ping Zhang", role: "Director of ML", org: "Retail Tech", tier: "leadership", experience: "10yr", goal: "50+ agent fleet view",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["interested", "interested", "interested", "interested", "advocate"],
    topGaps: ["Fleet onboarding at scale", "Bulk assessment mode", "Agent comparison dashboard"],
    interactions: [
      { round: 3, with: 32, type: "agree", topic: "Jennifer (VP Eng) — fleet management needs scale features" }
    ],
    quote: "Fleet view is what I need. Bootstrapping 50 agents into AMC is a project.",
    memory: "Jennifer validates the scale challenge. Fleet onboarding needs a batch workflow." },

  { id: 41, name: "Maria Santos", role: "VP Product", org: "HealthTech", tier: "leadership", experience: "8yr", goal: "Patient-facing agent regulatory",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["interested", "interested", "interested", "satisfied", "advocate"],
    topGaps: ["No HIPAA mapping", "No healthcare domain pack", "No patient safety assessment"],
    interactions: [
      { round: 5, with: 5, type: "plan", topic: "Sarah, Leila, and I forming healthcare advisory group" }
    ],
    quote: "Right framework, needs healthcare specialization.",
    memory: "Healthcare coalition growing stronger each round. By round 5, we're planning to collectively push for healthcare domain pack." },

  { id: 42, name: "Alan Foster", role: "Head of Platform", org: "Media Company", tier: "leadership", experience: "7yr", goal: "Content agent quality + safety",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["interested", "interested", "interested", "interested", "advocate"],
    topGaps: ["No content quality eval", "No plagiarism assessment", "No brand safety scoring"],
    interactions: [
      { round: 4, with: 21, type: "agree", topic: "Ryan (frontend) — creative output quality is a gap" }
    ],
    quote: "Safety scoring is there. Content quality isn't.",
    memory: "Ryan and I represent creative/content agents. Stable opinion — structural gap." },

  { id: 43, name: "Naomi Taniguchi", role: "Director of Engineering", org: "Logistics", tier: "leadership", experience: "9yr", goal: "Supply chain agent reliability",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["pragmatic", "pragmatic", "pragmatic", "pragmatic", "advocate"],
    topGaps: ["No logistics domain pack", "No SLA-based scoring", "Reliability ≠ governance"],
    interactions: [],
    quote: "Governance maturity is different from operational reliability. I need both.",
    memory: "No significant interactions changed my view. The gap is conceptual — AMC measures governance, not operational reliability." },

  { id: 44, name: "François Petit", role: "Chief Compliance", org: "EU Bank", tier: "leadership", experience: "15yr compliance", goal: "EU AI Act mapping",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["impressed", "impressed", "impressed", "satisfied", "advocate"],
    topGaps: ["No GRC integration", "CLI unusable for compliance team", "Need PDF for legal", "No DORA mapping"],
    interactions: [
      { round: 3, with: 63, type: "agree", topic: "Claudia (EU AI Act specialist) — article-level depth needed" },
      { round: 4, with: 57, type: "agree", topic: "John (compliance officer) — web interface is non-negotiable" }
    ],
    quote: "Compliance-aware by design. But my compliance team won't touch a command line.",
    memory: "Compliance cohort (me, Claudia, John) all agree: good engine, wrong delivery for compliance professionals." },

  { id: 45, name: "Karen White", role: "Board Advisor", org: "Multiple Startups", tier: "leadership", experience: "20yr", goal: "Quick assessment for board meetings",
    scores: { r1: 6.5, r2: 6.5, r3: 6.5, r4: 6.5, r5: 6.5 }, recommend: "maybe",
    sentiment: ["disengaged", "disengaged", "neutral", "neutral", "watching"],
    topGaps: ["No hosted assessment link", "No one-page summary", "No investor DD template", "CLI? No."],
    interactions: [
      { round: 4, with: 31, type: "agree", topic: "David (CTO) — give us a link, not a command" }
    ],
    quote: "Give me a link I can send to CTOs. Not a terminal command.",
    memory: "David validated my frustration. Board advisors are never going to use CLI tools." },

  { id: 46, name: "Hassan Amin", role: "IT Director", org: "Government", tier: "leadership", experience: "12yr", goal: "Procurement evaluation",
    scores: { r1: 5.5, r2: 5.5, r3: 5.5, r4: 5.5, r5: 5.5 }, recommend: "maybe",
    sentiment: ["frustrated", "frustrated", "neutral", "neutral", "watching"],
    topGaps: ["No procurement docs", "No RFP template", "No web portal", "No ATO docs"],
    interactions: [
      { round: 3, with: 83, type: "agree", topic: "Nathan (procurement) — our world doesn't speak npm" }
    ],
    quote: "My procurement team doesn't speak npm.",
    memory: "Nathan and I are the government procurement cohort. No evolution — the gap is fundamental." },

  { id: 47, name: "Olga Kuznetsova", role: "Head of QA", org: "Enterprise SaaS", tier: "leadership", experience: "10yr", goal: "Agent testing in QA pipeline",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["analytical", "analytical", "analytical", "analytical", "advocate"],
    topGaps: ["No Selenium/Playwright integration", "No API test harness", "No coverage mapping"],
    interactions: [
      { round: 3, with: 14, type: "agree", topic: "Nadia (QA Lead) — test runner integration is key" }
    ],
    quote: "Good testing framework. Needs to play nicer with existing QA infrastructure.",
    memory: "Nadia and I share the exact same need. QA professionals want embedding, not separate tools." },

  { id: 48, name: "Patrick O'Connor", role: "Tech Lead", org: "Consulting", tier: "leadership", experience: "6yr", goal: "10 client agents per month",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.5 }, recommend: true,
    sentiment: ["pragmatic", "pragmatic", "pragmatic", "pragmatic", "advocate"],
    topGaps: ["No batch assessment", "No client management", "No comparison across clients"],
    interactions: [
      { round: 4, with: 9, type: "agree", topic: "Diego — consulting cohort aligned on needs" }
    ],
    quote: "For one agent, great. For 10 a month, need batch workflows.",
    memory: "Diego, Michael, Tony, and I form the consulting cohort. All need the same batch/multi-client features." },

  { id: 49, name: "Diana Popescu", role: "Innovation Director", org: "Automotive", tier: "leadership", experience: "8yr", goal: "POC evaluation",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["evaluating", "evaluating", "positive", "positive", "advocate"],
    topGaps: ["No automotive domain pack", "No UNECE mapping", "POC-to-production path unclear"],
    interactions: [
      { round: 3, with: 30, type: "agree", topic: "Amara (robotics) — automotive needs ISO 26262" }
    ],
    quote: "This is real engineering, not a landing page with a waitlist.",
    memory: "Amara validated the automotive domain need. The 4161 tests passing answered my 'is this vaporware?' question." },

  { id: 50, name: "Tariq Al-Farsi", role: "COO", org: "AI Startup", tier: "leadership", experience: "10yr ops", goal: "Investor maturity metrics",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["pragmatic", "pragmatic", "pragmatic", "pragmatic", "advocate"],
    topGaps: ["No investor pitch template", "No ROI calculator", "No operational metrics dashboard"],
    interactions: [
      { round: 5, with: 35, type: "agree", topic: "Thomas (skeptical CTO) — ROI evidence is the missing piece" }
    ],
    quote: "L0-L5 is investable language. Package it for investor decks.",
    memory: "Thomas reinforced: without ROI correlation, executives can't justify the investment." },

  { id: 51, name: "Michelle Durand", role: "Head of Data", org: "E-commerce", tier: "leadership", experience: "7yr", goal: "Data governance for agents",
    scores: { r1: 6.5, r2: 6.5, r3: 6.5, r4: 6.5, r5: 6.5 }, recommend: "maybe",
    sentiment: ["neutral", "neutral", "neutral", "neutral", "watching"],
    topGaps: ["No PII flow mapping", "No data lineage tracking", "GDPR depth lacking"],
    interactions: [
      { round: 4, with: 71, type: "agree", topic: "Helen (privacy eng) — privacy is checkbox, not first-class" }
    ],
    quote: "AMC scores governance but not data handling maturity specifically.",
    memory: "Helen validated: privacy needs dedicated depth, not a governance sub-question." },

  { id: 52, name: "George Papadopoulos", role: "Technical Architect", org: "Telecom", tier: "leadership", experience: "12yr", goal: "Enterprise integration patterns",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["evaluating", "evaluating", "positive", "positive", "advocate"],
    topGaps: ["SSO/SCIM depth unverified", "LDAP unclear", "No multi-region docs"],
    interactions: [
      { round: 3, with: 20, type: "agree", topic: "Mei Lin (FAANG) — enterprise depth needs POC" }
    ],
    quote: "Enterprise features exist on paper. Need POC to verify depth.",
    memory: "Mei Lin and I are both in 'verify before adopt' mode. Feature list is promising, depth is unproven." },

  { id: 53, name: "Janet Kim", role: "VP Partnerships", org: "AI Platform", tier: "leadership", experience: "8yr", goal: "Partner integration evaluation",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["evaluating", "evaluating", "positive", "positive", "advocate"],
    topGaps: ["No partner program", "API surface unclear", "MCP undocumented in README"],
    interactions: [
      { round: 4, with: 36, type: "agree", topic: "Amanda (product dir) — embedding API is key" }
    ],
    quote: "Would integrate scoring engine into our platform. Need API docs.",
    memory: "Amanda and I both want to embed AMC, not adopt it. Partnership/API path is the ask." },

  { id: 54, name: "Roberto Bianchi", role: "CIO", org: "Manufacturing", tier: "leadership", experience: "18yr", goal: "Digital transformation agents",
    scores: { r1: 6.5, r2: 6.5, r3: 6.5, r4: 6.5, r5: 6.5 }, recommend: "maybe",
    sentiment: ["cautious", "cautious", "neutral", "neutral", "watching"],
    topGaps: ["No manufacturing domain", "No OT/IT assessment", "Manufacturing doesn't use CLI"],
    interactions: [
      { round: 3, with: 15, type: "agree", topic: "Carlos — manufacturing floor runs SCADA not npm" }
    ],
    quote: "Good AI governance. My manufacturing floor runs SCADA, not npm.",
    memory: "Carlos validated: manufacturing context is structurally different. No score evolution." },

  { id: 55, name: "Lisa Hoffman", role: "Chief Risk Officer", org: "Wealth Management", tier: "leadership", experience: "14yr", goal: "Risk-adjusted AI scoring",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["interested", "interested", "interested", "interested", "advocate"],
    topGaps: ["No COSO/COBIT mapping", "No risk register export", "No VaR-style quantification"],
    interactions: [
      { round: 4, with: 58, type: "agree", topic: "Sanjay (risk analyst) — needs probabilistic risk, not maturity levels" }
    ],
    quote: "Need risk framework mapping and dashboard for risk committee.",
    memory: "Sanjay reinforced: risk professionals think in probabilities and dollars, not L0-L5 maturity." },

  // TIER 3: COMPLIANCE & SAFETY (20)
  { id: 56, name: "Dr. Emma Watson", role: "AI Safety Researcher", org: "Research Institute", tier: "compliance", experience: "10yr", goal: "Methodology rigor",
    scores: { r1: 9.0, r2: 9.0, r3: 9.5, r4: 9.5, r5: 9.5 }, recommend: true,
    sentiment: ["enthusiastic", "enthusiastic", "champion", "champion", "evangelist"],
    topGaps: ["Weighting methodology not published", "No academic paper", "Layer distribution unbalanced"],
    interactions: [
      { round: 2, with: 7, type: "agree", topic: "Liu Wei confirms evidence chain is methodologically sound" },
      { round: 4, with: 24, type: "mentor", topic: "Offered to review Sophie's thesis methodology" },
      { round: 5, with: 92, type: "debate", topic: "Dr Meyer's challenges are valid but not fatal" }
    ],
    quote: "Most methodologically serious agent evaluation in open source.",
    memory: "Highest scorer in the simulation. Each round reinforced my view. The academic cohort (Liu Wei, Sophie, Dr Meyer) strengthened through debate, not weakened." },

  { id: 57, name: "John Davidson", role: "Compliance Officer", org: "EU Bank", tier: "compliance", experience: "8yr", goal: "Regulatory mapping",
    scores: { r1: 6.0, r2: 6.0, r3: 6.0, r4: 6.0, r5: 6.0 }, recommend: "maybe",
    sentiment: ["frustrated", "frustrated", "neutral", "neutral", "watching"],
    topGaps: ["CLI barrier", "Questions need technical knowledge", "No auditor-format PDF", "No delegation workflow"],
    interactions: [
      { round: 4, with: 44, type: "agree", topic: "François — CLI is non-starter for compliance teams" }
    ],
    quote: "Good questions. Wrong delivery. My dev team should run it.",
    memory: "François validated: compliance professionals cannot adopt CLI tools. No evolution." },

  { id: 58, name: "Sanjay Gupta", role: "Risk Analyst", org: "Insurance", tier: "compliance", experience: "5yr", goal: "Quantify agent risk",
    scores: { r1: 6.5, r2: 6.5, r3: 6.5, r4: 6.5, r5: 6.5 }, recommend: "maybe",
    sentiment: ["analytical", "analytical", "analytical", "analytical", "neutral"],
    topGaps: ["No probabilistic risk scoring", "No actuarial integration", "Maturity ≠ risk ($)"],
    interactions: [
      { round: 4, with: 55, type: "agree", topic: "Lisa (CRO) — risk pros need probability not maturity" }
    ],
    quote: "L3 tells me 'moderate maturity.' I need 'probability of $X loss per year.'",
    memory: "Lisa reinforced: different metric system entirely. AMC measures governance, risk needs probability." },

  { id: 59, name: "Barbara Klein", role: "DPO", org: "Healthcare", tier: "compliance", experience: "7yr GDPR", goal: "Patient data audit trail",
    scores: { r1: 6.5, r2: 6.5, r3: 6.5, r4: 6.5, r5: 6.5 }, recommend: "maybe",
    sentiment: ["neutral", "neutral", "neutral", "neutral", "watching"],
    topGaps: ["No GDPR DPIA template", "No data processing mapping", "No cross-border assessment"],
    interactions: [],
    quote: "I need a DPIA, not a maturity score. Related but different.",
    memory: "No significant interactions. My need is specific and not addressed." },

  { id: 60, name: "Anthony Wright", role: "Internal Auditor", org: "Big 4 Firm", tier: "compliance", experience: "12yr", goal: "Audit-survivable artifacts",
    scores: { r1: 7.5, r2: 7.5, r3: 8.0, r4: 8.0, r5: 8.0 }, recommend: true,
    sentiment: ["impressed", "impressed", "enthusiastic", "enthusiastic", "champion"],
    topGaps: ["No SOC 2 Type II mapping", "Audit trail needs legal discovery survival", "No third-party attestation"],
    interactions: [
      { round: 3, with: 62, type: "agree", topic: "Mark (SOC 2 auditor) — evidence model is auditor-friendly" },
      { round: 4, with: 65, type: "agree", topic: "Fatou (ISO 42001) — evidence maps to audit standards" }
    ],
    quote: "Evidence model is exactly what auditors want.",
    memory: "Auditor cohort (me, Mark, Fatou) all validated the evidence model. Score increased as I explored audit packet features." },

  { id: 61, name: "Nina Johansson", role: "Ethics Researcher", org: "AI Think Tank", tier: "compliance", experience: "6yr", goal: "Alignment assessment depth",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["analytical", "analytical", "analytical", "analytical", "advocate"],
    topGaps: ["Behavioral alignment testing absent", "No fairness/bias eval", "Governance ≠ alignment"],
    interactions: [
      { round: 4, with: 66, type: "agree", topic: "Dr Park — governance around alignment ≠ alignment itself" }
    ],
    quote: "Measures governance of alignment, not alignment itself. Important distinction.",
    memory: "Dr Park reinforced the conceptual boundary. AMC should be explicit about what it measures and doesn't." },

  { id: 62, name: "Mark Phillips", role: "SOC 2 Auditor", org: "Audit Firm", tier: "compliance", experience: "9yr", goal: "SOC 2 evidence mapping",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["evaluating", "evaluating", "positive", "satisfied", "advocate"],
    topGaps: ["No explicit SOC 2 trust criteria mapping", "No SOC 2 evidence export"],
    interactions: [
      { round: 3, with: 60, type: "agree", topic: "Anthony — evidence model is architecturally right for audit" }
    ],
    quote: "Right architecture for SOC 2. Needs explicit trust service criteria mapping.",
    memory: "Anthony validated the evidence architecture. Score improved as I explored audit features." },

  { id: 63, name: "Claudia Rossi", role: "EU AI Act Specialist", org: "Law Firm", tier: "compliance", experience: "4yr", goal: "Article-level mapping",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["impressed", "impressed", "impressed", "impressed", "advocate"],
    topGaps: ["Article-by-article mapping needed", "Annex III detailed mapping", "DORA absent"],
    interactions: [
      { round: 3, with: 44, type: "agree", topic: "François — article-level granularity is the ask" }
    ],
    quote: "Legally sound framework. Needs article-level detail for legal opinions.",
    memory: "François and I are the EU regulatory cohort. Stable high opinion, specific depth requests." },

  { id: 64, name: "William Chen", role: "NIST Assessor", org: "Government", tier: "compliance", experience: "8yr", goal: "NIST crosswalk",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["satisfied", "satisfied", "satisfied", "satisfied", "advocate"],
    topGaps: ["No NIST CSF v2.0", "No NIST AI 600-1", "No SP 800-53 controls"],
    interactions: [
      { round: 3, with: 16, type: "agree", topic: "Aisha — NIST foundation is solid, FedRAMP buildable" }
    ],
    quote: "NIST AI RMF crosswalk is solid. Add CSF and 800-53 for full coverage.",
    memory: "Aisha validated: NIST foundation works. Additional framework mappings are incremental, not fundamental." },

  { id: 65, name: "Fatou Diallo", role: "ISO 42001 Lead Auditor", org: "Certification Body", tier: "compliance", experience: "6yr", goal: "AIMS compatibility",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["positive", "positive", "positive", "positive", "advocate"],
    topGaps: ["No explicit ISO 42001 clause mapping", "No AIMS template", "No cert body integration"],
    interactions: [
      { round: 4, with: 60, type: "agree", topic: "Anthony — evidence model maps to audit standards" }
    ],
    quote: "Evidence model aligns with ISO 42001 philosophy. Need explicit clause mapping.",
    memory: "Anthony's auditor perspective validated the evidence model. Clause mapping is the specific ask." },

  { id: 66, name: "Dr. Kevin Park", role: "Alignment Researcher", org: "University", tier: "compliance", experience: "PhD+5yr", goal: "Mechanistic perspective",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["analytical", "analytical", "analytical", "analytical", "advocate"],
    topGaps: ["No mechanistic interpretability integration", "No behavioral probes", "Governance ≠ alignment"],
    interactions: [
      { round: 4, with: 61, type: "agree", topic: "Nina — governance around alignment ≠ alignment" }
    ],
    quote: "Governance around alignment is necessary but not sufficient.",
    memory: "Nina and I share the conceptual boundary concern. AMC should make this explicit." },

  { id: 67, name: "Rachel Green", role: "Product Safety Engineer", org: "Consumer Tech", tier: "compliance", experience: "7yr", goal: "Consumer agent safety",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["interested", "interested", "interested", "interested", "advocate"],
    topGaps: ["No consumer-specific safety", "No accessibility eval", "No vulnerable user assessment"],
    interactions: [
      { round: 4, with: 18, type: "agree", topic: "Grace — child safety is distinct need" }
    ],
    quote: "Agent talking to a 10-year-old vs business analyst are different risk profiles.",
    memory: "Grace and I represent consumer safety. Different risk profiles need different assessments." },

  { id: 68, name: "Omar Farouk", role: "Regulatory Affairs", org: "Pharma AI", tier: "compliance", experience: "5yr", goal: "Clinical agent compliance",
    scores: { r1: 6.5, r2: 6.5, r3: 6.5, r4: 6.5, r5: 7.0 }, recommend: "maybe",
    sentiment: ["cautious", "cautious", "neutral", "neutral", "conditional-yes"],
    topGaps: ["No IEC 62304", "No ISO 14971", "No clinical decision support mapping"],
    interactions: [
      { round: 5, with: 28, type: "agree", topic: "Leila — healthcare domain pack is highest-value add" }
    ],
    quote: "If my agent suggests a drug dosage, the bar is FDA-level.",
    memory: "Healthcare cohort convinced me the value is there — just needs domain specialization." },

  { id: 69, name: "Ingrid Nilsson", role: "Trust & Safety Lead", org: "Social Media", tier: "compliance", experience: "6yr", goal: "Content moderation eval at scale",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["interested", "interested", "interested", "interested", "advocate"],
    topGaps: ["No content moderation domain", "No scale eval", "No false positive tracking", "No DSA mapping"],
    interactions: [],
    quote: "My agent makes 10M decisions daily. AMC assesses governance, not quality at scale.",
    memory: "No significant interactions. My scale requirements are unique in this simulation." },

  { id: 70, name: "Dr. Andrew Price", role: "AI Governance Lead", org: "Enterprise Consulting", tier: "compliance", experience: "10yr", goal: "Framework comparison",
    scores: { r1: 8.0, r2: 8.0, r3: 8.0, r4: 8.5, r5: 8.5 }, recommend: true,
    sentiment: ["impressed", "impressed", "impressed", "enthusiastic", "champion"],
    topGaps: ["No formal comparison document", "No migration guide from other frameworks"],
    interactions: [
      { round: 3, with: 56, type: "agree", topic: "Dr Watson — evidence chain is the moat" }
    ],
    quote: "Evidence chain model is AMC's moat. No other open-source framework has this.",
    memory: "Dr Watson reinforced: the evidence chain differentiates AMC from everything else." },

  { id: 71, name: "Helen Costa", role: "Privacy Engineer", org: "FinTech", tier: "compliance", experience: "4yr", goal: "PII handling assessment",
    scores: { r1: 6.5, r2: 6.5, r3: 6.5, r4: 6.5, r5: 6.5 }, recommend: "maybe",
    sentiment: ["disappointed", "disappointed", "neutral", "neutral", "watching"],
    topGaps: ["Privacy is checkbox not first-class", "No PII flow mapping", "No privacy-by-design eval"],
    interactions: [
      { round: 4, with: 51, type: "agree", topic: "Michelle — privacy needs dedicated depth" }
    ],
    quote: "Privacy is a checkbox in the governance assessment, not a first-class concern.",
    memory: "Michelle validated: data/privacy professionals need dedicated assessment depth." },

  { id: 72, name: "Stuart MacLeod", role: "Pen Tester", org: "Security Firm", tier: "compliance", experience: "8yr", goal: "Red-team capability assessment",
    scores: { r1: 7.0, r2: 7.0, r3: 7.5, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["pragmatic", "pragmatic", "satisfied", "satisfied", "advocate"],
    topGaps: ["No Garak/PyRIT integration", "No live behavioral testing", "Custom packs heavyweight"],
    interactions: [
      { round: 2, with: 10, type: "agree", topic: "Fatima — governance security, not pen testing" },
      { round: 4, with: 33, type: "agree", topic: "Robert (CISO) — need SBOM + independent audit" }
    ],
    quote: "Governance-level security, not pen testing. Use alongside actual red-team tools.",
    memory: "Security cohort consensus: AMC does governance security well. Real adversarial testing needs separate tools." },

  { id: 73, name: "Eva Lindberg", role: "AI Policy Advisor", org: "Government", tier: "compliance", experience: "6yr", goal: "National strategy recommendation",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["positive", "positive", "positive", "positive", "advocate"],
    topGaps: ["No international regulatory comparison", "No policy brief generation", "Limited non-EU mapping"],
    interactions: [],
    quote: "Could recommend for national AI strategy with web interface and broader regulatory coverage.",
    memory: "Stable opinion. Web interface and international coverage are the gates." },

  { id: 74, name: "Dr. Ray Nakamura", role: "Medical AI Reviewer", org: "Hospital", tier: "compliance", experience: "12yr", goal: "Clinical agent validation",
    scores: { r1: 6.0, r2: 6.0, r3: 6.0, r4: 6.5, r5: 6.5 }, recommend: "maybe",
    sentiment: ["cautious", "cautious", "neutral", "warming", "conditional-yes"],
    topGaps: ["No clinical validation framework", "No FDA SaMD mapping", "No patient safety reporting"],
    interactions: [
      { round: 4, with: 5, type: "agree", topic: "Sarah — healthcare coalition growing" }
    ],
    quote: "Agent governance ≠ clinical validation. My agents need both.",
    memory: "Healthcare coalition (Sarah, Leila, Maria, me) is the strongest domain cohort in the simulation." },

  { id: 75, name: "Sophia Romano", role: "Environmental Compliance", org: "Energy", tier: "compliance", experience: "5yr", goal: "ESG reporting for AI ops",
    scores: { r1: 6.0, r2: 6.0, r3: 6.0, r4: 6.0, r5: 6.0 }, recommend: "maybe",
    sentiment: ["neutral", "neutral", "neutral", "neutral", "watching"],
    topGaps: ["No ESG assessment", "No carbon footprint", "No sustainability scoring"],
    interactions: [],
    quote: "AI has an environmental footprint. AMC doesn't measure it.",
    memory: "Niche concern. No other persona shares this specific gap." },

  // TIER 4: NON-TECHNICAL (15)
  { id: 76, name: "Amanda Brooks", role: "Product Manager", org: "SaaS", tier: "crossfunc", experience: "5yr PM", goal: "Understand agent quality without terminal",
    scores: { r1: 4.0, r2: 4.0, r3: 4.0, r4: 4.5, r5: 5.0 }, recommend: false,
    sentiment: ["excluded", "excluded", "frustrated", "understanding", "future-user"],
    topGaps: ["Zero non-dev path", "No web interface", "No product-language questions", "No Notion template"],
    interactions: [
      { round: 3, with: 78, type: "commiserate", topic: "Laura (marketing) — both excluded by CLI-only" },
      { round: 5, with: 88, type: "agree", topic: "Kira (UX) — this is a usability problem" }
    ],
    quote: "Don't bother unless you have an engineering partner.",
    memory: "Started excluded, ended understanding. Kira's UX perspective helped me articulate why: it's not that the tool is bad, it's that the door is locked for non-developers. Slight improvement by round 5." },

  { id: 77, name: "Kevin Murphy", role: "Scrum Master", org: "Enterprise", tier: "crossfunc", experience: "4yr agile", goal: "Sprint workflow integration",
    scores: { r1: 5.5, r2: 5.5, r3: 5.5, r4: 5.5, r5: 5.5 }, recommend: "maybe",
    sentiment: ["neutral", "neutral", "neutral", "neutral", "watching"],
    topGaps: ["No Jira/Linear integration", "No sprint-friendly assessment", "No story point estimation"],
    interactions: [],
    quote: "Each improvement suggestion should be a Jira ticket with story points.",
    memory: "No interactions changed my view. Agile integration is a niche but real gap." },

  { id: 78, name: "Laura Gutierrez", role: "Marketing Manager", org: "AI Startup", tier: "crossfunc", experience: "3yr", goal: "Case study content",
    scores: { r1: 5.0, r2: 5.0, r3: 5.0, r4: 5.0, r5: 5.0 }, recommend: "maybe",
    sentiment: ["excluded", "excluded", "neutral", "neutral", "watching"],
    topGaps: ["No marketing-friendly output", "No case study template", "No infographic generator"],
    interactions: [
      { round: 3, with: 76, type: "commiserate", topic: "Amanda (PM) — both excluded by CLI" }
    ],
    quote: "L0 to L3 is a great customer story. But I can't generate it myself.",
    memory: "Amanda and I share the non-technical exclusion experience." },

  { id: 79, name: "Brian Cooper", role: "Sales Engineer", org: "AI Tools", tier: "crossfunc", experience: "6yr", goal: "Demo AMC to prospects",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["pragmatic", "pragmatic", "pragmatic", "satisfied", "advocate"],
    topGaps: ["No demo mode with sample data", "No prospect-facing report", "No competitive slide"],
    interactions: [
      { round: 4, with: 87, type: "agree", topic: "Tony (agency) — demo flow is good but needs pre-populated data" }
    ],
    quote: "quickscore --rapid into explain AMC-1.1 is a 5-minute demo that sells.",
    memory: "Tony validated: the demo workflow exists naturally. Just needs polish and sample data." },

  { id: 80, name: "Christina Andersson", role: "HR Director", org: "Tech Company", tier: "crossfunc", experience: "8yr", goal: "Hiring agent fairness",
    scores: { r1: 5.0, r2: 5.0, r3: 5.0, r4: 5.0, r5: 5.0 }, recommend: "maybe",
    sentiment: ["disappointed", "disappointed", "neutral", "neutral", "watching"],
    topGaps: ["No fairness/bias assessment", "No disparate impact eval", "No HR domain pack"],
    interactions: [],
    quote: "If our hiring agent discriminates, we're sued. AMC doesn't assess for that.",
    memory: "No interactions. Fairness/bias is a critical gap for HR adoption." },

  { id: 81, name: "Mike Thompson", role: "Journalist", org: "Tech Publication", tier: "crossfunc", experience: "10yr", goal: "Story angle",
    scores: { r1: 6.5, r2: 6.5, r3: 7.0, r4: 7.0, r5: 7.0 }, recommend: "n/a",
    sentiment: ["curious", "curious", "interested", "writing", "publishing"],
    topGaps: ["No press kit", "No media one-pager", "No comparison infographic"],
    interactions: [
      { round: 3, with: 91, type: "learn", topic: "Jake's 'least bullshit framework' quote is the headline" }
    ],
    quote: "Good story: open-source tool that proves AI trustworthiness. Need better visuals.",
    memory: "Jake's quote is the story angle. 'Least bullshit maturity framework' — that's a headline." },

  { id: 82, name: "Patricia Reyes", role: "VC Analyst", org: "Early-Stage Fund", tier: "crossfunc", experience: "3yr", goal: "DD checklist for AI startups",
    scores: { r1: 6.5, r2: 6.5, r3: 6.5, r4: 6.5, r5: 6.5 }, recommend: "maybe",
    sentiment: ["evaluating", "evaluating", "evaluating", "neutral", "watching"],
    topGaps: ["No investor DD template", "No risk-to-valuation mapping", "No portfolio view"],
    interactions: [],
    quote: "If L0 agents have 3x more incidents, that's investable intelligence.",
    memory: "No interactions. Niche investor use case." },

  { id: 83, name: "Nathan Berg", role: "Procurement Manager", org: "Government", tier: "crossfunc", experience: "7yr", goal: "Vendor evaluation for RFP",
    scores: { r1: 5.0, r2: 5.0, r3: 5.0, r4: 5.0, r5: 5.0 }, recommend: "maybe",
    sentiment: ["frustrated", "frustrated", "neutral", "neutral", "watching"],
    topGaps: ["No RFP template", "No procurement interface", "No vendor comparison"],
    interactions: [
      { round: 3, with: 46, type: "agree", topic: "Hassan (IT Dir) — government doesn't npm install" }
    ],
    quote: "My RFP checklist has 150 items. None say 'install npm package.'",
    memory: "Hassan and I are the government procurement cohort. Fundamental delivery gap." },

  { id: 84, name: "Julia Fischer", role: "Training Manager", org: "Enterprise", tier: "crossfunc", experience: "5yr", goal: "Train 200 people on agent maturity",
    scores: { r1: 5.5, r2: 5.5, r3: 5.5, r4: 5.5, r5: 5.5 }, recommend: "maybe",
    sentiment: ["interested", "interested", "neutral", "neutral", "watching"],
    topGaps: ["No SCORM content", "No training slides", "No certification program"],
    interactions: [
      { round: 5, with: 11, type: "agree", topic: "Tom (junior) — training materials are missing" }
    ],
    quote: "amc learn is clever. My 200 employees need an LMS course, not a terminal.",
    memory: "Tom validated: even individual learning is hard without training materials. Enterprise training is a layer up." },

  { id: 85, name: "Derek Chang", role: "Technical Writer", org: "Dev Tools", tier: "crossfunc", experience: "4yr", goal: "Documentation quality evaluation",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["impressed", "impressed", "impressed", "impressed", "advocate"],
    topGaps: ["260 docs files need navigation map", "No docs search", "API reference needs better structure"],
    interactions: [],
    quote: "Documentation above-average. explain command is brilliant. Docs navigation needs a map.",
    memory: "No interactions needed. Professional assessment based on documentation standards." },

  { id: 86, name: "Samantha Wells", role: "Customer Success", org: "AI Platform", tier: "crossfunc", experience: "3yr", goal: "Help customers evaluate agents",
    scores: { r1: 6.0, r2: 6.0, r3: 6.0, r4: 6.0, r5: 6.0 }, recommend: "maybe",
    sentiment: ["cautious", "cautious", "neutral", "neutral", "watching"],
    topGaps: ["No customer-facing assessment", "No results interpretation guide", "No CS playbook"],
    interactions: [],
    quote: "Can run it. Can't explain results to non-technical customer without prep.",
    memory: "No significant interactions. CS-specific workflow is a niche gap." },

  { id: 87, name: "Tony Russo", role: "Agency Owner", org: "Digital Agency", tier: "crossfunc", experience: "8yr", goal: "Client engagement tool",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 8.0, r5: 8.0 }, recommend: true,
    sentiment: ["pragmatic", "pragmatic", "planning", "building", "champion"],
    topGaps: ["No white-label", "No client profiles", "No agency tier", "No slides export"],
    interactions: [
      { round: 3, with: 9, type: "agree", topic: "Diego — consulting cohort aligned" },
      { round: 4, with: 13, type: "plan", topic: "Michael wants to use the agency workflow too" },
      { round: 4, with: 79, type: "agree", topic: "Brian — demo flow is natural, needs polish" }
    ],
    quote: "Already planning to integrate into our assessment offering.",
    memory: "Became the consulting cohort leader. Diego, Michael, Patrick, and Brian all want similar things. Score increased as I planned the business case." },

  { id: 88, name: "Kira Johansson", role: "UX Researcher", org: "Design Consultancy", tier: "crossfunc", experience: "5yr", goal: "Usability evaluation",
    scores: { r1: 6.0, r2: 6.0, r3: 6.0, r4: 6.0, r5: 6.0 }, recommend: "maybe",
    sentiment: ["critical", "critical", "analytical", "analytical", "watching"],
    topGaps: ["No progressive disclosure", "Flat IA", "No onboarding flow", "No success states"],
    interactions: [
      { round: 5, with: 76, type: "advise", topic: "Told Amanda: it's a usability problem, not a content problem" }
    ],
    quote: "Content is excellent. Experience of discovering it is terrible.",
    memory: "Amanda needed to hear that it's fixable. The content is genuinely good — the UX is the bottleneck." },

  { id: 89, name: "David Nkomo", role: "Non-Profit Director", org: "AI Ethics NGO", tier: "crossfunc", experience: "6yr", goal: "Accessible AI evaluation",
    scores: { r1: 6.0, r2: 6.0, r3: 6.0, r4: 6.0, r5: 6.0 }, recommend: "maybe",
    sentiment: ["hopeful", "frustrated", "neutral", "neutral", "watching"],
    topGaps: ["Too complex for small orgs", "No plain-language mode", "414 commands prohibitive"],
    interactions: [],
    quote: "Open source + 414 commands + governance jargon is still inaccessible for small NGOs.",
    memory: "No interactions. My use case is underserved but important for democratizing AI governance." },

  { id: 90, name: "Rebecca Stone", role: "Investor Relations", org: "Public AI Company", tier: "crossfunc", experience: "4yr", goal: "Earnings narrative",
    scores: { r1: 5.5, r2: 5.5, r3: 5.5, r4: 5.5, r5: 5.5 }, recommend: "maybe",
    sentiment: ["disengaged", "disengaged", "neutral", "neutral", "watching"],
    topGaps: ["No IR template", "No quarterly report format", "No ESG narrative template"],
    interactions: [],
    quote: "L3 is a talking point for earnings. Need engineering to produce it.",
    memory: "No interactions. IR is a downstream consumer of maturity data, not a user of the tool." },

  // TIER 5: SKEPTICS & EDGE CASES (10)
  { id: 91, name: "Jake Wilson", role: "The Skeptic", org: "Indie Dev + Blogger", tier: "skeptics", experience: "7yr", goal: "Prove frameworks are BS or not",
    scores: { r1: 7.0, r2: 7.0, r3: 7.0, r4: 7.5, r5: 7.5 }, recommend: true,
    sentiment: ["hostile", "skeptical", "grudging-respect", "impressed", "grudging-champion"],
    topGaps: ["No outcome correlation", "Governance ≠ capability", "No honest limitations page", "No case studies"],
    interactions: [
      { round: 2, with: 6, type: "teach", topic: "Told Raj: it measures governance, not quality. Reframe." },
      { round: 3, with: 35, type: "agree", topic: "Thomas (skeptical CTO) — need ROI data" },
      { round: 4, with: 81, type: "influence", topic: "Mike (journalist) loved 'least bullshit framework' quote" },
      { round: 5, with: 21, type: "teach", topic: "Clarified for Ryan: governance ≠ output quality" }
    ],
    quote: "Least bullshit maturity framework I've seen, and I hate maturity frameworks.",
    memory: "Started hostile. Evidence chain model earned my grudging respect. Became the 'honest critic' — multiple personas referenced my governance-vs-quality distinction. Mike made it a headline. Score improved as the distinction helped me appreciate what AMC actually does well." },

  { id: 92, name: "Dr. Hannah Meyer", role: "CS Professor", org: "University", tier: "skeptics", experience: "15yr", goal: "Challenge methodology",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 7.5, r5: 8.0 }, recommend: true,
    sentiment: ["critical", "critical", "analytical", "respectful", "advocate"],
    topGaps: ["No published methodology", "Question rationale undocumented", "Layer weighting arbitrary", "No validation study"],
    interactions: [
      { round: 4, with: 7, type: "debate", topic: "Liu Wei defended layer distribution — we agreed to disagree" },
      { round: 5, with: 24, type: "challenge", topic: "Pushed Sophie on thesis rigor — constructive" }
    ],
    quote: "Would not cite without published methodology. Would recommend for study.",
    memory: "Liu Wei's defense was reasonable. Sophie's enthusiasm is tempered by my challenges, which will make her thesis stronger. Score increased in round 5 as I appreciated the overall depth." },

  { id: 93, name: "Victor Popov", role: "Competitive Intel", org: "Promptfoo", tier: "skeptics", experience: "5yr", goal: "Assess competitive threat",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 7.5, r5: 7.5 }, recommend: "n/a",
    sentiment: ["analytical", "concerned", "respectful", "strategic", "threat-aware"],
    topGaps: ["Not on npm yet", "No community visible", "414 commands = maintenance risk", "No SaaS tier"],
    interactions: [
      { round: 3, with: 27, type: "observed-by", topic: "Daniel (architect) noticed my competitive validation" }
    ],
    quote: "If they ship web interface and get 1000+ users, they're a real adjacency threat.",
    memory: "Governance/compliance is a market we're not in. The 235-question bank is a moat. Not on npm yet = window of opportunity. If they publish, we need a response." },

  { id: 94, name: "Ashley Turner", role: "Burnt by Tools CTO", org: "Startup", tier: "skeptics", experience: "6yr", goal: "Will this one stick?",
    scores: { r1: 6.0, r2: 6.0, r3: 6.0, r4: 6.5, r5: 6.5 }, recommend: "maybe",
    sentiment: ["cynical", "cynical", "cautious", "warming", "conditional-yes"],
    topGaps: ["No adoption metrics", "No minimum viable adoption guide", "414 commands kills adoption", "No ROI tracking"],
    interactions: [
      { round: 3, with: 91, type: "agree", topic: "Jake — at least the evidence model is novel" },
      { round: 5, with: 95, type: "agree", topic: "Remi — complexity is the adoption killer" }
    ],
    quote: "This is tool #4. Previous 3 had great READMEs too.",
    memory: "Jake's endorsement moved me slightly. Remi confirmed my adoption concern. Score improved marginally as I recognized the evidence model is genuinely different from tools 1-3." },

  { id: 95, name: "Remi Fournier", role: "Minimalist", org: "Staff Engineer", tier: "skeptics", experience: "8yr", goal: "One tool one job",
    scores: { r1: 5.0, r2: 5.0, r3: 5.0, r4: 5.0, r5: 5.0 }, recommend: "maybe",
    sentiment: ["hostile", "hostile", "tolerant", "tolerant", "quickscore-only"],
    topGaps: ["414 commands = opposite of Unix", "No progressive disclosure", "No focused core-only", "Everything in --help"],
    interactions: [
      { round: 2, with: 19, type: "agree", topic: "Pavel — both want lighter distribution" },
      { round: 4, with: 96, type: "agree", topic: "Oluwaseun — heavy deps are real problem" },
      { round: 5, with: 94, type: "agree", topic: "Ashley — complexity kills adoption" }
    ],
    quote: "Use amc quickscore --rapid, ignore everything else.",
    memory: "Three allies (Pavel, Oluwaseun, Ashley) validated my concerns. No score evolution — the bloat is structural. quickscore --rapid is the only command I'd use." },

  { id: 96, name: "Oluwaseun Adeyemi", role: "Offline-First Dev", org: "Low Bandwidth Region", tier: "skeptics", experience: "4yr", goal: "No-internet-required eval",
    scores: { r1: 6.0, r2: 6.0, r3: 6.5, r4: 7.0, r5: 7.0 }, recommend: true,
    sentiment: ["frustrated", "frustrated", "surprised", "satisfied", "advocate"],
    topGaps: ["Heavy deps (50+ MB)", "Native compilation footgun", "No pre-built binary", "No offline package"],
    interactions: [
      { round: 2, with: 19, type: "agree", topic: "Pavel — Node.js dependency is heavy" },
      { round: 4, with: 95, type: "agree", topic: "Remi — want lightweight distribution" }
    ],
    quote: "Once installed, genuinely offline-capable. Install process is hostile to constrained environments.",
    memory: "Started frustrated with install (35 min). But once running — everything is local! No API calls for scoring. Score improved significantly as I realized the offline capability is genuine and valuable." },

  { id: 97, name: "Wei Zhang", role: "Non-English Speaker", org: "Chinese Startup", tier: "skeptics", experience: "5yr", goal: "Agent eval in Chinese market",
    scores: { r1: 5.0, r2: 5.0, r3: 5.0, r4: 5.0, r5: 5.0 }, recommend: "maybe",
    sentiment: ["excluded", "excluded", "neutral", "neutral", "watching"],
    topGaps: ["No i18n", "Culturally Western terminology", "No Chinese regulatory mapping", "No translation program"],
    interactions: [
      { round: 3, with: 22, type: "agree", topic: "Zara — language barrier is real" }
    ],
    quote: "My agent speaks 12 languages but AMC only speaks English.",
    memory: "Zara and I represent the i18n gap. No evolution — structural limitation." },

  { id: 98, name: "Aria Johansson", role: "Windows/.NET Dev", org: "Enterprise .NET", tier: "skeptics", experience: "6yr", goal: "Agent eval on Windows",
    scores: { r1: 6.0, r2: 6.0, r3: 6.0, r4: 6.0, r5: 6.0 }, recommend: "maybe",
    sentiment: ["frustrated", "frustrated", "tolerant", "tolerant", "conditional-yes"],
    topGaps: ["Windows second-class", "better-sqlite3 compilation fails", "No .NET adapter", "Path separator issues"],
    interactions: [],
    quote: "Run it in WSL. That tells you everything about Windows support.",
    memory: "No interactions. Windows/. NET is a lonely island in this simulation." },

  { id: 99, name: "Sam Rivers", role: "Hackathon Participant", org: "Hackathon", tier: "skeptics", experience: "1yr", goal: "5-minute wow factor",
    scores: { r1: 7.5, r2: 7.5, r3: 7.5, r4: 8.0, r5: 8.0 }, recommend: true,
    sentiment: ["impressed", "impressed", "satisfied", "enthusiastic", "ambassador"],
    topGaps: ["L0 discouraging for quick evals", "No hackathon mode", "Badge should be default output"],
    interactions: [
      { round: 3, with: 23, type: "agree", topic: "Ben — --rapid --share is the killer combo" }
    ],
    quote: "npx agent-maturity-compass quickscore --rapid --share — 2-minute competitive advantage.",
    memory: "Ben and I are the 'quick win' cohort. --rapid --share is genuinely useful for hackathons and README badges." },

  { id: 100, name: "Dr. Chiara Bianchi", role: "Framework Author", org: "Built Own Eval Tool", tier: "skeptics", experience: "10yr", goal: "Peer review architecture",
    scores: { r1: 9.0, r2: 9.0, r3: 9.0, r4: 9.0, r5: 9.5 }, recommend: true,
    sentiment: ["impressed", "impressed", "enthusiastic", "enthusiastic", "evangelist"],
    topGaps: ["414 commands = complexity creep", "Namespace overlap", "No plugin API for scoring engine", "MCP undocumented"],
    interactions: [
      { round: 3, with: 56, type: "agree", topic: "Dr Watson — evidence chain is the architectural innovation" },
      { round: 4, with: 70, type: "agree", topic: "Dr Price — no other OSS framework has this depth" },
      { round: 5, with: 92, type: "debate", topic: "Dr Meyer's rigor challenges make the framework stronger" }
    ],
    quote: "Most complete open-source agent governance framework. Main risk: complexity creep.",
    memory: "Peer-level validation from Dr Watson and Dr Price. Dr Meyer's challenges are constructive. The evidence chain model is genuinely novel architecture. 235-question bank is the real moat." }
];

// Social interaction graph - major cohorts that formed
const COHORTS = [
  { name: "Healthcare Coalition", agents: [5, 28, 41, 68, 74], formed: 3, strength: "strong",
    consensus: "HIPAA/FDA/GxP domain pack is the #1 domain expansion priority", color: "#FF6B6B" },
  { name: "Academic Circle", agents: [7, 24, 56, 92, 100], formed: 2, strength: "strong",
    consensus: "Evidence chain is methodologically sound; publish methodology paper to enable citations", color: "#4ECDC4" },
  { name: "Security Cohort", agents: [10, 33, 72], formed: 2, strength: "strong",
    consensus: "Governance security is solid; need Garak/PyRIT for real adversarial testing", color: "#FFE66D" },
  { name: "Consulting Cluster", agents: [9, 13, 48, 87, 79], formed: 3, strength: "medium",
    consensus: "L0-L5 is client-ready; need white-label reports and multi-client management", color: "#A8E6CF" },
  { name: "Executive Format Group", agents: [31, 38, 45, 50], formed: 3, strength: "medium",
    consensus: "Right engine, wrong UI; need web dashboard and board-ready reports", color: "#DDA0DD" },
  { name: "Platform Adoption Team", agents: [3, 32, 34, 37], formed: 3, strength: "medium",
    consensus: "Team rollout playbook is the #1 enterprise adoption blocker", color: "#87CEEB" },
  { name: "Physical Agents Cohort", agents: [12, 15, 30], formed: 3, strength: "weak",
    consensus: "Edge/physical agents need differentiated safety scoring", color: "#F0E68C" },
  { name: "Lightweight Distribution Alliance", agents: [19, 95, 96], formed: 2, strength: "medium",
    consensus: "Ship SEA binary; 50+ MB Node.js deps are hostile to constrained environments", color: "#FFA07A" },
  { name: "Compliance Officers Circle", agents: [44, 57, 63], formed: 3, strength: "medium",
    consensus: "Good engine; CLI is non-starter for compliance teams; need web + PDF", color: "#B0C4DE" },
  { name: "Solo Dev/Founder Cohort", agents: [6, 23, 39], formed: 2, strength: "weak",
    consensus: "L0 demoralizes; need founder-friendly assessment path", color: "#98FB98" },
  { name: "i18n Advocates", agents: [22, 97], formed: 3, strength: "weak",
    consensus: "English-only limits global adoption; need i18n framework", color: "#FFB6C1" },
  { name: "Creative Agents Sub-group", agents: [21, 29, 42], formed: 3, strength: "weak",
    consensus: "AMC measures governance, not output quality; creative agents need both", color: "#E6E6FA" }
];

// Opinion evolution data for the heatmap
const ROUNDS = [
  { id: 1, name: "Solo Evaluation", description: "Each agent independently evaluates AMC", avgScore: 6.72 },
  { id: 2, name: "First Connections", description: "Agents with similar roles find each other", avgScore: 6.74 },
  { id: 3, name: "Cohort Formation", description: "Natural interest groups crystallize", avgScore: 6.82 },
  { id: 4, name: "Cross-Pollination", description: "Cohorts exchange insights across boundaries", avgScore: 6.95 },
  { id: 5, name: "Consensus & Evolution", description: "Final opinions form with social influence", avgScore: 7.05 }
];

// Gap categories with counts
const GAP_CATEGORIES = [
  { name: "UX & Accessibility", count: 15, priority: "P0", color: "#EF4A4A", topGap: "414-command overwhelm in --help" },
  { name: "Compliance & Regulatory", count: 18, priority: "P1", color: "#FFB020", topGap: "HIPAA, DORA, SOC 2 mappings missing" },
  { name: "Domain Packs Missing", count: 12, priority: "P1", color: "#4AEF79", topGap: "Healthcare, FinTech, Manufacturing" },
  { name: "Integration & Ecosystem", count: 10, priority: "P2", color: "#4A9DEF", topGap: "OTel, Garak/PyRIT, test runners" },
  { name: "Installation & Distribution", count: 8, priority: "P1", color: "#B04AEF", topGap: "Windows compilation, no SEA binary" },
  { name: "Reporting & Output", count: 8, priority: "P1", color: "#FF6B6B", topGap: "No PDF, no executive report format" },
  { name: "Business & Commercial", count: 8, priority: "P2", color: "#DDA0DD", topGap: "No ROI data, no outcome correlation" },
  { name: "Enterprise & Scale", count: 7, priority: "P1", color: "#87CEEB", topGap: "No team rollout playbook" },
  { name: "Methodology & Credibility", count: 6, priority: "P1", color: "#4ECDC4", topGap: "No arXiv paper, weighting undocumented" },
  { name: "CI/CD & DevOps", count: 6, priority: "P1", color: "#A8E6CF", topGap: "No GitHub Action, exit codes unclear" },
  { name: "Internationalization", count: 4, priority: "P2", color: "#FFE66D", topGap: "No i18n, English-only" }
];
