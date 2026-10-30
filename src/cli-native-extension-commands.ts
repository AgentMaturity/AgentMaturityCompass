import type { Command } from "commander";
import { previewNativeExtensionCommand } from "./extensions/nativeExtensionRuntime.js";
import { NativeExtensionError } from "./extensions/nativeExtensionManifest.js";
import { describeNativeExtension, installNativeExtension, readNativeExtension, signNativeExtensionAsync } from "./extensions/nativeExtensionStore.js";

function reportFailure(error: unknown, json: boolean): void {
  const code = error instanceof NativeExtensionError ? error.code : "EXTENSION_OPERATION_FAILED";
  const message = error instanceof NativeExtensionError ? error.message : "The native extension operation failed. Content and signing diagnostics are withheld.";
  if (json) console.log(JSON.stringify({ ok: false, code, message }, null, 2));
  else console.error(message);
  process.exitCode = 1;
}
function report(result: ReturnType<typeof describeNativeExtension>, json: boolean, preview?: ReturnType<typeof previewNativeExtensionCommand>): void {
  if (json) console.log(JSON.stringify({ ok: true, ...result, ...(preview === undefined ? {} : { preview }) }, null, 2));
  else {
    console.log(`Native extension: ${result.id}\nManifest: ${result.manifestPath}\nReviewed digest: ${result.manifestDigest}\nWorkspace signature: ${result.signatureValid ? "valid" : "not valid"}`);
    console.log(`Context files: ${result.contexts.length}; commands: ${result.commands.map(entry => `/${entry.name}`).join(", ") || "none"}; content bytes: ${result.totalContentBytes}`);
    for (const command of result.commands) {
      console.log(`/${command.name}: ${command.path} sha256=${command.sha256}; variables=${command.variables.join(", ")}${command.template?.argumentHint === undefined ? "" : `; arguments=${command.template.argumentHint}`}`);
    }
    console.log(result.boundary);
    if (preview !== undefined) console.log(preview.prompt);
  }
}

/** Local explicit operations only. Inspect does not sign; sign does not load; install does not auto-activate. */
export function registerNativeExtensionCommands(program: Command): void {
  const extension = program.command("native-extension")
    .description("Inspect, explicitly sign and install declarative native context and prompt commands");
  extension.command("inspect <manifest>")
    .description("Read manifest/content hashes and workspace signature status without loading or writing")
    .option("--expect-digest <sha256>", "Refuse a manifest different from these reviewed bytes")
    .option("--preview-command <name>", "Preview a declarative prompt command without loading or executing it")
    .option("--arguments <text>", "Literal command arguments for the explicitly selected preview")
    .option("--json", "Output metadata without content; explicit previews include expanded command text")
    .action((manifest: string, opts: { expectDigest?: string; json?: boolean; previewCommand?: string; arguments?: string }) => {
      try {
        if (opts.arguments !== undefined && opts.previewCommand === undefined)
          throw new NativeExtensionError("PREVIEW_COMMAND_REQUIRED", "--arguments requires --preview-command so the expanded command is explicit.");
        const snapshot = readNativeExtension({ workspace: process.cwd(), manifestPath: manifest,
          requireSignature: false, ...(opts.expectDigest === undefined ? {} : { expectedDigest: opts.expectDigest }) });
        const preview = opts.previewCommand === undefined ? undefined : previewNativeExtensionCommand(snapshot, opts.previewCommand, opts.arguments ?? "");
        report(describeNativeExtension(snapshot), opts.json === true, preview);
      } catch (error) { reportFailure(error, opts.json === true); }
    });
  extension.command("sign <manifest>")
    .description("Sign the exact reviewed manifest with existing AMC workspace BUNDLE signing policy")
    .requiredOption("--expect-digest <sha256>", "Exact manifest digest reviewed during inspect")
    .option("--json", "Output signature metadata without content")
    .action(async (manifest: string, opts: { expectDigest: string; json?: boolean }) => {
      try { report(await signNativeExtensionAsync(process.cwd(), manifest, opts.expectDigest), opts.json === true); }
      catch (error) { reportFailure(error, opts.json === true); }
    });
  extension.command("install <manifest>")
    .description("Copy an already signed extension into the local plugin store without activation")
    .requiredOption("--expect-digest <sha256>", "Exact signed manifest digest reviewed during inspect")
    .option("--json", "Output installed manifest path and pins")
    .action((manifest: string, opts: { expectDigest: string; json?: boolean }) => {
      try { report(installNativeExtension(process.cwd(), manifest, opts.expectDigest), opts.json === true); }
      catch (error) { reportFailure(error, opts.json === true); }
    });
}
