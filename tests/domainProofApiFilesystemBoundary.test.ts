import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import YAML from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { handleApiRoute } from "../src/api/index.js";

const manifestPath = "fixtures/domain-proof/toy-governance/source-rule-manifest.json";
const inputPath = "examples/domain-proof/toy-governance/proven.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
const provenInput = JSON.parse(readFileSync(inputPath, "utf8")) as unknown;
const disprovenInput = JSON.parse(
  readFileSync("examples/domain-proof/toy-governance/disproven.json", "utf8"),
) as unknown;
const unsupportedInput = JSON.parse(
  readFileSync("examples/domain-proof/toy-governance/unsupported.json", "utf8"),
) as unknown;
const roots: string[] = [];

function mockReq(body: unknown): IncomingMessage {
  const payload = JSON.stringify(body);
  const req = Readable.from([Buffer.from(payload, "utf8")]) as unknown as IncomingMessage;
  (req as { method?: string; url?: string }).method = "POST";
  (req as { method?: string; url?: string }).url = "/api/v1/proof/check";
  return req;
}

function mockRes(): { res: ServerResponse; state: { statusCode: number; body: string } } {
  const state = { statusCode: 0, body: "" };
  const res = {
    writeHead: (statusCode: number) => {
      state.statusCode = statusCode;
      return res;
    },
    end: (chunk?: string | Buffer) => {
      if (chunk !== undefined) state.body += chunk.toString();
    },
  } as unknown as ServerResponse;
  return { res, state };
}

async function post(workspace: string, body: unknown): Promise<{ statusCode: number; body: string }> {
  const { res, state } = mockRes();
  const handled = await handleApiRoute("/api/v1/proof/check", "POST", mockReq(body), res, workspace);
  expect(handled).toBe(true);
  return state;
}

