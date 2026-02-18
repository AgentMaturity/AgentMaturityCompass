# AMC Website — Agent Maturity Compass

> Measure what matters. Scale what's safe.

A premium, conversion-optimized static website for the Agent Maturity Compass assessment service. Zero dependencies — works offline, deploys anywhere.

---

## Files

| File | Description |
|------|-------------|
| `index.html` | Main landing page — hero, problem, solution, pricing, FAQ, CTA |
| `score-demo.html` | Interactive 5-question maturity assessment demo |
| `sample-report.html` | Sample assessment report for fictional "InvoiceBot v2" |

## Quick Start

```bash
# Local preview
open index.html
# or
python3 -m http.server 8000
```

## Deployment

All files are static HTML with embedded CSS/JS. No build step required.

### GitHub Pages
```bash
# From repo root
git add AMC_OS/WEBSITE/
git commit -m "Deploy AMC website"
git push
# Enable Pages in repo Settings → point to /AMC_OS/WEBSITE/ or copy files to root
```

### Vercel
```bash
cd AMC_OS/WEBSITE
npx vercel --prod
```

### Netlify
Drag the `WEBSITE/` folder into Netlify's deploy UI, or:
```bash
cd AMC_OS/WEBSITE
npx netlify deploy --prod --dir=.
```

### Any Static Host
Upload `index.html`, `score-demo.html`, and `sample-report.html` to any web server or CDN. No server-side processing needed.

---

## Customization

### Updating Copy

All content is inline in the HTML files. Search and replace:

| What | Where | Search for |
|------|-------|------------|
| Company email | All files | `hello@agentmaturity.com` |
| Pricing | `index.html` | `$5,000` / `$3,000–$15,000` |
| Hero headline | `index.html` | `Turn your AI agents` |
| FAQ answers | `index.html` | `<div class="faq-answer">` |
| Trust/social proof | `index.html` | `social-proof` section |

### Updating Colors

Color variables are defined in `:root` at the top of each file's `<style>`:

```css
:root {
  --navy: #0A0F1E;
  --gold: #C9A84C;
  --white: #F8F8F0;
  --gray: #4A5568;
  --green: #10B981;
  --red: #EF4444;
  --amber: #F59E0B;
}
```

### Customizing the Score Demo

Edit `score-demo.html` — the questions array near the top of the `<script>` block:

```javascript
const questions = [
  {
    dimension: "Governance",
    question: "How is ownership of your AI agents defined?",
    options: [
      { level: 1, text: "No defined ownership" },
      { level: 2, text: "Informal ownership..." },
      // ...
    ]
  },
  // Add/modify questions here
];
```

To add questions: push new objects to the array. The progress bar and scoring auto-adapt.

### Customizing the Sample Report

Edit `sample-report.html` — dimension scores and evidence are in the HTML directly. Each dimension is a `<div class="dimension-card">` block.

---

## Design System

- **Background:** Deep Navy `#0A0F1E`
- **Accent:** Compass Gold `#C9A84C`
- **Text:** Signal White `#F8F8F0`
- **Typography:** system-ui stack, 16px base
- **Spacing:** 8px grid
- **Max width:** 1280px (index), 720px (demo), 960px (report)
- **Animations:** CSS-only with `prefers-reduced-motion` support

## Accessibility

- WCAG AA compliant color contrast
- All animations respect `prefers-reduced-motion: reduce`
- Semantic HTML5 with ARIA labels
- Keyboard navigable (FAQ accordion, demo questions)
- Print styles on sample report

## Performance

- Zero external requests (no fonts, no CDNs, no analytics)
- Total size: ~50KB across all files
- First paint: instant (no blocking resources)

---

## License

© Agent Maturity Compass. All rights reserved.
