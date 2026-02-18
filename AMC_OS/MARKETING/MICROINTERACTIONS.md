# AMC Microinteractions & Motion Spec

---

## Core Animation: The Compass Settling

**Name:** `compass-settle`
**Trigger:** Page load
**Duration:** 900ms total

Phase 1 (0–300ms): Needle rotates randomly ±45° (chaos)
Phase 2 (300–900ms): Ease-out to 0° (true north)
CSS:
```
transform: rotate(var(--needle-angle));
transition: transform 600ms cubic-bezier(0.25, 0.46, 0.45, 0.94)
```

Implementation: SVG needle with CSS custom-property animation.

---

## Scroll Animations

| Element | Animation | Trigger | Duration |
|---------|-----------|---------|----------|
| Section headings | Fade up 20px | Enter viewport | 400ms |
| Problem cards | Stagger fade-up | Enter viewport | 400ms, 80ms delay each |
| Score bars | Fill from 0% to value | Enter viewport | 600ms, ease-out |
| How it works steps | Sequential reveal | Enter viewport | 300ms, 150ms delay each |
| FAQ items | Accordion expand | Click | 250ms |

**Library:** Intersection Observer API (no heavy libs)

---

## Hover States

**CTA Button:**
- Scale: 1.0 → 1.02
- Box shadow: 0 0 0 3px rgba(201, 168, 76, 0.3)
- Transition: 200ms ease

**Dimension Cards:**
- Border: opacity 0.2 → 0.6
- translateY: 0 → -2px
- Tooltip: evidence requirement appears

**Sample Preview:**
- Blur reduces from 8px → 6px
- Overlay: "Request full sample" fades in
- Cursor: pointer

---

## Form / Input States

- Focus: gold border (2px), gold shadow ring
- Error: red border, shake animation (300ms, 3 cycles, 4px amplitude)
- Success: green checkmark fade-in

---

## Accessibility

All animations wrapped with:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

No flashing content. All interactive elements keyboard-focusable. ARIA labels on all icon-only elements.
