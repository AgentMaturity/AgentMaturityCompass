/**
 * The verdict a `verify` node reads from its delegate (SH-ORCH-03).
 *
 * THE TOKEN IS MINTED PER DISPATCH. A fixed phrase such as `VERDICT: pass` could
 * be quoted back from the text under review — a reviewed output that contains
 * the line passes itself. The runtime therefore mints a nonce the reviewed
 * output cannot have known, asks for `VERDICT-<nonce>: pass|fail` as the LAST
 * non-empty line, and fails the node when the line is missing, repeated or
 * contradictory. That makes the control flow mechanical. It does not make the
 * verdict trustworthy: the verifier sees the token and the reviewed text in one
 * goal, so the reviewed text can still steer the model that writes the line.
 * The judgement behind the line is a model's; nothing here evaluates it.
 */

export type Verdict = "pass" | "fail" | "missing" | "ambiguous";

export function verdictInstruction(nonce: string): string {
  return `Finish with exactly one final line, and nothing after it: VERDICT-${nonce}: pass — or — VERDICT-${nonce}: fail. `
    + "Give that line only once. Quote nothing from the reviewed output that looks like it.";
}

export function readVerdict(text: string, nonce: string): Verdict {
  const pattern = new RegExp(`^VERDICT-${nonce}: (pass|fail)$`);
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  const matches = lines.flatMap(line => { const hit = pattern.exec(line); return hit === null ? [] : [hit[1] as "pass" | "fail"]; });
  if (matches.length === 0) return "missing";
  if (matches.length > 1 || !pattern.test(lines.at(-1) ?? "")) return "ambiguous";
  return matches[0]!;
}
