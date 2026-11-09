---
"agent-maturity-compass": patch
---

Compose browser origins are appended, never replaced (LIVE-DEPLOY-02). `deploy/compose/docker-compose.yml` and `docker-compose.tls.yml` set no `AMC_CORS_ALLOWED_ORIGINS`, so a browser at the documented console URL got `403 NATIVE_HOST_DENIED` on native and A4 routes; `docker/docker-compose.yml` admitted only the in-network verify origin. Each Studio service now admits its documented console origin (`http://localhost:<AMC_STUDIO_PORT>` and `http://127.0.0.1:<AMC_STUDIO_PORT>` on the HTTP stacks, `https://<AMC_TLS_HOST>:<AMC_TLS_PORT>` on the TLS stack; `docker/` keeps `http://amc-studio:3212` first) and appends `AMC_EXTRA_ORIGINS` (new in `.env.example`) for LAN or phone origins, so setting it never drops the defaults. An origin is `scheme://host[:port]` with no path. The Phone/LAN steps in `deploy/compose/README.md` say to set `AMC_PUBLISH_ADDRESS=0.0.0.0` and add the origin, and the Helm ingress example sets its ingress origin.
