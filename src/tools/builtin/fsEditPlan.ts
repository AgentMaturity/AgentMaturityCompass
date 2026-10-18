/**
 * Plan a list of literal edits against one read of a file (P1-36).
 *
 * Pure and all-or-nothing: edits apply in order to an in-memory string, and
 * the first one that cannot apply throws, so the caller writes either every
 * edit or none. Replacement is a splice, never `String.prototype.replace`,
 * which would expand `$&`, `$$`, `` $` `` and `$'` in the agent's text.
 */

export interface LiteralEdit {
  readonly find: string;
  readonly replace: string;
  readonly replaceAll?: boolean;
}

export interface EditPlan {
  readonly after: string;
  readonly replacements: number;
  readonly perEdit: readonly number[];
}

class EditPlanError extends Error {
  override readonly name = "EditPlanError";
}

/** Every start of `find`, overlapping ones included: in "aaa", "aa" starts twice, and picking one would be a guess. */
function occurrences(text: string, find: string): number {
  let count = 0;
  for (let at = text.indexOf(find); at !== -1; at = text.indexOf(find, at + 1)) count++;
  return count;
}

/** Left to right, without overlap, never rescanning inserted text. */
function replaceEvery(text: string, find: string, replace: string): { readonly text: string; readonly count: number } {
  const parts: string[] = [];
  let from = 0;
  for (let at = text.indexOf(find); at !== -1; at = text.indexOf(find, from)) {
    parts.push(text.slice(from, at), replace);
    from = at + find.length;
  }
  parts.push(text.slice(from));
  return { text: parts.join(""), count: (parts.length - 1) / 2 };
}

export function planLiteralEdits(before: string, edits: readonly LiteralEdit[], path = "the file"): EditPlan {
  let text = before;
  const perEdit: number[] = [];
  edits.forEach((edit, index) => {
    const label = edits.length === 1 ? "" : `edit ${index + 1} of ${edits.length}: `;
    const refuse = (problem: string) => new EditPlanError(label + problem);
    if (edit.find.length === 0) throw refuse("find is empty");
    if (edit.find === edit.replace) throw refuse("find and replace are identical; nothing would change");
    const at = text.indexOf(edit.find);
    if (at === -1) throw refuse(`no occurrence of that text in ${path}`);
    if (edit.replaceAll === true) {
      const replaced = replaceEvery(text, edit.find, edit.replace);
      text = replaced.text;
      perEdit.push(replaced.count);
      return;
    }
    const count = occurrences(text, edit.find);
    if (count > 1) throw refuse(`that text appears ${count} times in ${path}; include more context or set replaceAll`);
    text = text.slice(0, at) + edit.replace + text.slice(at + edit.find.length);
    perEdit.push(1);
  });
  return { after: text, replacements: perEdit.reduce((sum, count) => sum + count, 0), perEdit };
}
