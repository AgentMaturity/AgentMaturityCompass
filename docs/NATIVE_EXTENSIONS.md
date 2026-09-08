# Native context and prompt-command extensions

AMC native extensions contribute reviewed text and named prompt commands to AMC's own model loop. They need no external harness. This first format is declarative: it cannot execute JavaScript, register arbitrary tool implementations, change provider credentials, widen signed tool policy or establish an OS sandbox.

The source implementation awaits the final combined validation pass. The examples are instructions for operators, not records of a successful provider or installed-package trial.

## Declare and review the files

An extension is one strict JSON manifest and its declared UTF-8 content files inside the manifest's directory. No network registry, archive format or new key authority is introduced. The optional installation destination is the existing workspace plugin-store area, `.amc/plugins/native-extensions/<id>/`.

The manifest has exactly these fields:

| Field | Meaning |
|---|---|
| `schemaVersion` | Must be `1`. |
| `id` | Lowercase letter followed by up to 63 lowercase letters, digits or hyphens. |
| `contexts` | List of `{name, path, sha256}` contributions; context names must be unique. |
| `commands` | Object mapping command names to `{path, sha256}` prompt-template files. |

Paths are relative to the manifest's reviewed directory. Each SHA-256 commits to the exact file bytes. Absolute paths, traversal, symlink components, unsupported fields and built-in command-name collisions are refused. At least one context or command is required. Limits are 64 KiB for the manifest, 256 KiB per content file, 1 MiB total content, 16 contexts and 32 commands per extension, with 16 extensions loaded at once.

Context files are literal text: `{{a_variable}}` remains text and cannot look up a prompt variable. A command template must contain exactly one `{{args}}` placeholder and no other template substitutions. AMC substitutes the supplied arguments as one JSON string, not executable code. For example, a review template can say:

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
