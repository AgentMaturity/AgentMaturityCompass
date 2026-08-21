# No-Code Governance Bridges

AMC now includes governance bridges for webhook-based no-code/low-code platforms:

- `n8n`
- `Make` / `Integromat`
- `Zapier`
- `generic` (fallback parser for custom automation tools)

These bridges convert workflow execution webhooks into tamper-evident AMC evidence records.

## What The Bridge Does

For each incoming execution event, AMC will:

1. Parse the platform payload into a normalized execution model.
2. Extract workflow actions/steps (HTTP call, DB write, email send, etc.).
3. Write one execution audit evidence event:
   - `auditType: NO_CODE_EXECUTION_INGESTED`
4. Write one `tool_action` evidence event per extracted action:
   - `auditType: NO_CODE_ACTION_CAPTURED`
5. Mint receipts for each record so downstream verification can prove provenance.

## Register a Platform Webhook

> **No CLI command registers these yet.** `amc adapter add` was documented here
> but has never existed; the no-code adapters are a library surface today.
> Ingest an execution event programmatically:

```ts
import { ingestNoCodeWebhookEvent } from "agent-maturity-compass";

ingestNoCodeWebhookEvent({
  source: "n8n",          // "n8n" | "make" | "zapier"
  workspace: process.cwd(),
  payload,                 // the raw webhook body
});
```

This writes signed config to:

- `.amc/no-code-governance.yaml`
- `.amc/no-code-governance.yaml.sig`

## Programmatic Ingestion

Use `ingestNoCodeWebhookEvent` to process a webhook payload:

```ts
import { ingestNoCodeWebhookEvent } from "@amc/core";

const out = ingestNoCodeWebhookEvent({
  workspace: process.cwd(),
  platform: "n8n", // n8n | make | zapier | generic
  payload: webhookBody,
  sourceWebhookUrl: "https://hooks.example.com/n8n/executions"
});

console.log(out.actionCount, out.executionEventId);
```

## Payload Notes

The adapters are tolerant of partial payloads and infer fields from common patterns:

- `n8n`: `data.resultData.runData` node executions
- `make`: `scenario`, `execution`, `operations`/`modules`
- `zapier`: `zap_id`, `run_id`, `steps`
- `generic`: `workflowId`, `executionId`, `actions` (or `steps`/`operations`)

If platform-specific fields are missing, generic fallbacks are used so evidence capture still succeeds.

## Evidence Querying

Filter ledger events by audit type:

- `NO_CODE_EXECUTION_INGESTED`
- `NO_CODE_ACTION_CAPTURED`

These events include:

- `agentId`
- `platform`
- `workflowId`
- `executionId`
- action metadata (`actionId`, `actionName`, `actionType`, `actionStatus`)
