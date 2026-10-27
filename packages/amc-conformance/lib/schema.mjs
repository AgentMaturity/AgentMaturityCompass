/**
 * A JSON Schema (draft 2020-12) checker for exactly the keywords the published AMC schemas use (spec/schemas/v1/).
 * Node built-ins only, so the suite runs without AMC or any dependency. A keyword it does not know is refused, never
 * skipped: a schema it cannot fully check must not make a record pass.
 */
const ANNOTATIONS = new Set(["$id", "$schema", "title", "description", "format", "default"]);
const KEYWORDS = new Set(["type", "enum", "const", "pattern", "minLength", "minimum", "maximum", "required", "properties",
  "additionalProperties", "propertyNames", "items", "anyOf", "oneOf"]);

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function typeMatches(type, value) {
  const actual = typeOf(value);
  return type === actual || (type === "number" && actual === "integer");
}

/** The first error as `<path>: <message>`, or null when `value` satisfies `schema`. */
export function schemaError(schema, value, path = "$") {
  if (schema === true || (typeof schema === "object" && schema !== null && Object.keys(schema).length === 0)) return null;
  if (schema === false) return `${path}: not allowed`;
  for (const key of Object.keys(schema)) {
    if (!ANNOTATIONS.has(key) && !KEYWORDS.has(key)) throw new Error(`schema keyword ${key} at ${path} is not supported by this checker`);
  }
  const types = schema.type === undefined ? null : [schema.type].flat();
  if (types && !types.some(type => typeMatches(type, value))) return `${path}: expected ${types.join(" or ")}, got ${typeOf(value)}`;
  if (schema.enum && !schema.enum.some(item => item === value)) return `${path}: not one of ${JSON.stringify(schema.enum)}`;
  if ("const" in schema && schema.const !== value) return `${path}: expected ${JSON.stringify(schema.const)}`;
  if (typeof value === "string") {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) return `${path}: shorter than ${schema.minLength}`;
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) return `${path}: does not match ${schema.pattern}`;
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) return `${path}: below ${schema.minimum}`;
    if (schema.maximum !== undefined && value > schema.maximum) return `${path}: above ${schema.maximum}`;
  }
  if (schema.anyOf && !schema.anyOf.some(option => schemaError(option, value, path) === null)) return `${path}: matches no anyOf option`;
  if (schema.oneOf && schema.oneOf.filter(option => schemaError(option, value, path) === null).length !== 1) return `${path}: does not match exactly one oneOf option`;
  if (Array.isArray(value) && schema.items !== undefined) {
    for (const [index, item] of value.entries()) {
      const error = schemaError(schema.items, item, `${path}[${index}]`);
      if (error) return error;
    }
  }
  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) return `${path}: missing ${key}`;
    for (const [key, item] of Object.entries(value)) {
      const known = schema.properties && Object.hasOwn(schema.properties, key);
      const rule = known ? schema.properties[key] : schema.additionalProperties;
      if (schema.propertyNames) {
        const error = schemaError(schema.propertyNames, key, `${path}.${key}(name)`);
        if (error) return error;
      }
      if (rule === undefined) continue;
      const error = schemaError(rule, item, `${path}.${key}`);
      if (error) return error;
    }
  }
  return null;
}
