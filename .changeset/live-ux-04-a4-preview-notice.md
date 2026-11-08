---
"agent-maturity-compass": patch
---

Compass Console A4 page: "A4 preview is not enabled in this workspace" now says how to enable it. In the workspace folder, stop Studio with `amc down`, set `AMC_A4_PREVIEW=1` (macOS/Linux: `AMC_A4_PREVIEW=1 amc up`; PowerShell: `$env:AMC_A4_PREVIEW="1"; amc up`) and start it again; a running Studio keeps the environment it started with. The Home navigation link to A4 still appears only while the preview is on.
