---
"agent-maturity-compass": patch
---

`amc connect hooks install|status|remove --provider dsh` (control mode only) binds AMC's DeepSeek Harness plugin, AMC's DSH transport and the DSH on PATH in a signed manifest with a dedicated hook lease. It prints the plugin entry to add to the DSH profile; AMC does not edit DSH profiles. The plugin registers each DSH process as a session before its first call, and AMC measures the plugin, its transport and the `@deepseek-ai/dsh` and `@deepseek-ai/dsh-tools` packages on disk against the manifest. The transport accepts only a signed answer bound to exactly the call it sent. Removal revokes the lease and runs through the deletion gate. No DSH version is qualified, so every DSH call is still denied and nothing is claimed for DSH.
