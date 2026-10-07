/** Option parsers for the business CLI commands (moved out of src/cli-business-commands.ts). */
export function parseNonNegativeNumber(value: string | undefined, flagName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be a finite number greater than or equal to 0.`);
  }
  return parsed;
}

export function normalizeCurrency(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("--currency must be a 3-letter ISO currency code such as USD.");
  }
  return normalized;
}

export function parsePositiveInteger(value: string | undefined, flagName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  return parsed;
}

export function parseMaturityLevel(value: string | undefined, flagName: string): number | undefined {
  const parsed = parseNonNegativeNumber(value, flagName);
  if (parsed !== undefined && parsed > 5) {
    throw new Error(`${flagName} must be between 0 and 5.`);
  }
  return parsed;
}
