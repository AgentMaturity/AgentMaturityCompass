# Native skills

A skill is a directory containing a `SKILL.md` with `name` and `description` frontmatter. The name must match the directory and use a slash-command name. Skills remain attributed workspace text; loading one grants no tools, credentials or execution authority. `{{variables}}`, shell syntax and examples in its body remain literal.

Explicit workspace and home anchors are resolved to their actual filesystem paths first, including macOS `/var` aliases. Discovered skill roots, directories and files must still contain no symlink components.

Discovery starts with the explicit AMC home `skills` directory when supplied. Within a Git repository, it then visits each directory from the nearest repository root through the current workspace, reading `.agents/skills` before `.amc/skills` at each level. More specific directories override ancestors; `.amc/skills` wins over `.agents/skills` at the same level. Both Git directories and worktree `.git` files define repository boundaries. Without a Git marker, discovery reads only the explicit workspace. It never imports ambient skills above the repository. An unreadable boundary or exhausted 64-directory ancestor search refuses discovery rather than claiming that no repository exists.

Use the existing run command to inspect discovery without creating a session:

```sh
amc agent-loop run --list-skills --json
amc agent-loop run --list-skills review --json
```

The list reports winning sources, content digests, model-invocation availability, problems and a separate versioned discovery observation. Named inspection also prints the exact literal body. Incomplete discovery exits unsuccessfully. `disable-model-invocation: true` hides a skill from the model's advertised catalog and `skill.load`; the operator can still inspect it and invoke `/name`.

The historical catalog digest continues to identify admitted names and content bytes, independently of location or discovery diagnostics. The separate observation digest includes sources, root coverage and problems. Each catalog build is a fresh observation. The existing model-selected load path rereads the catalog; neither listing nor a previous successful observation approves later bytes.

Discovery limits are 64 roots, 2,048 entries, 64 KiB per skill, 1 MiB total file bytes and 64 diagnostics. Missing roots are ordinary absences. Unreadable roots, stat failures, malformed or duplicate frontmatter, nonregular files, symlinks, invalid UTF-8, source changes and limit refusals remain visible. An unreadable higher layer suppresses uncertain lower-layer winners. A failed named override never revives an earlier version. A source change during discovery prevents publication of potentially stale winners.

Filesystem access reuses AMC's contained, nonblocking, no-follow reader and checks source witnesses before publishing. Node has no `openat`; a parent swapped away and restored entirely between checks is outside these checks' observation model. Skills are untrusted prompt data and never executable packages.

Shared native sessions used by ACP, Studio and the SDK also resolve `/name` before enqueueing a turn. In ordered image or audio input, a command in the first text part replaces only that part; every later part retains its position and bytes. Input beginning with media remains literal. The selected skill contributes only during that turn. A later ordinary turn has no active skill context; previously committed snapshots remain signed history.

## Command files, frontmatter fields and `$ARGUMENTS`

Beside every `skills` root, a `commands` directory (`.amc/commands`, `.agents/commands`, `<AMC home>/commands`) holds command files: `<name>.md` invoked as `/name`, and `<ns>/<name>.md` (one level deep) invoked as `/ns:name`. A command file is a skill without a directory: same frontmatter, same catalog, same digests, same layering. `name` may be omitted (the file name is the name; a stated name must match it) and `description` defaults to the body's first line. Names are `[A-Za-z0-9][A-Za-z0-9_-]{0,63}` segments; chat accepts `/ns:name` in lowercase. A command that collides with a skill in the same layer is reported, not silently chosen; a later layer's command overrides an earlier layer's skill of the same name as usual.

Frontmatter is YAML (block lists work) with Claude Code's field names:

| Field | Effect |
|---|---|
| `name`, `description` | as before |
| `disable-model-invocation: true` | `/name` only; never advertised to the model |
| `user-invocable: false` | model only (`skill.load`); `/name` is refused with the reason |
| `argument-hint` | shown by `--list-skills` |
| `arguments: [a, b]` | declared names, fed positionally, for `$a`, `$b` |
| `disallowed-tools: [fs.write, bash]` | the run's registry is narrowed before the turn; a name that is not registered REFUSES the run rather than restricting nothing. In an ACP session the narrowing lasts for the rest of the session. `delegate` and `workflow` are withheld with it when present: a delegated child composes its own toolset without the skill and would hand the denied tool back. |
| `allowed-tools`, `model`, `effort`, `when_to_use` | parsed and reported only. Workspace text cannot widen a signed tool policy or choose a route. |

A list field that cannot be read is a reported problem, never an empty list.

Arguments after `/name` are substituted into the body in one pass, Claude Code's dialect: `$ARGUMENTS` (the whole text), `$0`, `$1`, `$ARGUMENTS[N]` (0-based, quote-aware words), `$name` for declared arguments, `${AMC_SKILL_DIR}`, `${AMC_WORKSPACE}`, and `\$` for a literal dollar. Values are inserted literally and never expanded again; an undeclared `$word` stays as written. The arguments are also the user prompt of the turn, as before; a bare `/name` still uses the description. Limits: 16 KiB of arguments, 32 words, 1 MiB rendered.

The attribution frame stays true after substitution: it names the file and its sha256, the operator-supplied arguments and their sha256, and the rendered text's sha256, and states that the substituted text is user data. For a directory skill it also names the directory and lists regular files beside `SKILL.md` (names and sizes, at most 64) so the model knows what `fs.read` can reach; nothing but `SKILL.md` is read into the prompt.

Intentional differences: no `` !`command` `` shell injection in prompt files (prompt text never runs commands), no `context: fork`, no `hooks` or `agent` fields, and `allowed-tools` never grants.
