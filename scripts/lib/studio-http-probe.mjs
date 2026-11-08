/**
 * Studio container health probe (LIVE-DEPLOY-03): GET /healthz and /readyz over HTTP, each bounded by an in-process
 * 8 s timeout, exit 0 only when both answer 2xx. The CLI probe (`amc studio healthcheck`) loaded the whole CLI for two
 * GETs and exceeded the healthcheck timeout under load while /readyz was READY. The Dockerfile HEALTHCHECK and the
 * compose healthchecks keep literal copies, because they cannot import; tests pin them to this string. It covers the
 * entrypoint's single-workspace `amc studio start` (AMC_BIND, AMC_STUDIO_PORT); a container running `amc host` is not
 * probed by it.
 */
export const STUDIO_HTTP_PROBE = "const h=['0.0.0.0','::',''].includes(process.env.AMC_BIND||'')?'127.0.0.1':process.env.AMC_BIND;const b='http://'+(h.includes(':')?'['+h+']':h)+':'+(process.env.AMC_STUDIO_PORT||3212);Promise.all(['/healthz','/readyz'].map(p=>fetch(b+p,{signal:AbortSignal.timeout(8000)}))).then(r=>process.exit(r.every(x=>x.ok)?0:1),()=>process.exit(1))";
