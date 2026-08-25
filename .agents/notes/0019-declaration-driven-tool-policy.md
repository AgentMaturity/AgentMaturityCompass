# ADR-0019 — Tool policy follows the declaration, not the name

Status: accepted · Date: 2026-08-25 · Follows [ADR-0018](0018-phase-4-wiring.md)

## The bug family, and why it kept producing holes

`validateToolRequest` decided what to check by matching the tool's **name**:

```ts
if (input.tool.name === "fs.read" || input.tool.name === "fs.write") { …paths… }
if (input.tool.name === "http.fetch")                                { …hosts… }
if (input.tool.name === "process.spawn")                             { …binary, argv… }
if (input.tool.name.startsWith("git."))                              { …a hardcoded cwd rule… }
```

That is not a policy about capabilities. It is a policy about four identifiers,
and it produced three separate holes across two phases before the shape was
visible:

1. **P4.3** — a network tool under any name but `http.fetch` got no host check,
   so the `web_fetch` the plan asks for would have shipped ungoverned. Patched
   then with an `actionClass`-driven guard.
2. **P4.3** — path globs reach `fs.read`/`fs.write` only, so `glob`, `grep` and
   any new filesystem tool get no path policy from this function.
3. **P4 wiring** — a `bash` entry declaring `argvRegexDenylist` was **dead
   config that reads as policy**, because argv patterns only ever reached
   `"process.spawn"`. Patched then in the guard.

Each patch closed one hole. The shape kept producing more.

## The fix

Every check now runs because the tool's signed entry **declares** the
corresponding policy, against whichever arguments carry that kind of value:

| the entry declares | what is checked | on which arguments |
|---|---|---|
| `allow.paths` / `deny.paths` | path globs | `path`, `file_path`, `filePath`, `notebook_path` |
| `allow.hostAllowlist` or `denyByDefault` | host allowlist | `url`, `uri` |
| non-empty `allow.binariesAllowlist` | binary allowlist | `binary`, `executable` |
| non-empty `deny.argvRegexDenylist` | deny patterns | `command`, `argv`, `args`, `binary` |

So a new tool is governed by existing, or it declares nothing and is governed
by the allowlist's presence rule alone. The tests use deliberately unfamiliar
names — `notebook.open`, `webhook.post`, `runner.exec` — so that any of them
passing because of what a tool is *called* means the fix has been undone.

**Fail closed on a declared-but-uncheckable policy.** An entry declaring a path
policy on a call naming no path is DENIED. A declared policy that cannot be
evaluated has not been satisfied, and "we could not tell" is not a reason to
proceed — the same rule the egress guard applies to a network call with no
parseable host.

**Argument roles are a closed list.** A guessed role is worse than no role: it
would silently check the wrong field and report a policy as satisfied. A path
under a name not listed is a reason to add it deliberately.

**An empty allowlist is not a declaration.** `binaryAllowedForTool` reads an
empty list as "no restriction", so treating its presence as a policy would deny
every call for naming no binary — a policy nobody wrote.

The guard patch from the wiring commit is **deleted**. One place decides.

## What measuring the cwd rule turned up

The `git.*` branch applied a hardcoded `["./workspace/**", "./**"]` to the
working directory. Generalising it looked obvious. Measuring it was not:

| cwd | allow | deny | result |
|---|---|---|---|
| `../etc` | `./` + globstar | none | denied (outside the workspace) |
| `.git/hooks` | `./` + globstar | none | denied (leading dot never matches) |
| `src` | `./` + globstar | none | allowed |
| `../etc` | bare globstar | a `.git` pattern | **ALLOWED — an escape** |
| `.git/hooks` | bare globstar | a `.git` pattern | **ALLOWED — the deny never fires** |

So my first version added a deny list of `.amc` and `.git` patterns, and
**neither entry could ever fire**: `.amc` is refused unconditionally inside
`pathAllowedByPatterns` before any list is consulted, and a globstar-slash
`.git` pattern needs a segment before `.git` that a workspace-relative path
does not have.

I had written exactly the thing this ADR exists to remove — config that reads
as policy and enforces nothing — while removing it. Worse, the obvious repair
(widen the allow pattern to a bare globstar so the deny "works") would have
opened an escape out of the workspace entirely.

The deny list is gone. `./` + globstar is what protects the working directory,
it protects it against both escapes and dot-directories, and the tests pin that
because it is a property of the glob implementation rather than of an explicit
rule.

## Verification

18 tests, 13 mutations, all caught after two survivors were closed — the
declared-but-uncheckable host case had no test, and the `.git` cwd case was
passing for a reason other than the one its comment claimed.

Three of the mutations restore the original name-keying, one per hole. If any
of them stops turning the suite red, the family is back.

## Still open

`pathAllowedByPatterns` refuses `.amc` through a rule inside itself rather than
through a declared policy. That is the right outcome and the wrong shape — it
is invisible from any config, so an operator reading `tools.yaml` cannot tell
it exists. Recorded rather than moved, because relocating an unconditional
protection deserves its own change.
