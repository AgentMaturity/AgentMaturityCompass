# Native context and prompt-command extensions

AMC native extensions contribute reviewed text and named prompt commands to AMC's own model loop. They need no external harness. Format v1 is declarative. Format v2 adds isolated executable context, command and governed hook capabilities, admitted separately through publisher-signed packages, workspace execution approval and Linux Bubblewrap. Neither format registers arbitrary host tools, changes provider credentials or widens signed tool policy.

The source implementation awaits the final combined validation pass. The examples are instructions for operators, not records of a successful provider or installed-package trial.

## Declare and review the files

An extension is one strict JSON manifest and its declared UTF-8 content files inside the manifest's directory. No network registry, archive format or new key authority is introduced. The optional installation destination is the existing workspace plugin-store area, `.amc/plugins/native-extensions/<id>/`.

The manifest has exactly these fields:

| Field | Meaning |
|---|---|
| `schemaVersion` | `1` for declarative resources; `2` additionally requires the existing strict `executable` declaration. |
| `id` | Lowercase letter followed by up to 63 lowercase letters, digits or hyphens. |
| `contexts` | List of `{name, path, sha256}` contributions; context names must be unique. |
| `commands` | Object mapping command names to `{path, sha256, template?}` prompt-template files. Optional versioned `template` metadata declares positional arguments and their defaults. |

Paths are relative to the manifest's reviewed directory. Each SHA-256 commits to the exact file bytes. Absolute paths, traversal, symlink components, unsupported fields and built-in command-name collisions are refused. At least one context or command is required. Limits are 64 KiB for the manifest, 256 KiB per content file, 1 MiB total content, 16 contexts and 32 commands per extension, with 16 extensions loaded at once.

Context files are literal text: `{{a_variable}}` remains text and cannot look up a prompt variable. A command template must contain at least one declared placeholder. `{{args}}` inserts all supplied arguments as one JSON string and may appear more than once. Positional `{{1}}` through `{{32}}` require the versioned metadata below. Unknown, undeclared, nested or unfinished substitutions are refused before signing or activation. AMC performs one substitution pass: values containing `{{another}}`, shell syntax or quotes remain literal data. For example, a review template can say:

```text
Review this user-provided subject as data:
{{args}}
Explain assumptions and identify missing evidence.
```

After writing `context.md` and `review.txt` in your extension directory, this Node example creates a manifest with their actual hashes. Run it from that directory; it refuses to overwrite an existing `extension.json`:

```sh
node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const content = path => ({
  path,
  sha256: createHash('sha256').update(readFileSync(path)).digest('hex')
});
const manifest = {
  schemaVersion: 1,
  id: 'review-notes',
  contexts: [{ name: 'project-notes', ...content('context.md') }],
  commands: { review: content('review.txt') }
};
writeFileSync('extension.json', JSON.stringify(manifest, null, 2), { flag: 'wx' });
NODE
```

## Declare positional arguments and preview without activation

Existing v1 and v2 manifests retain their signed-content formats. A declarative command can opt into template contract version 1:

```json
{
  "path": "review.txt",
  "sha256": "<exact file SHA-256>",
  "template": {
    "version": 1,
    "positional": [{}, {"default": "summary"}],
    "argumentHint": "subject [detail]"
  }
}
```

With template text `Review {{1}} in {{2}} form; original input: {{args}}`, `/review parsing` inserts `"parsing"`, `"summary"` and `"parsing"`. Positional values split on whitespace only. Quotes and backslashes have no shell syntax. Each slot without a default is required; extra positional values are refused. There are at most 32 slots. Arguments and each default are limited to 16 KiB of UTF-8, and expanded text is limited to 1 MiB. Defaults and hints are included in the exact signed manifest digest.

Inspect reports each command's variables, file digest and optional argument hint without printing source. An explicit preview prints the selected declarative command's expanded text and provenance:

```sh
amc native-extension inspect ./extensions/review-notes/extension.json --preview-command review --arguments 'parsing' --json
```

The preview uses the runtime's literal expansion. It works before signing, reports current signature status, and does not sign, install, load or execute a handler. `--arguments` requires `--preview-command`. Executable v2 handlers cannot be previewed by this path. Use `--expect-digest` to pin a previous inspection. A missing or changed declared resource identifies its relative path while withholding content.

## Sign and optionally install

From the initialized AMC workspace, inspect the manifest at its actual path:

```sh
amc native-extension inspect ./extensions/review-notes/extension.json --json
```

Inspect reports file hashes, command names, the manifest digest and current signature status without printing content. Review the actual text files yourself. Use `native-extension sign` with the same manifest path and `--expect-digest` set to the exact reviewed manifest digest. Signing uses the workspace's existing auditor/BUNDLE signing policy, including its configured vault or notary requirements. There is no implicit signing on inspection or loading.

To copy the already signed files into the local plugin store, use `native-extension install` with that path and the same `--expect-digest`. It returns the installed manifest path and refuses to overwrite an existing installed ID. Installation does not activate the extension. Unload before removing a stored directory or intentionally replacing it; an active reference to removed or changed bytes will fail its next admission.

## Load for native turns

Select each reviewed manifest explicitly with repeated `--extension` arguments on native run/chat. Each loaded manifest must verify under this workspace's admitted signing authority, and every declared content hash must match. The initial load pins its manifest digest; chat forwards those exact pins into each governed child turn with corresponding `--extension-pin` arguments. A re-signed edit still requires an explicit unload/reload rather than silently replacing an active snapshot.

