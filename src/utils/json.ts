export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const sortedKeys = Object.keys(input).sort();
    const out = Object.create(null) as Record<string, unknown>;
    for (const key of sortedKeys) {
      out[key] = sortDeep(input[key]);
    }
    return out;
  }
  return value;
}
