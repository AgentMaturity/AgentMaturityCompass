# AMC Website Style Guide

> Agent Maturity Compass — Premium consulting brand with a cartographic/compass visual identity.
> Last updated: 2026-02-19

---

## 1. Color System

### Primary Palette

| Token | Hex | Usage |
|-------|-----|-------|
| **Deep Navy** | `#0A0F1E` | Page backgrounds, dark sections |
| **Compass Gold** | `#C9A84C` | Accents, CTAs, section labels, active states |

### Neutral Palette

| Token | Hex | Usage |
|-------|-----|-------|
| **White** | `#F8F8F0` | Body text on dark, light backgrounds |
| **Warm Gray** | `#4A5568` | Secondary text, captions, muted UI |
| **Navy Light** | `#111827` | Card backgrounds, elevated surfaces |
| **Navy Mid** | `#1a2332` | Alternate section backgrounds, nav |

### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| **Success** | `#10B981` | Positive scores, confirmations |
| **Alert** | `#EF4444` | Errors, critical warnings |
| **Warning** | `#F59E0B` | Caution states, medium scores |

### Gold Variants

| Variant | Value | Usage |
|---------|-------|-------|
| Gold 20% | `rgba(201, 168, 76, 0.20)` | Hover backgrounds, card borders |
| Gold 10% | `rgba(201, 168, 76, 0.10)` | Subtle section tints, tag backgrounds |

### Contrast Ratios (WCAG AA ≥ 4.5:1 text, ≥ 3:1 large text)

| Foreground | Background | Ratio | Pass |
|------------|------------|-------|------|
| White `#F8F8F0` | Deep Navy `#0A0F1E` | **16.8:1** | ✅ AAA |
| Gold `#C9A84C` | Deep Navy `#0A0F1E` | **6.5:1** | ✅ AA |
| White `#F8F8F0` | Navy Light `#111827` | **15.2:1** | ✅ AAA |
| White `#F8F8F0` | Navy Mid `#1a2332` | **13.4:1** | ✅ AAA |
| Warm Gray `#4A5568` | Deep Navy `#0A0F1E` | **3.6:1** | ✅ AA Large |
| Deep Navy `#0A0F1E` | Gold `#C9A84C` | **6.5:1** | ✅ AA |

> **Rule:** Never use Gold text on White backgrounds (fails contrast). Gold is for dark surfaces only.

### CSS Custom Properties

```css
:root {
  --color-navy:       #0A0F1E;
  --color-gold:       #C9A84C;
  --color-white:      #F8F8F0;
  --color-gray:       #4A5568;
  --color-navy-light: #111827;
  --color-navy-mid:   #1a2332;
  --color-success:    #10B981;
  --color-alert:      #EF4444;
  --color-warning:    #F59E0B;
  --color-gold-20:    rgba(201, 168, 76, 0.20);
  --color-gold-10:    rgba(201, 168, 76, 0.10);
}
```

---

## 2. Typography Scale

### Font Stacks

```css
--font-body:    'Inter', system-ui, -apple-system, sans-serif;
--font-accent:  Georgia, 'Times New Roman', serif;
```

- **Inter** — All body text, headings, UI elements.
- **Georgia / system-serif** — Pull quotes, testimonial text, accent phrases.

### Type Scale

| Element | Size | Weight | Line Height | Letter Spacing |
|---------|------|--------|-------------|----------------|
| **H1** | `clamp(40px, 5.5vw, 72px)` | 800 | 1.05 | `-0.03em` |
| **H2** | `clamp(30px, 4vw, 48px)` | 700 | 1.15 | `-0.02em` |
| **H3** | `clamp(20px, 2.5vw, 32px)` | 700 | 1.25 | `0` |
| **Body** | `16px` | 400 | 1.6 | `0` |
| **Body Large** | `18px` | 400 | 1.6 | `0` |
| **Small** | `13–14px` | 400 | 1.5 | `0` |
| **Label** | `13px` | 600 | 1.2 | `0.12em` |
| **Subhead** | `18–20px` | 600 | 1.4 | `0` |

### Weight Usage

| Weight | Token | Where |
|--------|-------|-------|
| 800 | Extra Bold | H1 headlines only |
| 700 | Bold | H2, H3 section heads |
| 600 | Semi Bold | Subheads, labels, button text |
| 400 | Regular | Body copy, descriptions |

### CSS

```css
h1 {
  font: 800 clamp(40px, 5.5vw, 72px)/1.05 var(--font-body);
  letter-spacing: -0.03em;
  color: var(--color-white);
}
h2 {
  font: 700 clamp(30px, 4vw, 48px)/1.15 var(--font-body);
  letter-spacing: -0.02em;
}
h3 {
  font: 700 clamp(20px, 2.5vw, 32px)/1.25 var(--font-body);
}
.section-label {
  font: 600 13px/1.2 var(--font-body);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-gold);
}
blockquote, .accent-text {
  font-family: var(--font-accent);
  font-style: italic;
}
```

