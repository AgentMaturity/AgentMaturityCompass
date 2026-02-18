# AMC Website Style Guide — Awwwards Grade
> Da Vinci Standard: Proportion. Harmony. Clarity. Craft.

---

## Brand Identity

**Name:** Agent Maturity Compass (AMC)
**Tagline:** Measure what matters. Scale what's safe.
**Voice:** Expert, direct, honest. Not corporate. Not startup-hype. Earned authority.

---

## Color Palette

| Name | Hex | Use |
|------|-----|-----|
| Deep Navy | #0A0F1E | Primary background, authority, depth |
| Compass Gold | #C9A84C | Accent, CTA, compass motif highlight |
| Signal White | #F8F8F0 | Body text, light backgrounds |
| Evidence Gray | #4A5568 | Secondary text, subtle elements |
| Alert Amber | #F59E0B | Warning states only |
| Verified Green | #10B981 | Confirmed/evidence states |
| Risk Red | #EF4444 | Gap/risk indicators only |

**Rule:** Navy + Gold on white = the premium default. Never mix more than 2 accent colors per view.

---

## Typography

**Primary font:** Inter (UI, body, labels)
- Body: Inter 400, 16px/1.6
- UI Labels: Inter 500, 14px
- Strong: Inter 600

**Display font:** DM Serif Display (headlines, pull quotes, key moments)
- H1: DM Serif Display, 56–72px, tracking -0.02em
- H2: DM Serif Display, 36–48px
- H3: Inter 600, 24–32px

**Rule:** Serif for gravitas (headlines). Sans for clarity (everything else).

---

## Spacing System

Base unit: 8px

| Token | Size | Use |
|-------|------|-----|
| xs | 4px | Tight label spacing |
| sm | 8px | Icon padding, small gaps |
| md | 16px | Standard element spacing |
| lg | 32px | Section internal spacing |
| xl | 64px | Section breaks |
| 2xl | 128px | Hero/major section padding |

**Grid:** 12-column, max-width 1280px, 24px gutters, 80px page margins (desktop)

---

## Motion Principles

1. **Motion = Meaning**: Every animation must communicate something (not just decorate)
2. **Compass metaphor**: Core animation is the needle finding true north (chaos → clarity)
3. **Timing**: Fast in (150ms), slow out (400ms). Ease: cubic-bezier(0.25, 0.46, 0.45, 0.94)
4. **Never**: Bounce, spin, wiggle, or flash. We are a trust product.

**Key animations:**
- Hero: Compass needle drifts → settles on page load (300ms chaos, 600ms settle)
- Scroll: Dimension cards reveal evidence tooltips on hover
- CTA: Subtle scale(1.02) on hover, 200ms; gold underline slide-in
- Score bars: Fill left-to-right as section enters viewport
- Section transitions: Fade-up, 20px offset, 400ms, staggered 80ms

**Accessibility:** All animations respect `prefers-reduced-motion: reduce`

---

## Component Library

### Buttons
- Primary: Gold bg (#C9A84C) + Navy text, 14px Inter 600, 48px height, 24px horizontal padding, 6px border-radius
- Secondary: Transparent + Gold border + Gold text, same sizing
- Ghost: Transparent + Signal White text/border

### Cards
- Background: #111827 (slightly lighter than page bg)
- Border: 1px solid rgba(201, 168, 76, 0.2)
- Border-radius: 12px
- Hover: border-color opacity 0.6, translateY(-2px), 250ms

### Score Bars (maturity dimensions)
- Track: rgba(255,255,255,0.1), 4px height
- Fill: gradient from Evidence Gray → Compass Gold
- Animated fill on scroll-enter

### Evidence Badges
- Small pill: Verified Green bg, white text, 10px Inter 600, border-radius 999px
- States: Verified ✓ | Partial ~ | Missing ✗

---

## Iconography

**Style:** Thin-stroke line icons (1.5px stroke), consistent with technical drawing aesthetic
**Size system:** 16px / 24px / 32px
**Source:** Lucide or Heroicons (free, consistent)
**Custom:** Compass rose icon as brand mark (precision, direction, navigation)

---

## Photography & Visual Assets

- **Style:** Abstract technical — circuit patterns, cartographic grids, topographic contours
- **Never:** Generic stock photos of people staring at laptops
- **Preferred:** Data visualizations, compass imagery, architectural precision
- **Illustration:** Technical line art, blueprint style

---

## Layout Philosophy

1. **Generous whitespace** — breathing room signals confidence and premium
2. **Left-aligned text** — easier to read, feels editorial
3. **Clear hierarchy** — one focal point per section
4. **Evidence preview** — every claim accompanied by a visual artifact hint
5. **Progressive disclosure** — show enough to trust, gate enough to intrigue

---

## Awwwards Checklist

Design (40%):
- [ ] Consistent visual system throughout
- [ ] Typography conveys hierarchy and character
- [ ] Color used purposefully (not decoratively)
- [ ] Visual weight guides eye to conversion points

UX/UI (30%):
- [ ] Navigation immediately obvious
- [ ] CTA always reachable without scrolling (sticky or repeated)
- [ ] Mobile-first responsive
- [ ] WCAG AA accessibility minimum

Creativity (20%):
- [ ] Concept (Chaos → Compass) expressed visually, not just in copy
- [ ] Unexpected but purposeful motion/interaction
- [ ] Brand world feels cohesive and memorable

Content (10%):
- [ ] Precise, no jargon without explanation
- [ ] Every section serves a conversion or trust purpose
- [ ] No filler text
