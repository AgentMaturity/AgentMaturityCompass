# AMC website

The public site for [Agent Maturity Compass](https://github.com/AgentMaturity/AgentMaturityCompass), served at
agentmaturity.co.

## Preview it

The pages in this folder are plain HTML, CSS and JavaScript, but some files the pages load are added only by the
build: the Inter and Space Mono fonts (`fonts/`), the docs renderer (`docs/vendor/marked.min.js`) and the docs
guides (`docs/content/`). Opened straight from this folder, the pages show fallback fonts and the docs app cannot
load. Preview a build instead:

```bash
node scripts/build-pages-site.mjs --out /tmp/amc-site   # the output folder must be empty or new
python3 -m http.server 8000 --directory /tmp/amc-site
```

Then open http://127.0.0.1:8000/.

## How it is published

`.github/workflows/pages.yml` runs the same build on every push to `main` that touches the site, the docs or the
source, and publishes the output to GitHub Pages. GitHub Pages serves `404.html` for any unknown address.
`netlify.toml` holds the same rule for a Netlify deploy: it has no catch-all rewrite.

## What lives where

- `home.css` is the design system; `pages.css` adds inner-page parts; `docs-pages.css` adds reading pages (docs,
  comparisons, API). Every page copies the nav and footer from `index.html`.
- `industry-packs.json` and the `station-*.html` pages are generated from the pack registry:
  `npm run gen-website-packs`. Do not edit them by hand.
- `changelog.html` gets each release's notes from `CHANGELOG.md`: `npm run gen:changelog-page`.
- `og-card.png` is rendered from `scripts/brand/og-card.html`: `npm run brand:render`.
- Console pictures in `img/` are taken by `npm run capture:site-shots`.