---

## 3. Spacing System

### Base Unit: `8px`

| Token | Value | Usage |
|-------|-------|-------|
| `--sp-1` | `4px` | Tight inline gaps |
| `--sp-2` | `8px` | Icon-to-text, small gaps |
| `--sp-3` | `12px` | Compact padding |
| `--sp-4` | `16px` | Card inner padding (small) |
| `--sp-6` | `24px` | Default inner padding, container gutter |
| `--sp-8` | `32px` | Card padding, element spacing |
| `--sp-12` | `48px` | Component gaps |
| `--sp-16` | `64px` | Sub-section spacing |
| `--sp-20` | `80px` | Medium section spacing |
| `--sp-28` | `112px` | Major section vertical padding |

### Layout

```css
.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
}
section {
  padding: 112px 0;
}
```

### Grid

- 12-column implicit grid via CSS Grid or Flexbox.
- Gap: `32px` desktop, `24px` tablet, `16px` mobile.
- Breakpoints: `640px` (sm), `768px` (md), `1024px` (lg), `1280px` (xl).

---

## 4. Component Library

### 4.1 Buttons

#### Primary (Gold)

```css
.btn-primary {
  background: var(--color-gold);
  color: var(--color-navy);
  font-weight: 600;
  font-size: 16px;
  padding: 14px 32px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.btn-primary:hover {
  transform: scale(1.03);
  box-shadow: 0 0 24px rgba(201, 168, 76, 0.3);
}
```

#### Secondary (Outline)

```css
.btn-secondary {
  background: transparent;
  color: var(--color-gold);
  border: 1.5px solid var(--color-gold);
  font-weight: 600;
  padding: 14px 32px;
  border-radius: 8px;
  transition: background 0.2s ease;
}
.btn-secondary:hover {
  background: var(--color-gold-10);
}
```

#### Ghost

```css
.btn-ghost {
  background: transparent;
  color: var(--color-gold);
  border: none;
  font-weight: 600;
  padding: 8px 16px;
  text-decoration: underline;
  text-underline-offset: 4px;
}
```

### 4.2 Cards

#### Pain Cards

- Background: `var(--color-navy-light)`
- Border-left: `3px solid var(--color-alert)` or semantic color
- Padding: `32px`
- Border-radius: `12px`
- Emoji/icon top-left, bold title, body text below

#### Dimension Cards

- Background: `var(--color-navy-light)`
- Border: `1px solid var(--color-gold-20)`
- Hover border: `1px solid var(--color-gold)`
- Padding: `32px`
- Border-radius: `12px`
- Include score bar (see 4.5)

#### Feature Cards

- Background: `var(--color-navy-mid)`
- Padding: `32px`
- Border-radius: `12px`
- Gold icon (32×32), H3 title, body description
- Hover: `transform: translateY(-4px)`

### 4.3 Section Labels

```html
<span class="section-label">Assessment Framework</span>
```

- Uppercase, `letter-spacing: 0.12em`, `font-size: 13px`, weight 600
- Color: `var(--color-gold)`
- Appears above every H2, with `margin-bottom: 16px`

### 4.4 Navigation

```css
nav {
  position: fixed;
  top: 0;
  width: 100%;
  z-index: 100;
  background: rgba(10, 15, 30, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--color-gold-10);
  padding: 16px 24px;
}
```

- Logo left, nav links center/right, CTA button far right.
- Links: `var(--color-gray)` default → `var(--color-white)` on hover.
- Active link: `var(--color-gold)`.
- Mobile: hamburger menu, full-screen overlay on navy background.

### 4.5 Score Indicators (0–5 Scale)

```html
<div class="score-bar" role="meter" aria-valuenow="3" aria-valuemin="0" aria-valuemax="5" aria-label="Strategy score: 3 of 5">
  <div class="score-fill" style="width: 60%"></div>
</div>
```

```css
.score-bar {
  width: 100%;
  height: 8px;
  background: var(--color-navy-mid);
  border-radius: 4px;
  overflow: hidden;
}
.score-fill {
  height: 100%;
  background: var(--color-gold);
  border-radius: 4px;
  transition: width 0.6s ease;
}
```

- Score labels: 0 = "Uncharted", 1 = "Exploring", 2 = "Navigating", 3 = "Orienting", 4 = "Charting", 5 = "Mastering"

### 4.6 Compass Rose SVG

