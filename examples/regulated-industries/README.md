# Regulated-industry examples (health, wealth, governance)

Three runnable examples that drive the built CLI in a throwaway workspace. They
need no provider key, no Industry Packs license key and no network access.
Each sentence below that describes behaviour carries a citation; the appendix
maps every citation to a file and line, and `tests/regulatedExamples.test.ts`
checks that each cited line still contains the quoted text.

## Run

```bash
pnpm build
node examples/regulated-industries/health/run.mjs --deny-network
node examples/regulated-industries/wealth/run.mjs --deny-network
node examples/regulated-industries/governance/run.mjs --deny-network
pnpm vitest run tests/regulatedExamples.test.ts
```

Options: `--cli <path>` (default `dist/cli.js`), `--workdir <dir>` (default: a
new temp directory) and `--deny-network`.

## What each example does

Each station directory holds a synthetic `fixture.json` (industry pack id,
assurance pack id, capability flags, one prompt) and a `run.mjs` that calls the
shared runner in `lib/runStation.mjs`.

Environment. The runner builds the child environment from scratch: `PATH`
[C1], a temp `HOME` [C2], and a vault passphrase generated with
`randomBytes` for this workspace only [C3]. No provider or license variable is
passed through. With `--deny-network`, every CLI process is started with a
preload [C4] that refuses TCP/TLS connects [C5] and DNS lookups [C6] and logs
each attempt [C7]; the runner fails if the log is not empty [C8].

Steps, in order (all run against the same workspace):

| Step | Command | Expected exit | Output |
| --- | --- | --- | --- |
| init | `amc init --skip-vault` [C9] | 0 | `.amc/` |
| domain-modules | `amc domain modules --domain <station> --json` [C10] | 0 | `out/domain-modules.json` |
| pack-catalog | `amc domain pack list --domain <station> --json` [C11] | 0 | `out/pack-catalog.json` |
| pack-run-gate | `amc domain pack run --pack <id> --baseline --json` [C12] | 1 | `out/pack-run-gate.json` |
| risk-classify | `amc compliance risk-classify --capabilities <fixture> --json` [C13] | 0 | `out/risk-classification.json` |
| assurance-pack | `amc assurance describe <pack>` [C14] | 0 | `out/assurance-pack.json` |
| agent-run | `amc --agent default agent-loop run "<prompt>" --provider stub ...` [C15] | 0 | `out/agent-run.json` |
| agent-verify | `amc agent-loop verify <session-id> --json` [C16] | 0 | `out/agent-verify.json` |
| evidence-export | `amc evidence export --format json --include-chain` [C17] | 0 | `out/evidence.json` |
| binder-create | `amc audit binder create --scope agent --id default` [C18] | 0 | `out/binder.amcaudit` |
| binder-verify | `amc audit binder verify out/binder.amcaudit` [C19] | 0 | none |
| assurance-gate | `amc assurance run --pack <pack>` [C20] | 2 | none |

A step whose exit code differs from the expected one stops the run [C21].

## What the outputs show, and what they do not

- `pack-run-gate`: industry pack scoring checks the Industry Packs entitlement
  first [C22] and, with `--json`, prints `industry_packs_locked` [C23]. The
  entitlement is read from `AMC_INDUSTRY_PACKS_LICENSE_KEY` or a stored file
  [C24]. These examples hold no license, so no industry pack score is produced.
- `risk-classify`: the CLI parses the fixture's capability JSON [C25] and runs
  its own classifier on it [C26]. The fixture flags describe a hypothetical
  agent; the output is the classifier's mapping, not a legal determination.
- `agent-run`: the stub provider records a canned response through the signed
  session log, not a real model answer [C27]. `agent-verify` re-derives each
  model request from the log and checks the chains [C28].
- `evidence-export`: `--include-chain` adds hash chain verification fields to
  each exported record [C29].
- `binder-create`: writes a signed `.amcaudit` artifact [C30].
- `assurance-gate`: the example names an agent endpoint [C31], which takes the
  responder's explicit-endpoint branch [C32]; with no provider key set it
  refuses before sending a request [C33], and the CLI exits with code 2 [C34].
  No assurance score is produced. This step runs last; the O20 receipt records
  why.

## Provenance in `out/summary.json`

The runner records the source commit [C35], the SHA-256 of the CLI file [C36]
and of the fixture [C37], the network mode and logged attempts [C38], and the
SHA-256 of every artifact it lists [C39]. The test recomputes those digests.

## Not covered

- Industry pack scoring, `amc domain apply` and `amc domain assess` (licensed).
- An assurance scan with a score (needs a reachable agent under test).
- Any statement about whether an output meets a regulation.

## Appendix: citations

