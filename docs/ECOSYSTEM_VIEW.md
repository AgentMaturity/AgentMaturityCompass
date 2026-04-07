# Ecosystem View

AMC compares local org performance against imported federation benchmarks without importing peer raw evidence.

## Data Sources

Local:
- signed org scorecards (`/Users/sid/AgentMaturityCompass/.amc/org/scorecards`)
- local runs/assurance/outcomes

Federated peers:
- imported `.amcbench`
- imported `.amccert` / BOM references
- transparency roots/proofs from `.amcfed`

## What Is Compared

Percentile views for:
- overall maturity
- IntegrityIndex
- assurance summaries
- value score
- 5 systemic risk indices

## Important Constraint

Peer comparisons are benchmark-based only.
AMC does **not** merge peer raw run/evidence DB content into local score computation.

## Console Usage

Open:
- `/console/org` for local node + ecosystem rollup tiles
- `/console/benchmarks` for imported peer distributions and benchmark stats

