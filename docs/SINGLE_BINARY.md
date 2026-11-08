# Single-binary build (experimental Node SEA, does not start yet)

AMC has an **experimental** build script for a single binary using **Node SEA (Single Executable Applications)**. Its current status:

- it is a **local experimental build only**: it builds a binary for the host that runs it, and never cross-compiles;
- the binary it builds **does not start yet**, on any host tried;
- it is **not a release asset**: the release workflow neither builds nor uploads it.

Install AMC with npm or the verified release installer instead ([INSTALL.md](INSTALL.md)).

## Why it does not start

Node SEA runs the embedded main script as CommonJS. AMC's `dist/cli.js` is an unbundled ES module (its first statement is `import "./storage/nativeGuard.js";`), so the binary exits at startup with `SyntaxError: Cannot use import statement outside a module`. ES module support alone would not be enough: inside a SEA, `require()` in the main script loads only Node's built-in modules, so the CLI's other files under `dist/` and the `better-sqlite3` native addon could not load the way they do today.

Making it start needs the CLI bundled into one CommonJS file (esbuild is already a dev dependency) with the native addon kept on disk beside the binary. That work has not been done.

## Build locally

This is for work on the build itself. Prerequisites:

- Node with SEA support (`node --experimental-sea-config`)
- `pnpm install --frozen-lockfile` and `npm run build`
- network access: the script runs `npx --yes postject`, and when the local Node binary has no SEA fuse it downloads the official Node binary of the same version and platform from nodejs.org

```bash
npm run build
npm run build:sea
```

`npm run build:sea` writes:

- binary: `dist/sea/amc` (`dist/sea/amc.exe` on Windows)
- metadata: `dist/sea/manifest.json`
- SEA blob: `dist/sea/amc-prep.blob`

It then runs the binary with `--version`. When the binary does not start, the build exits 1 and prints the binary's own error output. Today it always exits 1 at this step, with the `SyntaxError` above. `npm pack` never includes `dist/sea/` (`package.json` excludes it).

## Verification status

Checked on 2026-11-07:

- blob generation: works.
- injection: works on macOS arm64. On macOS the blob now goes into the `NODE_SEA` segment, which is where Node reads it; postject's default segment (`__POSTJECT`) made the binary crash at startup (SIGSEGV, no output).
- fallback to the official Node release binary when the local Node has no SEA fuse (Homebrew's Node 22 has none): works on macOS arm64.
- startup: fails on macOS arm64 with Node 22 and Node 24 (`SyntaxError: Cannot use import statement outside a module`). Linux was not run; SEA runs the main script through the same CommonJS path on every platform, so it is expected to fail there the same way.
- Windows: not run, and `build:sea` is unlikely to work there yet. The script spawns `npx` without a shell, which Node cannot do with `npx.cmd`, and its fallback extracts the Node zip with `unzip`, which stock Windows does not have.

## Release status

`.github/workflows/release.yml` does not build, copy or upload a SEA binary, and its contract test (`tests/releaseWorkflowContract.test.ts`) fails if one is added back. Both stay that way until `npm run build:sea` produces a binary that starts.

The 1.1.1 GitHub release carries an experimental Linux SEA binary, `amc-linux-x64-sea-1.1.1`. An earlier release workflow built it the same way (with `dist/cli.js`, an ES module, as the SEA main) and attached it without starting it first. Do not rely on it; use npm or the release installer.

## Next steps

- bundle the CLI into one CommonJS file and point the SEA `main` at it, keeping the `better-sqlite3` addon on disk
- then add a release asset per OS, each started on its own runner (`--version`, then `doctor --json`) before upload
- on Windows, spawn npx through npm's JavaScript entry point instead of the `npx.cmd` shim, and extract the zip with `tar`

Acceptance check for that work: `npm run build:sea` exits 0 (so the binary printed its version), then `./dist/sea/amc doctor --json` runs on the same host.
