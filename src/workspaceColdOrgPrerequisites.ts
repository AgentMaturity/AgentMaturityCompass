/** Fixed mature adapter/canon/bank prerequisite attempt. Fresh bootstrap keeps its synchronous key order. */
import { relative, resolve } from "node:path";
import { initWorkspace, type InitWorkspaceOptions } from "./workspace.js";
import { captureAdaptersConfigInitialization } from "./adapters/adapterConfigStore.js";
import { canonPath, prepareCanonAsync } from "./canon/canonLoader.js";
import { builtInCanon } from "./canon/canonBuiltin.js";
import { diagnosticBankPath, prepareDiagnosticBankAsync } from "./diagnostic/bank/bankLoader.js";
import { defaultDiagnosticBankV1 } from "./diagnostic/bank/bankV1.js";
import { captureOrgPairs, assertOrgPairsCurrent, captureOrgPairsAuthority, OrgPairsPublicationError } from "./org/preparedOrgPairs.js";
import { pathExists } from "./utils/fs.js";

export class WorkspaceInitializationPartialError extends Error {
  readonly code = "WORKSPACE_INITIALIZATION_PARTIAL";
  constructor(cause: unknown, readonly publishedPaths: readonly string[] = Object.freeze([".amc/adapters.yaml", ".amc/adapters.yaml.sig"])) {
    super("workspace initialization did not complete; published prerequisite members remain", { cause });
    this.name = "WorkspaceInitializationPartialError";
  }
}
export function captureWorkspaceColdOrgPrerequisites(workspace: string) {
  const canon = canonPath(workspace), bank = diagnosticBankPath(workspace);
  const initialCanon = pathExists(canon) ? null : captureOrgPairs([canon]), initialBank = pathExists(bank) ? null : captureOrgPairs([bank]);
  const canonValue = initialCanon === null ? null : structuredClone(builtInCanon()), bankValue = initialBank === null ? null : structuredClone(defaultDiagnosticBankV1());
  // Existing canon/bank contents contribute skip/presence decisions, without unlock, signing or repair.
  const original = initialCanon !== null || initialBank !== null ? captureOrgPairsAuthority(workspace) : () => {};
  let canonCurrent = () => { if (initialCanon !== null) assertOrgPairsCurrent(initialCanon); else if (!pathExists(canon)) throw new Error("existing canon disappeared during workspace initialization"); };
  let bankCurrent = () => { if (initialBank !== null) assertOrgPairsCurrent(initialBank); else if (!pathExists(bank)) throw new Error("existing diagnostic bank disappeared during workspace initialization"); };
  const completed: string[] = [], ownCurrent = () => { original(); canonCurrent(); bankCurrent(); };
  // This real C7 capture owns its original pair/default/authority before an earlier ops await.
  // Its callback is independent: calling the composed gate here would recurse through adapter.assertCurrent.
  const adapter = captureAdaptersConfigInitialization(workspace, ownCurrent);
  const assertCurrent = () => { ownCurrent(); adapter.assertCurrent(); };
  const completedPaths = () => Object.freeze([...adapter.publishedPaths().map(path => relative(workspace, resolve(workspace, path))), ...completed]);
  const initializeCanon = async () => {
    assertCurrent(); if (initialCanon === null) return;
    const prepared = await prepareCanonAsync(workspace, canonValue!, { beforePublish: original, assertInputsCurrent: assertCurrent }, initialCanon);
    const saved = prepared.publish()[0]!; canonCurrent = prepared.assertCurrent; completed.push(relative(workspace, saved.path), relative(workspace, saved.sigPath));
  };
  const initializeBank = async () => {
    assertCurrent(); if (initialBank === null) return;
    const prepared = await prepareDiagnosticBankAsync(workspace, bankValue!, { beforePublish: original, assertInputsCurrent: assertCurrent }, initialBank);
    const saved = prepared.publish()[0]!; bankCurrent = prepared.assertCurrent; completed.push(relative(workspace, saved.path), relative(workspace, saved.sigPath));
  };
  return Object.freeze({ workspace, get completedPaths(): readonly string[] { return completedPaths(); }, assertCurrent, initializeCanon, initializeBank,
    async initializeAdapters() { assertCurrent(); const saved = await adapter.initialize(); assertCurrent(); return saved; },
    async initializeWorkspace(input: InitWorkspaceOptions) {
      const options = structuredClone(input); options.workspacePath ??= workspace;
      if (options.workspacePath !== workspace) throw new Error("workspace prerequisite attempt belongs to another workspace");
      try {
        assertCurrent(); await adapter.initialize(); assertCurrent();
        await initializeCanon(); await initializeBank(); assertCurrent(); return initWorkspace(options);
      } catch (cause) {
        const paths = [...completedPaths(), ...(cause instanceof OrgPairsPublicationError ? cause.publishedPaths : [])];
        if (paths.length > 0) throw new WorkspaceInitializationPartialError(cause, Object.freeze(paths)); throw cause;
      }
    }
  });
}
export type WorkspaceColdOrgPrerequisites = ReturnType<typeof captureWorkspaceColdOrgPrerequisites>;