function tempLayout(): { root: string; workspace: string; outside: string } {
  const root = mkdtempSync(join(tmpdir(), "amc-domain-proof-api-"));
  roots.push(root);
  const workspace = join(root, "workspace");
  const outside = join(root, "outside");
  mkdirSync(workspace, { recursive: true });
  mkdirSync(outside, { recursive: true });
  return { root, workspace, outside };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("Domain Proof API filesystem boundary", () => {
  test("publishes inline-first OpenAPI without an API output-file property", () => {
    const spec = YAML.parse(readFileSync("website/openapi.yaml", "utf8")) as any;
    const request = spec.components.schemas.DomainProofCheckRequest;
    const status = spec.components.schemas.DomainProofStatus;

    expect(request.additionalProperties).toBe(false);
    expect(request.properties.manifest.oneOf[0].$ref).toBe(
      "#/components/schemas/DomainProofSourceRuleManifest",
    );
    expect(request.properties.input.oneOf[0].$ref).toBe(
      "#/components/schemas/DomainProofCheckInput",
    );
    expect(request.properties.manifest.oneOf[1].deprecated).toBe(true);
    expect(request.properties.input.oneOf[1].deprecated).toBe(true);
    expect(request.properties).not.toHaveProperty("outFile");
    expect(status.properties.apiFileWrites.enum).toEqual(["disabled"]);
  });

  test("documents the implemented Studio admin/session boundary for protected proof routes", () => {
    const proofDoc = readFileSync("docs/DOMAIN_PROOF_LANE.md", "utf8");
    const studioDoc = readFileSync("docs/STUDIO.md", "utf8");
    const surfacesDoc = readFileSync("docs/API_SURFACES.md", "utf8");

    expect(proofDoc).toContain('x-amc-admin-token: $AMC_ADMIN_TOKEN');
    expect(proofDoc).not.toContain("authorization: Bearer $AMC_API_TOKEN");
    expect(studioDoc).toContain("protected routes require a signed Studio session");
    expect(studioDoc).not.toContain("not RBAC-gated today");
    expect(surfacesDoc).toContain("agent and lease credentials cannot access internal `/api/v1` routes");
    expect(surfacesDoc).toContain("not an accepted Studio HTTP auth carrier");
  });

  test.each([
    ["proven", provenInput],
    ["disproven", disprovenInput],
    ["unsupported", unsupportedInput],
  ])("accepts schema-validated inline %s checks without filesystem access", async (result, inlineInput) => {
    const { workspace } = tempLayout();
    const response = await post(workspace, { domain: "governance", manifest, input: inlineInput });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      data: {
        result,
        requestMode: "inline_json",
        artifact: { proofClass: "domain_correctness" },
      },
    });
  });

  test.each([
    ["absolute", (outside: string) => join(outside, "manifest.json"), (outside: string) => join(outside, "input.json")],
    ["traversal", () => "../outside/manifest.json", () => "../outside/input.json"],
  ])("rejects %s paths even when they contain valid proof JSON", async (_label, manifestRef, inputRef) => {
    const { workspace, outside } = tempLayout();
    writeJson(join(outside, "manifest.json"), manifest);
    writeJson(join(outside, "input.json"), provenInput);

    const response = await post(workspace, {
      domain: "governance",
      manifest: manifestRef(outside),
      input: inputRef(outside),
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain(outside);
    expect(response.body).not.toContain("manifest.json");
  });

  test("rejects traversal segments even when normalization would remain inside an allowed root", async () => {
    const response = await post(process.cwd(), {
      domain: "governance",
      manifest: "fixtures/domain-proof/toy-governance/../toy-governance/source-rule-manifest.json",
      input: "examples/domain-proof/toy-governance/../toy-governance/proven.json",
    });

    expect(response.statusCode).toBe(400);
  });

  test("rejects workspace symlinks that resolve outside the allowed proof roots", async () => {
    const { workspace, outside } = tempLayout();
    const externalManifest = join(outside, "manifest.json");
    const externalInput = join(outside, "input.json");
    writeJson(externalManifest, manifest);
    writeJson(externalInput, provenInput);
    mkdirSync(join(workspace, "fixtures", "domain-proof"), { recursive: true });
    mkdirSync(join(workspace, "examples", "domain-proof"), { recursive: true });
    symlinkSync(externalManifest, join(workspace, "fixtures", "domain-proof", "manifest.json"));
    symlinkSync(externalInput, join(workspace, "examples", "domain-proof", "input.json"));

    const response = await post(workspace, {
      domain: "governance",
      manifest: "fixtures/domain-proof/manifest.json",
      input: "examples/domain-proof/input.json",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain(outside);
  });

  test("rejects allowlisted root directories replaced by internal workspace symlinks", async () => {
    const { workspace } = tempLayout();
    const privateManifests = join(workspace, "private-manifests");
    const privateInputs = join(workspace, "private-inputs");
    writeJson(join(privateManifests, "manifest.json"), manifest);
    writeJson(join(privateInputs, "input.json"), provenInput);
    mkdirSync(join(workspace, "fixtures"), { recursive: true });
    mkdirSync(join(workspace, "examples"), { recursive: true });
    symlinkSync(privateManifests, join(workspace, "fixtures", "domain-proof"));
    symlinkSync(privateInputs, join(workspace, "examples", "domain-proof"));

    const response = await post(workspace, {
      domain: "governance",
      manifest: "fixtures/domain-proof/manifest.json",
      input: "examples/domain-proof/input.json",
    });

    expect(response.statusCode).toBe(400);
  });

  test("rejects arbitrary JSON reads inside the workspace outside legacy proof roots", async () => {
    const { workspace } = tempLayout();
    writeJson(join(workspace, "private", "manifest.json"), manifest);
    writeJson(join(workspace, "private", "input.json"), provenInput);

    const response = await post(workspace, {
      domain: "governance",
      manifest: "private/manifest.json",
      input: "private/input.json",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain("private/manifest.json");
  });

  test("rejects schema-valid inline manifests that substitute the canonical toy source", async () => {
    const { workspace } = tempLayout();
    const fabricatedManifest = {
      ...(manifest as Record<string, unknown>),
      sourceTitle: "Fabricated eligibility rules",
      sourceUrl: "https://attacker.invalid/rules",
      sourceHash: "a".repeat(64),
    };

    const response = await post(workspace, {
      domain: "governance",
      manifest: fabricatedManifest,
      input: provenInput,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain("attacker.invalid");
    expect(response.body).not.toContain("Fabricated eligibility rules");
  });

  test.each([
    [
      "unchecked input facts",
      manifest,
      {
        ...(provenInput as Record<string, unknown>),
        facts: {
          ...((provenInput as { facts: Record<string, unknown> }).facts),
          uncheckedRiskFlag: true,
        },
      },
    ],
    [
      "hidden manifest fields",
      { ...(manifest as Record<string, unknown>), unreviewedSourceOverride: true },
      provenInput,
    ],
  ])("rejects %s instead of silently dropping them before proof", async (_label, inlineManifest, inlineInput) => {
    const { workspace } = tempLayout();
    const response = await post(workspace, {
      domain: "governance",
      manifest: inlineManifest,
      input: inlineInput,
    });

    expect(response.statusCode).toBe(400);
  });

  test("rejects every API outFile request and performs no server-side write", async () => {
    const { outside } = tempLayout();
    const outFile = join(outside, "escaped.amcproof.json");

    const response = await post(process.cwd(), {
      domain: "governance",
      manifest: manifestPath,
      input: inputPath,
      outFile,
    });

    expect(response.statusCode).toBe(400);
    expect(existsSync(outFile)).toBe(false);
    expect(response.body).not.toContain(outFile);
  });

  test("redacts host paths and file names from rejected legacy-path errors", async () => {
    const { workspace, outside } = tempLayout();
    const secretPath = join(outside, "sensitive-proof-input.json");

    const response = await post(workspace, {
      domain: "governance",
      manifest: secretPath,
      input: secretPath,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain(outside);
    expect(response.body).not.toContain("sensitive-proof-input.json");
  });
});
