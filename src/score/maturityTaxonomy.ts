import type { MaturityLevel } from "./formalSpec.js";

export const AMC_MATURITY_LEVELS = [
  { level: "L0", ordinal: 0, label: "Absent" },
  { level: "L1", ordinal: 1, label: "Initial" },
  { level: "L2", ordinal: 2, label: "Developing" },
  { level: "L3", ordinal: 3, label: "Defined" },
  { level: "L4", ordinal: 4, label: "Managed" },
  { level: "L5", ordinal: 5, label: "Optimizing" },
] as const satisfies ReadonlyArray<{
  level: MaturityLevel;
  ordinal: number;
  label: string;
}>;

export type MaturityLabel = (typeof AMC_MATURITY_LEVELS)[number]["label"];

export const AMC_MATURITY_LABELS = Object.freeze(
  Object.fromEntries(AMC_MATURITY_LEVELS.map(({ level, label }) => [level, label])),
) as Readonly<Record<MaturityLevel, MaturityLabel>>;

export const AMC_MATURITY_LEGEND = AMC_MATURITY_LEVELS
  .map(({ level, label }) => `${level}=${label}`)
  .join(" | ");

export function maturityLevelFromOrdinal(ordinal: number): MaturityLevel {
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal > 5) {
    throw new RangeError(`Invalid AMC maturity ordinal: ${ordinal}. Expected an integer from 0 through 5.`);
  }
  return `L${ordinal}` as MaturityLevel;
}

export function maturityLabel(level: MaturityLevel): MaturityLabel {
  return AMC_MATURITY_LABELS[level];
}

export function formatMaturityLevel(level: MaturityLevel, separator = " — "): string {
  return `${level}${separator}${maturityLabel(level)}`;
}

export function formatMaturityOrdinal(ordinal: number, separator = " — "): string {
  return formatMaturityLevel(maturityLevelFromOrdinal(ordinal), separator);
}
