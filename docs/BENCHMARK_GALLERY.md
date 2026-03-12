# BENCHMARK_GALLERY.md — Real AMC proof artifacts from this repo

This page shows concrete artifacts already present in the repository.
No invented benchmarks. No synthetic customer theater.

## 1. README score badge pattern
AMC already documents a shareable badge pattern in the README.

### Where to see it
- `README.md` — badge block and badge example
- `docs/CI_TEMPLATES.md` — README badge pattern

### Why it matters
This gives users a visible proof format they can publish after running AMC.

---

## 2. CI trust gate example
AMC already includes a GitHub Action trust gate workflow.

### Real artifact
- `.github/workflows/amc-score.yml`

### Why it matters
This is the fastest path from “interesting repo” to “real release gate.”

---

## 3. Quickscore path
The repo already exposes a real first-action scoring path.

### Real artifact
- `README.md`
- `npx agent-maturity-compass quickscore`

### Why it matters
People can try the product wedge immediately instead of reading 40 pages first.

---

## 4. Example stacks
These example directories are already in the repo and should be treated as the public proof surface for compatibility.

### Real examples
- `examples/openclaw-amc-baseline/`
- `examples/openclaw/`
- `examples/langchain-python/`
- `examples/langchain-node/`
- `examples/langgraph-python/`
- `examples/crewai/`
- `examples/crewai-amc-github-actions/`
- `examples/openai-agents-sdk/`
- `examples/openai-compatible-lite-score/`
- `examples/claude-code/`
- `examples/gemini/`
- `examples/generic-cli/`
- `examples/semantic-kernel/`
- `examples/python-amc-sdk/`

### Why it matters
These are stronger than vague claims like “works with many frameworks.”

---

## 5. Release engineering proof
AMC includes explicit release workflow and release engineering coverage.

### Real artifacts
- `.github/workflows/release.yml`
- `.github/workflows/nightly-compatibility-matrix.yml`
- `tests/releaseEngineeringPack.test.ts`

### Why it matters
This supports the claim that AMC is trying to behave like a serious product, not just a pile of scripts.

---

## 6. Browser + CLI + CI proof
The public product entry surface now spans:
- browser playground
- CLI quickscore
- CI trust gate

### Real artifacts
- `website/playground.html`
- `README.md`
- `.github/workflows/amc-score.yml`

---

## 7. What should be added later
Still missing as true public proof artifacts:
- real screenshot gallery
- real public benchmark outputs
- before/after hardening samples
- published sample reports checked into a safe examples/artifacts location

Until those exist, this page should stay honest and repo-grounded.
