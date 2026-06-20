---
"agent-maturity-compass": patch
---

Add a mobile-safe AMC Bridge fetch wrapper for React Native-style integrations and document the mobile Bridge path for React Native and Flutter. The wrapper avoids Node-only imports, strips provider auth by default, injects AMC correlation headers, and keeps self-scoring guards active before mobile requests leave the app.
