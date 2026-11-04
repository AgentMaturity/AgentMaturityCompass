# Runbook: Provider Exit

P2-26. Use this to rehearse, and if needed carry out, leaving a model
provider. It is designed to support an ICT third-party exit plan (register
row `eu-dora`); AMC makes no DORA conformity claim.

## 1. Know your providers

`buildProviderRegister(workspace, agentId)` (`src/runtime/providerExit.ts`)
lists the gateway's model upstreams (`gateway.yaml`), the key providers bound
to the signing purposes, and the evidence store, each with its exit: an
alternate model that the agent's change envelope declares
(`digest_in_set` on the `model` component), or a safe stop.

## 2. Declare an alternate before you need it

An alternate takes over only if the agent's change envelope admits it and
each of its required tests has a signed passing result for that exact
manifest (see [REGULATORY_RUNTIME.md](../REGULATORY_RUNTIME.md), slice C).
An undeclared alternate is an out-of-envelope change: refused in a regulated
workspace, a warning elsewhere, and a reassessment either way.

## 3. Drill

```bash
npm run build
node scripts/drills/provider-exit-drill.mjs --workspace <ws> --agent <agentId> \
  --provider <upstream id> [--alternate <provider>/<model>] \
  --out qualification/<date>-P2-26/provider-exit.json
```

The drill disables the provider at the gateway with a provider-scoped
`stop_all` kill switch, checks that model calls to it fail closed, records
whether the envelope admits the alternate (`switched`,
`blocked_out_of_envelope` or `blocked_no_envelope`), releases the kill, and
writes a signed `amc.drill/1` receipt with the provider register. Without
`--workspace` it uses a fresh temporary workspace with no envelope.

## 4. Real exit

1. Activate a provider kill (`scope.kind: provider`) through
   `POST /api/v1/runtime/kill-switch`; proxy traffic to the provider's host
   is refused too.
2. Switch the agent's route to the declared alternate and open a session;
   the envelope check at session open records `CHANGE_ENVELOPE_APPLIED`.
3. Revoke the old provider's API keys at the provider.
4. Release the kill with a signed OWNER release once nothing routes there.

The drill cadence is agreed with the design partner (Sid, P2-03).
