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

## 2. Release (OWNER)

```bash
curl -s -X POST "$AMC_URL/api/v1/runtime/kill-switch/release" \
  -H "authorization: Bearer $OWNER_TOKEN" -H "content-type: application/json" \
  -d '{"killId":"<killId>","incidentId":"<the kill'"'"'s incident>"}'
```

The release is signed and must name the kill's incident. Break-glass never
overrides an active kill switch.

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
The drill cadence is agreed with the design partner (Sid, P2-03).
