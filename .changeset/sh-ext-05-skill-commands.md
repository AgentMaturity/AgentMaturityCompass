---
"agent-maturity-compass": minor
---

Skills: command files (`.amc/commands/<name>.md`, `<ns>/<name>.md` as `/ns:name`) join the skill catalog; frontmatter is parsed as YAML with `argument-hint`, `arguments`, `user-invocable`, `disallowed-tools` (narrows the run; an unregistered name refuses the run), and `allowed-tools`/`model`/`effort` reported only; `$ARGUMENTS`, `$N`, `$name`, `${AMC_SKILL_DIR}` and `${AMC_WORKSPACE}` are substituted in one pass with an attribution frame that names the file, the arguments and the rendered text by digest; directory skills list their supporting files.
