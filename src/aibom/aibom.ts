/**
 * The CycloneDX AI bill of materials (AIBOM) of one governed agent, rendered from collectAgentFacts. CycloneDX 1.6 by
 * default, 1.7 on request. A field AMC has no record for is left out and named in an `amc:unknown` property.
 */
import { randomUUID } from "node:crypto";
import type { AgentFacts, DigestFact } from "./collect.js";

type Property = { name: string; value: string };
type Hash = { alg: "SHA-256"; content: string };

export interface CycloneDxComponent {
  type: "application" | "machine-learning-model" | "data" | "file";
  "bom-ref": string;
  name: string;
  version?: string;
  supplier?: { name: string };
  hashes?: Hash[];
  data?: Array<{ type: "configuration" | "dataset"; name: string }>;
  modelCard?: unknown;
  licenses?: unknown;
  properties?: Property[];
}

export interface CycloneDxBom {
  $schema: string;
  bomFormat: "CycloneDX";
  specVersion: "1.6" | "1.7";
  serialNumber: string;
  version: 1;
  metadata: {
    timestamp: string;
    tools: { components: CycloneDxComponent[] };
    component: CycloneDxComponent;
    properties: Property[];
  };
  components: CycloneDxComponent[];
  services: Array<{ "bom-ref": string; name: string; version?: string; group?: string; properties: Property[] }>;
  dependencies: Array<{ ref: string; dependsOn: string[] }>;
}

const sha256 = (content: string): Hash[] => [{ alg: "SHA-256", content }];
const prop = (name: string, value: string): Property => ({ name, value });

function digestComponent(fact: DigestFact): CycloneDxComponent {
  // Named by digest only: a prompt's text and a dataset's file name can be sensitive.
  const name = `${fact.kind}:${fact.sha256.slice(0, 16)}`;
  return { type: "data", "bom-ref": `amc:${name}`, name, hashes: sha256(fact.sha256),
    data: [{ type: fact.kind === "dataset" ? "dataset" : "configuration", name }], properties: [prop("amc:kind", fact.kind)] };
}

export function buildAibom(facts: AgentFacts, options: { specVersion?: "1.6" | "1.7"; now?: Date } = {}): CycloneDxBom {
  const specVersion = options.specVersion ?? "1.6";
  const unknown = [...facts.unknown];
  const supplier = facts.agent?.providerTemplate;
  const models = facts.models.map((model): CycloneDxComponent => {
    unknown.push(...["version", "modelCard", "licenses", ...(supplier ? [] : ["supplier"])].map(field => `model ${model.id}: ${field}`));
    return { type: "machine-learning-model", "bom-ref": `amc:model:${model.id}`, name: model.id, ...(supplier ? { supplier: { name: supplier } } : {}),
      properties: [prop("amc:source", "signed adapters configuration"), prop("amc:provider.route", model.route), prop("amc:preferred", String(model.preferred))] };
  });
  const runtime: CycloneDxComponent = { type: "application", "bom-ref": "amc:runtime", name: facts.runtime.name, version: facts.runtime.version };
  const files = facts.signedFiles.map((file): CycloneDxComponent => ({ type: "file", "bom-ref": `amc:file:${file.path}`, name: file.path,
    hashes: sha256(file.sha256), properties: [prop("amc:signature", file.signature)] }));
  const components = [...models, ...facts.digests.map(digestComponent), ...files, runtime];
  const services = facts.tools.map(tool => ({ "bom-ref": `amc:tool:${tool.name}`, name: tool.name,
    ...(tool.mcp?.version ? { version: tool.mcp.version } : {}), ...(tool.mcp ? { group: tool.mcp.name } : {}),
    properties: [prop("amc:tool.actionClass", tool.actionClass), prop("amc:tool.context", tool.mcp ? "mcp" : "native"),
      ...(tool.mcp ? [prop("amc:mcp.server", tool.mcp.id), ...(tool.mcp.transport ? [prop("amc:mcp.transport", tool.mcp.transport)] : [])] : [])] }));
  const agentRef = `amc:agent:${facts.agentId}`;
  const agentProperties = facts.agent ? [prop("amc:agent.role", facts.agent.role), prop("amc:agent.domain", facts.agent.domain),
    prop("amc:agent.riskTier", facts.agent.riskTier), prop("amc:provider.template", facts.agent.providerTemplate),
    prop("amc:provider.route", facts.agent.providerRoute), prop("amc:provider.upstream", facts.agent.upstreamId)] : [];
  return {
    $schema: `http://cyclonedx.org/schema/bom-${specVersion}.schema.json`,
    bomFormat: "CycloneDX", specVersion, serialNumber: `urn:uuid:${randomUUID()}`, version: 1,
    metadata: {
      timestamp: (options.now ?? new Date()).toISOString(),
      tools: { components: [{ ...runtime, "bom-ref": "amc:generator" }] },
      component: { type: "application", "bom-ref": agentRef, name: facts.agentId, properties: [prop("amc:workspace", facts.workspaceId), ...agentProperties] },
      properties: [prop("amc:aibom.status", "experimental"), ...unknown.map(value => prop("amc:unknown", value))]
    },
    components,
    services,
    dependencies: [{ ref: agentRef, dependsOn: [...components, ...services].map(item => item["bom-ref"]) }]
  };
}
