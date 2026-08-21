import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Makes a temp directory look like an AMC source checkout.
 *
 * A family of scorers awards points for AMC's own source modules
 * (`src/enforce`, `src/ops/rateLimiter.ts`, ...). Those probes are only
 * meaningful inside AMC's own tree — elsewhere they credited a project for
 * directory names, so an unrelated repo with a `src/enforce` folder was
 * reported as having fail-secure governance controls it did not have.
 *
 * `evidencePathExists` now ignores `src/` candidates outside a checkout, so a
 * fixture that means to exercise those probes has to say so by planting the
 * markers `detectControlSurfaceScope` looks for.
 */
export function markAsAmcCheckout(root: string): void {
  for (const marker of ["src/score", "src/diagnostic", "src/ledger"]) {
    mkdirSync(join(root, marker), { recursive: true });
  }
}