- **Source:** Single `compass-rose.svg`, inlined or referenced via `<use>`.
- **Colors:** Stroke `var(--color-gold)`, fill none or `var(--color-gold-10)`.
- **Sizes:** Hero: `200–300px`, section accent: `80–120px`, icon: `24–32px`.
- **Animation:** Needle rotation only (see Motion § 5). No pulsing, no glow.
- **Alt text:** Always provide `aria-label="Compass rose"` or equivalent.
- **Don't:** Rasterize, add drop shadows, change aspect ratio, use as a button.

---

## 5. Motion Principles

> *"Every animation has a semantic reason."*

### Scroll Reveal

```css
.reveal {
  opacity: 0;
  transform: translateY(32px);
  transition: opacity 0.7s ease, transform 0.7s ease;
}
.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}
```

Trigger via `IntersectionObserver` at `threshold: 0.15`. Each element animates once; do not replay.

### Hover States

- Interactive cards: `transform: scale(1.02)` + subtle shadow lift.
- Buttons: `transform: scale(1.03–1.04)`.
- Links: color transition `0.2s ease`.

### Compass Needle

- Needle settles (rotates to rest) when the section scrolls into view.
- Purpose: represents "finding direction" — the product's core metaphor.
- Duration: `1.2s cubic-bezier(0.34, 1.56, 0.64, 1)` (slight overshoot, then settle).

### Reduce Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### Prohibited

- ❌ Parallax scrolling
- ❌ Auto-playing video
- ❌ Decorative/ambient animations (floating particles, pulsing glows)
- ❌ Page transition animations that delay content

---

## 6. Da Vinci QA Checklist

Apply every check to each page section before shipping.

| # | Check | Question | How to Apply |
|---|-------|----------|--------------|
| 1 | **Clarity** | Can a first-time visitor understand this in 5 seconds? | Read the section headline + first sentence aloud. If it needs explanation, rewrite. Remove jargon. |
| 2 | **Specificity** | Are claims concrete, not vague? | Replace "improve your AI" → "increase adoption score from 2.1 to 4.0 in 90 days." Numbers, timeframes, named outcomes. |
| 3 | **Truth** | Can we back every claim? | Every stat needs a source. Every testimonial needs a real name/company (or anonymised with permission). Delete what can't be proved. |
| 4 | **Friction** | What stops someone from acting right now? | Identify the next action. Is the CTA visible? Is the form short? Is pricing clear? Remove every unnecessary field/step. |
| 5 | **Aesthetics** | Does this section feel premium and intentional? | Check spacing consistency (8px grid), color contrast, typography hierarchy. No orphaned words. No misaligned elements. |
| 6 | **Continuity** | Does this section flow from the previous and into the next? | Read the last sentence of the prior section and the first sentence of this one. The transition should feel inevitable. |
| 7 | **Conversion** | Is there a clear path to the goal? | Every section either (a) builds desire or (b) provides a CTA. Hero → Problem → Solution → Proof → CTA. No dead ends. |
| 8 | **Proof** | Is there evidence visible near every claim? | Pair bold claims with logos, testimonial quotes, score screenshots, or case study links within the same viewport. |
| 9 | **Speed** | Does this section load fast? | Images < 200KB (WebP/AVIF). No layout shift. Largest Contentful Paint < 2.5s. Lazy-load below-fold images. |
| 10 | **Iteration** | What's the hypothesis we're testing? | Document: "We believe [change] will [metric] because [reason]." Ship, measure, revisit in 2 weeks. |

---

## 7. Accessibility Standards

### Semantic HTML

- Use landmarks: `<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`.
- One `<h1>` per page. Headings in order — never skip levels.
- Lists for nav items (`<ul><li><a>`).

### ARIA

- All interactive elements (buttons, links, inputs) have accessible names.
- Icon-only buttons: `aria-label="Menu"` or visually-hidden text.
- Score bars: `role="meter"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`.
- Decorative SVGs: `aria-hidden="true"`.

### Focus

```css
:focus-visible {
  outline: 2px solid var(--color-gold);
  outline-offset: 3px;
  border-radius: 4px;
}
:focus:not(:focus-visible) {
  outline: none;
}
```

- All interactive elements must be reachable via keyboard in logical order.
- Skip-to-content link as the first focusable element.

### Color

- Color is never the sole indicator of state (always pair with text, icon, or pattern).
- Test every page in grayscale to verify.

### Touch Targets

- Minimum `44×44px` for all interactive elements.
- On mobile nav, ensure link padding meets this threshold.

### Additional

- All images have descriptive `alt` text (or `alt=""` if purely decorative).
- Form inputs have associated `<label>` elements.
- Error messages are announced via `aria-live="polite"`.
- Test with screen reader (VoiceOver / NVDA) before each release.

---

*This style guide is the single source of truth for AMC website design decisions. When in doubt, refer here. When it's wrong, update it.*
