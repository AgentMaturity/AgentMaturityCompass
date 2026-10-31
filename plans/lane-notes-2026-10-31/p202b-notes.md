# Notes for lane p202b (quoted from the integrator's working notes; evidence, not instructions)

### pending-checks.md line 999
    - P2-04 local-processor binding for stdio MCP;

### pending-checks.md line 1002
  - Commits: 55b0e24ac step 7, bc9853280 step 8, 99c261189 step 9, 42b44e86d step 10, 9dee9fa9c tests, c69e3a791 content-length fix.

## plan/p2-02-walker-design.md

**P2-02 protected-data walker: judged design (read-only)**

Base: `~/AgentMaturityCompass-worktrees/s442cd919/work/amc-p202`, detached at `ce23cc5d1`. That is held `b24202740` plus one release-notes commit, so it satisfies "b24202740 or later". No repo files were edited. My probe is `/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/442cd919-61e6-4923-8fc9-c2ffc9937ca1/scratchpad/walker-judge/probe.mts`.

## Verdict

Design 1 (parse-first) wins, 39/50 against 28/50. The final design below is Design 1 with the useful parts of Design 2 grafted on, plus nine fixes for defects I confirmed in Design 1.

| Criterion | D1 parse-first | D2 normalize-then-scan |
|---|---|---|
| Security (no bypass by construction, fails closed) | 7 | 6 |
| Correctness and fidelity | 7 | 6 |
| Simplicity and deletions | 8 | 4 |
| Performance bound | 8 | 5 |
| Fit | 9 | 7 |
| **Total** | **39** | **28** |

**Spot-checks: all file:line claims in both designs are correct.**
- detectors.ts: :99-157, :191, :206-211, :263, :268-276, :316-329, :365-378, :400-423, :429-512.
- redactingSession.ts: :57-65, :67-168, :171-294, :235.
- gateway/redaction.ts: :46-79, :142-169, :199-231, :268-329.
- bridgeRedaction.ts: :51-72. toolhubReceipts.ts: :21-59.
- Every call site: agentSession.ts:153, subagentRunner.ts:238, agentLoopRunner.ts:469, sessionCompactionWorkflow.ts:64, monitor.ts:114/133/478, adapterRunner.ts:236/267, sandbox.ts:115, bridgeTelemetry.ts:21, bridgeServer.ts:572, toolhubJournal.ts:218, toolhubServer.ts:893/895, llmRuntime.ts:244, privacyRedaction.ts:118, server.ts:1479/1480/1481/1561/1573.
- Admission runs only in opted-in workspaces (llmRuntime.ts:232).
- I reran `walker/probe/perf.mts`: 58 / 470 / 274 / 158 / 810 ms. D1 reported 143 / 1484 / 602 / 333 / 1231 ms. The ordering is the same; the absolute gap is machine variance.

**Defects in Design 1, all fixed in the final design:**
- **(a) Views over-redact.** `views(g)` decodes the raw gap. Today it decodes the text after the in-place scan (detectors.ts:412, redactingSession.ts:256-258). With D1's version, any gap that has an escape and a raw finding is replaced whole, for example an HTML page with `&amp;` and one email.
- **(b) Views multiply.** D1's `probe` calls `unit()`, which starts a new decode chain inside every view. That is about 2^rounds views, which hits the budget and refuses benign pages (the r3-13 failure again).
- **(c) Base64 is broken by decode order.** One round is `web(json(v))`, so `+` becomes a space before base64 runs are taken whenever `\/` split the run in the raw text. Today's chain decodes JSON escapes, then base64, then web escapes (detectors.ts:149). I confirmed today's `decodedFinds` finds such a case.
- **(d) Escaped-once quoted members are dropped.** I confirmed that today `log {\"mrn\":\"A1234567\", \"na` (truncated) is caught as `health_record_id` through :207. D1 loses it.
- **(e) `generic_api_key` is deleted.** I confirmed that today `INFO api_key: abcdefghijklmnop1234` in the middle of a line is caught. D1's pair rules only anchor at line start or need `=`.
- **(f) Pair-rule values are capped** at `{1,256}` / `{0,256}`. A long value then has its tail left in place, and a long quoted value is not matched at all.
- **(g) No repeat search in gaps.** Truncated JSON that repeats a declared value is caught today by `declaredRepeats` (redactingSession.ts:143). D1 misses it.
- **(h) "First finding wins" in views.** Admission then under-counts classes, and the purpose policy sees fewer classes than are present.
- **(i) The unit memo is keyed on text alone.** It ignores declared cover, which depends on the path, and receipt counts, which depend on each finding. I drop the memo.
- **(j) The claim that D6 changes nothing is wrong.** Today `secret_env` flags a YAML line `nextPageToken: …` (I confirmed this). After D6 it is not flagged. This is a false-positive fix and should be described as one.

