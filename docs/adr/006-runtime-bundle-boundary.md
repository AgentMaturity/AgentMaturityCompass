# ADR-006: The Published Artifact Bundles the Kernel's Private Closure

## Status
Accepted

## Date
2026-09-08

## Context
The governed native agent loop is composed on `@amc/core` and the vendored
`@amc/cordis` family (ADR-0001 vendoring, rescoped to `@amc/*`). Those are
private workspace packages: they are not published, and the npm tarball ships
`dist/**` only. So the engine existed in source while a public installation
could not run it — `amc agent-loop run` failed with "the composition kernel is
not installed" on every machine that was not a repository checkout (AMC-1510).
DeepSeek Harness and Pi ship a runnable agent; AMC shipped the surfaces around
one.

Three boundaries were possible: publish the private packages to npm as real
dependencies; ship them inside the tarball as bundled dependencies; or bundle
their code into the artifact at build time.

## Decision
Bundle at build time, into the artifact, at exactly one seam.

- `src/kernel/amcRuntime.ts` is the only module that imports `@amc/core` or
  `@amc/cordis` (the architecture gate already confines `@amc` runtime imports
  to `src/kernel/`). Every other kernel module imports from it.
- `scripts/bundle-kernel.mjs` (esbuild, a pinned devDependency) replaces that
  module's compiled output in `dist/kernel/` with a self-contained ESM bundle
  of its closure. **Inline rule:** everything reachable is inlined except Node
  builtins and packages the root `package.json` declares as `dependencies`. A
  public package only a private package needs (js-yaml, chokidar, picomatch…)
  is inlined too, so the runtime never works only because a consumer happened
  to have it installed.
- One seam means one Cordis instance. A bundle per importing module would give
  each its own `Context` class and split the composed tree silently.
- The build writes, beside the bundle, `amcRuntime.bundle.json` (every inlined
  package with version and licence — the SBOM appends these as components
  marked `amc:bundled-into`), `amcRuntime.js.LEGAL.txt` (licence comments
  esbuild lifts from code) and `amcRuntime.js.NOTICES.md` (each inlined
  package's licence text). `THIRD_PARTY_NOTICES` ships in the tarball.
- `npm run check:packed-install` is the executable acceptance: pack as publish
  would, install into a fresh directory outside the checkout with an empty
  HOME, prove `@amc/core` is *not* resolvable there, then complete a keyless
  native turn over a fully signed session. A configured real provider is
  exercised only when set, and reported as skipped otherwise — never passed.

Not chosen: publishing the private packages (a release-process decision that
needs registry credentials and turns internal APIs into public contracts) and
`bundledDependencies` (npm does not reliably pack symlinked workspace members,
and it would still ship the packages' own unpinned transitive graph).

## Consequences
- **Positive**: the tarball delivers the runtime; a source checkout is unchanged
  (tsc still emits the thin re-export and the workspace resolves it)
- **Positive**: the inline rule is stated once and enforced by the bundle
  manifest; SBOM and notices cover the bytes that ship
- **Negative**: `dist/kernel/amcRuntime.js` is ~480 KB of inlined code; upgrades
  to the private packages reach users only through an AMC release
- **Negative**: a second `@amc` import site is a build-time trap, so
  `tests/kernelRuntimeBarrel.test.ts` forbids one
- **Boundary**: this is a local artifact check. Public release acceptance
  (published version, channel probes, installer verification) stays with
  AMC-7 / AMC-483; nothing here claims "shipped".
