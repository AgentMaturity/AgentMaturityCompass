/** Question builder shared by the per-station industry pack files. */
import type { IndustryPackQuestion } from "../../industryPacks.js";

export function q(
  id: string,
  dimension: string,
  text: string,
  regulatoryRef: string,
  l1: string,
  l3: string,
  l5: string,
  weight: number
): IndustryPackQuestion {
  return { id, dimension, text, regulatoryRef, l1, l3, l5, weight };
}