**Defects in Design 2:**
- **Performance claim is false.** It claims "(1+L)·N", but every node applies both whole-text decoders, which do not commute. The result is a tree of every ordering, the same problem as the r3-13 view cap, bounded only by the budget.
- **"About 250 lines" is not credible** for:
  - a lexer covering 4 escape levels and 2 quote kinds;
  - 3 decoders with offset maps;
  - inverse encoders for each layer;
  - widening and merging;
  - `redactValue` and a declared-path matcher.
- **A mapping bug would leak inside a string.** Replacing exact regions through maps can leave a value in place while the JSON guard still passes.
- **The lenient lexer brings back quote-position guessing** over free text.
- **D5 (secret table before the walk) breaks JSON.** For example, `{"api_key": "…"}` becomes `{"<AMC_REDACTED>}` before the walk can parse it.

**Grafted from Design 2:**
- `generic_api_key` stays as a shape rule.
- Repeats of declared values are found in free text (here through the kept `declaredRepeats`).
- `redactJsonLeaves` loses its `opaque` parameter.
- The budget is a required option.
- The coverage argument is framed as "every reading of the text".
- Test checks for idempotence, determinism and corpus completeness. Out-of-walker rows are filtered, not skipped, because the gate refuses skipped tests.

---

## Final design: one parse-first protected walk

### 1. Inventory and what happens to each part

**Entry points.** Each keeps its signature.

| Entry point | Becomes |
|---|---|
| Session `createWorkspaceRedactor().redact` (redactingSession.ts:171-294) | one `protectedWalk().text` |
| `redactHeaders` (redaction.ts:46-79) | `walk.text(value, header)` |
| `redactRequestTarget` (:223-231) | `walk.text(path)` and `walk.text(query)` |
| `redactBody` JSON (:268-305) | `walk.value(parsed)` |
| `redactBody` text (:307-329) | `walk.text(body)` |
| `streamHidesProtected` (:199-216) | joins kept; the probe becomes `walk.text(t) !== t` |
| `bridgeEvidenceRedactor` (bridgeRedaction.ts:51-72), reached by `processOutputRedactor` :81 and `recordedArgv` :102 | walk, then the secret table |
| ToolHub `withDeclaredFields`, `redactToolPayload`, `redactedEvidenceValue` (toolhubReceipts.ts:21-69) | `redactBody` with `declared` |
| `detectProtectedRequest` (detectors.ts:429-512) | count-mode walk |

`privacyRedaction.ts:118`, dlp.ts and detokenizeGate.ts keep their current API.

**Deleted:**
- **detectors.ts**
  - :99-114 `MAX_DECODED_VIEWS`, `decodeJsonView`, `decodedViewDepth`, `inDecodedView`;
  - :115-139 `decodedFinds`;
  - :140-157 `decodedChainFinds`;
  - :211 `secret_env`;
  - the `member` flag, plus :263 and :268-276 (the member branch of `credentialSpans`);
  - in `KEYED_NAME` (:191), the alternatives `|^[a-z0-9]*(?:password|passwd|secret|token)$|apikey$`;
  - :224 `traversalRevision`;
  - the exported wrapper of `redactProtectedText` (:316-329; the merge loop is kept as the internal `replaceRegions`);
  - :369, `redactJsonLeaves`' `opaque` parameter and its unsafe-integer branch;
  - :400-423 `JSON_TEXT` and `nestedJsonRedactor`;
  - :436-489, admission's `scan`/`visit`/`decoded`/`json` closures (the shape checks move into the walk).
- **redactingSession.ts**
  - :54-58 `MAX_NESTED_JSON`, `WHOLE_TOKEN`;
  - :64-65 `isDocument`;
  - :67-134 `tokenizeDeclared`;
  - :196-268 `scanText`, `redactJson`, `redactMember`, `redactLeaf`, `declaredIn`, `scanFallback`;
  - :270-283 root dispatch and `force`.
- **redaction.ts**
  - :142 `ScanBudgetExceeded`;
  - :144-169 `protectedRedactor`;
  - :322 the whole-body `decodedFinds`.
- **bridgeRedaction.ts:** :54-71, the charge, the detector half of `scan`, `nestedJsonRedactor` and `budgeted`.
- **toolhubReceipts.ts:** :13-36 `withDeclaredFields`, which becomes `declaredFieldsOf`, and `|| declared !== payload` at :56.

