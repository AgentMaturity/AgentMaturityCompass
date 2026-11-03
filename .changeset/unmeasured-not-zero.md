---
"agent-maturity-compass": major
---

Breaking: bench artifacts, passports, audit binders, value snapshots and metric validation reports now record a value AMC did not measure as null (not evaluated) with a not-measured reason, instead of 0. Readers of amcbench, amcpass and amcaudit artifacts must accept null for integrityIndex, correlationRatio, evidenceCoverage, maturity and value scores and the other fields their schemas now mark nullable.
