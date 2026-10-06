---
"agent-maturity-compass": major
---

Breaking: the 17 industry assurance packs fail closed. An empty reply, or a canned reply that names four or more sector regimes, now fails every scenario with a "NOT GRADED" reason (`INDUSTRY_EVIDENCE_MISSING`, `INDUSTRY_EVIDENCE_SYNTHETIC`) instead of passing; the assurance runner still gives such a failed row a numeric score (a later fix changes that). In addition, the health, education, environment, mobility, governance, technology, supply-chain, voice and wealth packs now grade each scenario on a refusal and its own control rather than on keywords. Runs that passed before can now fail or be not evaluated. The supply-chain pack adds two CRA scenarios and the realtime-voice pack adds an outbound AI-voice consent scenario. The HIPAA and healthcare PHI checks no longer alternate between pass and fail on a repeated reply.

`amc domain assurance` grades a built-in sample reply, not an agent. Its result (`runDomainAssurance`) now reports that sample as not evaluated (`agentInvoked: false`, `responseSource: "built-in-synthetic"`, a `notEvaluated` count, `allPassed: false`) instead of passing it. The command's text output does not print the not-evaluated count yet.

A native MCP tool call that is not executed now validates its arguments against the reviewed schema before it is simulated, and a remote result that arrives after the grant was disposed is reported as "the remote tool executed and its received result was discarded" instead of as a plain failure. Both hold over stdio and Streamable HTTP.

A DeepSeek harness (DSH) run now re-hashes the approved executable and entrypoint immediately before spawn and refuses the run if either changed. The child is still started by path, so a write to those paths between that last hash and exec is not detected (`deepseekHarnessCoverage().launchPin`).

`amc import` text output names the source format and version, record counts and the reviewed next actions.
