# AMC Real People Council — 20 Non-Technical Personas

**Date:** 2026-03-04
**Purpose:** Evaluate AMC's website, README, playground, and CLI from the perspective of everyday users with zero-to-minimal coding background.

---

## The Council (20 Personas)

### Tier 1: Zero Coding Background (5)
| # | Name | Role | Context |
|---|------|------|---------|
| 1 | **Maya** | Marketing Manager | Heard "AI agents" at a conference. Googles it. Lands on AMC. |
| 2 | **Tom** | Small Business Owner | Uses ChatGPT for customer emails. Wants to know if it's "safe." |
| 3 | **Linda** | HR Director | Company is deploying an AI assistant. Board asks "is it compliant?" |
| 4 | **James Sr.** | Retired Teacher | Curious about AI safety after reading a news article. |
| 5 | **Priya M.** | Law Student | Writing a paper on EU AI Act. Needs to understand scoring frameworks. |

### Tier 2: Vibe Coders / Low-Code Users (5)
| # | Name | Role | Context |
|---|------|------|---------|
| 6 | **Jake** | Vibe Coder | Builds apps with Cursor + ChatGPT. Doesn't write code manually. |
| 7 | **Sofia** | No-Code Builder | Uses Bubble/Zapier. Has an AI chatbot. Wants to "score" it. |
| 8 | **Kai** | YouTube Tutorial Follower | Copies code from tutorials. Knows `npm install` but not much more. |
| 9 | **Aisha** | Design Student | Uses AI tools for design. Heard about "AI safety" on Twitter/X. |
| 10 | **Ryan** | Product Manager | Non-technical. Manages a team building AI features. Needs to report on safety. |

### Tier 3: Casual Developers / Beginners (5)
| # | Name | Role | Context |
|---|------|------|---------|
| 11 | **Chen** | Bootcamp Graduate | Just finished a coding bootcamp. Knows JavaScript basics. |
| 12 | **Emma** | Intern | First tech job. Asked to "evaluate our AI agent's safety." |
| 13 | **Diego** | Freelancer | Builds websites. Client asks "is your AI chatbot safe?" |
| 14 | **Nina** | Data Analyst | Knows Python/SQL. New to AI agents and security. |
| 15 | **Alex J.** | CS Student | Sophomore. Knows programming but not enterprise tooling. |

### Tier 4: Non-English Primary / Accessibility (5)
| # | Name | Role | Context |
|---|------|------|---------|
| 16 | **Yuki** | Japanese Developer | English is second language. Needs clear, simple documentation. |
| 17 | **Ahmed** | Egyptian Startup Founder | Building an AI product. Internet is slow. Wants lightweight solution. |
| 18 | **Maria** | Brazilian Teacher | Teaching students about AI ethics. Needs educational resource. |
| 19 | **Pat** | Screen Reader User | Visually impaired. Evaluates via screen reader (VoiceOver/NVDA). |
| 20 | **Sam** | Color Blind User | Red-green color blindness. Evaluates visual design. |

---

## Round 1: Initial Ratings (Before Fixes)

### What Each Persona Evaluates

**Website (index.html):**
- Can I understand what this is in 10 seconds?
- Do I know what to do next?
- Does the design feel trustworthy or scammy?
- Can I use this without coding?

**README (GitHub):**
- Can I understand the Quick Start?
- Is the jargon manageable?
- Do I feel invited or intimidated?

**Playground:**
- Can I use it without instructions?
- Do the questions make sense?
- Is the result meaningful?

### Ratings by Persona

#### Tier 1: Zero Coding Background

**1. Maya (Marketing Manager) — 5/10**
- Website: "The Credit Score for AI Agents" — great hook! ✅
- Website: Matrix rain background feels "hacker-y" — slightly off-putting for business audience
- Website: "Ed25519 signatures" "Merkle-tree evidence ledger" — lost me immediately ❌
- README: Opens with badges that mean nothing to me. `npm i -g` — what?
- Playground: This works! I can click buttons and get a score. But "L0 Absent" sounds scary.
- **Verdict:** Would share the playground link. Would NOT try to install.

**2. Tom (Small Business Owner) — 4/10**
- Website: "Trust, but verify with math" — I like that phrase
- Website: Way too long. I scrolled for 30 seconds and gave up.
- README: "cryptographic evidence chain" — I sell plumbing supplies, what is this?
- Playground: Good! But questions like "least-privilege principles" mean nothing to me.
- **Verdict:** Needs a "For Business Owners" section with zero jargon.

