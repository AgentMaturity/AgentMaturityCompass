/** P2-14 cut-first prototype. No Windows boundary or native shell is enabled. */
export interface WindowsPrototypeRequest {
  readonly argv: readonly string[];
  readonly cwd: string;
  /** Opaque synthetic equality binding; not a verified signed policy. */
  readonly policySha256: string;
}

export interface FakeTokenApi {
  /** A pure prerequisite check; no resource allocation. */
  available(): { readonly ok: true } | { readonly ok: false };
  run(request: WindowsPrototypeRequest & { readonly callNonce: string }): Promise<unknown>;
  /** Owns partial fake resources even when run rejects. */
  cleanup(): Promise<void>;
}

export type WindowsPrototypeReason =
  | "not-implemented" | "unsupported-platform" | "prototype-not-qualified"
  | "invalid-request" | "api-unavailable" | "api-failure"
  | "status-missing" | "status-invalid" | "status-mismatch" | "cleanup-failed"
  | "simulation-complete";

export interface WindowsPrototypeResult {
  readonly kind: "refused" | "simulation-complete";
  readonly reason: WindowsPrototypeReason;
  readonly claimKind: "none" | "synthetic_example";
  readonly confined: false;
  readonly treeExitProven: false;
  readonly exitCode: null;
  readonly simulatedExitCode: number | null;
  readonly measurement: "not-measured";
}

/** Callable TDD stub. Root must measure assertion RED before implementation. */
export async function runWindowsTokenPrototype(_request: WindowsPrototypeRequest): Promise<WindowsPrototypeResult> {
  return { kind: "refused", reason: "not-implemented", claimKind: "none", confined: false,
    treeExitProven: false, exitCode: null, simulatedExitCode: null, measurement: "not-measured" };
}

/** Explicitly synthetic TDD stub; never a SandboxBackend or native receipt. */
export async function exerciseWindowsTokenProtocol(_request: WindowsPrototypeRequest, _api: FakeTokenApi): Promise<WindowsPrototypeResult> {
  return { kind: "refused", reason: "not-implemented", claimKind: "synthetic_example", confined: false,
    treeExitProven: false, exitCode: null, simulatedExitCode: null, measurement: "not-measured" };
}
