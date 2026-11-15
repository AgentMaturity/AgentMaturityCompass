// The A4 project page's live parts, moved unchanged from a4View.js (the a4-plain split): presence, the proposal
// conflict card and its JSON merge, and the validation of each poll answer.
import { renderPromptDiffViewer } from "./components/promptDiffViewer.js";
import { cardLabel, codes, esc, isObject } from "./a4Html.js";

export function renderPresence(presence, error) {
  const chips = presence.map((row) => `<span class="chip">${esc(row.username)} is on ${esc(cardLabel(row.card))}</span>`).join(" ");
  return `${chips || `<span class="muted">No presence reported.</span>`}${error ? ` <span class="muted">Presence: ${esc(error)}</span>` : ""}
    <p class="muted">Presence is held in memory for 30 seconds; it is not durable and not evidence.</p>`;
}

/**
 * "Apply my changes on top" only while the head takes a proposal (`conflict.proposable`, step `explained`; a4.js). Paths
 * both sides changed (`conflict.clashes`, found when the member applies) are listed and need "Apply mine over theirs".
 */
export function renderConflict(conflict) {
  const same = conflict.headRevisionNo === conflict.baseRevisionNo;
  const clashes = conflict.clashes ?? [];
  // What Studio returned, verbatim: the page does not know which transitions moved the head.
  return `<section class="card a4-conflict"><h4>${same ? "Studio refused your proposal" : "The specification changed while you were editing"}</h4>
    ${same ? `<p>Studio answered <code>${esc(conflict.code)}</code>. The head is at seq ${esc(conflict.headSeq)} (still
      r${esc(conflict.headRevisionNo)}; now <code>${esc(conflict.headStage)}</code> <code>${esc(conflict.headStep)}</code>). Review
      the page below before you act.</p>` : `<p>The head is r${esc(conflict.headRevisionNo)}; you started from
      r${esc(conflict.baseRevisionNo)}. Changes on the head:</p>
    ${conflict.theirs.length ? renderPromptDiffViewer({ status: "ok", changes: conflict.theirs }) : `<p class="muted">No specification changes on the head.</p>`}`}
    ${conflict.proposable ? "" : `<p>Studio takes a proposal only at step <code>explained</code> of the project's current stage; the head is at
      <code>${esc(conflict.headStage)}</code> <code>${esc(conflict.headStep)}</code>, so your changes cannot be applied on top of it.
      Reload shows the head and discards your edits.</p>`}
    <p>Your changes when Studio refused them${conflict.proposable ? " (Apply my changes on top uses the editor as it is now)" : ""}:</p>
    ${renderPromptDiffViewer({ status: "ok", changes: conflict.mine })}
    ${clashes.length ? `<p class="status-bad">You and r${esc(conflict.headRevisionNo)} both changed ${codes(clashes.map((row) => JSON.stringify(row.path)))}.
      Nothing was sent. "Apply mine over theirs" puts your editor's value there in place of r${esc(conflict.headRevisionNo)}'s; or
      edit those paths and apply again, or Reload to start from r${esc(conflict.headRevisionNo)}.</p>` : ""}
    <div class="row wrap">${!conflict.proposable ? "" : clashes.length
      ? `<button type="button" data-a4-action="apply-on-top" data-a4-confirm="${esc(conflict.clashKey)}">Apply mine over theirs</button> `
      : `<button type="button" data-a4-action="apply-on-top">Apply my changes on top</button> `}<button
      type="button" class="secondary" data-a4-action="reload">Reload</button></div></section>`;
}

/** Structural JSON diff: one row per differing leaf; arrays compare whole. */
export function jsonDiff(before, after, path = []) {
  if (isObject(before) && isObject(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) => jsonDiff(before[key], after[key], [...path, key]));
  }
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ path, before, after }];
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Applies jsonDiff rows onto another spec ("apply my changes on top"); a missing `after` deletes the key. A row reaching
 * through a value that is not an object there is refused, never replaced by {} (mergeOnTop avoids it).
 */
