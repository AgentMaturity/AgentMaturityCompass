# AMC Marketing Website

Static marketing site for [Agent Maturity Compass](https://github.com/AgentMaturity/AgentMaturityCompass).

## Local Preview

Open `index.html` in any browser — no build step required.

## Deploy to GitHub Pages

### Publish

This site is static source. There is no required build step for local preview.

If GitHub Pages is configured for this repo, publish one of these ways:

#### Option A: GitHub Pages from branch/folder

1. Go to **Settings → Pages**
2. Set Source to **Deploy from a branch**
3. Select `main` branch, `/website` folder
4. Save — site is live in ~60 seconds

#### Option B: GitHub Actions

If you add a Pages workflow later, pushing updated website files to `main` is the natural deploy path.

Current repo note: verify the workflow file exists before relying on GitHub Actions deployment.