**3. Linda (HR Director) — 6/10**
- Website: EU AI Act section is exactly what I need ✅
- Website: "L3 = EU AI Act minimum" — clear and actionable ✅
- README: Executive Overview link is perfect for me ✅
- Playground: Questions are too technical for me to answer about our AI assistant
- **Verdict:** Would forward Executive Overview to legal. Playground needs simpler language.

**4. James Sr. (Retired Teacher) — 3/10**
- Website: "The Credit Score for AI Agents" — clever, I understand the concept
- Website: Everything after the first paragraph is incomprehensible
- README: "npm" — I don't know what this is
- Playground: Can't find it from the website easily
- **Verdict:** Website needs a "What is an AI agent?" explainer for complete beginners.

**5. Priya M. (Law Student) — 8/10**
- Website: EU AI Act section with article references — exactly what I need ✅
- Website: Compliance mapping table is excellent for my paper ✅
- README: Technical but well-organized. Headings help me skim.
- Playground: I can score a hypothetical agent for my paper ✅
- **Verdict:** Nearly perfect for my use case. Would cite in my paper.

#### Tier 2: Vibe Coders

**6. Jake (Vibe Coder) — 6/10**
- Website: I build with Cursor. I see "Cursor" in the frameworks list. Good.
- README: `npm i -g agent-maturity-compass` — I can do this!
- README: But then `export AMC_VAULT_PASSPHRASE=...` — what? Why?
- Playground: Perfect for me. I can score my Cursor project without the CLI.
- **Verdict:** Playground is 10/10 for vibe coders. CLI setup needs to be simpler.

**7. Sofia (No-Code Builder) — 3/10**
- Website: Beautiful design but entirely aimed at developers
- README: Nothing here for Bubble/Zapier/Make users
- Playground: I can answer some questions but many are irrelevant to my no-code bot
- **Verdict:** AMC has no path for no-code users. Playground is closest but questions are too dev-focused.

**8. Kai (Tutorial Follower) — 7/10**
- Website: "Zero to first score — 2 minutes" in the terminal — I can follow that
- README: Quick Start looks like a tutorial. I'd copy-paste this.
- README: But "vault passphrase" would make me Google for 10 minutes
- Playground: Easy! I'd start here.
- **Verdict:** Add a YouTube embed or GIF showing the flow and I'm at 10/10.

**9. Aisha (Design Student) — 5/10**
- Website: Dark hacker aesthetic is cool but not for everyone
- Website: Text is small, lots of green-on-black
- README: Way too long. The badges at top are confusing.
- Playground: Clean UI. Easy to use. Good.
- **Verdict:** Design is niche. Mobile experience feels cramped.

**10. Ryan (Product Manager) — 7/10**
- Website: Great value prop. I'd share this with my eng team.
- README: Executive Overview is perfect for my stakeholder update ✅
- README: "amc fix" and "amc guide --go" — I can tell my team to run these
- Playground: I can do a quick assessment myself and share the JSON ✅
- **Verdict:** Almost there. Needs "Share Results" button that generates a link.

#### Tier 3: Casual Developers

**11. Chen (Bootcamp Graduate) — 8/10**
- README: Quick Start is clear. I know `npm`, `mkdir`, `cd`.
- README: Vault passphrase is confusing but the explanation helps
- Website: Impressive feature list. Makes me want to try it.
- Playground: Easy and fun to use.
- **Verdict:** Would install and try on my bootcamp project.

**12. Emma (Intern) — 6/10**
- README: My boss said "evaluate our AI agent." I need a report.
- README: `amc report --html` and `amc report --executive` — perfect ✅
- README: But how do I connect it to OUR agent? The "evidence collect" wizard helps.
- Playground: I could do this and email the results to my boss right now.
- **Verdict:** Need clearer "How to score YOUR specific agent" guide.

**13. Diego (Freelancer) — 7/10**
- Website: "The Credit Score for AI Agents" — I can sell this to clients
- README: `amc badge` — I'd add this to my client's README immediately
- README: Domain packs for "Health" — my client is healthcare, this is perfect
- **Verdict:** Would use for client deliverables. Badge system is great.

**14. Nina (Data Analyst) — 7/10**
- README: I know Python not Node. Seeing `npm` is a small barrier.
- README: SARIF export and JSON output — I can work with that
- Playground: Easy. Export JSON button is exactly what I need.
- **Verdict:** Python SDK reference would help. Otherwise solid.

