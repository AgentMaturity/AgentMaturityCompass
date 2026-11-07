# Workspace trust on first use

A workspace signs its own `.amc` (the tools policy, agent presets, the Action
Policy) with its own key set, and a repository can ship both. Cloning such a
repository and running a native agent session would apply its signed
`tools.yaml` (shell write grants, egress hosts, read-deny, binaries) and its
signed presets with your rights. Workspace trust is the consent step in front
of that, comparable to Claude Code's workspace trust dialog and Gemini CLI's
trusted folders.

## What is checked, and where

Every native session entry checks the workspace before it loads anything the
workspace signed: `amc agent-loop run` (and every turn of `agent-loop chat`),
`amc native schedule execute`, and `openAgentSession`, which the SDK, ACP,
Studio native tasks, the wire consumer and the trial runner all use. Delegated
children run inside their parent's session and inherit its verdict.

The verdict (`src/security/workspaceTrust.ts`) builds on the key-set anchoring
that already exists in `src/keys/keyset.ts`:

| Workspace | Verdict |
|---|---|
| Its key set was committed on this machine (`amc init` or a key rotation ran here) | trusted, no record needed: it is your own |
| It has no key set | trusted: nothing signed in it can grant anything |
| Otherwise, no consent record on this machine | first use: refused until you trust it |
| A consent record, same key set and same signed `tools.yaml` | trusted |
| A consent record, but the key set or the signed `tools.yaml` changed | changed: refused until you trust it again |
| The consent store is unreadable | refused for every workspace, with the repair step named |

The refusal names what the workspace would apply: the key-set generation and
digest, how many signed tools, how many shell write grants, egress hosts and
binaries. A later key-set fork or rollback is still refused by the key-set
anchoring itself (`FORK_DETECTED`, `ROLLBACK_DETECTED`).

## Giving consent

Consent comes only from the operator, never from a file in the workspace:

- `amc trust workspace` records it (`--status` shows the verdict, `--revoke`
  removes it, `--repair-store` moves an unreadable store aside, `--json`);
- `--trust-workspace` on `agent-loop run`, `agent-loop chat`, `amc acp` and
  `native schedule execute`; `trustWorkspace: true` in the SDK client options;
- `AMC_TRUST_WORKSPACE=1` for a headless host (Studio, the wire consumer, CI).

The record lives in `<AMC home>/state/workspace-trust.json` (0600, written
atomically under the control-file lock), keyed by a digest of the workspace's
real path, and holds the key-set generation and digest, the signed `tools.yaml`
digest, the time and the source of consent. `AMC_HOME` moves it with the rest of
the AMC home.

## Limits

- Consent binds the key set and the signed `tools.yaml`. Signed presets and
  skills are not part of the digest; a repository that changes only those after
  consent is not re-prompted (skills are prompt text, stamped as data).
- There is no interactive prompt yet: a TTY run is refused with the message
  above, and the operator re-runs with the flag or `amc trust workspace`.
- The verdict is not written to the evidence ledger; the consent record is
  machine-local state in the AMC home, like the anti-rollback marks.
- An existing workspace whose keys were created before anti-rollback marks
  existed on this machine reads as adopted, not committed, and is asked once.
