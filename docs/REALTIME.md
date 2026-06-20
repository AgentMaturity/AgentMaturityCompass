# Realtime Org Updates (SSE)

AMC Studio exposes org realtime events over SSE:

- endpoint: `GET /events/org`
- auth: console session cookie (RBAC `VIEWER+`) or admin token
- content type: `text/event-stream`
- reconnect hint: `retry: 15000` (15 seconds)

## Event Types

- `ORG_SCORECARD_UPDATED`
- `AGENT_RUN_COMPLETED`
- `ASSURANCE_RUN_COMPLETED`
- `OUTCOMES_UPDATED`
- `INCIDENT_CREATED`
- `FREEZE_APPLIED`
- `FREEZE_LIFTED`
- `POLICY_PACK_APPLIED`
- `BENCHMARK_INGESTED`
- `FEDERATION_IMPORTED`

Payload shape:

```json
{
  "type": "ORG_SCORECARD_UPDATED",
  "nodeIds": ["enterprise", "team-platform"],
  "ts": 1730000000000,
  "summaryHash": "<sha256>",
  "version": 1
}
```

Wire format:

```text
id: <summaryHash>
event: ORG_SCORECARD_UPDATED
data: {"type":"ORG_SCORECARD_UPDATED","nodeIds":["enterprise"],"ts":1730000000000,"summaryHash":"<sha256>","version":1}
```

## Reconnect Behavior

Browser `EventSource` clients reconnect automatically. AMC sends an SSE `retry` field with a 15-second reconnect interval, matching the WHATWG/MDN convention that integer `retry` values are interpreted as milliseconds.

Each org event includes an `id` equal to the event `summaryHash`, so clients can log or send `Last-Event-ID` on reconnect. The `/events/org` stream is live-update-only today: it does not replay missed org events from `Last-Event-ID`. After a reconnect, clients should refresh current state from the relevant snapshot/read route, then continue consuming live events.

## Privacy Rules

SSE payloads intentionally exclude:
- secrets
- tokens
- raw transcripts
- raw tool output

Only structural metadata needed for live UI refresh is emitted.

## Recompute Behavior

On key write paths (runs, assurance, outcomes ingest, incidents/freeze changes, policy-pack apply, benchmark ingest, federation import), Studio recomputes org scorecards and emits update events.
