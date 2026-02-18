# AMC Website Wireframes (Text-Based)
> Structure for development. Each section = one viewport height (approx).

---

## DESKTOP LAYOUT (1280px)

### [SECTION 1: HERO]
```
┌─────────────────────────────────────────────────────────────┐
│  NAV: [AMC Logo/Compass]        [About] [How it works] [CTA]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────────┐  ┌──────────────────────┐    │
│   │                         │  │   [COMPASS ANIMATION] │    │
│   │  Turn your AI agents    │  │   Needle drifting →   │    │
│   │  into an auditable,     │  │   → settling to       │    │
│   │  scalable system —      │  │   true north          │    │
│   │  not a science          │  └──────────────────────┘    │
│   │  experiment.            │                               │
│   │                         │                               │
│   │  [subhead text]         │                               │
│   │                         │                               │
│   │  [GET COMPASS SPRINT]   │                               │
│   │  [See sample →]         │                               │
│   └─────────────────────────┘                               │
│                                                             │
│  Built for teams deploying agents where failures are expensive  │
└─────────────────────────────────────────────────────────────┘
```

### [SECTION 2: THE PROBLEM]
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│        AGENT PROGRAMS RARELY FAIL LOUDLY.                   │
│              THEY FAIL QUIETLY.                             │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Shallow  │  │  Silent  │  │  Cost    │  │ Unclear  │  │
│  │  evals   │  │  drift   │  │  creep   │  │governance│  │
│  │  [icon]  │  │  [icon]  │  │  [icon]  │  │  [icon]  │  │
│  │ [detail] │  │ [detail] │  │ [detail] │  │ [detail] │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│                                                             │
│         If you can't verify maturity, you can't scale.      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### [SECTION 3: THE SOLUTION]
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│     AMC is not a slide deck. It's a working compass.        │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  SAMPLE SCORECARD (blurred/watermarked)              │  │
│  │  ┌────────┬────────┬────────┬────────┬────────┐      │  │
│  │  │Gov     │Sec     │Eval    │Reliab  │Cost    │      │  │
│  │  │L4 ████ │L3 ███  │L2 ██   │L3 ███  │L2 ██   │      │  │
│  │  └────────┴────────┴────────┴────────┴────────┘      │  │
│  │  [WATERMARK: SAMPLE — AMC]                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### [SECTION 4: HOW IT WORKS]
```
┌─────────────────────────────────────────────────────────────┐
│                    HOW IT WORKS                             │
│                                                             │
│   [1] ──────────────── [2] ──────────────── [3]            │
│   ASSESS            SCORE              ROADMAP              │
│   Map your          Evidence-backed    30/60/90             │
│   agent system       scoring across     day plan +           │
│   + workflows        7 dimensions       exec deck            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### [SECTION 5: WHAT YOU GET]
```
┌─────────────────────────────────────────────────────────────┐
│              COMPASS SPRINT — $5,000                        │
│                   5 Business Days                           │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ✓ Maturity scorecard (7 dimensions, evidence)      │    │
│  │ ✓ Gap analysis                                     │    │
│  │ ✓ 30/60/90 roadmap                                 │    │
│  │ ✓ Evaluation plan                                  │    │
│  │ ✓ Security + governance controls                   │    │
│  │ ✓ Exec deck + technical appendix                   │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│         [BOOK A DISCOVERY CALL]  [REQUEST SAMPLE]          │
└─────────────────────────────────────────────────────────────┘
```

### [SECTION 6: WHO IT'S FOR / NOT FOR]
### [SECTION 7: FAQ]
### [SECTION 8: FINAL CTA]

---

## MOBILE LAYOUT (375px)
- Single column throughout
- Sticky CTA bar (bottom) on mobile: "Book a Call"
- Problem cards: 2x2 grid, no crowded UI
- Score bars stack vertically
- Nav: hamburger menu, slides in from right
- CTA always visible once viewport is short

---

## INTERACTION STATES

| Element | Default | Hover | Active |
|---------|---------|-------|--------|
| Primary CTA | Gold bg | scale(1.02) + shadow | scale(0.98) |
| Nav links | White 60% | White 100% + gold underline | Gold |
| Dimension cards | Navy bg | translateY(-2px) + border glow | pressed |
| Sample preview | Blurred | "Request full sample" overlay | - |