**Moved into detectors.ts, as internal helpers:**
- `hasDuplicateKey` (redactingSession.ts:59-62).
- `NUMBER_LITERAL` and `declaredRepeats` (:136-168), verbatim.
- `DeclaredFields` (:37), re-exported from redactingSession.ts.
- The member rules :207, :208, :209 and :210 become `PAIR_RULES`, with their sources verbatim.

**Unexported:** `decodeJsonEscapes`, `secretMember`, `keyedSpan`.

**Kept:**
- noise filters (:40-55);
- the decoders (:61-98; base64 refactored to decode one run at a time);
- `secretMember` and `PAGE_TOKEN_NAME`;
- issued-token shielding (:231-255);
- the shape rules: shared table ×5, `private_key`, `password_in_url`, `generic_api_key`;
- `valueOnly` and `detectProtectedText`;
- `parseExact`, `rawJSON`, `isRawJson`, `NOT_JSON`, `redactJsonLeaves`;
- `holdsMedia`, the outcome-unknown notice split (:441-445), `plainUtf8`, `STREAM_DELTA_LEAVES`, `streamChunks`, `flagMember`;
- all header, secret-table and argv code that runs in every workspace.

No tracked file is deleted.

### 2. The walk (in src/dataflow/detectors.ts)

```ts
export type DeclaredFields = Readonly<Record<string, ProtectedDataClass>>;
export type WalkFailure = "too_long" | "too_deep" | "not_text" | "inexact_number" | "unsettled" | "budget" | "unsupported_shape";
export class WalkRefused extends Error {            // static text; never crosses a caller boundary
  readonly code = "PROTECTED_WALK_REFUSED";
  constructor(readonly reason: WalkFailure) { super(`Protected data walk refused: ${reason}`); this.name = "WalkRefused"; }
}
export interface Finding { readonly dataClass: ProtectedDataClass; readonly detector: string }
export interface WalkOptions {
  readonly budget: number;                                              // required: chars + UNIT_CHARGE per unit
  readonly issued?: IssuedToken;
  readonly declared?: { readonly fields: DeclaredFields; readonly at?: readonly string[] };
  readonly replace?: (finding: Finding, value: string) => string;       // absent = count only
  readonly opaque?: (reason: WalkFailure) => string;                    // absent = throw; budget/unsupported_shape always throw
}
export interface ProtectedWalk {
  text(text: string, key?: string): string;       // === input when nothing changed
  value(value: unknown): unknown;                 // === input when nothing changed
  readonly findings: readonly Finding[];          // every finding, document order (admission counts these)
  readonly declaredMatched: readonly string[];    // sorted
}
export function protectedWalk(options: WalkOptions): ProtectedWalk;

// internal
const MAX_DEPTH = 64, MAX_DECODE_PASSES = 8, UNIT_CHARGE = 16;
const ENV_SECRET = /^[A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|SECRET_KEY|SECRET_ACCESS_KEY|PRIVATE_KEY|API_KEY|TOKEN)$/i;
const PAIR_RULES: readonly { readonly type: "secret_json" | "secret_field"; readonly re: RegExp; readonly exactOnly: boolean }[];
//  :207 quoted string member (incl. \\?["'] escaped-once), :208 quoted number member, :209 assign, :210 multipart — sources verbatim, NO value caps;
//  + line: /^[ \t]*(?<k>[A-Za-z0-9_.-]{1,64})[ \t]*[:=][ \t]*(?<v>\S+)/m   (replaces secret_env). exactOnly: quoted×2, multipart.
function memberFinding(key: string | undefined, value: string, issued: IssuedToken, charge: (n: number) => void, parsed: boolean): Finding | undefined;
function pairSpans(text: string, view: boolean, issued: IssuedToken, charge: (n: number) => void): ProtectedDataSpan[];
function jsonSegments(text: string, charge: (n: number) => void): readonly { readonly start: number; readonly end: number; readonly parsed: unknown }[];
function replaceRegions(text: string, spans: readonly ProtectedDataSpan[], replace: (region: ProtectedDataSpan, value: string) => string): string;
function hasDuplicateKey(source: string): boolean;
function declaredRepeats(values: ReadonlyMap<string, ProtectedDataClass>): (text: string) => ProtectedDataClass | undefined;
```

**Algorithm**