| ID | Location | Quoted text |
| --- | --- | --- |
| C1 | `examples/regulated-industries/lib/runStation.mjs:77` | `PATH: process.env.PATH ?? ""` |
| C2 | `examples/regulated-industries/lib/runStation.mjs:78` | `HOME: home,` |
| C3 | `examples/regulated-industries/lib/runStation.mjs:80` | `AMC_VAULT_PASSPHRASE: randomBytes(24).toString("base64url")` |
| C4 | `examples/regulated-industries/lib/runStation.mjs:83` | `env.NODE_OPTIONS = ` |
| C5 | `examples/regulated-industries/lib/denyNetwork.mjs:24` | `net.Socket.prototype.connect = function connect(...args) {` |
| C6 | `examples/regulated-industries/lib/denyNetwork.mjs:34` | `dns.lookup = function lookup(host, ...rest) {` |
| C7 | `examples/regulated-industries/lib/denyNetwork.mjs:13` | `if (log) appendFileSync(log, ` |
| C8 | `examples/regulated-industries/lib/runStation.mjs:139` | `if (attempts.length > 0) throw new Error(` |
| C9 | `examples/regulated-industries/lib/runStation.mjs:40` | `{ id: "init", args: ["init", "--skip-vault"] }` |
| C10 | `examples/regulated-industries/lib/runStation.mjs:41` | `args: ["domain", "modules", "--domain", station, "--json"]` |
| C11 | `examples/regulated-industries/lib/runStation.mjs:42` | `args: ["domain", "pack", "list", "--domain", station, "--json"]` |
| C12 | `examples/regulated-industries/lib/runStation.mjs:44` | `stdoutTo: "pack-run-gate.json", expectExit: 1` |
| C13 | `examples/regulated-industries/lib/runStation.mjs:45` | `"--capabilities", JSON.stringify(fixture.capabilities)` |
| C14 | `examples/regulated-industries/lib/runStation.mjs:46` | `args: ["assurance", "describe", fixture.assurancePack]` |
| C15 | `examples/regulated-industries/lib/runStation.mjs:47` | `"--provider", "stub", "--model", STUB_MODEL` |
| C16 | `examples/regulated-industries/lib/runStation.mjs:48` | `["agent-loop", "verify", readJson(join(out, "agent-run.json")).sessionId, "--json"]` |
| C17 | `examples/regulated-industries/lib/runStation.mjs:49` | `"--agent", "default", "--include-chain"` |
| C18 | `examples/regulated-industries/lib/runStation.mjs:50` | `args: ["audit", "binder", "create", "--scope", "agent", "--id", "default", "--out", "out/binder.amcaudit"]` |
| C19 | `examples/regulated-industries/lib/runStation.mjs:51` | `args: ["audit", "binder", "verify", "out/binder.amcaudit"]` |
| C20 | `examples/regulated-industries/lib/runStation.mjs:56` | `{ id: "assurance-gate", args: ["assurance", "run"` |
| C21 | `examples/regulated-industries/lib/runStation.mjs:109` | `if (result.status !== expectExit) {` |
| C22 | `src/cli-domain-product-commands.ts:230` | `assertIndustryPackAccess(process.cwd());` |
| C23 | `src/cli-domain-product-commands.ts:233` | `error: "industry_packs_locked"` |
| C24 | `src/domains/industryPackEntitlement.ts:334` | `const envLicense = env.AMC_INDUSTRY_PACKS_LICENSE_KEY` |
| C25 | `src/cli.ts:12779` | `capabilities = JSON.parse(opts.capabilities)` |
| C26 | `src/cli.ts:12807` | `const result = classifyEuAiActRisk(capabilities);` |
| C27 | `src/doctor/firstRunPlan.ts:47` | `the stub provider records a canned response through the signed session log (no real model answer)` |
| C28 | `src/cli-agent-commands.ts:756` | `Re-derive every model request in a session from the log and check the chains` |
| C29 | `src/cli.ts:10429` | `.option("--include-chain", "include hash chain verification fields")` |
| C30 | `src/cli.ts:17172` | `Create deterministic signed .amcaudit artifact` |
| C31 | `examples/regulated-industries/lib/runStation.mjs:17` | `const UNUSED_AGENT_URL = "http://127.0.0.1:1";` |
| C32 | `src/assurance/agentResponder.ts:480` | `const explicitEndpoint = process.env.AMC_AGENT_BASE_URL?.trim();` |
| C33 | `src/assurance/agentResponder.ts:524` | `if (!apiKey \|\| apiKey.trim().length === 0) {` |
| C34 | `src/cli.ts:11116` | `process.exitCode = 2;` |
| C35 | `examples/regulated-industries/lib/runStation.mjs:123` | `sourceCommit: sourceCommit(),` |
| C36 | `examples/regulated-industries/lib/runStation.mjs:126` | `cliSha256: sha256(readFileSync(opts.cli)),` |
| C37 | `examples/regulated-industries/lib/runStation.mjs:128` | `fixtureSha256: sha256(readFileSync(fixturePath)),` |
| C38 | `examples/regulated-industries/lib/runStation.mjs:133` | `network: opts.denyNetwork ? { mode: "denied", attempts }` |
| C39 | `examples/regulated-industries/lib/runStation.mjs:135` | `artifacts: written.map((name) => ({ path: ` |
