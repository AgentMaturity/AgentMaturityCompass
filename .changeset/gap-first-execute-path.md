---
"agent-maturity-compass": patch
---

`amc governor check` and every caller of the Action Policy engine now name the actual cause when EXECUTE is downgraded because the agent's configuration is untrusted. A fresh agent with no trusted diagnostic run, or with a latest trusted run below integrity 0.6, gets an `UNTRUSTED RUN:` reason naming the run and its integrity. Its required evidence asks for a sealed `amc run` at integrity 0.6 or above, instead of telling the operator to re-sign a configuration whose signature is valid. "Re-sign policy/config files" is still given when a signature fails or no run explains the downgrade. `docs/GOVERNOR.md` gains "Reaching EXECUTE", which says what the gate needs and that no observed-evidence sequence reaches it on a fresh workspace today. The decision itself is unchanged.
