# AMC CI Templates

Copy-paste starting points for integrating AMC into CI.

## Goal

Make it trivial to answer:
- does AMC install cleanly in CI?
- can we score or verify in pipelines?
- can we fail builds on trust/security gates?

---

## Unsigned Starter vs Signed Rollout

Use the unsigned path first when you only need local or CI dry-run coverage:

```bash
amc ci init --no-sign --agent <agentId>
```

This creates a workflow and gate policy that call `amc gate --no-sign`. It is useful for adoption and smoke testing, but it is not verifier-ready because policy signatures and maturity BOM signatures are intentionally skipped.

Graduate to signed CI when the gate outcome will be used for release approval, customer evidence, compliance review, or external audit:

```bash
amc setup
amc ci init --agent <agentId>
```

Secret handling for signed CI:

- Store the vault passphrase as a CI secret named `AMC_VAULT_PASSPHRASE`, or mount it from a secret file and set `AMC_VAULT_PASSPHRASE_FILE`.
- Do not commit passphrases, generated local passphrase files, or ad hoc secret files.
- Commit the generated workflow, `gatePolicy.json`, and `gatePolicy.json.sig` together.
- Remove `--no-sign` only after `amc gate` passes with signed policy verification in CI.

---

## Provider-Specific Signed CI Secret Examples

These examples are for signed CI only. Unsigned starter workflows should keep using `amc ci init --no-sign` and `amc gate --no-sign` until the signed gate passes.

### GitHub Actions

Create the repository secret:

```bash
gh secret set AMC_VAULT_PASSPHRASE
```

Use it only on the signed AMC step:

```yaml
- name: AMC signed gate
  env:
    AMC_VAULT_PASSPHRASE: ${{ secrets.AMC_VAULT_PASSPHRASE }}
  run: amc gate --bundle .amc/agents/<agentId>/bundles/latest.amcbundle --policy .amc/agents/<agentId>/gatePolicy.json
```

For a mounted passphrase file, store the file with your CI secret mechanism and set `AMC_VAULT_PASSPHRASE_FILE` to the mounted path.

### GitLab CI/CD

In GitLab, open `Settings > CI/CD > Variables` and create a masked, protected variable named `AMC_VAULT_PASSPHRASE`.

```yaml
amc_signed_gate:
  image: node:20
  script:
    - curl -fsSL https://agentmaturity.co/install.sh | sh
    - test -n "$AMC_VAULT_PASSPHRASE"
    - amc gate --bundle .amc/agents/<agentId>/bundles/latest.amcbundle --policy .amc/agents/<agentId>/gatePolicy.json
```

If your GitLab runner mounts secrets as files, set `AMC_VAULT_PASSPHRASE_FILE` to that file path instead of exposing the passphrase value.

### CircleCI

Use either a project environment variable or a restricted context:

```bash
circleci env var set AMC_VAULT_PASSPHRASE
```

```yaml
jobs:
  amc_signed_gate:
    docker:
      - image: cimg/node:20.11
    steps:
      - checkout
      - run: curl -fsSL https://agentmaturity.co/install.sh | sh
      - run:
          name: AMC signed gate
          command: amc gate --bundle .amc/agents/<agentId>/bundles/latest.amcbundle --policy .amc/agents/<agentId>/gatePolicy.json
```

For file-backed secrets, mount the file in the job and set `AMC_VAULT_PASSPHRASE_FILE` before the signed gate step.

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
      - run: curl -fsSL https://agentmaturity.co/install.sh | sh
      - run: amc doctor
      - run: amc
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
    - curl -fsSL https://agentmaturity.co/install.sh | sh
    - amc doctor
    - amc
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
      - run: curl -fsSL https://agentmaturity.co/install.sh | sh
      - run: amc doctor
      - run: amc
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
amc
```

Then add:

```bash
amc assurance run --all
amc ci redteam default --plugins injection --strategies direct --evil-mcp --mcp-attacks tool_poison --no-sign
```

Only after that should you start failing builds on stricter trust/compliance thresholds.

## Related docs

- `docs/integrations/ci-cd.md`
- `docs/STARTER_BLUEPRINTS.md`
- `docs/SUPPORT_POLICY.md`
- `docs/RELEASE_CADENCE.md`
