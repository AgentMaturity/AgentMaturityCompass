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
