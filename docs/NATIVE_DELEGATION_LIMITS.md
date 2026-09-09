# Native delegation limits

AMC can bound a child delegation before authorizing it and keep that bound across
continuations. The operator chooses the conditions; the model cannot set or widen
them in a `delegate` tool call. These controls use AMC's own delegation and
cancellation path and require no DSH or Pi runtime.

Implementation is tracked in AMC-1545. Combined source, installed-runtime and
security-mutation qualification is pending. This guide defines the implemented
contract, not a completed acceptance receipt.

## Set a bound

After configuring the normal native workspace, provider and signed `delegate`
tool grant, add these options to a native `agent-loop run` or `agent-loop chat`
command:

```sh
--delegate --tools workspace \
  --delegate-stop max-turns:3 \
  --delegate-stop timeout-ms:60000
```

These are example operator limits, not observed timings or task results. A native
task still needs its usual provider/model and credential reference. See
[Your first native AMC workflow](NATIVE_AGENT_WORKFLOW.md).

| Condition | Runtime meaning |
| --- | --- |
| `max-turns:N` | At most N child executor invocations within one delegation, counting its initial goal and accepted continuations. It does not count individual model requests or tools, and does not combine separately authorized children into one quota. |
| `timeout-ms:N` | One elapsed-time deadline for the delegation, including initial execution, follow-ups and idle time while a child remains continuable. Follow-ups do not reset it. |

Values must be positive canonical decimal safe integers. Timeouts cannot exceed
2,147,483,647 milliseconds, the supported timer limit. Unknown names, prose such
as “stop when finished”, duplicates, fractional/exponent values and malformed
conditions are refused before a child is authorized or announced. The refusal
names the supported form. Natural-language completion criteria belong in the
goal; AMC does not turn a model's completion claim into a mechanical stop rule.

Omitting all stop conditions adds no extra delegation limit. It does not disable
the existing per-turn step limits, depth checks, signed budgets, approvals or
tool scopes. The model-facing `delegate` tool remains one-shot; the turn ceiling
also governs continuable children used through the native delegation API.

## Signed presets and continuation

A reviewed preset in `.amc/agents.yaml` may declare:

```yaml
delegate:
  enabled: true
  stopConditions:
    - max-turns:3
    - timeout-ms:60000
```

This is a configuration fragment, not a complete signed file. Preserve the
existing preset structure and use the normal reviewed signing process. Explicit
`--delegate-stop` arguments replace preset defaults. `--no-delegate-stop` is an
explicit operator reset of these additional conditions; the existing governance
controls still apply. Combining positive and reset flags is refused rather than
choosing silently by argument order. Stop flags require enabled delegation.

Native chat captures the resolved conditions in the commands it uses for later
turns and resume. It refuses an altered or unverifiable selected preset instead
of silently adopting a different declaration. Operator declarations are copied
before asynchronous composition; mutating an earlier array cannot widen a
capability already granted.

Each nested delegation receives the narrower inherited and configured condition
of each kind. Its own deadline is also enclosed by its parent's cancellation
signal, so starting a descendant cannot restart the parent's remaining lifetime.
The legacy foreign-process `delegate.timeoutMs` setting remains a separate
process-runner timeout; it is not silently reinterpreted as these native limits.

## What a stop proves

The signed handoff records the exact supported conditions. The native spawn
boundary enforces them; a packet created or verified independently is only a
signed declaration. Historical packets containing free text do not retroactively
become enforced execution evidence.

At the turn ceiling, the runtime admits no further child invocation and releases
the continuation. A timeout requests cancellation through the actual executor
signal, including when the child is idle. An active execution has the existing
bounded cancellation grace to return. A runner that ignores cancellation is
reported as abandoned or unconfirmed; an abort signal alone does not prove that
its process or side effects stopped. Late completion cannot create a second
settlement or reopen the child.

The parent's delegation settlement names the runtime stop cause. Child output
remains separate from that account. Limits cannot prove the answer correct,
make a failed task successful, or establish comparative performance. Check the
native signed session and independent verifier for the available execution
evidence; preserve incomplete and unknown outcomes.

### Output from a stopped native child

A native turn may record useful text before cancellation, a step/token ceiling,
or another failure. The native runner returns the newly recorded readable text
separately from its unsuccessful outcome and runtime reason. The first spawn's
failure may carry `childText`; a continuation failure carries `text`. Neither
field makes `ok: false` successful. Text already returned by an earlier
continuation is not returned again. A refusal before new work remains empty.

Missing or pruned text payloads are described in the runtime reason as incomplete
output, not replaced with diagnostic markers in the child's words. Available
fresh text may still be returned with that failure. The existing unsigned-row
refusal suppresses output. Reading text is not independent signature or chain
verification; use the normal verifier and preserve the original child session.

The model-facing `delegate` tool still reports the runtime failure account alone,
without concatenating a partial answer as though the child succeeded. Native
API callers must keep the text and settlement separate. Timeout/grace/abandonment,
turn limits, root-governed budgets, scopes and approvals are unchanged. A late
executor return still does not rewrite an already-unconfirmed settlement.

This correction is implementation-only under AMC-1545. Its scripted native
regressions in `tests/nativeChildStopOutput.test.ts` are **UNEXECUTED** pending
the consolidated final qualification; no provider, process-stop or release
acceptance is implied.
