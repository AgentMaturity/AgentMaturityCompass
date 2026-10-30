/** Conservative trillionths of USD. Parse decimal text, avoiding floating-point multiplication or accumulation. */
export function nativeUsdUnits(value: number, ceiling = true): bigint {
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid USD amount");
  const [mantissa, exponent = "0"] = value.toString().split("e");
  const [whole, fraction = ""] = mantissa!.split(".");
  const digits = BigInt(whole! + fraction);
  const places = 12 + Number(exponent) - fraction.length;
  if (places >= 0) return digits * 10n ** BigInt(places);
  const divisor = 10n ** BigInt(-places);
  return digits / divisor + (ceiling && digits % divisor !== 0n ? 1n : 0n);
}
