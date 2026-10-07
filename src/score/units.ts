/**
 * Score units (P0-21). Every score has one unit and every conversion is explicit:
 * a raw number is never reinterpreted by its size. See "Units, levels and claim
 * kinds" in docs/SCORING_METHODOLOGY.md.
 */
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** A self-declared answer on a 1-5 scale. */
export type Likert1to5 = Brand<number, "Likert1to5">;
export type Percent0to100 = Brand<number, "Percent0to100">;
export type Level0to5 = Brand<number, "Level0to5">;
export type Fraction0to1 = Brand<number, "Fraction0to1">;

function checked(n: number, min: number, max: number, integer: boolean, what: string): number {
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw new RangeError(`${what} must be ${integer ? "an integer" : "a number"} ${min}-${max}, got ${n}`);
  }
  return n;
}

export function likert(n: number): Likert1to5 {
  return checked(n, 1, 5, true, "Likert answer") as Likert1to5;
}

export function percent(n: number): Percent0to100 {
  return checked(n, 0, 100, false, "Percent") as Percent0to100;
}

export function level(n: number): Level0to5 {
  return checked(n, 0, 5, true, "Level") as Level0to5;
}

export function fraction(n: number): Fraction0to1 {
  return checked(n, 0, 1, false, "Fraction") as Fraction0to1;
}

/** 1 -> 0%, 5 -> 100%. */
export function likertToPercent(x: Likert1to5): Percent0to100 {
  return percent(((x - 1) / 4) * 100);
}

/** L0 -> 0%, L5 -> 100%. */
export function levelToPercent(l: Level0to5): Percent0to100 {
  return percent((l / 5) * 100);
}

export function percentToFraction(p: Percent0to100): Fraction0to1 {
  return fraction(p / 100);
}

/** The one level table: below 30% is L1, then L2 from 30, L3 from 55, L4 from 75 and L5 from 90. */
export function percentToLevel(p: Percent0to100): Level0to5 {
  if (p >= 90) return level(5);
  if (p >= 75) return level(4);
  if (p >= 55) return level(3);
  if (p >= 30) return level(2);
  return level(1);
}
