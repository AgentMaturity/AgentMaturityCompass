# Mirofish Synthesis: Actionable Issues (AMC-83)

## Critical (pre-launch blockers)
1. **Demo GIF/video for README** — every competitor has one. Record `quickscore --rapid` + `fix` in asciinema.
2. **npm publish** — can't launch without being on npm. Blocked on Sid.
3. **Test coverage to 70%+** — 53% undermines credibility for a trust tool.

## High Priority (launch quality)
4. **Link vs-promptfoo.html** from compare page nav and landing page
5. **Remove website backup files** (index-backup-*.html)
6. **Simplify `amc --help`** — show 10 essential commands, not 376
7. **Blog content** — need 3+ posts: Philosophy ✅, Tutorial, "How We Score"
8. **GitHub Release v1.0.0** — blocked on npm publish

## Medium Priority (post-launch polish)
9. **Search for docs site** — 316 docs need discoverability
10. **Enterprise dashboard polish** — `amc dashboard open` should wow
11. **TypeDoc API reference** — proper generated docs from source
12. **Mobile responsive check** on all website pages
13. **Analytics** — Plausible or similar for launch metrics

## Low Priority (nice to have)
14. **`amc tour`** — interactive onboarding wizard
15. **VS Code extension scaffold** — market expansion
16. **Docker image publish** — needs v-tag release
17. **ADR expansion** — add 5 more ADRs covering adapter architecture, scoring module design

## Issues to Create in Linear
From this synthesis, the new issues that should be created:
- "Simplify `amc --help` default output" (High)
- "Remove website backup files" (Quick win)
- "Link vs-promptfoo from navigation" (Quick win)
- "Write 2 more blog posts for launch" (High)
- "Add docs search" (Medium)
