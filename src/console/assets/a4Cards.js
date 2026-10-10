// A4 Studio card registry (P1-58). Stage modules (a4Aspire.js … a4Activate.js) add or replace cards from their
// register(); a4.js imports all four statically, so registration never depends on import order.
import { STAGES, renderBuildCard, renderConversation, renderReviewCard, renderSpecEditor } from "./a4View.js";

const GENERIC = [["conversation", "Conversation", renderConversation], ["specification", "Specification", renderSpecEditor],
  ["build", "Build", renderBuildCard], ["review", "Review", renderReviewCard]];
const cards = new Map(STAGES.map((stage) => [stage, new Map(GENERIC.map(([id, title, render]) => [id, { id, title, render }]))]));

/** `renderer(ctx)` returns HTML; buttons inside it use `data-a4-action` names a4.js handles. A known id replaces the generic card. */
export function registerStageCard(stage, cardId, renderer, title = cardId) {
  if (!cards.has(stage) || typeof cardId !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(cardId) || typeof renderer !== "function") {
    throw new Error(`Invalid A4 card registration: ${String(stage)} ${String(cardId)}`);
  }
  cards.get(stage).set(cardId, { id: cardId, title, render: renderer });
}

export function stageCards(stage) {
  return [...(cards.get(stage)?.values() ?? [])];
}

const actions = new Map();
/**
 * A stage's own button action (P1-60): `build({ button, value, headBinding, uuid, projectPath })` returns
 * `{ label, path, body }` for a `data-a4-action` name a4.js does not know. The path is this project's
 * (`projectPath("/…")`) or a native task route; Studio re-checks every action.
 */
export function registerStageAction(stage, name, build) {
  if (!cards.has(stage) || typeof name !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(name) || typeof build !== "function") {
    throw new Error(`Invalid A4 action registration: ${String(stage)} ${String(name)}`);
  }
  actions.set(`${stage}:${name}`, build);
}

export function stageAction(stage, name) {
  return actions.get(`${stage}:${name}`) ?? null;
}
