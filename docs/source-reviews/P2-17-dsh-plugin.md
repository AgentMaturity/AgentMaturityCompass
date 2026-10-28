# P2-17 - DSH plugin: the pinned tool-pipeline contract AMC's plugin uses

- Plan item: `P2-17` part C
- Pinned release: `@deepseek-ai/dsh@0.2.1-rc.2` (npm `latest` dist-tag on 2026-10-28, published 2026-10-17), integrity
  `sha512-tvY+yhfKRifthbqPe/OK0AYxM5ZkvqfYq/jMYgJcEUxiRRL1Vwra3Ti5TB6AXgSWQdiPHYh/Vp6SJa9yHwMNuw==`
- Source reviewed: tag `dsh-v0.2.1-rc.2` of `github.com/deepseek-ai/deepseek-harness`, commit
  `687f282e8625c6b8d11ff58211a90524be2e4317`. The npm package carries no `gitHead`; the tag is the link between the two.
- Cordis: `@deepseek-ai/dsh@0.2.1-rc.2` depends on `@deepseek-ai/cordis` `~4.0.5`; the plugin's peer range matches.
- Binary: **not run**. No DSH package was installed or executed; the plugin is tested against a fake Cordis context
  (`tests/dshAmcPlugin.test.ts`).

## Why this pin

0.2.x is pre-release, and DSH promises breaking changes. `0.2.1-rc.2` is what `npm install @deepseek-ai/dsh` installs
today (the `latest` tag); `next` is `0.2.1-rc.4` and `alpha` is `0.2.2-alpha.2`. A release candidate on `latest` is
the version operators are most likely to run. **Sid must accept pinning a pre-release** before any qualification;
every version bump needs this review repeated.

## Contract at the pin

### Where a plugin can gate a tool call

From `docs/subsystems/tools.md` and `packages/core/tools/src/index.ts` (`prepareExecution`):

1. The registry snapshots the call's arguments as lossless JSON and freezes them **before** policy runs, so they are
   available to every listener and cannot change afterwards. `PreToolDecision` has no input rewrite.
2. `tools/pre-execute` is a waterfall `(exec, next) => PreToolDecision` (`allow`, `deny`, `cancel`, `ask`). The innermost
   `next` is `allow`. A listener that returns without calling `next()` short-circuits every listener after it.
3. Only on `allow` do the monotonic guards (`ctx.tools.guard(fn)`) run. A guard is synchronous and can only deny.
4. A throw anywhere in this stage becomes a failed result; the tool body is never dispatched.
5. `ask` goes to the approval service; only `allowed-once` proceeds, and a missing service or channel denies.
6. Sub-dispatches (for example calls inside a `run_code` program) run through the same pipeline, carrying a `parent`
   token.

Arguments are therefore available at the gate. The 2026-09-08 finding that DSH's approval request carries no tool
arguments still holds (`docs/subsystems/approval.md`), which is why the plugin does not use the approval seam.

### How AMC's plugin uses it

- A pre-execute listener registered with `prepend` asks AMC (through an injected transport) and returns `deny` unless
  AMC answers exactly `allow`. On allow it calls `next()`, so later listeners can still deny or ask.
- A guard denies every call AMC did not allow. This covers a listener ahead of AMC's (another plugin that also
  prepends) returning `allow` without `next()`. Listener order cannot widen AMC's answer.
- Missing arguments, an unqualified DSH version, a transport error, a timeout and a malformed answer all deny. The
  denial text for missing arguments is "DSH did not supply tool arguments; AMC cannot evaluate this call".
- `tools/result` observations carry tool name, call ids and `isError` only.

### Failure behaviour

- AMC's listener throws or AMC does not answer: the call is denied (blocks).
- The plugin is not loaded: DSH runs tools ungoverned. A plugin entry whose module cannot be resolved is reported
  through the Cordis logger and skipped, not fatal (`docs/cordis-tutorial/01-first-plugin.md`). AMC has no session
  registration for DSH yet, so it cannot tell a governed session from an ungoverned one. Until it does, no
  enforcement claim is possible.

## Built since, and still pending

Built (P2-17, on the AMC side):

- The Bridge control route accepts provider `dsh` (`src/adapters/dsh/dshProvider.ts`). Each mapped built-in has a fixed
  argument schema taken from DSH 0.2.1-rc.2's `defineTool` parameters: `read` (`file_path`, `offset`, `limit`),
  `write` (`file_path`, `content`), `edit` (`file_path`, `old_string`, `new_string`, `replace_all`) and `web_fetch`
  (`url`). Paths must be absolute in one canonical spelling and are resolved through symlinks; DSH resolves relative
  paths against a per-session working directory AMC cannot see. `write`'s sandbox-escalation fields, any other
  argument, and the shell, search, PTC, subagent and MCP tools are not mapped, so they are denied.
- Session registration (`src/bridge/dshSessionRegistry.ts`): one session per plugin instance, measured against the
  signed installation (plugin module, AMC's transport module, the `@deepseek-ai/dsh` and `@deepseek-ai/dsh-tools`
  packages on disk).
- The installer (`amc connect hooks install --provider dsh`, control mode only) and AMC's transport
  (`src/adapters/dsh/dshControlClient.ts`), which checks that each answer is signed and bound to its request. The
  plugin imports the transport by the path in its profile entry.

Pending:

- No DSH version is qualified (`src/adapters/dsh/dshVersions.ts`), so the Bridge denies every DSH call.
- Before any qualification, AMC must protect DSH's own configuration and profile files from mapped writes, so an
  allowed `write` cannot unmount the plugin. Their paths were not reviewed at this pin.
- Installed conformance with the pinned DSH and a local scripted provider: a denied write leaves no file; a bridge
  outage blocks. This needs an approved install of the pinned package.
- The other DSH packages (fs, shell and web tools, Cordis) are not measured at registration.

## Files reviewed (SHA-256 of the retrieved bytes)

| File at `687f282e` | SHA-256 |
| --- | --- |
| `docs/subsystems/tools.md` | `b34e4f1569bb33cc1379bb44aae24a23c9f0f4af49c26e13a7f850dabea56488` |
| `docs/subsystems/approval.md` | `795418a89bbd276c9fa9ea7144730761def6d55259b4815955ded718877f2cdd` |
| `docs/cordis-tutorial/01-first-plugin.md` | `d9e7fb1f2b1f14fa721c11fa390a3c852026ca5587fcde583baeb2e8896c6271` |
| `packages/core/tools/src/index.ts` | `398bcdeb221e450d088510830b77d99a513e65ab31e40ade71688a19cdf5e6aa` |
| `packages/core/tools/package.json` | `ebbfe4df3fed6b627e7f093df6c1d76de8b1739692ca0214fc03bec863d7e8c9` |
| `.agents/notes/archived/feature/2026-06-30-interception-extension-points.md` | `10ae368b10d0960c9df52060308894e09b7183962477426bff5113d639af4364` |