```
text(t,key) = unit(t, {key, path:[], roots:[at.length], depth:0}, "string");  value(v) = value(v, same ctx)
declared ⇒ pass 1 (declare: same traversal, no detectors, records covered strings/number literals/keys), then pass 2.

value(v, ctx):  depth>64 → fail(too_deep)
  string → unit(v, ctx, "string")
  number/rawJSON → src = source ?? String(v); integer ∧ ¬safe ∧ |v|<1e20 ∧ no source → fail(inexact_number)
                   charge(16+|src|); declared cover/repeat → replace; memberFinding(ctx.key, src, parsed=true) → replace;
                   ≥10 digits → detectProtectedText(src) any → replace whole number (as string)
  boolean → declared cover only;  null → keep;  Buffer/ArrayBuffer view → count mode keep, else fail(unsupported_shape)
  dense array → items keep ctx.key/path, depth+1;  plain object (proto Object|null, no symbols, data descriptors, no cycle):
      key k → unit(k, ctx, "key"); member → value(x, {key:k, path:[...path,k], depth+1})
  else → fail(unsupported_shape)

unit(text, ctx, kind):
  charge(16+|text|); |text|>MAX_PROTECTED_TEXT_CHARS → fail(too_long); depth>64 → fail(too_deep); has U+0000 → fail(not_text)
  WHOLE_TOKEN ∧ issued → keep
  declared cover: some D ⊑ path.slice(r), r∈roots, path under `at` → replace(declared_field), record value
  declaredValues.get(text) (under `at`) → replace(declared_field)
  kind≠key ∧ memberFinding(ctx.key, text, parsed=ctx.parsed) → replace whole
  pieces = jsonSegments(text): segment → doc(raw, parsed, {…ctx, roots:[...roots, path.length], depth+1}); gap → gap(g, ctx)

doc(raw, parsed, ctx): out = value(parsed, ctx)
  out≠parsed → JSON.stringify(out);  hasDuplicateKey(raw) (charged) → replace mode JSON.stringify(out) | count mode also gap(raw);  else raw

gap(g):  // exact text that did not parse
  spans  = detectProtectedText(g) ∪ pairSpans(g, view=false)
  for each raw line [a,b) of g (maximal run without \r \n):
     masked = line with intersecting spans → "[REDACTED]"        // search only; never rendered
     f = declaredRepeats(line) ?? search(masked)                  // all findings recorded; earliest names the region
     f → add region [a,b) ∪ crossing spans
  return replaceRegions(g, spans ∪ lineRegions, replace)          // merged regions; value = raw slice

search(m):  // decode-only; the one chain for this line
  base64 text runs of m → child (exact): unit(run, depth+1) in probe mode
  v=m; round 1..8:
    j = decodeJsonEscapes(v); j≠v → base64 children of j; probe(j)
    w = decodeWebEscapes(j);  w≠j → base64 children of w; probe(w)
    w==v → return findings;  v=w
  → fail(unsettled)
probe(view): jsonSegments(view) → leaves are new exact units (full treatment, depth+1);
             view gaps → detectProtectedText ∪ pairSpans(view=true: assign,line) ∪ declaredRepeats — NO nested chain
```

**`jsonSegments`**
1. Fast path: the trimmed text starts with `{` or `[` and parses whole. That gives one segment.
2. Otherwise, one pass:
   - a bracket stack; quotes are tracked only while inside a bracket;
   - a raw newline inside a string, or a mismatched closer, clears the stack;
   - the result is a forest of bracket pairs.
3. Try the top-level pairs. A pair is parsed only if the first token after its bracket fits JSON (`{`→`"` `}`; `[`→`" { [ ] - digit t f n`). Each parse is charged.
4. When a pair fails, try its children. Segments never overlap.
5. Parsing uses `parseExact` when `rawJSON` exists, else `JSON.parse`. A `SyntaxError` means "not a segment"; a stack error means `too_deep`.

