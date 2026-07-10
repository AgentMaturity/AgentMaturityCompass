# AMC Troubleshooting

Quick answers for the most common adoption and setup failures.

## First thing to run

```bash
amc doctor
```

If AMC feels broken, confusing, or half-initialized, start there.

## Common problems

### `amc` command not found

Install AMC first:

```bash
curl -fsSL https://agentmaturity.co/install.sh | sh
```

Or run without installing:

```bash
curl -fsSL https://agentmaturity.co/install.sh | sh && amc
```

### Install fails on Node version / native module issues

Use Node 20 or 22 LTS.

AMC is happiest on LTS runtimes.

### Studio or gateway does not start

Try:

```bash
amc up
amc doctor
```

Then inspect the related deployment docs if you are using Docker/Compose/Helm.

### Vault is locked

Unlock it before running flows that need signing or protected operations.

```bash
amc vault unlock
```

### Full score works, but deeper workflows feel confusing

Read these in order:
- `docs/QUICKSTART.md`
- `docs/COMPATIBILITY_MATRIX.md`
- `docs/STARTER_BLUEPRINTS.md`

### Example project does not run

Check:
1. framework-specific dependencies are installed
2. provider credentials are present if required
3. you are using the example's setup script when provided
4. you are not assuming every example is zero-credential

### Docs and CLI seem inconsistent

Prefer:
- current stable docs
- commands confirmed by `amc --help`
- changelog for recent renames/deprecations

If you find a mismatch, file an issue — that kind of drift is exactly the sort of thing that makes OSS adoption suck.

## Recommended fix flow

```bash
amc doctor
amc up
amc fix-signatures
amc adapters verify
```

## Getting unstuck

If you still hit a wall:
- search existing GitHub issues/discussions
- include your install path, OS, Node version, and exact command/output
- include whether you are using npm, Homebrew, Docker, or source install
