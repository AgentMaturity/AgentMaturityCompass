import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Validating ACP messages against the vendored schema itself (plan P7.1a).
 *
 * NO GENERATED CODECS, AND THAT IS THE POINT. The transitive closure of the
 * inbound message types is 36 definitions of unions, `$ref`s and `allOf` -- a
 * hand-written JSON-Schema-to-zod generator over that is a real bug surface, and
 * a generated artifact can drift from the schema it came from. Validating
 * against `vendor/acp-schema/schema.json` DIRECTLY makes drift impossible by
 * construction: the schema is the validator. `ajv` is already a dependency of
 * this repository, so this costs no new supply-chain surface.
 *
 * It also makes the vendored file load-bearing rather than decorative. A schema
 * nothing reads at run time is documentation that can rot silently; this one
 * fails loudly the moment it is missing or malformed.
 *
 * DRAFT 2020-12, so the `ajv/dist/2020` entry point is required -- ajv's default
 * export is draft-07 and rejects this schema outright with "no schema with key
 * or ref https://json-schema.org/draft/2020-12/schema".
 *
 * ONLY INBOUND MESSAGES ARE VALIDATED HERE. What AMC SENDS is constructed by
 * this codebase, so validating it at run time would be checking our own
 * arithmetic on every message; it is checked once, in tests, against this same
 * schema (tests/acpSchema.test.ts). What a CLIENT sends is untrusted and is
 * checked every time.
 */

/** The definitions a client can send us, and the only ones compiled. */
export const ACP_INBOUND_SHAPES = [
  "InitializeRequest",
  "AuthenticateRequest",
  "NewSessionRequest",
  "PromptRequest",
  "CancelNotification"
] as const;

export type AcpInboundShape = (typeof ACP_INBOUND_SHAPES)[number];

export type SchemaCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

interface CompiledSchema {
  readonly validate: (shape: string, value: unknown) => SchemaCheck;
  readonly protocolVersion: number;
}

let compiled: CompiledSchema | null = null;

/**
 * Where the schema lives, in a checkout and in an installed package.
 *
 * `vendor/` is not in package.json's `files`, so the build copies the schema
 * beside the compiled output. Both are tried rather than branching on some
 * guess about the environment: whichever exists is the right one, and if
 * NEITHER does that is a broken install and must say so.
 */
function schemaPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "acp-schema.json"),
    join(here, "..", "..", "vendor", "acp-schema", "schema.json")
  ];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // Try the next one.
    }
  }
  throw new Error(
    `the ACP schema is missing; looked in ${candidates.join(" and ")}. `
    + "A build that did not copy vendor/acp-schema/schema.json cannot serve ACP."
  );
}

/**
 * The three ajv methods this file uses.
 *
 * Declared structurally rather than imported: `ajv/dist/2020` is CJS, so its
 * TypeScript default export is not constructable even though the runtime value
 * is. Naming the surface actually used is more honest than casting away the
 * mismatch, and it keeps the coupling to three methods.
 */
interface SchemaCompiler {
  addSchema(document: object, key: string): void;
  getSchema(ref: string): ((value: unknown) => boolean) & { errors?: unknown } | undefined;
  errorsText(errors: unknown, options: { dataVar: string }): string;
}

/**
 * Compile once, lazily.
 *
 * Roughly 90ms for the whole document, paid on the first message rather than at
 * import, so a process that loads this module without serving ACP does not pay
 * for it at all.
 */
async function compile(): Promise<CompiledSchema> {
  if (compiled) return compiled;
  const module_ = (await import("ajv/dist/2020.js")) as unknown as {
    default: new (options: Record<string, unknown>) => SchemaCompiler;
  };
  const Ajv2020 = module_.default;
  const document = JSON.parse(readFileSync(schemaPath(), "utf8")) as object;
  // `strict: false` because this is somebody else's schema: strict mode
  // complains about keywords ajv does not recognise, which would turn an
  // upstream schema style choice into an AMC startup failure.
  const ajv = new Ajv2020({ strict: false, allErrors: false, validateFormats: false });
  ajv.addSchema(document, "acp");

  compiled = {
    validate(shape, value) {
      const validator = ajv.getSchema(`acp#/$defs/${shape}`);
      if (!validator) {
        return { ok: false, reason: `the vendored ACP schema defines no ${shape}` };
      }
      if (validator(value)) return { ok: true };
      // Names the path and the rule, never the value: a refusal travels back to
      // the sender and into logs, and the sender already knows what it sent.
      return { ok: false, reason: ajv.errorsText(validator.errors, { dataVar: shape }) };
    },
    protocolVersion: readProtocolVersion(document)
  };
  return compiled;
}

/**
 * The protocol version this schema describes.
 *
 * Read from the schema rather than written here, so a schema bump cannot leave
 * AMC advertising a version it no longer implements. `ProtocolVersion` is a
 * bounded integer in the document; the version actually in force is the one the
 * `InitializeRequest` example pins, so it is taken from there when present and
 * falls back to the schema's own minimum otherwise.
 */
function readProtocolVersion(document: object): number {
  const defs = (document as { $defs?: Record<string, unknown> }).$defs ?? {};
  const request = defs["InitializeRequest"] as
    { properties?: { protocolVersion?: { default?: unknown; const?: unknown } } } | undefined;
  const pinned = request?.properties?.protocolVersion;
  for (const candidate of [pinned?.const, pinned?.default]) {
    if (typeof candidate === "number" && Number.isSafeInteger(candidate)) return candidate;
  }
  return 1;
}

/** Check one inbound message against its schema definition. */
export async function checkAcpShape(shape: AcpInboundShape, value: unknown): Promise<SchemaCheck> {
  return (await compile()).validate(shape, value);
}

/** Check any definition by name. Used by tests to validate what AMC sends. */
export async function checkAcpDefinition(shape: string, value: unknown): Promise<SchemaCheck> {
  return (await compile()).validate(shape, value);
}

export async function acpProtocolVersion(): Promise<number> {
  return (await compile()).protocolVersion;
}
