# Contributing to AMC

Thanks for your interest in contributing to the Agent Maturity Compass. Every contribution helps make AI agent trust scoring better for everyone.

## Quick Setup

```bash
git clone https://github.com/thewisecrab/AgentMaturityCompass.git
cd AgentMaturityCompass
npm ci
npm run build
```

## Running Tests

```bash
# TypeScript (2478 tests)
npm test

# Python platform (1586 tests)
cd platform/python && python3 -m pytest tests/ -q

# Or from repo root
python3 -m pytest platform/python/tests/ -q
```

All tests must pass before submitting a PR.

## Making Changes

1. Fork the repo
2. Create a branch: `git checkout -b my-feature`
3. Make your changes
4. Run `npm run build` — must compile with zero TypeScript errors
5. Run `npm test` — all tests must pass
6. Commit with a descriptive message
7. Push and open a PR

## Code Style

- TypeScript for core modules (`src/`)
- Python for platform modules (`platform/python/`)
- Use existing patterns — look at similar files before writing new ones
- Add tests for new functionality
- Keep CLI commands consistent: `--json` flag for machine output, colored human output by default

## What to Work On

- Check [good first issues](https://github.com/thewisecrab/AgentMaturityCompass/labels/good%20first%20issue) for beginner-friendly tasks
- Browse [GitHub Discussions](https://github.com/thewisecrab/AgentMaturityCompass/discussions) for ideas and questions
- Look at open issues for bugs and feature requests

## PR Process

1. PRs are reviewed by maintainers
2. CI must pass (build + tests)
3. One approval required to merge
4. Squash merge preferred for clean history

## Questions?

- [GitHub Discussions](https://github.com/thewisecrab/AgentMaturityCompass/discussions) — best place for questions
- Open an issue if you find a bug
- Security issues → see [SECURITY.md](SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
