/**
 * The ONE place the kernel imports the private workspace packages (AMC-1510).
 *
 * `@amc/core` and the vendored `@amc/cordis` family are workspace packages the
 * published tarball does not carry. Every kernel module imports these names
 * from here instead of from the packages, so the build can replace this single
 * module's compiled output with an esbuild bundle that inlines the whole
 * private closure (`scripts/bundle-kernel.mjs`). One module means one Cordis
 * instance: a bundle per importer would give each its own `Context` class and
 * the composed tree would silently split.
 *
 * In a source checkout nothing changes — tsc emits the thin re-export and the
 * packages resolve through the workspace as before. The architecture gate
 * still allows `@amc` runtime imports only under src/kernel/, which is where
 * this file lives.
 */
export { AmcSeam, defineSeam } from "@amc/core";
export { Context } from "@amc/cordis";
