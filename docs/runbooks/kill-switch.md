# Runbook: Kill Switch

P2-26. Use this when an agent must stop taking effects now. AMC's kill switch
refuses the next protected effect; it never interrupts one already
dispatched. The manual fallback below works when AMC itself is down.

## 1. Activate through AMC (OWNER)

```bash
curl -s -X POST "$AMC_URL/api/v1/runtime/kill-switch" \
  -H "authorization: Bearer $OWNER_TOKEN" -H "content-type: application/json" \
  -d '{"scope":{"kind":"workspace","id":"workspace"},"mode":"stop_new_effects","reason":"<why>","incidentId":"<incident id or null>"}'
```

- `scope.kind`: `workspace`, `agent` (id = agent id), `tool_class` (id = an
  action class such as `FINANCIAL`) or `provider` (id = a gateway upstream id).
- `mode`: `stop_new_effects` keeps `READ_ONLY` tools and model calls (the safe
  state for reads and reconciliation); `stop_all` refuses everything,
  including gateway model calls.
- The issuer is the authenticated principal. The record is signed with the
  workspace's artifact-seal key, written to `.amc/runtime/kill-switch/` and
  mirrored under the control checkpoint root (`AMC_CONTROL_CHECKPOINT_DIR`)
  outside the workspace, and recorded in the ledger
  (`KILL_SWITCH_ACTIVATED`), which opens an incident.

Check: `GET /api/v1/runtime/kill-switch` and the red line at the top of the
Studio banner. Refusals carry `kill_switch_active`: a `TOOL_CALL_DENIED` row
(or a `recheck_failed:kill_switch_active` receipt for journaled calls), a
toolhub `EXECUTE_FROZEN_ACTIVE` audit, or a gateway `KILL_SWITCH_DENIED`
audit with HTTP 403.

A file in either kill-switch directory that cannot be read or verified
counts as an active workspace `stop_all` and raises a
`KILL_SWITCH_UNVERIFIABLE` alert. Remove only files you can account for.

Under `AMC_NO_SIGN=1` the kill still activates, because refusing an emergency
stop is the unsafe direction. The record carries the signature `unsigned`, the
ledger row goes to the unsigned evidence store, and no receipt is written.
Every enforcement point treats it as an active kill for the scope and mode it
names (one whose scope is not a plain id counts as a workspace `stop_all`). An
unsigned record never lifts or narrows a kill: an unsigned release counts as
an unverifiable file, and a kill is released only by the signed release below.
Its incident and its alerts (`KILL_SWITCH_UNVERIFIABLE`,
`KILL_SWITCH_SUSPEND_FAILED`) are also recorded in the unsigned store, and
`amc incident list` and `GET /api/v1/incidents` show that incident in any mode,
labelled unsigned. That incident is never cut by `--limit` (or `limit`): it is
kept past the limit and counted. If the unsigned store cannot be read, the
list still shows the signed incidents and says so (`unsignedUnreadable`).

## 2. Release (OWNER)

```bash
curl -s -X POST "$AMC_URL/api/v1/runtime/kill-switch/release" \
  -H "authorization: Bearer $OWNER_TOKEN" -H "content-type: application/json" \
  -d '{"killId":"<killId>","incidentId":"<the kill'"'"'s incident>"}'
```

The release is signed and must name the kill's incident, so under
`AMC_NO_SIGN=1` it is refused; release from a signing session. Break-glass never
overrides an active kill switch. An agent-scoped `stop_all` kill also suspended the agent
(lifecycle reason `incident`); the release does not resume it. An OWNER
resumes it with `amc lifecycle transition --to active` once the incident is
closed.

## 3. Manual fallback (AMC down)

Do these in order; each works without AMC.

1. Copy an offline-signed lease revocation list into the workspace
   (`amc lease revoke` on an offline machine with the owner keys, then copy
   the signed list into `.amc/`), so any AMC process that comes back refuses
   the agent's leases.
2. Stop the agent's compute: `kubectl scale deployment/<agent> --replicas=0 -n <ns>`,
   or apply a deny-all egress NetworkPolicy:

   ```yaml
   apiVersion: networking.k8s.io/v1
   kind: NetworkPolicy
   metadata: { name: amc-kill-switch-deny-egress, namespace: <ns> }
   spec:
     podSelector: { matchLabels: { app: <agent> } }
     policyTypes: [Egress]
     egress: []
   ```

3. Revoke the provider API keys at each provider's console.

Record what you did as an incident oversight record when AMC is back.

## 4. Drill

```bash
npm run build
node scripts/drills/kill-switch-drill.mjs --out qualification/<date>-P2-26/kill-switch.json
```

Without `--workspace` the drill uses a fresh temporary workspace. It passes
only when the fixture system of record shows zero effects after activation.
Its signed `amc.drill/1` receipt records the manual-fallback rehearsal as
`pending` until a person rehearses step 3 on a kind cluster and fills it in.
The drill cadence is agreed with the design partner (Sid, P2-03). Under
`AMC_NO_SIGN=1` the drill refuses before activating anything, since it could
neither release its kill nor sign its receipt.
