# Value Ingestion

AMC supports three deterministic ingestion paths for value evidence.

## 1) OBSERVED (Automatic)

AMC derives observed value signals from internal receipts/events:

- Bridge receipts
- ToolHub receipts
- Approval cycle and governance events

These are trust-tiered as `OBSERVED`.

## 2) Webhook Ingest (Owner Systems)

Endpoint:

- `POST /value/ingest/webhook` in single-workspace Studio mode
- `POST /w/:workspaceId/value/ingest/webhook`

Auth:

- OWNER/OPERATOR Studio session, or
- `x-amc-admin-token`, or
- vault-backed webhook token in `x-amc-webhook-token`

Token contract:

- The dedicated webhook token is stored in the vault at `value/webhook/token`.
- Send it only as the `x-amc-webhook-token` header.
- It is compared with timing-safe equality and is not an HMAC request signature.
- Do not send this token in the query string or JSON body.

Payload rules:

- Numeric/categorical allowlist only
- No free text, email, URL, file paths, tokens, or secrets
- Suspicious payloads are rejected with `400`

Trust labeling:

- Session/admin-token/token-authenticated webhook flow => `ATTESTED`
- Unauthenticated value webhook requests are rejected with `401`

## 3) CSV Import (Offline)

```bash
amc value import --csv ./kpi.csv --scope agent --id agent-1 --kpi cycle_time_hours
```

CSV must be numeric (`ts,value`) rows only. Suspicious strings are rejected.

## Security Model

- All ingested events are normalized and hashed.
- Transparency entries are appended (`VALUE_EVENT_INGESTED`).
- Self-reported events are clearly labeled and excluded from strong-claim math by policy gates.
- No raw prompts/model I/O are accepted in value ingest flows.
