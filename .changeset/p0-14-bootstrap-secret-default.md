---
"agent-maturity-compass": major
---

Breaking for Helm bootstrap users: the chart no longer creates its bootstrap Secret by default. Provision all five referenced keys out of band, or explicitly set `bootstrap.createSecret=true` with all five values. Review the deployment guide and existing Secret ownership before upgrading; this change establishes no retention, migration, exposure-remediation or rotation outcome.
