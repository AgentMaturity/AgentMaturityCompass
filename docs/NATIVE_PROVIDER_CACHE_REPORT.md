# Native provider and cache reports

`amc agent-loop run` reports its recorded session after a turn; `--json` exposes
the structured summary. `amc session show <session-id>` and its `--json` form read
the same recorded usage projection. Native chat displays it after each child
result; `/inspect` uses session history. These are cumulative session reports,
not a verification verdict, current configuration snapshot or live provider test.

## Recorded identity and provenance

`usage.requestReports` names each request's recorded provider/model/encoder from
`request/header`, and adapter/version from its linked `request/response` or
`request/failure`. Header and outcome event IDs provide provenance. A retry has
its own header; a `step/end` usage copy is not another request. A pending request
has no outcome. A historical outcome without adapter identity or dispatch
provenance remains unavailable, rather than borrowing today's route settings.

These are the configured labels that the rows recorded, not authentication of
the remote model, server operator or advertised capability. Even a completed
scripted endpoint can supply these fields. No generic compatible origin or
gateway template establishes native provider/modality breadth.

Only bounded identifier labels are presented. URL-shaped, control-containing,
unsupported or `sk-`/`sk_`-prefixed labels are withheld in both text and the projection.
The projection never copies credential objects/references, provider parameters,
endpoints or arbitrary failure text. It does not resolve credentials. Text shows
up to ten request identities and explicitly names omitted rows; JSON contains
all projected request references. Missing/withheld labels are not silently
truncated into a different identity. This identifier policy is not a general
secret detector; credentials must never be placed in provider/model labels.

## Token share is not request hit rate

The existing **cache-read token share** divides recorded cache-read tokens by the
eligible reported input subtotal. AMC's normalized accounting separates known
cache reads/writes from input, while reasoning is already included in output.
Unknown cache fields stay unknown. When an adapter has no cache breakdown, its
normalized input may still be the reported prompt total; the report does not
call that observed uncached usage. Omitted cache-write counts are named, not
fabricated as zero. Neither a zero nor an absent token denominator yields a share.

The separate `usage.requestCache` has basis
`completed-requests-with-reported-cache-read`. A request is eligible only when
its linked outcome completed, usage explicitly says `reported: true` and
`complete: true`, and `cacheReadTokens` is a valid recorded count. A **request
cache-read hit** means that count is greater than zero. Its rate is hit requests
divided by eligible requests, with the excluded-provider-request count shown.
This is cache-read incidence in the eligible recorded subset, not a provider's
internal cache-lookup metric. A request with a reported zero is an eligible miss;
an omitted count is not. Zero-token completed reports can therefore have a known
zero request-hit rate while their token-share denominator remains zero/unavailable.

Failed and partial usage retains its known token subtotal and its outcome label,
but never supplies a request-hit denominator. Missing/historical/pending and
explicit `stub` requests do not supply one either. Failed usage claiming to be
complete, reported usage claiming no dispatch, inconsistent links, invalid counts
or overflow make the usage projection invalid and suppress rates. Old serialized
summaries without request details retain their existing token display but cannot
acquire request hits or identity from aggregate counts.

## Boundaries

Use `amc agent-loop verify <session-id>` for the separate evidence checks. The
report preserves the canonical read-only SQLite/JSONL history path and does not
change signed policies, adapters, encoders, budget admission or historical bytes.
It is not billing, latency, live cache behavior, task-quality or provider-breadth
proof. Those require their own measured evidence.

Task12 implementation and its recorded-usage/public-report/negative regressions
are **UNQUALIFIED / AUTHORED UNEXECUTED**. Current-candidate checks and acceptance
remain deferred to the final implementation boundary; no historical pass is
promoted to this source.
