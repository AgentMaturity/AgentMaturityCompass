/**
 * P2-19 conformance fixtures for AMC's ACS guardian. ACS v0.1.4 publishes no test vectors (docs/spec/conformance.md:
 * "This release ships no conformance test suite"), so every case here is AMC-authored: requests from the spec's own
 * examples or built to its schemas, and every AMC response validated, unmodified, against the pinned JSON Schemas in
 * tests/fixtures/acs-v0.1.4/schema. Passing them shows AMC's answers have the pinned shape; it is not ACS conformance.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { afterEach, describe, expect, test } from "vitest";
import { handleAcsGuardianRequest } from "../src/standards/acs/acsGuardian.js";
import { controlledWorkspace, removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

const addFormats: import("ajv-formats").FormatsPlugin = createRequire(import.meta.url)("ajv-formats");
const FIXTURES = join("tests", "fixtures", "acs-v0.1.4");
const BASE = "https://genai-security-project.github.io/agent-control-standard/schema/v0.1.0/";
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
for (const dir of ["schema", join("schema", "hooks")]) {
  for (const file of readdirSync(join(FIXTURES, dir)).filter((name) => name.endsWith(".json"))) {
    ajv.addSchema(JSON.parse(readFileSync(join(FIXTURES, dir, file), "utf8")) as object);
  }
}
const validator = (id: string) => {
  const validate = ajv.getSchema(`${BASE}${id}`);
  if (!validate) throw new Error(`pinned schema ${id} missing`);
  return (value: unknown) => (validate(value) ? [] : (validate.errors ?? []).map((error) => `${error.instancePath} ${error.message}`));
};
const requestEnvelope = validator("request-envelope.json");
const responseEnvelope = validator("response-envelope.json");
const toolCallRequest = validator("hooks/tool-call-request.json");
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Record<string, any>;

afterEach(removeFixtureWorkspaces);

interface Case { name: string; agentId: string; request: Record<string, any>; now?: number; expect: (response: Record<string, any>) => void }

function cases(workspace: string): Case[] {
  const agentId = "acs-conformance-agent";
  const sessionId = randomUUID();
  const envelope = (method: string, payload: Record<string, unknown>) => ({ jsonrpc: "2.0", method, id: randomUUID(),
    params: { acs_version: "0.1.0", request_id: randomUUID(), timestamp: new Date().toISOString(), metadata: { agent_id: agentId, session_id: sessionId }, payload } });
  const inAction = fixture("acs-in-action-tool-call-request.json");
  return [
    { name: "spec example: ACS in Action toolCallRequest for email.send, a tool AMC does not map", agentId: inAction.params.metadata.agent_id,
      request: inAction, now: Date.parse(inAction.params.timestamp),
      expect: (response) => expect(response.result).toMatchObject({ type: "final", request_id: inAction.params.request_id, decision: "deny" }) },
    { name: "handshake/hello: ClientHello per handshake.json", agentId,
      request: envelope("handshake/hello", { acs_versions_supported: ["0.1.0"], methods_implemented: ["steps/toolCallRequest", "system/ping"],
        transports_supported: ["http"], provenance_producer: "none", profiles_supported: ["acs-core"] }),
      expect: (response) => expect(response.result).toMatchObject({ negotiated_version: "0.1.0", methods_evaluated: ["steps/toolCallRequest"] }) },
    { name: "system/ping with echo", agentId, request: envelope("system/ping", { echo: "conformance" }),
      expect: (response) => expect(response.result).toMatchObject({ decision: "allow", payload: { status: "ok", echo: "conformance" } }) },
    { name: "toolCallRequest allow: fs.read inside the workspace", agentId,
      request: envelope("steps/toolCallRequest", { tool: { name: "fs.read" }, arguments: { path: { value: join(workspace, "workspace", "public.txt") } } }),
      expect: (response) => expect(response.result).toMatchObject({ decision: "allow" }) },
    { name: "toolCallRequest ask substitution: fs.write needing approval", agentId,
      request: envelope("steps/toolCallRequest", { tool: { name: "fs.write" }, arguments: { path: { value: join(workspace, "workspace", "output", "a.txt") } } }),
      expect: (response) => expect(response.result).toMatchObject({ decision: "deny", reason_codes: ["approver_unavailable"] }) },
    { name: "toolCallRequest with raw_command: not evaluated, deny", agentId,
      request: envelope("steps/toolCallRequest", { tool: { name: "fs.read" }, arguments: {}, raw_command: "cat notes.txt" }),
      expect: (response) => expect(response.result).toMatchObject({ decision: "deny" }) },
    { name: "unsupported hook: steps/toolCallResult", agentId,
      request: envelope("steps/toolCallResult", { execution_id: "x", outputs: {} }),
      expect: (response) => expect(response.error).toMatchObject({ code: -32003, data: { reason: "unsupported" } }) },
    { name: "unsupported version 1.0.0", agentId, request: { ...envelope("steps/toolCallRequest", {}), params: { ...envelope("x", {}).params, acs_version: "1.0.0" } },
      expect: (response) => expect(response.error).toMatchObject({ code: -32001 }) },
  ];
}

describe("ACS v0.1.4 AMC-authored conformance fixtures", () => {
  test("the pinned schemas accept the spec's own request and response examples", () => {
    const inAction = fixture("acs-in-action-tool-call-request.json");
    expect(requestEnvelope(inAction)).toEqual([]);
    expect(toolCallRequest(inAction.params.payload)).toEqual([]);
    expect(responseEnvelope(fixture("acs-in-action-response.json"))).toEqual([]);
    // And reject what they should: a deny without reasoning, and an allow without a request id.
    expect(responseEnvelope({ jsonrpc: "2.0", id: 1, result: { type: "final", acs_version: "0.1.0", request_id: randomUUID(), decision: "deny" } })).not.toEqual([]);
    expect(responseEnvelope({ jsonrpc: "2.0", id: 1, result: { type: "final", acs_version: "0.1.0", decision: "allow" } })).not.toEqual([]);
  });

  test("every AMC answer has the pinned response shape and the expected disposition", () => {
    const workspace = controlledWorkspace("acs-conformance-agent");
    const all = cases(workspace);
    const failures: string[] = [];
    for (const item of all) {
      const requestErrors = requestEnvelope(item.request);
      const response = handleAcsGuardianRequest({ workspace, authenticatedAgentId: item.agentId, lease: { leaseId: "lease_acs_conformance",
        expiresTs: Date.now() + 3_600_000 }, rawBody: JSON.stringify(item.request), ...(item.now === undefined ? {} : { now: item.now }) });
      const responseErrors = responseEnvelope(response);
      if (requestErrors.length + responseErrors.length > 0) failures.push(`${item.name}: ${[...requestErrors, ...responseErrors].join("; ")}`);
      expect(response.id, item.name).toBe(item.request.id);
      item.expect(response as Record<string, any>);
    }
    expect(failures).toEqual([]);
    expect(all).toHaveLength(8);
  });
});
