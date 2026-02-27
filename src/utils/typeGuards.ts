/**
 * Type-safe `.includes()` for readonly arrays.
 * Avoids the `as never` workaround for TS readonly array `.includes()` limitation.
 */
export function includes<T>(arr: readonly T[], value: unknown): value is T {
  return (arr as readonly unknown[]).includes(value);
}
