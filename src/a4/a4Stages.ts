/**
 * The stage lanes' registration seam (P1-57; issue step 7). Each src/a4/stages/<stage>.ts exports `register(registry)`;
 * `ensureA4Stages` calls the four exactly once, before the first readiness evaluation (a4Gates.evaluateFor) and the first
 * effect lookup (a4Effects), so STAGE_ITEMS and the effect table are the same whichever entry (router, CLI) loaded A4.
 * Lazy rather than at module load: a register() that calls registerEffect would otherwise meet a4Effects mid-evaluation
 * in the a4Gates/a4Effects import cycle.
 */
import { registerA4Effect } from "./a4Effects.js";
import { STAGE_ITEMS } from "./a4Readiness.js";
import type { A4Stage, A4StageRegistry } from "./a4Schema.js";
import { register as activate } from "./stages/activate.js";
import { register as adapt } from "./stages/adapt.js";
import { register as aspire } from "./stages/aspire.js";
import { register as assemble } from "./stages/assemble.js";

let registered = false;

/** Idempotent. A register() that throws fails this call and every later one (fail closed), never a partial table read as whole. */
export function ensureA4Stages(): void {
  if (registered) return;
  const lanes: Array<[A4Stage, (registry: A4StageRegistry) => void]> = [["aspire", aspire], ["assemble", assemble], ["adapt", adapt], ["activate", activate]];
  for (const [stage, register] of lanes) register({ stage, items: STAGE_ITEMS[stage], registerEffect: registerA4Effect });
  registered = true;
}
