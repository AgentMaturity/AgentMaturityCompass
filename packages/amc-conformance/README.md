# amc-conformance

The conformance suite runner for the AMC spec. It tests any verifier, producer, adapter, compiler or A4 record verifier,
written in any language, through its command line, and writes a `conformance-results` v1 file. It needs Node 20 or later and nothing
else: no AMC build and no dependency. The classes and their cases are in
[`spec/conformance/v1/`](../../spec/conformance/v1/README.md).

## Run it

The runner reads the case manifests, fixtures and schemas from a checkout of the spec (`--root`, default the current
directory). Install the packed tarball anywhere, then point it at the checkout:

```bash
npm install ./amc-conformance-1.0.0.tgz
npx amc-conformance run --root ~/AgentMaturityCompass --class verifier \
  --impl "my-verifier {artifact} --trust-list {trustList} --as-of {asOf}" \
  --name my-verifier --impl-version 1.2.3 --language Rust --out results.json
```

| Option | Meaning |
| --- | --- |
| `--class` | `verifier`, `producer`, `adapter`, `compiler` or `a4-record` |
| `--impl` | The command template. It is split on whitespace and run without a shell; placeholders are filled in after the split |
| `--cases <glob>` | Run only the case ids matching the glob (`*` is the only wildcard). The others are reported `skipped`, so a filtered run is never conformant |
| `--out <file>` | Where the results go (standard output otherwise) |
| `--timeout <ms>` | Per case, default 30000. A case that runs longer is killed and reported `error` |
| `--name`, `--impl-version`, `--vendor`, `--repository`, `--language` | Name the implementation in the results |

Exit codes: 0 conformant, 1 not conformant, 64 usage error.

Placeholders per class:

| Class | Placeholders |
| --- | --- |
| `verifier` | `{artifact}`, `{trustList}`, `{asOf}`, `{params}` (the case's `params.json`: pinned roots, expected scope, known sequences), `{caseDir}`, and `{verifierArgs}`, which expands to the AMC verifier's flags for the case (`--trust-list … --trust-root … --as-of … --json`) |
| `producer` | `{scenario}`, `{outDir}` |
| `adapter` | `{hookPayload}`, `{policy}` |
| `compiler` | `{profile}`, `{catalogLock}`, `{outDir}` |
| `a4-record` | `{record}`, `{trustList}`, `{trustRoots}` (the `amc.trust-roots` file), `{trustRoot}` (its root key id) |

A placeholder the class does not provide is a usage error. AMC's own verifier runs as:

```bash
amc-conformance run --class verifier --impl "amc-verify verify {artifact} {verifierArgs}"
amc-conformance run --class a4-record --impl "env AMC_A4_PREVIEW=1 amc a4 verify {record} --trust-list {trustList} --trust-root {trustRoot} --json"
```

The runner makes no network call and no case needs one. It does not sandbox the implementation; run it in your own
sandbox if you do not trust it. Command templates are qualified on Linux and macOS. Windows is unqualified: quoting
there differs.

## What "conformant" means

A results file says `conformant: true` only when the class has normative cases and every one of them passed. A failed,
errored or skipped normative case makes it false, and the `conformance-results` contract refuses a file that says
otherwise. Informative cases are reported but never decide it.

A results file is the implementer's own record of one run, so it is self-reported evidence of conformity for that suite
version and fixture-set digest. It is not a certificate, and it says nothing about records the suite does not cover.
Interoperability between implementations may be claimed only after two independently built verifiers pass the suite
(P3-03).

## Publish results

Commit the results file next to your implementation, or send it to the spec repository's `spec/conformance/results/`
folder. Keep `suiteVersion` and `fixtureSetDigest` as written: a reader reruns the same suite version against your
implementation and compares. The results contract has an optional `signature` member (AMC's signature envelope) for a
signed copy; the runner does not sign.

## Versioning

The suite's MAJOR and MINOR follow the spec's. New normative cases arrive only in a new MINOR; corrections in a PATCH.
