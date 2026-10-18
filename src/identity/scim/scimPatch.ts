export interface ScimPatchOperation {
  op: "add" | "remove" | "replace";
  path?: string;
  value?: unknown;
}

/** Checks one received operation before a patch handler opens the host database; returns its path, "" when absent. */
export function scimOperationPath(op: ScimPatchOperation): string {
  if (!op || typeof op !== "object" || Array.isArray(op) || !["add", "remove", "replace"].includes(op.op)) {
    throw new Error("invalidValue");
  }
  if (op.path !== undefined && typeof op.path !== "string") {
    throw new Error("invalidPath");
  }
  return op.path ?? "";
}

export function parseScimPatchOperations(input: unknown): ScimPatchOperation[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("invalidValue");
  }
  const operations = (input as { Operations?: unknown }).Operations;
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error("invalidValue");
  }
  return Array.from(operations, (item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("invalidValue");
    }
    const opRaw = (item as { op?: unknown }).op;
    const op = typeof opRaw === "string" ? opRaw.toLowerCase() : "";
    if (op !== "add" && op !== "remove" && op !== "replace") {
      throw new Error("invalidValue");
    }
    const path = (item as { path?: unknown }).path;
    if (path !== undefined && typeof path !== "string") {
      throw new Error("invalidPath");
    }
    return {
      op,
      path: typeof path === "string" ? path : undefined,
      value: (item as { value?: unknown }).value
    };
  });
}