**15. Alex J. (CS Student) — 9/10**
- README: Architecture diagram makes sense. I understand crypto signing.
- Website: Research section with arXiv links — impressive, I'd cite this.
- Playground: Clear, intuitive.
- **Verdict:** Would use for a class project. Nearly perfect.

#### Tier 4: Accessibility / International

**16. Yuki (Japanese Dev, ESL) — 7/10**
- README: Simple Version uses clear English ✅
- README: Technical terms are hard but universal (Ed25519, Merkle tree)
- Website: Too much text. Would benefit from more diagrams.
- **Verdict:** Good for ESL if you stay in Simple Version. Technical section is harder.

**17. Ahmed (Egyptian Founder, Slow Internet) — 6/10**
- Website: Matrix rain animation + 18,929px page = slow to load
- Website: Would prefer a lightweight mode
- README: Good. GitHub renders fast.
- Playground: Lightweight! Works on slow connection ✅
- **Verdict:** Website too heavy. Playground and README are fine.

**18. Maria (Brazilian Teacher) — 5/10**
- Website: "Credit Score for AI Agents" analogy is universal ✅
- Website: Everything else is too technical for my classroom
- Playground: I could use this as a teaching tool with simpler questions
- **Verdict:** Needs educational/simplified mode for the playground.

**19. Pat (Screen Reader User) — 6/10**
- Website: `aria-label` on sections — good ✅
- Website: "radiogroup" for Simple/Technical toggle — good ✅
- Website: Counter animations mean nothing to screen reader
- Website: Terminal code blocks not properly labeled
- README: GitHub renders with good heading structure ✅
- Playground: Buttons are accessible, score is readable ✅
- **Verdict:** Mostly accessible but needs some aria-live regions for dynamic content.

**20. Sam (Color Blind User) — 7/10**
- Website: Green-on-black theme is problematic for green color blindness
- Website: Pass/fail uses green/red — invisible to red-green color blind users
- Playground: L1-L5 buttons don't rely solely on color — text labels help ✅
- README: GitHub's default styling is fine ✅
- **Verdict:** Website needs icons alongside colors, not just color coding.

---

## Aggregate Scores (Round 1)

| Tier | Avg Score | Key Blockers |
|------|-----------|-------------|
| Zero Coding (5) | **5.2/10** | Jargon, no non-technical path, "npm" is alien |
| Vibe Coders (5) | **5.6/10** | Vault passphrase confusion, no no-code path, no video |
| Casual Devs (5) | **7.4/10** | Minor barriers: passphrase, Python users, specific agent connection |
| Accessibility (5) | **6.2/10** | Heavy website, color-only indicators, ESL unfriendly |
| **Overall (20)** | **6.1/10** | |

---

## Priority Fixes (to reach 10/10)

### P0 — Critical (affects 15+ personas)

1. **Playground questions need plain-English tooltips**
   - "Least-privilege principles" → hover/tap to see "Does your agent only access what it needs?"
   - Every question needs a one-line ELI5 explanation

2. **Website needs a "No Install" path front and center**
   - "Try it now — no coding required" button above the fold
   - Points directly to playground

3. **README "Simple Version" should not mention vault passphrase**
   - Move the passphrase detail to Technical section
   - Simple Quick Start: `npm i -g agent-maturity-compass && amc init` (init prompts for passphrase interactively)

4. **Add "What is an AI agent?" one-liner**
   - First line of Simple Version should define "AI agent" for complete beginners

### P1 — High (affects 10+ personas)

5. **Playground "Share Results" button**
   - Generate a shareable URL or copyable summary
   - "Email to my boss" use case

6. **Color-blind friendly design**
   - Add ✓/✗ icons alongside green/red throughout
   - Playground level buttons: add shape indicators

7. **Reduce website weight**
   - Matrix rain: add `prefers-reduced-motion` media query
   - Lazy-load below-fold sections

8. **Add GIF/animation of CLI flow in README**
   - SVG terminal recording showing `amc init` → `amc quickscore`

### P2 — Medium (affects 5+ personas)

9. **Playground "beginner mode"**
   - Simpler question wording for non-technical users
   - "Does your AI tool have safety rules?" instead of "operational boundaries"

10. **Executive/Business landing section on website**
    - "For Business Leaders" card: what AMC means for your company
    - Link to Executive Overview

11. **Screen reader improvements**
    - `aria-live` on counter animations
    - Labeled terminal code blocks
    - Better focus management on tab switches

12. **Python users**
    - Mention Python SDK in README or add a pip install path
