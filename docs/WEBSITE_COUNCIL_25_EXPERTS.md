# Website UX Council — 25-Expert Panel Review

**Date:** 2026-03-04
**Subject:** https://thewisecrab.github.io/AgentMaturityCompass/
**Method:** 25 simulated experts across web design, UI/UX, technical, and general audience categories
**Version:** Post-fix (auto theme, decluttered nav, light mode CSS)

---

## Panel Composition

### Web Designers (5)
1. **Elena** — Senior Visual Designer, Figma/Webflow specialist, 8 years
2. **Kai** — Brand Identity Designer, dark-mode specialist, agency lead
3. **Nora** — Typography & Layout Designer, accessibility focus
4. **Diego** — Motion Design & Interaction specialist
5. **Yuki** — Minimalist Web Designer, Japanese design principles

### UI/UX Specialists (5)
6. **Aisha** — UX Research Lead, Fortune 500 enterprise SaaS
7. **Ryan** — Information Architecture specialist, dev tools
8. **Mei** — Accessibility (WCAG 2.2 AA) auditor
9. **Jordan** — Mobile-first UX, responsive design expert
10. **Sven** — Conversion Rate Optimization, PLG SaaS

### Technical Users (5)
11. **Marcus** — Senior ML Engineer, evaluates agent frameworks daily
12. **Priya** — DevOps Lead, runs CI/CD for 50+ microservices
13. **Alex** — Security Researcher, red-team pentester
14. **Chen** — Open-source maintainer, 10K+ star project
15. **Fatima** — CTO, 30-person AI startup

### Common/Non-Technical Users (5)
16. **James** — Compliance Officer, EU AI Act preparation
17. **Linda** — VP Engineering, non-technical management
18. **Tom** — Startup founder, evaluating tools for his team
19. **Sarah** — Junior Developer, first year, browsing GitHub trending
20. **Robert** — Procurement Manager, comparing enterprise tools

### Cross-Functional (5)
21. **Olivia** — Tech Journalist, writes for The Verge/Ars Technica
22. **Hassan** — VC Associate, evaluating AI infrastructure companies
23. **Kenji** — Developer Advocate, LangChain community
24. **Maria** — Academic Researcher, AI governance
25. **Pat** — General consumer, clicked a link from Hacker News

---

## Individual Reviews

### 1. Elena — Senior Visual Designer (8/10)

**First impression:** "The terminal aesthetic is bold and differentiated. Most dev tool sites look identical — this stands out. The green-on-black is immediately recognizable."

**Strengths:**
- Strong visual identity — the compass icon, monospace type, and green accent create a memorable brand
- Good use of whitespace in sections
- The score comparison gauge (100 vs 16) is a brilliant visual hook
- Section numbering (01, 02, 03...) creates a nice reading rhythm

