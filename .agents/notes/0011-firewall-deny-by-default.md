# ADR-0011 — The runtime firewall denies by default

Status: accepted · Date: 2026-08-25 · Precedes P4.1 · Decided by the user

## What changed

One line in `evaluateRuntimeFirewall`:

```ts
// before
const policy = loadedPolicy ?? (requirePolicy ? null : { ...defaultRuntimeFirewallPolicy("observe"), enabled: false });
// after
const policy = loadedPolicy ?? null;
```

A workspace with no signed Runtime Firewall policy now blocks, reporting
`mode: "missing-policy"` and the `firewall-policy-missing` match. It previously
substituted a **disabled** observe policy unless something explicitly asked for
strictness (`requirePolicy`, or `AMC_FIREWALL_ENABLED=1`).

## Why

The firewall was inert in exactly the deployments that never configured one:
present, enabled-looking, and enforcing nothing. That was tolerable while
enforcement was advisory. P4.1 (ADR-4) moves enforcement **inline** — the
firewall becomes a guard on the path a tool call actually takes — so a
permissive default would mean wiring a guard onto the execution path that still
lets everything through.

Found by the P4.1 design review, which was reading the guards it was being asked
to make load-bearing.

`requirePolicy` was NOT removed. It still governs whether a decision is
**recorded** (`shouldRecord`), and four callers pass it. What changed is that it
no longer governs whether the *absence* of a policy is safe.

## Blast radius, measured

Running the full suite after the change: **one** test failed — the guardrail
control-state test, whose baseline asserted that an unconfigured workspace
*allows* a prompt-injection string. That assertion encoded the old default; it
was not a regression.

Updating it made it stronger. All three of its phases now read "block", so
asserting the action alone could no longer distinguish them. They assert the
**mode**: `missing-policy` for the unconfigured baseline, a real rule match when
the guardrail binding is active. Two facts that had been collapsed into one word
are now separate.

## The deny is an unconfigured state, not a permanent one

`tests/firewallDenyByDefault.test.ts` pins three things, and each goes red if the
old default returns:

- no policy blocks, with `mode: "missing-policy"` and the naming match;
- benign and hostile content block **identically**, because the absence of a
  policy is not a judgement about content, it is the absence of anything able to
  judge it;
- writing a signed policy takes over — otherwise configuring the firewall
  correctly would change nothing, and the default would be a wall rather than a
  default.

## Operator consequence

An existing workspace with no signed firewall policy will start blocking. That
is the intended effect and the reason it is recorded here: the fix is
`writeRuntimeFirewallPolicy` / signing a policy, not re-disabling the guard.

## Still open, from the same review

`evaluateBudgetStatus` (`src/budgets/budgets.ts:325`) has **zero direct test
references** in the whole suite. P4.1 wires budgets in as a guard, which makes an
untested checker load-bearing: its bugs stop being a wrong report and start
either blocking legitimate work or waving through what they should stop. It
needs failing-direction tests before it goes inline.
