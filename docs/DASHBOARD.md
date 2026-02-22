# DASHBOARD

AMC dashboard is a static, responsive, offline-first Compass view for mobile/desktop/tablet.

## Build

```bash
amc dashboard build --agent <agentId> --out .amc/agents/<agentId>/dashboard
```

Generated files:
- `index.html`
- `app.js`
- `styles.css`
- `data.json`
- `evidenceIndex.json`
- `components/*.js`

## Serve

```bash
amc dashboard serve --agent <agentId> --port 4173
```

## What It Shows

- Studio Home (gateway/proxy/studio/vault status)
- QR tile for dashboard URL (mobile handoff)
- overall score + IntegrityIndex + trust label
- 5-layer radar
- 67-question current-vs-target heatmap
- trend timeline across recent runs
- assurance pack summary
- failure-risk indices
- evidence gap list
- per-question detail (cap reasons, evidence IDs)
- Education → Ownership → Commitment view

Studio Home data comes from `.amc/studio/state.json` plus fleet/ledger summaries and includes:
- current service status
- vault lock state
- per-agent summary rows (score/trust/last provider/model)

## E/O/C Flow Commands

```bash
amc learn --agent <agentId> --question AMC-2.5
amc own --agent <agentId> --target default
amc commit --agent <agentId> --target default --days 14 --out .amc/agents/<agentId>/commitments/plan.md
```

These commands emit signed audit evidence:
- `EDUCATION_VIEWED`
- `OWNERSHIP_ASSIGNED`
- `COMMITMENT_CREATED`