**Key context: `memberFinding`**
1. `secretMember(key, v)`, or the ENV clause: `ENV_SECRET` matches, at least 8 characters once issued tokens are removed, and the name is not a page cursor. Result: `credential`, detector `secret_json` for a member of parsed JSON, else `secret_field`.
2. Otherwise `keyedSpan(key, v)`, gated by `KEYED_NAME = KEYWORD_BOUND`. Its condition changes to a span that crosses the name/value boundary (`start < prefix.length < end`). It then returns only what the name shows, so plain findings stay in place whatever the order.
3. `pairSpans` checks each match with `memberFinding(k, v)`. On a hit it narrows the span to `v`. It resumes at the start of `v`, so members nested inside a value are found (round-3 behaviour).
4. Names come from:
   - JSON members (arrays keep their member's name);
   - header names;
   - the argv flag before an argument (`flagMember`);
   - pair keys.

**Budget, termination and opaque values**
- **Charges.** One budget per call is charged for:
  - every unit (16 + length);
  - every parse attempt and duplicate-key check;
  - every gap scan and every view;
  - every `keyedSpan` context.
- **Termination.**
  - Each child is strictly shorter than its parent: a leaf is inside quotes; base64 decodes to 3/4 of the run; decoding never lengthens text.
  - Depth is at most 64 over JSON nesting, documents in strings, base64 children and leaves found in views.
  - At most 8 rounds per line, and no chain inside a probe.
  - Every regex is linear: negated classes, values end at a newline or delimiter, keys at most 64 characters.
  - The budget is the hard stop.
- **Opaque values.**
  - `too_long`, `too_deep`, `not_text`, `inexact_number` and `unsettled` are local to a unit or line. With `opaque`, that unit or line becomes `opaque(reason)`; without it, the walk throws.
  - `budget` and `unsupported_shape` always throw, and the caller replaces or refuses the whole value.
  - The walk never returns partial output.
- **Determinism.** Output depends only on the input, the options and the issued set. It is built in document order. Merged regions take the earliest span, then the longest. Tokens come from the HMAC. There is no memo.

**Coverage argument (every reading of the text).** Every character is in one of two places:
1. A parsed segment. A JSON reader sees exactly its keys, strings and number literals, and each is a unit with its member name.
2. A gap. Gaps are scanned raw: dlp, shape rules, all pair rules and repeats. Each line is then decoded by one chain that reaches every layer order. A layer one decoder produces for the other is peeled in the next round. Base64 is taken before web escapes turn `+` into a space.

Member names come only from exact parses or from pair rules on exact text, so no member rule runs where decoding has moved the quotes. That covers the r3-09 class by construction. A value split across leaves or runs is the documented gap; a raw scan misses it too.

### 3. How each caller maps onto the walk

| Caller | New body | On failure |
|---|---|---|
| Session (redactingSession.ts:173-285) | (1) Keep the length check and the `rawJSON` guard (:176-178). (2) If declaring with `unparseable === "refuse"` and `parseExact(text) === NOT_JSON`, refuse `declared_fields_unparseable`. (3) `walk = protectedWalk({budget: MAX_REDACTION_SCAN_CHARS, issued, declared: declaring ? {fields} : undefined, replace: (f, v) => tokenize(f.dataClass, f.detector, v)})`. (4) `walk.text(text)`. Receipt `declaredFields: walk.declaredMatched`. Token collision checks, `storeTokens` and the receipt are unchanged. | `WalkRefused`: `not_text` → `content_not_text`; `too_deep` while declaring → `declared_fields_unparseable`; anything else → `detector_invalid`. `redactOrWithhold` is unchanged. |
| Gateway (redaction.ts) | `protectedWalkFor(reasons, declared?)` with `replace` → reason `protectedData:<class>` and `[REDACTED]`, and `opaque` → `protectedData:unscanned` and `[REDACTED]`. Headers: `walk.text(stored, key)`. Target: path and query share one walk. JSON body: `walk.value(pathResult.value)`, then the top-level array join. Text body: `plainUtf8` and the NUL gate, then `walk.text`, then the SSE/NDJSON joins. `redactBody` options gain `declared?`. | Existing catches: header → `[REDACTED]`; body → `unscannedJsonBody()`. |
| Bridge (opted in) | `text: (s, k) => guarded(() => redactBridgeText(walkFor().text(s, k)))`; `json: v => guarded(() => redactJsonLeaves(walkFor().value(v), redactBridgeText))`. Budget `MAX_BRIDGE_SCAN_CHARS`, `replace` and `opaque` → MARKER. Walk first, so JSON reaches the walk intact. The non-opted branch (:64) is verbatim. | MARKER. |
| ToolHub | `declaredFieldsOf()` returns the fields, `undefined` or `null`. `redactBody(…, {protectedData, declared: fields && {fields, at: ["result"]}})`. A `null` body is stored as `"[REDACTED]"`, with `wasRedacted ||= declared === null`. | As gateway. |
| Admission | `walk = protectedWalk({budget: MAX_REQUEST_SCAN_CHARS, issued})`. `text()` over model, system, text/thinking/tool_result parts, `toolName` and `argumentsJson`. `value()` over params and tools. Counts come from `walk.findings`. `issued` is called on every token-shaped substring, so `phiToken` (llmRuntime.ts:241) still works. | Any throw → `refused()` → `DataFlowRefused("detector_invalid")`, unchanged. |
| Not opted in | The walk is never constructed. | — |

### 4. Rounds 1-3: how each finding is covered

Round 1 is `8de6d6570`, round 2 `d32996930`, round 3 `980190235`. Each row gets one or more corpus rows.

| ID | Finding | Coverage |
|---|---|---|
| r1-01 | adapter stdout and stderr rows unredacted | `processOutputRedactor` → bridge walk |
| r1-02 | SSE values split across events | events parsed as segments; joins kept |
| r1-03, r1-08 | ToolHub ignores declared fields | `declared` with `at: ["result"]`, the session's walk |
| r1-04 | declared fields stop one level deep | path continues through every JSON document; `roots` per document |
| r1-05 | no percent or HTML decoding | per-line chain |
| r1-06 | header denylist | every-workspace code, untouched |
| r1-07 | outcome-unknown notice hides declared fields | notice split :441 untouched |
| r1-09 | ToolHub raw arguments in meta and consent | `redactedEvidenceValue` → `redactBody` → walk |
| r1-10 | credential class too narrow | shape rules, including `generic_api_key`, plus `memberFinding` |
| r2-01 | sandbox environment in argv | untouched |
| r2-02 | text rules and leaf walk disagree on secret names | one `memberFinding` for every name source; `secret_env` folded into the ENV clause |
| r2-03, r2-12 | `process_start` argv raw | `recordedArgv` wiring |
| r2-04, r2-14 | header values unscanned | `walk.text(v, header)` |
| r2-05 | double encodings missed | chain to a fixpoint, with views parsed |
| r2-06 | passwords in form, multipart and query | assign and multipart pair rules plus `memberFinding` |
| r2-07, r3-08 | reasoning deltas, NDJSON, Ollama `response` | delta-leaf set and joins kept |
| r2-08 | ToolHub repeats only whole leaves | Map hit per unit plus `declaredRepeats` per gap and view line |
| r2-09 | UTF-16 or charset bodies | `plainUtf8`; NUL → `not_text` |
| r2-10 | bridge has no scan budget | required budget plus unit charge |
| r2-11 | keyword detectors blind inside JSON | `keyedSpan` on every keyed unit |
| r2-13 | declared redaction quadratic | O(1) Map per unit; linear repeats |
| r2-15 | base64 not decoded | children before web decoding |
| r3-01, r3-06 | `sk-` `\b` regression | every-workspace `textRegexDenylist`, untouched |
| r3-02, r3-03 | monitor rows hide POLICY_VIOLATION; delegate answer corrupted | non-opted output is the identity |
| r3-04 | wrap telemetry lost on SIGINT | cli.ts, untouched |
| r3-05 | MRN or passport in quoted text | segments, quoted rule (escaped-once kept), JSON parsed in views |
| r3-07 | argv flag members | `flagMember` key |
| r3-09 | MediaWiki and DOI false positives | quoted rules exact-only; views structural only; noise filter kept |
| r3-10 | `password_in_url` overmatch | bounded rule kept |
| r3-11 | page cursors treated as secrets | `PAGE_TOKEN_NAME` in `secretMember` and the ENV clause |
| r3-12 | per-leaf cost | number prefilter, `KEYWORD_BOUND` gate, unit charge, scanners compiled once |
| r3-13 | view-cap refusals | ≤8 rounds per line and no nested chains |

**Slice-2 items:**
- forged token-shaped text: issued lookup;
- duplicate keys: re-serialize;
- declared numbers and keys;
- raw scan before decoding;
- escaped JSON parsed;
- the escaped form of `password_json` (`valueOnly`);
- committed text equals rendered text.

**New rows for Design 1's defects (a)-(h):**
- an HTML page with `&amp;` and one raw email: only the email is replaced;
- base64 with `\/` and `+`;
- a truncated escaped-once MRN;
- `api_key:` in the middle of a line;
- a quoted password over 300 characters;
- a declared repeat inside truncated JSON;
- a view line holding a pii and a card_number finding: admission counts both classes.

### 5. Performance bound

T ≤ a·S + b·U, where:
- S ≤ budget counts characters parsed, scanned or decoded;
- U ≤ budget/16 counts units;
- a ≈ 0.06–0.14 s/MiB for ordinary text and at most 0.55 s/MiB for hostile text (dlp.ts:155-158);
- b ≈ 3 µs.

Ordinary input costs about N for parsing, plus one leaf scan per unit, plus one view per encoded line per layer present (usually 1–2). D1's walk approximation measured 280 ms on the 1.22 MB MCP body, against today's 470–1484 ms. The hostile ceilings are unchanged:

| Path | Budget | Worst case |
|---|---|---|
| Session | 32 MiB | ≈18 s |
| Gateway and admission | 16 MiB | ≈9 s |
| Bridge | 4 MiB | ≈2.2 s |

What goes away is the 27-view breadth-first search, the second scan per keyed leaf, the nested chains and the quadratic repeat search.

### 6. Migration and compatibility

- **`DETECTOR_SET_DIGEST`**: schema `amc.protected-detectors/v2`.
  - `credentialRules` holds only the shape rules.
  - Added: `pairRules` (source, flags, `exactOnly`), `envSecret`, `keyedNames = KEYWORD_BOUND`, and `walk: {revision: "protected-walk-v1", order: "json>base64>web", maxDecodePasses: 8, viewRules: "dlp+shape+assign+line"}`.
  - `limits`: `{maxDepth: 64, maxLeafChars, maxRequestScanChars, unitCharge: 16, keyedContextChars}`.
  - Dropped: `traversalRevision` and `maxDecodedViews`.
  - Old rows keep their digest; `purposePolicy.ts:49` only checks the hex shape.
- **Receipt `amc.redaction-receipt/v1`**: unchanged. Detectors no longer emitted: `secret_env`, and the session's `password_json` override (dlp's `password_json` remains). Counts are one per replaced region.
- **Token format, vault, refusal codes and the issued-token shielding**: unchanged.
- **Committed bytes, opted-in workspaces only:**
  - unchanged JSON keeps its original bytes (no `force`);
  - changed segments are re-serialized compactly;
  - a hit only decoding shows replaces its raw line, not the whole text;
  - declared fields also apply to JSON segments inside non-JSON text in the detectors-only outcome.
