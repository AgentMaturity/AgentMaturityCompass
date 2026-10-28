# dsh-amc-plugin

AMC's gate for DeepSeek Harness (DSH) tool calls. **Not qualified**: it has been tested only against a fake Cordis
context, not a DSH binary, and AMC makes no enforcement claim for DSH. See `docs/adapters/SUPPORT_MATRIX.md` in the
AMC repository.

Written against `@deepseek-ai/dsh@0.2.1-rc.2` (contract in `docs/source-reviews/P2-17-dsh-plugin.md`). It imports
nothing at runtime and declares `@deepseek-ai/cordis` `~4.0.5` as a peer, so it never loads AMC's vendored Cordis.

## What it does

- Before every tool call (`tools/pre-execute`, prepended) it asks AMC through the `decide` transport you pass, with the
  tool name and its frozen arguments. Only an exact `{ decision: "allow" }` lets the call continue.
- A guard denies every call AMC did not allow, so another plugin's listener cannot skip AMC.
- It denies on an unqualified DSH version, missing arguments, a transport error, a timeout or any other answer.
- With `observe`, it reports each finished call's name, call ids and `isError`; never arguments or output.

```js
import { createAmcDshPlugin } from "dsh-amc-plugin";

export default createAmcDshPlugin({
  decide: async (request, signal) => /* ask AMC */ ({ decision: "deny", reason: "not wired" }),
  dshVersion: "0.2.1-rc.2",
  qualifiedVersions: [],
});
```

There is no AMC transport yet: the AMC Bridge has no `dsh` provider. With `qualifiedVersions: []` every call is denied.

## Publishing

Private. Only Sid publishes; the commands are in `qualification/2026-10-28-P2-17/PUBLISH.md` in the AMC repository.
