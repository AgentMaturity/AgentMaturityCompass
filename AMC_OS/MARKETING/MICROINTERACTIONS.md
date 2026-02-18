# AMC Microinteractions & Motion Spec

---

## Core Animation: The Compass Settling

**Name:** `compass-settle`
**Trigger:** Page load
**Duration:** 900ms total

Phase 1 (0–300ms): Needle rotates randomly ±45° (chaos)
Phase 2 (300–900ms): Ease-out to 0° (true north)
CSS: `transform: rotate(var(--needle-angle)); transition: transform 600ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`

Implementation: SVG needle with CSS custom property animation.

```javascript
// Compass settle implementation
const needle = document.querySelector('.compass-needle');
let angle = (Math.random() - 0.5) * 90; // chaos phase: ±45°

needle.style.setProperty('--needle-angle', `${angle}deg`);

setTimeout(() => {
  needle.style.setProperty('--needle-angle', '0deg'); // settle to true north
}, 300);
```

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

```javascript
// Scroll animation base pattern
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animate-in');
      observer.unobserve(entry.target); // fire once
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));
```

CSS:
```css
[data-animate] {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 400ms ease, transform 400ms ease;
}
[data-animate].animate-in {
  opacity: 1;
  transform: translateY(0);
}
/* Stagger delays */
[data-animate]:nth-child(1) { transition-delay: 0ms; }
[data-animate]:nth-child(2) { transition-delay: 80ms; }
[data-animate]:nth-child(3) { transition-delay: 160ms; }
[data-animate]:nth-child(4) { transition-delay: 240ms; }
```

---

## Score Bar Animation

```css
.score-bar-fill {
  width: 0%;
  height: 4px;
  background: linear-gradient(90deg, #4A5568, #C9A84C);
  transition: width 600ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.score-bar-fill.animate-in {
  width: var(--score-value); /* set via data-score attribute */
}
```

```javascript
// Set score values from data attributes
document.querySelectorAll('.score-bar-fill').forEach(bar => {
  const score = bar.closest('[data-score]').dataset.score;
  bar.style.setProperty('--score-value', `${(score / 5) * 100}%`);
});
```

---

## Hover States

**CTA Button:**
- Scale: 1.0 → 1.02
- Box shadow: 0 0 0 3px rgba(201, 168, 76, 0.3)
- Transition: 200ms ease

```css
.btn-primary {
  transition: transform 200ms ease, box-shadow 200ms ease;
}
.btn-primary:hover {
  transform: scale(1.02);
  box-shadow: 0 0 0 3px rgba(201, 168, 76, 0.3);
}
.btn-primary:active {
  transform: scale(0.98);
}
```

**Dimension Cards (scorecard preview):**
- Border: opacity 0.2 → 0.6
- translateY: 0 → -2px
- Tooltip: evidence requirement appears

```css
.dimension-card {
  border: 1px solid rgba(201, 168, 76, 0.2);
  transition: border-color 250ms ease, transform 250ms ease;
}
.dimension-card:hover {
  border-color: rgba(201, 168, 76, 0.6);
  transform: translateY(-2px);
}
.dimension-card:hover .evidence-tooltip {
  opacity: 1;
  visibility: visible;
}
```

**Sample Preview (blurred):**
- Blur reduces from 8px → 6px
- Overlay: "Request full sample" fades in
- Cursor: pointer

```css
.sample-preview {
  filter: blur(8px);
  transition: filter 300ms ease;
  cursor: pointer;
}
.sample-preview:hover {
  filter: blur(6px);
}
.sample-preview:hover .request-overlay {
  opacity: 1;
}
```

---

## Nav Link Hover

```css
.nav-link {
  color: rgba(248, 248, 240, 0.6);
  position: relative;
  transition: color 200ms ease;
}
.nav-link::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 0;
  height: 1px;
  background: #C9A84C;
  transition: width 200ms ease;
}
.nav-link:hover {
  color: rgba(248, 248, 240, 1.0);
}
.nav-link:hover::after {
  width: 100%;
}
```

---

## FAQ Accordion

```css
.faq-answer {
  max-height: 0;
  overflow: hidden;
  transition: max-height 250ms ease;
}
.faq-item.open .faq-answer {
  max-height: 500px; /* generous upper bound */
}
.faq-chevron {
  transition: transform 250ms ease;
}
.faq-item.open .faq-chevron {
  transform: rotate(180deg);
}
```

---

## Form / Input States

```css
.form-input {
  border: 1px solid rgba(248, 248, 240, 0.2);
  transition: border-color 200ms ease, box-shadow 200ms ease;
}
.form-input:focus {
  border-color: #C9A84C;
  box-shadow: 0 0 0 3px rgba(201, 168, 76, 0.2);
  outline: none;
}
.form-input.error {
  border-color: #EF4444;
  animation: shake 300ms ease;
}
.form-input.success {
  border-color: #10B981;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
```

---

## Sticky Mobile CTA

```css
.mobile-sticky-cta {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px 24px;
  background: #0A0F1E;
  border-top: 1px solid rgba(201, 168, 76, 0.2);
  z-index: 100;
  display: none;
}
@media (max-width: 768px) {
  .mobile-sticky-cta {
    display: flex;
    justify-content: center;
  }
}
```

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

```html
<!-- Accessibility examples -->
<button class="btn-primary" aria-label="Get the Compass Sprint — book a discovery call">
  Get the Compass Sprint
</button>

<div role="img" aria-label="Compass needle settling from chaos to true north" class="compass-animation">
  <!-- SVG compass here -->
</div>

<button class="faq-trigger" aria-expanded="false" aria-controls="faq-answer-1">
  Does this replace our internal team?
</button>
```

---

## Performance Notes

- No GSAP or heavy animation libraries — native CSS + Intersection Observer only
- SVG compass: inline, no external requests
- All transitions use `transform` and `opacity` only (GPU-composited, no layout reflow)
- Score bar fills triggered once on viewport entry, then unobserved
- Total animation JS budget: < 2KB gzipped
