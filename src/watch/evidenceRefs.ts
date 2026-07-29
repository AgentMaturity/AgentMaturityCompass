export function hasNonBlankEvidenceRef(values: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(values)
    && values.some((value) => typeof value === "string" && value.trim().length > 0);
}

export function normalizeEvidenceRefs(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(
    values.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    ),
  )];
}
