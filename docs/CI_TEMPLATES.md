# AMC CI Templates

Copy-paste starting points for integrating AMC into CI.

## Goal

Make it trivial to answer:
- does AMC install cleanly in CI?
- can we score or verify in pipelines?
- can we fail builds on trust/security gates?

---

## GitHub Actions

```yaml
name: amc-check
on: [push, pull_request]

jobs:
  amc:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm i -g agent-maturity-compass
      - run: amc doctor
      - run: amc quickscore
      - run: amc assurance run --all
```

## GitLab CI

```yaml
stages:
  - amc

amc_check:
  stage: amc
  image: node:20
  script:
    - npm ci
    - npm i -g agent-maturity-compass
    - amc doctor
    - amc quickscore
    - amc assurance run --all
```

## CircleCI

```yaml
version: 2.1
jobs:
  amc:
    docker:
      - image: cimg/node:20.11
    steps:
      - checkout
      - run: npm ci
      - run: npm i -g agent-maturity-compass
      - run: amc doctor
      - run: amc quickscore
      - run: amc assurance run --all

workflows:
  amc-workflow:
    jobs:
      - amc
```

---

## Practical next step

Start with:

```bash
amc doctor
amc quickscore
```

Then add:

```bash
amc assurance run --all
```

Only after that should you start failing builds on stricter trust/compliance thresholds.

## Related docs

- `docs/integrations/ci-cd.md`
- `docs/STARTER_BLUEPRINTS.md`
- `docs/SUPPORT_POLICY.md`
- `docs/RELEASE_CADENCE.md`
