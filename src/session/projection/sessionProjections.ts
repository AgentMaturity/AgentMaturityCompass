/**
 * The session spine's built-in projections.
 *
 * One factory rather than a module-level singleton registry: a registry owns
 * cached fold state, and two sessions folding two different logs through one
 * cache would spend every evaluation retiring each other's entries — correct
 * (the cut digests would never match), but pointlessly so. Each SessionService
 * therefore gets its own registry, and a caller that wants a projection of its
 * own registers it on `registry` beside the built-ins.
 */
import { surfaceProjection } from "../surfaceProjection.js";
import type { ConversationHistory } from "../surfaceProjection.js";
import { createProjectionRegistry, type ProjectionHandle, type ProjectionRegistry } from "./projectionRegistry.js";

export interface SessionProjections {
  readonly registry: ProjectionRegistry;
  /** The model-visible conversation, folded from this session's committed rows. */
  readonly surface: ProjectionHandle<ConversationHistory>;
}

export function createSessionProjections(): SessionProjections {
  const registry = createProjectionRegistry();
  return { registry, surface: registry.register(surfaceProjection) };
}