- **Non-opted workspaces**: byte-for-byte unchanged.
- **Docs** (`.changeset/protected-data-redaction-before-commit.md` :13, :24, :33, :37):
  - "one level deep" → "at any depth";
  - "27 decoded views and 8 rounds" → "8 rounds of the per-line chain";
  - in the Not-covered section, remove "Admission decodes … once".
- **docs/SECURITY_ARCHITECTURE_OVERVIEW.md**: :131, :139, :143, :149, :153, the same statements.
- **Unchanged files**: src/session/sessionService.ts, tokenizer.ts, tokenVault.ts, detokenizeGate.ts, dlp.ts.

### 7. Test plan (existing files only, plus one fixture)

**Fixture:** `tests/fixtures/dataflow/protected-walk-regressions.json`.
- Shape: `{schema: "amc.test.protected-walk-corpus/v1", cases: [{id, round, finding, surface, optedIn, input: {text|value, key?, contentType?, declared?}, expect}]}`.
- `surface` is one of: `walk | session | admission | gateway-body | gateway-header | gateway-target | bridge-text | bridge-json | argv | process-output | toolhub | out-of-walker`.
- `expect` is one of `{unchanged}`, `{classes, absent, present}`, `{opaque}`, `{refusal}` or `{withinMs}`.
- Secret-shaped values are `{{PLACEHOLDER}}` strings filled in by the runner.
- **Contents:**
  - at least one row per ID r1-01 to r3-13;
  - the slice-2 items;
  - rows for defects (a)-(h);
  - benign rows: the MediaWiki head script, a DOI page, `nextPageToken`/`NextToken`, `api_key_name`, the F13 610-character page, the 170k-number body;
  - hostile rows, generated: IBAN-shaped words and "1 1 1" (1 MiB), unclosed `{{{{`, JSON 65 levels deep, `%25` 9 levels deep, budget overflow.