function applyChanges(base, changes) {
  let out = structuredClone(isObject(base) ? base : {});
  for (const { path, after } of changes) {
    if (path.some((key) => UNSAFE_KEYS.has(key))) throw new Error("The specification uses a reserved key name.");
    if (path.length === 0) { out = structuredClone(after); continue; }
    let node = out;
    for (const key of path.slice(0, -1)) {
      if (!isObject(node[key])) throw new Error(`The head no longer has an object at ${JSON.stringify(path)}. Nothing was sent.`);
      node = node[key];
    }
    if (after === undefined) delete node[path.at(-1)];
    else node[path.at(-1)] = structuredClone(after);
  }
  return out;
}

const within = (path, prefix) => prefix.length <= path.length && prefix.every((key, index) => key === path[index]);

/**
 * The head's changes (`theirs`) that collide with the draft's (`mine`), both diffed from the revision the draft was
 * edited from: the same path, or one inside the other, unless both wrote the same value at the same path.
 */
export function clashingChanges(theirs, mine) {
  return theirs.filter((row) => mine.some((own) => (within(own.path, row.path) || within(row.path, own.path))
    && !(own.path.length === row.path.length && JSON.stringify(own.after) === JSON.stringify(row.after))));
}

/**
 * The draft on top of the head, once the member has seen and confirmed `clashes`: the draft's rows win, and where the
 * draft changed something inside a path the head replaced, the draft's whole value at the head's path is written.
 */
export function mergeOnTop(headSpec, mine, draft, clashes) {
  const outer = clashes.filter((row) => mine.some((own) => own.path.length > row.path.length && within(own.path, row.path)));
  const at = (path) => path.reduce((node, key) => (isObject(node) ? node[key] : undefined), draft);
  return applyChanges(headSpec, [...mine.filter((own) => !outer.some((row) => within(own.path, row.path))),
    ...outer.map((row) => ({ path: row.path, after: at(row.path) }))]);
}

// P1-52: validateNativeTaskPoll (nativeTasks.js) is exported, but it validates the native-task view (task, truncated,
// event kinds), not A4's { events, nextCursor, firstCursor, droppedEvents, head, presence }. This copy keeps its refusals:
// a malformed or oversized page, a cursor or event order that moves backwards, and a head that regresses or names
// another project. P1-57's head names no projectId (the request path names the project), so only a present, different
// one is refused.
const POLL_EVENT_BYTES = 2 * 1024 * 1024;

/** Presence rows as Studio returned them (the poll's or the heartbeat's), keeping only well-formed ones. */
export const presenceRows = (rows) => (Array.isArray(rows) ? rows.slice(0, 256) : []).filter((row) => isObject(row) && typeof row.username === "string")
  .map((row) => ({ username: row.username, card: typeof row.card === "string" ? row.card : "" }));

export function validateA4Poll(value, current, cursor) {
  const int = (number) => Number.isSafeInteger(number) && number >= 0;
  if (!isObject(value) || !Array.isArray(value.events) || !Array.isArray(value.presence) || !int(value.nextCursor)
    || !int(value.firstCursor) || !int(value.droppedEvents) || !isObject(value.head) || !int(value.head.headSeq)
    || value.events.length > 512 || value.presence.length > 256
    || new TextEncoder().encode(JSON.stringify(value.events)).byteLength > POLL_EVENT_BYTES) {
    throw new Error("Studio returned an unsupported A4 update. No updates were applied.");
  }
  if ((value.head.projectId !== undefined && value.head.projectId !== current.projectId) || value.head.headSeq < current.headSeq) {
    throw new Error("The project head moved backwards or changed identity. No updates were applied; reload the page.");
  }
  if (value.nextCursor < cursor || value.firstCursor > value.nextCursor + 1) {
    throw new Error("The event cursor moved backwards. No updates were applied; reload the page.");
  }
  let previous = -1; // a project's CREATED transition is seq 0
  for (const event of value.events) {
    if (!isObject(event) || !int(event.cursor) || event.cursor <= previous || event.cursor < value.firstCursor || event.cursor > value.nextCursor) {
      throw new Error("Studio returned out-of-order A4 updates. No updates were applied.");
    }
    previous = event.cursor;
  }
  // The cursor is the next seq to read, so an event at the cursor is new.
  return { head: value.head, nextCursor: value.nextCursor, events: value.events.filter((event) => event.cursor >= cursor),
    presence: presenceRows(value.presence) };
}
