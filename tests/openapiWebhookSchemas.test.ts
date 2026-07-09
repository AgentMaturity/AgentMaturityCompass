import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { describe, expect, test } from "vitest";

function loadPublicOpenApi(): any {
  const raw = readFileSync(resolve(process.cwd(), "website/openapi.yaml"), "utf8");
  return YAML.parse(raw);
}

describe("public OpenAPI webhook schemas", () => {
  test("documents diagnostic artifact validity separately from evidence readiness", () => {
    const spec = loadPublicOpenApi();
    const schemas = spec.components.schemas;

    expect(schemas.EvidenceReadiness.required).toEqual([
      "schemaVersion",
      "status",
      "claimEligible",
      "label",
      "reasonCodes",
      "claimBoundary",
      "nextStep",
      "thresholds"
    ]);
    expect(schemas.EvidenceReadiness.properties.status.enum).toEqual([
      "READY",
      "LIMITED",
      "INSUFFICIENT_EVIDENCE",
      "UNVERIFIED"
    ]);
    expect(schemas.DiagnosticReport.properties.status.description).toContain("Artifact validity only");
    expect(schemas.DiagnosticReport.properties.evidenceReadiness.allOf[0].$ref).toBe(
      "#/components/schemas/EvidenceReadiness"
    );
    expect(schemas.DiagnosticReportResponse.properties.data.$ref).toBe(
      "#/components/schemas/DiagnosticReport"
    );

    for (const [path, method] of [
      ["/v1/score/run", "post"],
      ["/v1/score/latest", "get"],
      ["/v1/score/run/{runId}", "get"],
      ["/v1/score/report/{runId}", "get"],
      ["/v1/score/report", "get"]
    ]) {
      const response = spec.paths[path][method].responses["200"];
      expect(response.content["application/json"].schema.$ref).toBe(
        "#/components/schemas/DiagnosticReportResponse"
      );
    }
  });

  test("defines reusable webhook payload and receipt contracts", () => {
    const spec = loadPublicOpenApi();
    const schemas = spec.components.schemas;

    for (const schemaName of [
      "WebhookSignatureHeaders",
      "WebhookEventEnvelope",
      "WebhookDeliveryRequest",
      "WebhookAttemptReceipt",
      "WebhookDeliveryReceipt",
      "PortalWebhookPayload",
      "OutcomeWebhookPayload",
      "ValueWebhookPayload"
    ]) {
      expect(schemas).toHaveProperty(schemaName);
    }

    expect(schemas.WebhookDeliveryRequest.required).toEqual(["url", "eventType", "payload", "secret"]);
    expect(schemas.WebhookDeliveryReceipt.required).toEqual([
      "deliveryId",
      "eventType",
      "url",
      "payloadSha256",
      "createdTs",
      "completedTs",
      "delivered",
      "attempts"
    ]);
    expect(schemas.WebhookDeliveryReceipt.properties.attempts.items.$ref).toBe("#/components/schemas/WebhookAttemptReceipt");
  });

  test("documents concrete value and outcome webhook payload shapes", () => {
    const spec = loadPublicOpenApi();
    const schemas = spec.components.schemas;

    expect(schemas.ValueWebhookPayload.required).toEqual(["v", "sourceId", "scope", "events"]);
    expect(schemas.ValueWebhookPayload.properties.v.enum).toEqual([1]);
    expect(schemas.ValueWebhookPayload.properties.scope.required).toEqual(["type", "id"]);
    expect(schemas.ValueWebhookPayload.properties.events.items.required).toEqual(["kpiId", "value"]);

    expect(schemas.OutcomeWebhookPayload.required).toEqual(["agentId", "signalId", "category", "value"]);
    expect(schemas.OutcomeWebhookPayload.properties.category.enum).toEqual([
      "Emotional",
      "Functional",
      "Economic",
      "Brand",
      "Lifetime"
    ]);
  });

  test("links portal submit payload to the webhook schema variants", () => {
    const spec = loadPublicOpenApi();
    const submit = spec.paths["/v1/product/portal/submit"].post;
    const schema = submit.requestBody.content["application/json"].schema;
    const payload = schema.properties.payload;

    expect(schema.$ref).toBeUndefined();
    expect(schema.required).toEqual(["name", "type", "submittedBy"]);
    expect(payload.oneOf.map((row: any) => row.$ref)).toEqual([
      "#/components/schemas/PortalWebhookPayload",
      "#/components/schemas/OutcomeWebhookPayload",
      "#/components/schemas/ValueWebhookPayload",
      "#/components/schemas/WebhookEventEnvelope"
    ]);
    expect(submit.requestBody.content["application/json"].examples.valueSignal.value.payload.events[0].kpiId).toBe("ticket.resolve.minutes");
  });

  test("publishes the value webhook route and token contract", () => {
    const spec = loadPublicOpenApi();
    const route = spec.paths["/value/ingest/webhook"]?.post;

    expect(route).toBeTruthy();
    expect(route.servers.map((server: any) => server.url)).toEqual([
      "http://localhost:3000",
      "https://{host}",
      "https://{host}/w/{workspaceId}"
    ]);
    expect(route.security).toEqual([
      { amcSessionCookie: [] },
      { amcAdminToken: [] },
      { valueWebhookToken: [] }
    ]);
    expect(route.parameters.map((param: any) => param.name)).toContain("x-amc-webhook-token");
    expect(route.requestBody.content["application/json"].schema.$ref).toBe("#/components/schemas/ValueWebhookPayload");
    expect(route.responses["200"].content["application/json"].schema.required).toEqual([
      "ingested",
      "file",
      "sha256",
      "trustKind",
      "transparencyHash"
    ]);
    expect(route.responses["401"].description).toContain("OWNER/OPERATOR");
  });

  test("documents the value webhook route family outside OpenAPI", () => {
    const apiSurfaces = readFileSync(resolve(process.cwd(), "docs/API_SURFACES.md"), "utf8");
    const valueIngestion = readFileSync(resolve(process.cwd(), "docs/VALUE_INGESTION.md"), "utf8");

    for (const doc of [apiSurfaces, valueIngestion]) {
      expect(doc).toContain("POST /value/ingest/webhook");
      expect(doc).toContain("POST /w/:workspaceId/value/ingest/webhook");
      expect(doc).toContain("x-amc-webhook-token");
      expect(doc).toContain("value/webhook/token");
      expect(doc).toContain("not an HMAC request signature");
    }
  });
});