**Runners:**
- `tests/dlpScan.test.ts`: walk rows, plus property checks over every row:
  - deterministic: two runs give the same output and findings;
  - idempotent: a second walk with the issued tokens changes nothing and finds nothing;
  - JSON in gives JSON out;
  - budget and termination;
  - completeness: every ID is present; out-of-walker rows are filtered, not skipped.
- `tests/toolhubPipelineTools.test.ts`:
  - session rows through `createWorkspaceRedactor`: tokens, receipt findings, `declaredFields`, refusal codes;
  - ToolHub rows through `appendToolEvidenceWithReceipt`.
- `tests/gatewayAndSupervise.test.ts`: `redactBody`, `redactHeaders` and `redactRequestTarget` (SSE, NDJSON and array joins, form, multipart, charset, NUL), plus byte identity for non-opted workspaces, including the `sk-` `\n`/`\t` rows.
- `tests/secretRedaction.test.ts`: `bridgeEvidenceRedactor` text and json, `recordedArgv` and `processOutputRedactor`, in an opted-in temp workspace (`initProcessorRegistry`) and a non-opted one (identity).
- `tests/catalog/l0/data.test.ts`: admission classes and refusals, duplicate-key arguments, multi-class view rows.
- `tests/sessionAttachmentSpill.test.ts`: r1-07, the notice set aside.

**Mutation checks.** Each must fail at least one row:
1. allow quoted pair rules in views → r3-09
2. remove the chain → r1-05, r2-05
3. remove base64 children → r2-15
4. take base64 after web decoding → defect (c)
5. apply `memberFinding` to JSON keys only → r2-06, r3-07, r2-04
6. drop `roots` → r1-04
7. decode unmasked lines → defect (a)
8. drop the escaped-once quoted form → r3-05 and defect (d)
9. run a chain inside probes → r3-13 within the time limit
10. treat budget overflow as keep → hostile rows
11. keep raw bytes when keys repeat → duplicate-key row

