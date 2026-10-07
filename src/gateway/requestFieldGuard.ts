/**
 * Route-level refusal of named top-level JSON request fields (P1-24), for example DSH's
 * `dsh_session_log`. Only top-level keys of a JSON object body are inspected; nested keys and
 * non-JSON bodies (including compressed ones) match nothing. Field values are never read or kept.
 */
export function findRefusedFields(body: Buffer, fields: readonly string[]): string[] {
  if (fields.length === 0) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(body.toString("utf8")); } catch { return []; }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  return fields.filter((field) => Object.hasOwn(parsed, field));
}
