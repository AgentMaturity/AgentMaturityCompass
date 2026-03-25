# Mirofish Audit: CLI Experience (AMC-80)

## First Impressions
- `amc --help` outputs **427 lines** — overwhelming for first-time users
- Good: has "Start with a task" section with role-based suggestions
- Good: error messages include "Tip:" with guidance
- Issue: no `amc` with zero args should show a concise welcome, not full help

## Strengths
1. ✅ `amc quickscore` works immediately — zero setup required
2. ✅ `--rapid` mode for impatient users (5 questions vs 235)
3. ✅ `amc doctor` provides clear health diagnostics
4. ✅ JSON output (`--json`) available on key commands
5. ✅ Role-based quick start in help output
6. ✅ Error messages suggest closest commands
7. ✅ Namespace shortcuts documented (evidence → verify, bundle, etc.)

## Issues Found
1. ⚠️ **Help overload**: 427 lines is too much. Should show top 10 commands, then "run `amc help` for full list"
2. ⚠️ **No interactive wizard**: `amc quickscore` is great but a `amc start` or first-run wizard would improve onboarding
3. ⚠️ **376 CLI commands total**: impressive but intimidating. Progressive disclosure needed.
4. ⚠️ **Vault unlock blocking**: `quickscore --auto` requires vault unlock — non-obvious for new users
5. ⚠️ **No color-coded severity**: assurance results could use red/yellow/green more consistently

## Recommendations
1. Add concise zero-arg output: "Welcome to AMC. Try: `amc quickscore`"
2. Consider `amc tour` — interactive walkthrough of top 5 features
3. Group commands into tiers: Essential (5), Common (15), Advanced (rest)
4. Add `--no-sign` hint when vault lock blocks operations
