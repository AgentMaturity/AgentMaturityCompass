/**
 * A4 Forge identity at the boundary (P1-56 fills it): parses the principal native Studio admission already
 * resolved (`NativeTaskApiContext.principalId`) and re-reads the live user record. Named by the `studio` channel in
 * docs/security/channel-map.json.
 */
export function resolveA4Principal(): never {
  throw new Error("A4 identity lands with P1-56");
}