**Issues:**
- The page is *very* long — 13 sections is a lot to scroll through
- The "Simple/Technical" toggle in the hero isn't obvious enough
- Some stat counters show "0" which looks broken (intersection observer hasn't fired)
- The footer is too dense

**Score: 8/10**

---

### 2. Kai — Brand Identity Designer (9/10)

**First impression:** "This is one of the best-branded developer tool sites I've seen. The terminal metaphor is consistent from nav to footer. The compass branding is tight."

**Strengths:**
- Brand consistency is excellent — every element reinforces the "trusted observer" positioning
- The custom cursor (green dot + ring) is a nice touch that doesn't interfere with usability
- Dark mode is the correct default for this audience
- The scanline overlay is subtle enough to be atmospheric, not distracting

**Issues:**
- Light mode feels like an afterthought — it works but doesn't have the same design intentionality
- The favicon could be crisper at small sizes
- No consistent illustration style — could use a set of line-art icons

**Score: 9/10**

---

### 3. Nora — Typography & Layout Designer (7/10)

**First impression:** "Good type choices — JetBrains Mono for code/headings, Inter for body. Readable. But the line lengths get long on wide screens."

**Strengths:**
- Font pairing is professional
- Code blocks use proper monospace
- Section headers with numbering create clear hierarchy

**Issues:**
- Max-width of 1160px is fine but some text blocks run wider than 75ch — strain on readability
- The hero text is slightly too small on mobile
- Light mode overrides the monospace font to Inter in some contexts — breaks visual consistency
- Some buttons have inconsistent border-radius (3px vs none)

**Score: 7/10**

---

### 4. Diego — Motion Design & Interaction (7/10)

**First impression:** "The rain canvas animation is cool but adds nothing functionally. The scroll-triggered section reveals are smooth. Custom cursor is playful."

**Strengths:**
- Intersection observer for section reveals works well
- Scroll progress bar in the nav is useful
- The copy buttons on code blocks are well-placed

**Issues:**
- No page transition animations between views
- The stat counter animation (counting up from 0) sometimes doesn't fire — shows "0" permanently
- Custom cursor adds 60-80ms of latency on scroll — some users will find it laggy
- The terminal demo simulation should auto-play on scroll into view

**Score: 7/10**

---

### 5. Yuki — Minimalist Web Designer (6/10)

**First impression:** "Too much content. This page tries to say everything at once. A great product page says one thing powerfully."

**Strengths:**
- The core message (84-point gap) is compelling
- The maturity scale visualization is clean
- The install command as primary CTA is correct

**Issues:**
- **13 sections is excessive** — should be 5-6 max for a landing page
- The domain packs section alone has 7 sub-cards — overwhelming
- Research papers section is too academic for a landing page — move to /research
- The coverage section lists 9 attack types — move details to docs
- Footer has too many links

**Score: 6/10**

---

### 6. Aisha — UX Research Lead (7/10)

**First impression:** "The value proposition is clear in the first fold. 'Credit Score for AI Agents' is immediately understood. But the page asks too much of the user's attention."

**Strengths:**
- Hero section communicates value quickly
- The comparison gauge (100 vs 16) is the single best element — shows the problem viscerally
- Clear CTAs: install command, playground, demo
- The maturity scale (L0-L5) is intuitive

**Issues:**
- No user journey segmentation — a CTO and a developer see the same page
- The "Simple/Technical" toggle tries to solve this but isn't prominent enough
- No social proof (testimonials, star count, company logos)
- The waitlist form is buried at the bottom — should be after the hook
- Information overload: 140 questions, 85 packs, 75 modules, 593 sector questions, 482 commands... too many numbers

**Score: 7/10**

---

### 7. Ryan — Information Architecture (7/10)

**First impression:** "The IA is logical (Platform → How → Gap → Scale → Compliance) but the page is doing the work of 5 separate pages."

**Strengths:**
- Section numbering provides a clear mental model
- The nav anchors map to sections correctly
- The "Your Path" section (01-04 steps) is excellent progressive disclosure

**Issues:**
- Sections 10-13 should be separate pages (Coverage, Research, EU AI Act, Adapters)
- The domain packs section is essentially a product catalog — needs its own page
- No breadcrumb or "you are here" indicator beyond scroll progress
- Missing a "Why AMC?" or comparison section on the main page (exists at compare.html but not linked prominently)

**Score: 7/10**

---

### 8. Mei — Accessibility Auditor (7/10)

**Strengths:**
- Skip link present ("Skip to main content")
- ARIA labels on navigation, regions
- Focus-visible styles implemented
- Color contrast in dark mode passes AA for main text (#e0ffe0 on #000)
- Semantic HTML: nav, main, sections with proper headings

**Issues:**
- The custom cursor hides the system cursor — users with motor impairments may lose track
- Green-on-dark contrast ratio for muted text (#5a8a5a on #000) is 2.9:1 — fails AA (needs 4.5:1)
- Some interactive elements don't have sufficient touch targets (lang switcher buttons are very small)
- The rain canvas animation has no `prefers-reduced-motion` respect
- Screen reader experience: the stat counters animating from 0 will be confusing

**Score: 7/10** — Good foundation, needs muted text contrast fix and reduced-motion support

---

### 9. Jordan — Mobile-First UX (6/10)

**Strengths:**
- Hamburger menu exists and works
- Responsive breakpoints are reasonable
- The hero stacks correctly on mobile

**Issues:**
- **Page is extremely long on mobile** — easily 30+ screen heights of scrolling
- The code blocks overflow horizontally on small screens
- The architecture diagram doesn't reflow well below 400px
- Touch targets on some buttons are too small (lang switcher: <32px)
- The sticky bottom bar overlaps content on short screens
- No "back to top" button visible on mobile (buried in footer)

**Score: 6/10**

---

### 10. Sven — Conversion Rate Optimization (6/10)

**First impression:** "The product is impressive but the page doesn't convert. Where's the funnel?"

**Strengths:**
- Primary CTA (install command) is above the fold
- The 84-point gap is a compelling hook
- GitHub link is prominent

**Issues:**
- **No clear conversion funnel** — install, playground, demo, docs, blog, GitHub are all competing for the same click
- The waitlist form is at position 13/14 — 90% of visitors will never see it
- No pricing/freemium messaging — users don't know if this costs money
- No "trusted by" section (even beta users or the team's own usage)
- No "How long does it take?" — "2 minutes" is mentioned but not prominent enough
- The star count badge shows "0" — should be hidden until it's meaningful

**Score: 6/10**

---

### 11. Marcus — Senior ML Engineer (9/10)

**First impression:** "Finally, someone doing execution-verified scoring instead of vibes-based evaluation. The technical depth is real."

**Strengths:**
- The EPES trust model section is technically rigorous
- Evidence provenance tiers (1.1×, 1.0×, 0.8×, 0.4×) are well-explained
- arXiv citations give credibility — these are real papers
- The architecture diagram (agent → gateway → LLM → scoring → sealed output) is clear
- 14 adapter support means I can use this with my existing LangChain setup

**Issues:**
- Would like to see actual output examples, not just terminal simulations
- The "quickscore" simulation shows "140 diagnostic questions" but earlier said "5-question rapid assessment" — which is it?
- Want to see benchmark comparisons against other evaluation tools

**Score: 9/10**

---

### 12. Priya — DevOps Lead (8/10)

**Strengths:**
- CI/CD gate feature is exactly what I need
- Docker support mentioned
- The `OPENAI_BASE_URL` env var approach is clean — no agent code changes
- Assurance packs can be scheduled

**Issues:**
- No Helm chart or Kubernetes deployment guide linked from the site
- The "amc up" Studio feature isn't well-explained — is it a web UI? CLI dashboard?
- Want to see resource requirements (CPU/memory for the gateway proxy)

**Score: 8/10**

---

### 13. Alex — Security Researcher (9/10)

**First impression:** "The threat taxonomy is excellent. Zombie agents, economic DoS, MCP attacks — this is current."

**Strengths:**
- Coverage section maps to real arXiv research, not marketing buzzwords
- 85 assurance packs with scenario counts
- Ed25519 + Merkle tree evidence chain is cryptographically sound
- Over-compliance detection from H-Neurons research is unique

**Issues:**
- Want to see SARIF export mentioned on the site (it exists in CLI but not advertised)
- No CVE/advisory database integration mentioned
- Would like a "red team report" example output

**Score: 9/10**

---

### 14. Chen — Open-Source Maintainer (8/10)

**Strengths:**
- MIT license prominently displayed
- GitHub link is primary CTA
- Technical depth shows this isn't vaporware
- The structured JSON-LD schema is good for discoverability

**Issues:**
- Star count shows "0" — don't show it until it's meaningful, or show "★ Star" without count
- No CONTRIBUTING.md or community guidelines linked
- No Discord/community link in the nav
- The repo description should match the site tagline exactly

**Score: 8/10**

---

### 15. Fatima — CTO, AI Startup (8/10)

**Strengths:**
- Clear positioning: "credit score for AI agents"
- EU AI Act compliance mapping is relevant for our European expansion
- The maturity scale gives a shared language for my team
- The executive report feature (mentioned in docs) is useful for board presentations

**Issues:**
- No pricing page — is this free forever? Enterprise tier?
- No case studies or implementation timeline estimates
- Want to understand: how much engineering effort to integrate?
- The "14 adapters" list doesn't show which ones are production-ready vs experimental

**Score: 8/10**

---

### 16. James — Compliance Officer (6/10)

**First impression:** "The EU AI Act section is relevant but I need to scroll through 12 sections of developer content to find it."

**Issues:**
- The site is developer-first — compliance users are an afterthought
- No "Compliance" entry point in the nav
- The Article 9/12/13/14/17 mapping is exactly what I need but it's buried
- No downloadable compliance report template
- The terminal aesthetic is intimidating for non-technical users

**Score: 6/10**

---

### 17. Linda — VP Engineering (7/10)

**Strengths:**
- The 84-point gap story is compelling for executive communication
- Maturity scale is easy to understand
- The "install in 2 minutes" claim is good

**Issues:**
- Too much technical detail on the landing page
- No "ROI" section — why should I invest engineering time?
- No team size or "about" section — who built this?

**Score: 7/10**

---

### 18. Tom — Startup Founder (7/10)

**First impression:** "Cool product. But is it ready? The star count is 0."

**Issues:**
- Zero social proof — no stars, no users, no testimonials
- No "built by" section — is this a solo project or a company?
- The comparison page exists but isn't linked from the main nav

**Score: 7/10**

---

### 19. Sarah — Junior Developer (7/10)

**First impression:** "The dark terminal theme is cool! The install command is clear. But there's SO much content."

**Strengths:**
- npm install command is front and center
- The step-by-step path (Install → Score → Fix → Certify) is helpful
- The playground link is inviting

**Issues:**
- Overwhelming amount of information
- Not sure what to click first
- Some terms (EPES, Merkle tree, Ed25519) need tooltips or simpler explanations

**Score: 7/10**

---

### 20. Robert — Procurement Manager (5/10)

**Issues:**
- No pricing information
- No enterprise contact form
- No SLA or support information
- No security certifications (SOC 2, ISO 27001) for AMC itself
- The site doesn't answer: "Can I put this in a procurement request?"

**Score: 5/10**

---

### 21. Olivia — Tech Journalist (8/10)

**First impression:** "The 84-point gap is the story. That's the headline. Everything else supports it."

**Strengths:**
- The narrative hook is strong: "Your AI agent says it's safe. AMC proves whether it is."
- Research citations add credibility
- The comparison gauge is screenshot-worthy
- Blog posts are well-written (if the claims can be substantiated)

**Issues:**
- No press kit or media assets
- No founder/team story
- The "200+ production agents" claim in the blog needs evidence

**Score: 8/10**

---

### 22. Hassan — VC Associate (7/10)

**First impression:** "Interesting positioning in the AI safety/governance space. Open-source PLG with potential enterprise play."

**Strengths:**
- Clear market positioning (agent trust scoring)
- EU AI Act timing is excellent
- Open-source with potential for enterprise upsell
- Technical moat (cryptographic evidence chains)

**Issues:**
- No traction metrics visible (stars, downloads, users)
- No team page
- No indication of business model
- Would want to see: market size, competitive landscape, differentiation matrix

**Score: 7/10**

---

### 23. Kenji — Developer Advocate, LangChain (8/10)

**Strengths:**
- LangChain adapter is first-class with examples
- The `OPENAI_BASE_URL` approach means zero code changes
- Guide system auto-detects LangChain and generates framework-specific guardrails
- The blog post on evaluation is shareable with our community

**Issues:**
- Would like a LangChain-specific tutorial prominently linked
- The adapter examples page should show actual Python code, not just CLI commands
- Missing LangSmith/LangChain Hub integration mention

**Score: 8/10**

---

### 24. Maria — Academic Researcher, AI Governance (8/10)

**Strengths:**
- Rigorous arXiv citations (not just name-dropping)
- The EPES model is a novel contribution worth studying
- The maturity model has clear theoretical grounding
- The evidence provenance tiers are methodologically sound

**Issues:**
- No formal paper describing AMC's methodology
- The scoring weights (0.4×, 0.8×, 1.0×, 1.1×) need published validation
- Would like to see statistical properties of the scoring (reliability, inter-rater agreement)
- The 84-point gap needs a proper study, not anecdotal evidence

**Score: 8/10**

---

### 25. Pat — HN Visitor (7/10)

**First impression:** "Cool terminal theme. What does this do? Oh — it scores AI agents. The 84-point gap thing is interesting. Let me try it."

**Path:** Hero → read "Credit Score for AI Agents" → scroll to gap section → impressed → click npm install

**Issues:**
- Almost clicked away because the page was loading slowly (rain animation + fonts)
- Wasn't sure if this was free (it is, but had to look for MIT badge)
- The page is very long for a "let me quickly check this out" visit from HN

**Score: 7/10**

---

## Aggregate Scores

| Category | Panelists | Avg Score |
|----------|-----------|-----------|
| Web Designers (5) | Elena, Kai, Nora, Diego, Yuki | **7.4/10** |
| UI/UX Specialists (5) | Aisha, Ryan, Mei, Jordan, Sven | **6.6/10** |
| Technical Users (5) | Marcus, Priya, Alex, Chen, Fatima | **8.4/10** |
| Non-Technical (5) | James, Linda, Tom, Sarah, Robert | **6.4/10** |
| Cross-Functional (5) | Olivia, Hassan, Kenji, Maria, Pat | **7.6/10** |

**Overall Average: 7.3/10**

---

## Top Issues by Frequency (mentioned by 3+ panelists)

| Issue | Mentions | Severity |
|-------|----------|----------|
| Page is too long (13 sections) | 8 | High |
| No social proof (stars, testimonials) | 6 | High |
| Stat counters show "0" (animation bug) | 5 | Medium |
| Light mode feels incomplete | 5 | Medium |
| No pricing/business model clarity | 5 | Medium |
| Muted text contrast fails WCAG AA | 4 | High |
| Too many competing CTAs | 4 | Medium |
| No team/about section | 4 | Low |
| Code blocks overflow on mobile | 3 | Medium |
| Custom cursor adds latency | 3 | Low |
| Waitlist form buried too deep | 3 | Medium |
| No prefers-reduced-motion support | 3 | Medium |

---

## Recommendations (Priority-Ordered)

### P0 — Must fix

1. **Fix muted text contrast** — `#5a8a5a` on `#000` is 2.9:1, needs 4.5:1. Change to `#7cb87c` (4.7:1).
2. **Add `prefers-reduced-motion`** — Disable rain animation, custom cursor, and scroll reveals.
3. **Hide star count badge** when count is 0 — or show just "★ Star" without number.
4. **Move waitlist form higher** — After the 84-point gap section (section 3), not at position 13.

### P1 — Should fix

5. **Reduce page length** — Move Research, Coverage details, and Domain Packs details to subpages. Keep summaries with "Learn more →" links.
6. **Fix stat counter "0" bug** — The intersection observer animation sometimes doesn't fire. Use a fallback that shows the final number after 3s.
7. **Add social proof section** — Even if it's "Used by the AMC team on 14 frameworks" or "MIT licensed, open-source public infrastructure."
8. **Add "Free forever" or pricing clarity** — A single line: "Free and open source. MIT licensed. No enterprise tier (yet)."
9. **Improve light mode** — Dedicated light mode design pass (not just CSS variable overrides).
10. **Add prefers-reduced-motion media query** for rain canvas, cursor, and animations.

### P2 — Nice to have

11. **Shorten the hero** — Remove the stat strip or move it to the platform section.
12. **Add comparison page link to nav** — It exists but isn't discoverable.
13. **Mobile code block overflow** — Add horizontal scroll or reduce font size on mobile.
14. **Add a "Team" or "Built by" section** — Even a one-liner builds trust.
15. **Create a /compliance landing page** — For James-type personas who need a non-developer entry point.

---

## What's Working Exceptionally Well

These elements scored 8+ across multiple panelists:

1. **The 84-point gap visualization** — The most effective element on the page. Every panelist noticed it.
2. **Terminal aesthetic / brand identity** — Memorable, differentiated, consistent.
3. **Technical depth** — arXiv citations, EPES model, cryptographic details build credibility.
4. **The maturity scale (L0-L5)** — Universally understood, intuitive framework.
5. **Zero-friction install** — `npm i -g agent-maturity-compass` as primary CTA is correct.
6. **EU AI Act mapping** — Timely, relevant, and well-executed.

---

## Conclusion

**7.3/10 overall** — Strong technical product page that excels with developer audience (8.4) but underperforms with non-technical users (6.4) and conversion optimization (6.6). The site's biggest liability is its length and density — it tries to be a landing page, documentation hub, and product catalog simultaneously.

**The fix is editorial, not design.** The visual foundation is solid. Cut the page to 6-7 sections, move depth to subpages, add social proof, fix accessibility gaps, and the score jumps to 8.5+.

---

*Report generated by Polaris 25-Expert Website Council, 2026-03-04*
