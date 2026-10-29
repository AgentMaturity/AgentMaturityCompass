import { NATIVE_EXTENSION_LIMITS, NativeExtensionError, type NativeExtensionCommand } from "./nativeExtensionManifest.js";

/** One closed, literal dialect for admission, inspection and runtime expansion. */
export function nativeExtensionTemplateVariables(text: string, command: NativeExtensionCommand): readonly string[] {
  const variables = new Set<string>();
  const remaining = text.replace(/\{\{([^{}]*)\}\}/g, (placeholder: string, variable: string, offset: number) => {
    if (text[offset - 1] === "{" || text[offset + placeholder.length] === "}"
      || (variable !== "args" && (!/^[1-9][0-9]*$/.test(variable)
        || Number(variable) > (command.template?.positional.length ?? 0)))) {
      throw new NativeExtensionError("TEMPLATE_INVALID", `Command template ${JSON.stringify(command.path)} has an unknown, undeclared or nested variable. Use {{args}} or declared positional {{1}} through {{32}} only.`);
    }
    variables.add(variable);
    return "";
  });
  if (variables.size === 0 || remaining.includes("{{") || remaining.includes("}}")) {
    throw new NativeExtensionError("TEMPLATE_INVALID", `Command template ${JSON.stringify(command.path)} must contain declared placeholders with balanced double braces.`);
  }
  return [...variables];
}

export function expandNativeExtensionTemplate(text: string, command: NativeExtensionCommand, args: string): string {
  nativeExtensionTemplateVariables(text, command);
  if (Buffer.byteLength(args) > NATIVE_EXTENSION_LIMITS.argumentBytes || args.includes("\0")) {
    throw new NativeExtensionError("ARGUMENT_LIMIT", "Extension command arguments exceed the text limit or contain NUL bytes.");
  }
  const words = args.trim() === "" ? [] : args.trim().split(/\s+/);
  const slots = command.template?.positional;
  if (slots !== undefined && words.length > slots.length) {
    throw new NativeExtensionError("ARGUMENT_COUNT", `This command accepts at most ${slots.length} positional arguments. Values split on whitespace; shell quoting is not interpreted.`);
  }
  const values = slots?.map((slot, index) => {
    const value = words[index] ?? slot.default;
    if (value === undefined) {
      throw new NativeExtensionError("ARGUMENT_REQUIRED", `Positional argument ${index + 1} is required. Supply it or review a manifest default.`);
    }
    return value;
  });
  let bytes = Buffer.byteLength(text);
  return text.replace(/\{\{(args|[1-9][0-9]*)\}\}/g, (placeholder: string, variable: string) => {
    const value = JSON.stringify(variable === "args" ? args : values![Number(variable) - 1]!);
    bytes += Buffer.byteLength(value) - Buffer.byteLength(placeholder);
    if (bytes > NATIVE_EXTENSION_LIMITS.expansionBytes) {
      throw new NativeExtensionError("EXPANSION_LIMIT", "Expanded command template exceeds the output byte limit.");
    }
    return value;
  });
}
