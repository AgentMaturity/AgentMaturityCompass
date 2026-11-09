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
`amc native-schedule run-due|watch`, and `openAgentSession`, which the SDK, ACP,
Studio native tasks, the wire consumer and the trial runner all use. Delegated
children run inside their parent's session and inherit its verdict. Every entry
checks before the vault is unlocked, so a refused run never migrates a 1.x
vault (a migration commits a key set on this machine and would then count as
your own work); only an explicit vault command in that workspace does that.

The verdict (`src/security/workspaceTrust.ts`) builds on the key-set anchoring
that already exists in `src/keys/keyset.ts`:

| Workspace | Verdict |
|---|---|
| Its key set was committed on this machine (`amc init` or a key rotation ran here) | trusted, no record needed: it is your own |
| It has no signer: no key set and no legacy role key (`.amc/keys/auditor_ed25519.pub`) | trusted: nothing signed in it can verify; the session is pinned to "no policy", so keys and a tools policy that appear while it is open are refused, not applied |
| A 1.x key layout (role keys, no `keyset.json`) whose signed `tools.yaml` verifies with the legacy auditor key | first use: consent binds that key's fingerprint (recorded as generation 0) |
| Otherwise, no consent record on this machine | first use: refused until you trust it |
| A consent record, same signer and same signed `tools.yaml` | trusted; the consented `tools.yaml` digest is pinned for the session (a re-signed policy under a long-lived session is refused, not applied). Consent given while no signed `tools.yaml` verified pins "no policy" the same way: a policy signed later is refused for the rest of the session |
| A consent record, but the signer, the signed `tools.yaml` or the signed presets (`.amc/agents.yaml`) changed | changed: refused until you trust it again |
| The consent store is unreadable | refused for every workspace, with the repair step named |

The refusal names what the workspace would apply: the key-set generation and
digest, how many signed tools, how many shell write grants, egress hosts and
binaries, and how many signed presets. Presets are bound because they choose a
run's approval gate and delegate provider: a preset re-signed after consent (a
dropped `approveTools`, a foreign `delegate.provider`) is a changed surface.
`agent-loop run` checks trust before it reads a preset. A later key-set fork or rollback is still refused by the key-set
anchoring itself (`FORK_DETECTED`, `ROLLBACK_DETECTED`).

## Giving consent

Consent comes only from the operator, never from a file in the workspace:

- `amc trust workspace` records it (`--status` shows the verdict, `--revoke`
  removes it, `--repair-store` moves an unreadable store aside, `--json`);
- `--trust-workspace` on `agent-loop run`, `agent-loop chat`, `amc acp` and
  `native-schedule run-due|watch`; `trustWorkspace: true` in the SDK client
  options (the SDK spawns `amc acp --trust-workspace`, so the record says
  `acp-flag`; an in-process `openAgentSession({ trustWorkspace: true })` says
  `sdk-option`);
- `AMC_TRUST_WORKSPACE=1` for a headless host (Studio, the wire consumer, CI).
  Studio forwards it to its native-task child, which records the consent in the
  credentials home Studio runs with (`AMC_HOME` for that child), so `amc trust
  workspace` must also use that home when run by hand.

The record lives in `<AMC home>/state/workspace-trust.json` (0600, written
atomically under the control-file lock), keyed by a digest of the workspace's
real path, and holds the key-set generation and digest, the signed `tools.yaml`
digest, the signed presets digest, the time and the source of consent. `AMC_HOME` moves it with the rest of
the AMC home.

## Limits

- A workspace that migrated from 1.x on this machine (an explicit vault
  command unlocked it here) holds a key set this machine committed and reads as
  your own; that migration is the operator's action in the workspace. Nothing a
  repository ships unlocks it implicitly: `.amc/local-vault-passphrase` is read
  beside a vault only when this machine committed that vault's key set, so bare
  `amc`, `amc run`, `amc init` and `amc monitor start` never open, migrate or
  commit a cloned vault with a passphrase the clone supplies.
- Consent binds the signer, the signed `tools.yaml` and the signed presets.
  Skills are not part of the digest (they are prompt text, stamped as data), and
  neither are the narrowing layers a repository can only tighten against its own
  signed tools policy (the Action Policy, budgets).
- Consent is never asked interactively, by design: a TTY run is refused with the
  message above, and the operator re-runs with the flag or `amc trust workspace`.
  A prompt that any terminal can answer would give an agent driving a terminal on
  this machine a way to consent; the explicit forms leave a command in the
  operator's own history.
- The verdict is not written to the evidence ledger; the consent record is
  machine-local state in the AMC home, like the anti-rollback marks.
- An existing workspace whose keys were created before anti-rollback marks
  existed on this machine reads as adopted, not committed, and is asked once.