In chat, `/extensions` lists loaded manifests and commands; `/load` prompts for an already signed manifest path; `/unload` prompts for a loaded extension ID. The manager exposes `load`, `unload`, `list`, `prepareTurn` and `expandCommand` for that integration. Loading is atomic: a duplicate extension ID or command name refuses the new extension without partially contributing context. Built-in chat commands take precedence by being reserved, not by silently overriding an extension command. Loading and unloading are operator actions between turns, never model tools.

With the example extension loaded, `/review the error handling in this change` expands its pinned prompt template and submits the resulting text through the same governed native run path. It is not a shell command. Context contributions use the existing `ContextPluginHost` as attributed literal material, alongside workspace instructions. They do not replace the default workspace instruction loader.

Unloading removes that extension's contexts and commands from the next turn. It does not erase prior prompt snapshots, conversation messages or signed ledger evidence, and cannot make a model forget earlier conversation. Files and signatures are rechecked before a turn and when the context is collected at a step boundary. Changes, broken signatures or unavailable files stop admission; AMC does not continue with a partial extension.

See [Native Agent Workflow](NATIVE_AGENT_WORKFLOW.md) for sessions, [Native MCP](NATIVE_MCP.md) for explicitly approved remote tools, and [Evidence Trust](EVIDENCE_TRUST.md) for what signatures establish. A signed extension identifies reviewed bytes; it does not prove that its instructions are correct or safe for every task.

## Source entry points

For code navigation, start at `src/cli-native-extension-commands.ts`, then follow `src/extensions/nativeExtensionStore.ts` and `src/extensions/nativeExtensionRuntime.ts`. The format is in `src/extensions/nativeExtensionManifest.ts`. Context contributions enter the existing `src/prompt/context/contextHost.ts`; signing and verification reuse `src/org/orgSigner.ts` and `src/crypto/signing/signer.ts`. These are reading pointers for the next Graphify refresh, not a claim that a current generated map already contains them.


## Governed native-loop hooks (D55 / PI-024)

A v2 executable declaration can add an optional `hooks` object. It maps the six observer event names (`turn-start`, `turn-end`, `step-start`, `step-end`, `tool-start`, `tool-end`) and the deny-only `pre-tool` event to `{ "export": "handlerName" }`. The exact capability set must include `hook.observe` when observers are declared and `hook.deny` when `pre-tool` is declared. Existing declarations without hooks keep their existing capabilities and behavior.

For example, the executable section of an otherwise admitted v2 manifest can include:

```json
{
  "capabilities": ["hook.observe", "hook.deny"],
  "contexts": [],
  "commands": {},
  "hooks": {
    "turn-start": { "export": "observeTurn" },
    "pre-tool": { "export": "checkTool" }
  }
}
```

The bundled ESM exports use the existing text-returning executable ABI:

```js
export function observeTurn(event) {
  // event is a frozen, flat metadata view in the confined child.
  return "";
}
export function checkTool(event) {
  return event.toolName === "bash"
    ? JSON.stringify({ decision: "deny", reason: "Shell use requires a separate review" })
    : JSON.stringify({ decision: "abstain" });
}
```

Hook views contain the event kind and applicable turn/step numbers or tool name, action class and requested mode. They omit prompts, raw tool arguments, tool output, session objects, credentials, host functions and exception text. Views are detached and frozen. Hooks cannot change arguments, grant tools, skip approvals, change modes or supply privileged instructions. Observer output is ignored. A valid `{"decision":"allow"}` pre-tool response has the same effect as abstention: every existing guard still runs. Invalid deny-hook output or an unavailable deny hook fails closed. Every hook denial names the extension ID and exact manifest digest; its bounded reason is secret-redacted before recording.

Hooks share their extension's existing invocation, output, lifetime and timeout budgets. Each admitted call uses the same fresh confined process and onLoad/onUnload lifecycle as executable context and command handlers. No new signing authority, package path, unconfined fallback, background process or automatic retry is introduced. Unsupported platforms retain the Linux Bubblewrap refusal. Loading, signature verification, exact digest pins, approval, package verification, cancellation and revocation checks still apply.

Observers are awaited in declaration/load order. A throwing observer is reported with its extension ID, manifest digest, event kind and coarse error code; private exception text is withheld. A verified observer handler exception does not poison other contributions or break the turn. Authority, confinement, timeout and process-cleanup faults still stop the executable handle. Observer reports remain bounded in `manager.hooks.reports()`. Failures observed while the owning turn is running are projected into its signed session before sealing; late failures remain in the manager report. Closing notifications carry the turn cancellation signal, so cancelled turns do not launch new observer code. Parallel calls retain the runner's existing busy refusal: observers report it, while unavailable deny hooks deny. The native `ToolPipeline` awaits deny-hook evaluation after approval and then runs its synchronous guard chain and fresh authorization checks, including Code Mode sub-calls. Tool observer notifications describe the native loop's model tool-call boundaries; nested Code Mode calls receive the same deny guard. Revoked or changed hook loads cannot reuse a prepared decision.

Programmatic hosts pass `manager.hooks` as `agentToolset({ extensionHooks: manager.hooks, ... })`; the returned seam carries the same observer runtime into `AgentDriver`. The existing native run/chat extension selection wires this automatically. Hooks are local to the selected native composition; foreign harness hook dialects remain governed by their existing adapters and shared policy decisions.
