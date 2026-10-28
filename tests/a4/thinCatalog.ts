/**
 * P2-35 fixture: the admitted catalog replaced by the synthetic compiler catalog (tests/fixtures/catalog/compiler, five
 * controls). With the shipped catalog Adapt's proposal overflows its 240 KiB room (DEBT.md follow-up), so a project can
 * cross Adapt only on a thin catalog. Used as `vi.mock("../../src/catalog/admission/gate.js", thinCatalog)`.
 */
import { fileURLToPath } from "node:url";

export async function thinCatalog(original: <T>() => Promise<T>) {
  const real = await original<typeof import("../../src/catalog/admission/gate.js")>();
  const root = fileURLToPath(new URL("../fixtures/catalog/compiler/catalog/", import.meta.url));
  return { ...real, loadAdmittedCatalog: (opts: { root?: string } = {}) => real.loadAdmittedCatalog({ root: opts.root ?? root }) };
}
