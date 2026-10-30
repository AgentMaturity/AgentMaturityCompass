import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";

/**
 * Argument snapshotting for the tool pipeline.
 *
 * Two jobs, and both matter for evidence rather than for tidiness:
 *
 * - Detach. The caller keeps its own object; a caller that could mutate
 *   arguments after a guard read them would have the pipeline decide on one
 *   call and run another.
 * - Refuse silently-lossy values. `JSON.stringify` drops `undefined` members,
 *   turns `NaN` into `null` and throws on `BigInt`. A tool call whose recorded
 *   arguments differ from the ones it ran is worse than a rejected call, so
 *   these are rejected at the boundary instead.
 */

const LOSSY = "tool arguments must be losslessly JSON-serializable";

function assertJsonSafe(value: unknown, path: string): void {
  if (value === null) return;
  switch (typeof value) {
    case "string":
    case "boolean":
      return;
    case "number":
      if (!Number.isFinite(value)) throw new TypeError(`${LOSSY} (${path} is ${String(value)})`);
      return;
    case "object": {
      if (Array.isArray(value)) {
        value.forEach((item, index) => assertJsonSafe(item, `${path}[${index}]`));
        return;
      }
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        // Object.entries skips nothing, so an explicit `undefined` member is
        // visible here — which is exactly the value JSON would drop.
        assertJsonSafe(item, `${path}.${key}`);
      }
      return;
    }
    default:
      throw new TypeError(`${LOSSY} (${path} is ${typeof value})`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

/** A detached, deep-frozen copy. Throws rather than record something lossy. */
export function freezeToolArguments(input: Record<string, unknown>): Readonly<Record<string, unknown>> {
  assertJsonSafe(input, "arguments");
  return deepFreeze(JSON.parse(JSON.stringify(input)) as Record<string, unknown>);
}

type SchemaValidator = ReturnType<AjvJsonSchemaValidator["getValidator"]>;
/** One compiled validator per published schema, each in its own Ajv instance so one tool's `$id` never selects another's. */
const validators = new WeakMap<object, SchemaValidator>();

/**
 * Why `args` do not satisfy a tool's published JSON schema, or null when they do (or no schema is published). Checked
 * before any stage that spends something on the call (PXA-22): an approval for a call the body would reject is a
 * question nobody should have been asked. A schema that does not compile fails closed.
 */
export function argumentSchemaError(schema: Record<string, unknown> | undefined, args: unknown): string | null {
  if (schema === undefined) return null;
  let validate = validators.get(schema);
  if (validate === undefined) {
    try {
      validate = new AjvJsonSchemaValidator().getValidator(schema as Parameters<AjvJsonSchemaValidator["getValidator"]>[0]);
    } catch (error: unknown) {
      return `the published argument schema does not compile: ${error instanceof Error ? error.message : String(error)}`;
    }
    validators.set(schema, validate);
  }
  const result = validate(args);
  return result.valid ? null : `arguments do not match the published schema: ${result.errorMessage ?? "invalid"}`;
}
