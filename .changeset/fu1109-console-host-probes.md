---
"agent-maturity-compass": patch
---

The Compass Console's Portfolio Forecast and Bench Portfolio pages no longer probe host-router endpoints that a single-workspace console does not have (each view logged a 404). Behind the host router (a `/w/<id>/` console) they read the host router's own `/host/api/portfolio/forecast` and `/host/api/bench/portfolio`, and Bench Portfolio now shows the rows the host router returns; elsewhere they render the workspace fallback as before.
