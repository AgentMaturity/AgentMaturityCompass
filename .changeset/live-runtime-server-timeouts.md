---
"agent-maturity-compass": patch
---

Studio, the host router, the gateway and the hosted API now keep idle keep-alive connections for 65 seconds, with a 70 second header timeout (LIVE-RUNTIME-12). Node's 5 second default was below a reverse proxy's upstream idle timeout, so the proxy could reuse a connection Node had just closed and answer an intermittent 502 on a POST under real traffic. Studio, the router and the hosted API also bound receiving a request to 120 seconds; the gateway keeps Node's request timeout for long uploads. Keep your proxy's upstream idle timeout below 65 seconds; for Caddy: `reverse_proxy { transport http { keep_alive { idle_timeout 50s } } }`. Server-sent event streams are not affected.
