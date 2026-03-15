# Platform Engineer Quickstart

If you are evaluating AMC for a team, platform, or internal standard, start here.

## Goal

Determine whether AMC can be integrated into your existing stack with low friction and high trust.

## Start here

1. Read `docs/COMPATIBILITY_MATRIX.md`
2. Read `docs/INSTALL_PACKAGES.md`
3. Read `docs/STARTER_BLUEPRINTS.md`
4. Read `docs/DEPLOYMENT.md` and `docs/SECURITY.md`

## Suggested first workflow

```bash
amc doctor
amc quickscore
amc assurance run --all
amc trace list
amc business report
```

## If you care about CI and controlled rollout

Read:
- `docs/integrations/ci-cd.md`
- `docs/RELEASE_CADENCE.md`
- `docs/SUPPORT_POLICY.md`
- `docs/OPS_HARDENING.md`

## What you are really checking

- Does AMC work with your existing frameworks?
- Can it run in CI without drama?
- Are the outputs credible enough for internal stakeholders?
- Is the deployment/security model sane enough to trust?
