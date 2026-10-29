/** Bounded display labels only. Unsafe labels are withheld; durable linkage retains original identities. */
export function displayEvidenceIdentifier(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value)
    && !value.includes("//") && !/^(?:https?:|file:|sk[-_])/i.test(value) ? value : null;
}