### 8. Decisions (one recommendation each) and risks

- **D1 Where the walk lives:** detectors.ts, about 600 lines. A new file would create an import cycle through `DETECTOR_SET_DIGEST`.
- **D2 Opaque in the session:** refuse with the existing codes; never invent a class.
- **D3 Depth:** 64 everywhere.
- **D4 Granularity of a hit only decoding shows:** the owning raw line.
- **D5 Rules in views:** dlp, shape rules, and the assign and line pairs. Quoted and multipart rules run only on exact text.
- **D6 Environment-style names:** the ENV clause in `memberFinding`; delete `secret_env`. This fixes the YAML page-cursor false positive.
- **D7 `generic_api_key`:** keep it as a shape rule.
- **D8 Detector names:** `secret_json` for parsed members, `secret_field` otherwise; drop the `password_json` override.
- **D9 NUL:** `not_text` everywhere, mapped to `content_not_text` in the session.
- **D10 Admission decoding:** the full chain.
- **D11 `force` re-serialization:** delete it.
- **D12 ToolHub scope:** `at: ["result"]`.
- **D13 Memo:** none. Add one only after a measurement shows the need.
- **D14 Parsing:** the walk uses `parseExact` when `rawJSON` exists. Gateway, bridge and ToolHub keep `JSON.parse`; inexact integers become opaque.
- **D15 Regexes over serialized JSON outside the walk** (`textRegexDenylist`, the bridge secret table, `summarizeBridgeBody`): leave them, for non-opted parity. Running them on leaves is a follow-up.
- **D16 Bridge order:** walk, then the secret table.
- **D17 Declared fields in non-JSON detectors-only text:** apply them to its JSON segments (more tokenization, never less).
- **D18 Class of a merged region holding several classes:** the earliest, as today. Per-class tokens for multi-class regions are a follow-up.
- **D19 Unsafe integers in admission params on Node 20:** fail closed (refuse).

**Risks:**
- **K1** Opted-in output changes. The corpus pins the new behaviour and the changeset states it.
- **K2** Unbalanced brackets fall back to gaps: coarser, but still scanned.
- **K3** The hostile worst case is unchanged. Keep the budgets and revisit after the timing rows run.
- **K4** Admission refuses more (depth over 64, NUL, `unsettled`). The benign corpus rows must pass admission.
- **K5** Declaring tools walk twice. The 32 MiB budget covers it; add a row near the limit.
- **K6** Node 20 behaviour (`runtime_unsupported`) is unchanged.
- **K7** Slice 3: the detokenize and retokenize primitives are unchanged, since `redactJsonLeaves` keeps its 2-argument calls.

### 9. Build list

**Change:**
- `src/dataflow/detectors.ts`
- `src/dataflow/redactingSession.ts`
- `src/gateway/redaction.ts`
- `src/bridge/bridgeRedaction.ts`
- `src/toolhub/toolhubReceipts.ts`
- `.changeset/protected-data-redaction-before-commit.md`
- `docs/SECURITY_ARCHITECTURE_OVERVIEW.md`
- `docs/releases/2.0.0.md`, only if `release:notes -- --check` asks for it

**New file:** `tests/fixtures/dataflow/protected-walk-regressions.json`.

**Delete:** the code listed in §1. Expected net change is about −80 lines.

**Extend:**
- `tests/dlpScan.test.ts`
- `tests/toolhubPipelineTools.test.ts`
- `tests/gatewayAndSupervise.test.ts`
- `tests/secretRedaction.test.ts`
- `tests/catalog/l0/data.test.ts`
- `tests/sessionAttachmentSpill.test.ts`

**Run:**
```
npx vitest run tests/dlpScan.test.ts tests/toolhubPipelineTools.test.ts tests/gatewayAndSupervise.test.ts tests/secretRedaction.test.ts tests/catalog/l0/data.test.ts tests/sessionAttachmentSpill.test.ts tests/llmRuntimeDispatch.test.ts tests/dataResidency.test.ts tests/nativeMcpClient.test.ts tests/nativeMcpHttp.test.ts tests/actions/authorizationRecheck.test.ts tests/cliBridge.test.ts tests/governorToolhubWorkorders.test.ts tests/gap16*ConsentBlastRadius*.test.ts
npm run typecheck && npm run typecheck:tests && npm run lint && npm run check:dead-code && npm run check:duplicates && npm run release:notes -- --check
```
After that, run one adversarial verify round with the mutation checks above.
