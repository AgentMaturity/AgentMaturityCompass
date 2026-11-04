"""BOUND P0-45 canonical builder v2; prepared f78cd00e and P021 v2 9f9f8287.

Root supplied actual frozen bindings; independent static review is required before
execution. This writes only one absent qualification directory. It does not run a
product, test, compiler, installer, guard, or validation command.
"""
from pathlib import Path
import hashlib
import json
import os
import stat
import subprocess

R = Path('/Users/sid/.codex/worktrees/p0-45-qualification/AgentMaturityCompass')
B = Path('/private/tmp/p0-45-qualification-20261015')
C = Path('/private/tmp/p0-45-causal-qualification-20261015')
T = Path('/private/tmp')
Q = R / 'qualification/2026-10-15-P0-45'
SOURCE = '2024f25c79973987b44a4a1298488d55ee0d6227'
CODE = '58e91dcef111bf02f773dcbfd1921d428cf75e34'
MAX = 1048576
FREEZER = T / 'p0-45-freeze-qualified-evidence-v2-20261015.py'
FREEZER_SHA = 'a1c0de3feaf6fd5a7b2e823ca4b92b096a153c371d28da6ad2d2b6c35571137b'

# No final result or approval is invented. Root fills exact {path, bytes, sha256}
# pins in a separately reviewed NEW version after actual runtime and freezing.
EXPECTED = {'packet': {'path': '/private/tmp/p0-45-bounded-qualification-20261015.json', 'bytes': 66642, 'sha256': '449f3d99f3ed644be2694797a241c92292497acf6557450cdb47296248baac30'}, 'packetMarkdown': {'path': '/private/tmp/p0-45-bounded-qualification-20261015.md', 'bytes': 4697, 'sha256': '8949080a9e150b2f5cba750bd577d4cf52b7fc9a57ac8974383422056e6c213d'}, 'causal': {'path': '/private/tmp/p0-45-causal-qualification-20261015.json', 'bytes': 76872, 'sha256': '16a37b402eb7777b01ff68d205845f29616f4ce73c9259e1b1a78901dfc8b13e'}, 'causalMarkdown': {'path': '/private/tmp/p0-45-causal-qualification-20261015.md', 'bytes': 4617, 'sha256': '12bcb9c70ce4f5d91adb86fba8d30479a020c9f5c661284bc7ab6978f0739324'}, 'index': {'path': '/private/tmp/p0-45-causal-qualification-20261015/runtime-artifact-index.json', 'bytes': 50431, 'sha256': '032e4ec6ee8e1041c4116ec8ac571620bda7871459c7572f3a51be0dac7978bb'}, 'review': {'path': '/private/tmp/p0-45-bounded-independent-review-20261015.json', 'bytes': 24023, 'sha256': '69e169f00be3600589dbd91e19320c37f15aa1d77c304fe9557c73d136b2a09a'}, 'reviewMarkdown': {'path': '/private/tmp/p0-45-bounded-independent-review-20261015.md', 'bytes': 3340, 'sha256': 'b734b33cb6a45de391b4a876307e09079d2711a04a58b4908176ac3bee4be1c0'}, 'outcome': {'path': '/private/tmp/p0-45-root-bounded-outcome-20261015.json', 'bytes': 11960, 'sha256': '5d46ddb629f77ccc75616cda53b7b51bf953ea8342ebf9f0cf7b367b3e668ca5'}, 'freezerCorrection': {'path': '/private/tmp/p0-45-freezer-v2-static-review-20261015.json', 'bytes': 3649, 'sha256': 'af8bdb2f33e845298413e1898135ec0d9ab35d106d5c3aa4ad3f32315a813261'}, 'sealedSetupReview': {'path': '/private/tmp/p0-45-controller-sealed-setup-review-20261015.json', 'bytes': 20040, 'sha256': '91b1cc2d9a7856d4e8177e5fde967ac1a76f71d8932ac011f9de2d306a58ed19'}, 'sealedSetupReviewMarkdown': {'path': '/private/tmp/p0-45-controller-sealed-setup-review-20261015.md', 'bytes': 2996, 'sha256': '6e9cbcb9e195605ca33c95ca98ee19fd935bb7ecb20c27d563ef302952d01ff5'}}
RUNTIME = {'node': 'v22.23.3', 'pnpm': '10.33.0', 'os': 'Darwin 25.6.0', 'arch': 'arm64'}
ADDITIONAL_PRIVATE_REFERENCES = [{'path': '/private/tmp/p0-45-build-canonical-packet-prepared-20261015.py', 'bytes': 25486, 'sha256': 'f78cd00e4483e3a973b958290baa226c0fcc9e3addb64d10f14657a215e21ab2'}, {'path': '/private/tmp/p0-45-freeze-qualified-evidence-prepared-20261015.py', 'bytes': 38880, 'sha256': '3c4685fb48a71c8c9af9497c0c226bbd21583998328c995195d03ffff2f9aac9'}, {'path': '/private/tmp/p0-45-freezer-code-static-review-20261015.json', 'bytes': 9564, 'sha256': '3ef6a439febc71add38b793e6f9a36f17d9009876fb67b363d3d4f113b745987'}, {'path': '/private/tmp/p0-45-freezer-v2-change-note-20261015.json', 'bytes': 900, 'sha256': 'a1e84f5a9d7e40eb04856111e03568cce475558d01f62288e0c9080ffea5dec7'}, {'path': '/private/tmp/p0-45-root-runtime-attribution-20261015.json', 'bytes': 954, 'sha256': '2508c7a978579259826991dd2f458e6fc682fb40c244ae2ef657129d0df80f87'}, {'path': '/private/tmp/p0-45-run-final-command-20261015.py', 'bytes': 1148, 'sha256': '6313188c413fa9304c97a994e8974100c49293a0f55b9e3ae39dfac653d00520'}, {'path': '/private/tmp/p0-45-author-causal-release-20261015.py', 'bytes': 4879, 'sha256': '9c03f4999bfbb65bbc3a3f5a60ff29e7c5408a48bfef377baa682e10b6aebab7'}]


def need(ok, message):
    if not ok:
        raise RuntimeError(message)


def read(path):
    return json.loads(Path(path).read_text())


def pin(path):
    path = Path(path)
    data = path.read_bytes()
    return {'path': str(path), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def verify(row):
    need(pin(row['path']) == row, 'Frozen input changed: ' + row['path'])


def write_new(path, value):
    with Path(path).open('x') as out:
        json.dump(value, out, indent=2)
        out.write('\n')


def text_new(path, value):
    with Path(path).open('x') as out:
        out.write(value)


def contains_pin(value, wanted):
    if isinstance(value, dict):
        return ((value.get('path') == wanted['path'] and value.get('sha256') == wanted['sha256'])
                or any(contains_pin(v, wanted) for v in value.values()))
    return isinstance(value, list) and any(contains_pin(v, wanted) for v in value)


def main():
    need(all(isinstance(v, dict) and set(v) == {'path', 'bytes', 'sha256'} for v in EXPECTED.values()),
         'STOP: final packet/index/review/outcome/correction/sealed-review pins remain unset')
    need(isinstance(RUNTIME, dict) and set(RUNTIME) == {'node', 'pnpm', 'os', 'arch'}, 'Actual runtime attribution missing')
    need(not Q.exists(), 'Canonical destination exists; no overwrite or automatic resume')
    for row in EXPECTED.values():
        verify(row)
    packet, causal, index = [read(EXPECTED[k]['path']) for k in ['packet', 'causal', 'index']]
    review, outcome = read(EXPECTED['review']['path']), read(EXPECTED['outcome']['path'])
    need(packet['source'] == causal['source'] == index['source'] == SOURCE
         and packet['codeSource'] == causal['codeSource'] == index['codeSource'] == CODE, 'Source attribution differs')
    need(packet['formalAcceptanceClosed'] is False and causal['formalAcceptanceClosed'] is False
         and outcome['formalAcceptanceClosed'] is False, 'Formal acceptance cannot be closed by this packet')
    need(packet['state'] == causal['state'] == 'complete-pending-independent-review', 'Measured packet boundary differs')
    need(contains_pin(packet, EXPECTED['index']) and contains_pin(packet, EXPECTED['causal'])
         and contains_pin(causal, EXPECTED['index']), 'Final packet/causal/index binding differs')
    need(contains_pin(review, EXPECTED['packet']) and contains_pin(review, EXPECTED['index']), 'Independent review does not bind final inputs')
    blocking_fields = [k for k in ['blockingFindings', 'blockingPacketFindings'] if k in review]
    need(blocking_fields and all(isinstance(review[k], list) and review[k] == [] for k in blocking_fields)
         and review['allReadsFinished'] is True and review['formalAcceptanceClosed'] is False,
         'Blocking evidence findings remain or explicit final disposition is absent; informational findings are preserved')
    need(contains_pin(outcome, EXPECTED['packet']) and contains_pin(outcome, EXPECTED['review']), 'Root outcome does not bind packet/review')
    # Avoid a hash cycle: the root outcome precedes the final builder. A later
    # postcommit handoff may pin both; the outcome must not pin this final body.
    need(not contains_pin(outcome, pin(Path(__file__).resolve())), 'Root outcome/final-builder hash cycle')
    need(index['artifactCount'] == len(index['artifacts']), 'Runtime index cardinality differs')
    indexed = {}
    for row in index['artifacts']:
        verify(row)
        need(row['path'] not in indexed, 'Duplicate runtime reference')
        indexed[row['path']] = row
    physical = index['privateOnlyLargeManifest']
    verify(physical)
    need(physical['bytes'] == 4083433 and physical['bytes'] > MAX, 'Expected large private physical manifest differs')
    original = packet['originalCorpora']
    need(original['source'] == SOURCE and original['codeSource'] == CODE
         and original['distinctOriginalFileTitleRegistrations'] == 31 and original['originalFileCount'] == 4
         and original['single31CaseRunClaimed'] is False
         and [r['registered'] for r in original['separateOriginalRuns']] == [12, 5, 4, 10]
         and all(r['registered'] == r['passed'] and r['failed'] == r['pending'] == r['todo'] == 0
                 for r in original['separateOriginalRuns']), 'Four original run results differ')
    commands = packet['rootCommands']
    need(packet['rootCommandCount'] == len(commands) == 15 and len({c['phase'] for c in commands}) == 15,
         'Root journal must retain 15 distinct actual commands')
    need(commands[-1]['phase'] == 'final-normal-freeze' and all(c['head'] == SOURCE for c in commands), 'Final source/freeze differs')
    grep = [c for c in commands if c['phase'] == 'old-delete-message-inventory']
    need(len(grep) == 1 and grep[0]['exit'] == 1
         and grep[0]['ownedProcess']['argv'] == ['git', 'grep', '-n', 'Removed corrupted', '--', 'src']
         and Path(grep[0]['log']).read_bytes() == b''
         and all(c['exit'] == 0 for c in commands if c['phase'] != 'old-delete-message-inventory'),
         'Only the exact empty negative grep may exit1; no source-guard failure may be waived')
    matrices, phases = causal['controls'], []
    need(len(matrices) == 2, 'Only two reviewed source controls are in scope')
    for matrix in matrices:
        need([p['stage'] for p in matrix['phases']] == ['baseline', 'mutant', 'restored'], 'Matrix phase order differs')
        phases.extend(matrix['phases'])
        for p in matrix['phases']:
            c = p['classification']
            need(c['total'] == 12 and c['pending'] == c['todo'] == 0
                 and c['passed'] + c['failed'] == 12, 'Core12 phase incomplete')
            if p['stage'] != 'mutant':
                need(c['passed'] == 12 and c['failed'] == 0 and c['classification'] == 'passed', 'Baseline/restoration not green')
            else:
                need(c['classification'] == ('survivor' if c['failed'] == 0 else 'body-assertion-failures-observed'),
                     'Actual mutant classification differs')
        expected_verdict = ('survivor' if matrix['phases'][1]['classification']['failed'] == 0
                            else 'body-assertion-sensitivity-awaiting-root-attribution')
        need(matrix['verdict'] == expected_verdict, 'Mutation verdict differs from measured classification')
    totals = {k: sum(p['classification'][k] for p in phases) for k in ['total', 'passed', 'failed', 'pending', 'todo']}
    need(len(phases) == packet['separateCausalCommandCount'] == len(causal['causalCommandRecords']) == 6
         and totals['total'] == 72 and totals['pending'] == totals['todo'] == 0
         and totals == causal['executionCounts'] == packet['causalExecutionCounts'], 'Derived repeated counts differ')
    failures = [f for p in phases for f in p['classification']['failures']]
    distinct_failed = len({(f['file'], f['fullName']) for f in failures})
    survivors = [m['control'] for m in matrices if m['verdict'] == 'survivor']
    need(distinct_failed == causal['distinctFailedFileTitlePairs'] and survivors == causal['survivingControls']
         and causal['mutantPassedCounts'] == [m['phases'][1]['classification']['passed'] for m in matrices],
         'Measured failures/survivors differ; predictions must not replace actual outcomes')
    need(RUNTIME['node'] == original['runtime']['node'] == 'v22.23.3'
         and RUNTIME['pnpm'] == '10.33.0' and RUNTIME['arch'] in ['arm64', 'x64'], 'Actual runtime attribution differs')
    env = os.environ.copy() | {'GIT_NO_LAZY_FETCH': '1'}
    need(subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=R, env=env, text=True).strip() == SOURCE, 'Parent HEAD differs')
    need(subprocess.check_output(['git', 'branch', '--show-current'], cwd=R, env=env, text=True).strip() ==
         'codex/p0-45-current-qualification', 'Parent branch differs')
    need(not subprocess.check_output(['git', 'status', '--porcelain=v1'], cwd=R, env=env, text=True), 'Parent is not clean')
    tracked, compiled = [read(C / ('inputs/' + n + '-manifest.json')) for n in ['source', 'compiled']]
    need(len(tracked) == 8205 and len(compiled) == 4529 and not set(tracked) & set(compiled), 'Manifest counts/overlap differ')
    need(all(pin(R / n)['sha256'] == sha for n, sha in (tracked | compiled).items()), 'Parent source/dist bytes changed')
    preservation = read(packet['finalSourcePreservation']['path'])
    need(preservation['allBytesExact'] is True and preservation['physicalIdentityExact'] is True
         and preservation['parentTrackedChecked'] == 8205 and preservation['parentCompiledChecked'] == 4529
         and preservation['privateFilesChecked'] == 12734, 'Final preservation incomplete')
    need(pin(FREEZER)['sha256'] == FREEZER_SHA, 'Reviewed freezer-v2 changed')

    # Curated compact bodies only. Reference membership is not copy permission.
    sources = [Path(p['path']) for p in EXPECTED.values()]
    sources += [B / n for n in ['initial-preflight.json', 'original-corpora-summary.json', 'post-build-provenance.json',
        'exact-source-validation-context.json', 'acceptance-static-inventory.json', 'adjacent-doctor-static-review.json',
        'commands-frozen.jsonl', 'final-source-preservation.json']]
    sources += [C / n for n in ['setup.json', 'setup-index.json', 'proposal.json', 'driver/controller.py',
        'driver/observer-reporter.mjs', 'inputs/case-identities.json', 'inputs/preservation.json']]
    sources += [T / n for n in ['p0-45-readonly-readiness-20261015.json', 'p0-45-readonly-readiness-20261015.md',
        'p0-45-causal-readonly-plan-20261015.json', 'p0-45-causal-readonly-plan-20261015.md',
        'p0-45-controller-code-static-review-20261015.json', 'p0-45-controller-code-static-review-20261015.md',
        'p0-45-causal-controller-preparation-20261015.json',
        'p0-45-wrapper-static-review-20261015.json', 'p0-45-wrapper-static-review-20261015.md',
        'p0-45-original-corpora-independent-review-20261015.json', 'p0-45-original-corpora-independent-review-20261015.md',
        'p0-45-prebuild-pin-order-preparation-issue-20261015.json',
        'p0-11-readonly-readiness-20261015.json']]
    sources += [FREEZER, Path(__file__).resolve(), Path('/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/specs/P0-45.md')]
    sources += [Path(c['log']) for c in commands]
    for run in original['separateOriginalRuns']:
        sources += [Path(run[k]['path']) for k in ['raw', 'rawProducer', 'observer', 'combinedStream',
                    'command', 'ownedProcess', 'ownedGroupAfterExit']]
    for matrix in matrices:
        sources += [Path(matrix['result']['path']), Path(matrix['release']['path'])]
        for p in matrix['phases']:
            directory = Path(p['directory'])
            need(directory.parent == C / 'phases', 'Unexpected causal phase directory')
            sources += [directory / n for n in ['raw.json', 'observer.json', 'stdout-stderr.log', 'command.json',
                'owned-process.json', 'owned-group-after-exit.json', 'inputs-before.json', 'inputs-after.json',
                'classification.json', 'artifacts.json']]
    sources = list(dict.fromkeys(sources))
    excluded = [C / 'closure', C / 'home', C / 'tmp', B / 'home', B / 'store', R / 'node_modules', R / 'src', R / 'dist']
    forbidden_names = {'physical-copy-manifest.json', 'source-manifest.json', 'compiled-manifest.json',
                       'p0-45-freeze-qualified-evidence-prepared-20261015.py'}
    marker = b'PRIVATE ' + b'KEY-----'
    payloads = []
    for source in sources:
        need(not any(source == root or root in source.parents for root in excluded)
             and source.name not in forbidden_names, 'Private/oversize source selected for copy: ' + str(source))
        need(stat.S_ISREG(source.lstat().st_mode) and not source.is_symlink(), 'Selected evidence is not a regular file')
        data = source.read_bytes()
        need(len(data) <= MAX and marker not in data, 'Oversize/key body selected; do not split or trim: ' + str(source))
        row = pin(source)
        if str(source) in indexed:
            need(row == indexed[str(source)], 'Selected evidence differs from frozen index')
        payloads.append((source, row, data))
    references = dict(indexed)
    for row in ADDITIONAL_PRIVATE_REFERENCES:
        verify(row)
        references[row['path']] = row
    # Every copied body is validated before mkdir. Writes are exclusive and
    # nontransactional: retain a failed partial attempt; no rollback or retries.
    Q.mkdir()
    (Q / 'evidence').mkdir()
    mapping = []
    for source, row, data in payloads:
        target = Q / 'evidence' / (row['sha256'] + '-' + source.name)
        if target.exists():
            need(target.read_bytes() == data, 'Content-addressed filename collision')
        else:
            with target.open('xb') as out:
                out.write(data)
        need(target.read_bytes() == data, 'Evidence copy mismatch')
        mapping.append({'original': row, 'copy': target.relative_to(Q).as_posix()})
    write_new(Q / 'evidence-map.json', {'copies': mapping, 'immutableBytesPreserved': True})
    write_new(Q / 'private-references.json', {'source': SOURCE, 'codeSource': CODE,
        'references': [references[k] for k in sorted(references)], 'privatePhysicalManifest': physical,
        'boundary': 'Point-in-time hash references only. Source closures, HOME/store/tmp, dependencies/native bodies and the unsplit 4,083,433-byte physical manifest remain private. No reference body is copied merely because it is indexed. Historical role-inbox boundaries retain their original attribution.'})
    write_new(Q / 'outcomes.json', {'source': SOURCE, 'codeSource': CODE, 'formalAcceptanceClosed': False,
        'originalCorpora': original, 'primaryOriginalCoreTests': {'total': 12, 'passed': 12, 'failed': 0, 'skipped': 0},
        'causalControls': matrices, 'causalExecutionCounts': totals, 'distinctFailedFileTitlePairs': distinct_failed,
        'survivingControls': survivors, 'failuresAndMasking': failures,
        'rootCommandCount': 15, 'expectedEmptyGrep': grep[0], 'separateCausalCommandCount': 6,
        'separateCausalCommandRecords': causal['causalCommandRecords'],
        'controllerHistory': causal['controllerHistory'], 'review': EXPECTED['review'], 'rootOutcome': outcome,
        'countingRule': 'Original12/5/4/10 are four separate invocations. Two controls repeat core12 across six phases:72 repeated executions, not72 unique cases or one21-command test invocation.'})
    write_new(Q / 'acceptance-gaps.json', {'formalAcceptanceClosed': False,
        'currentAcceptanceStaticInventory': read(B / 'acceptance-static-inventory.json'),
        'adjacentDoctorStaticReview': read(B / 'adjacent-doctor-static-review.json'),
        'sourceQuality': packet['unwaivedSourceQuality'], 'limits': packet['limits'],
        'preserved': ['Current production behavior and all original test/setup/config/assertion/cleanup bytes',
            'Current OBSERVED L2/audit schema3', 'P021 literal20/10-outside-R4 gap', 'User P029 skip',
            'Claude/shared/paused ownership and reservations', 'All earlier decisions and pending transfers'],
        'nextReadOnlyCandidate': packet['nextReadOnlyCandidate']})
    readme = f'''# P0-45 bounded qualification

Four separate unchanged original runs pass **12 core, 5 built CLI, 4 verification-separation and 10 readonly-verifier cases** on source `{SOURCE}`. Production code remains `{CODE}`. These are four invocations, not one 31-case run. The primary receipt count is the original core 12.

Two private source controls repeat that same 12-case corpus across six phases: **{totals['total']} repeated executions, {totals['passed']} passes and {totals['failed']} body assertion failures across {distinct_failed} distinct file/title pairs**. No cases were pending or todo. All baseline and restored phases pass 12. Actual survivor controls: {', '.join(survivors) if survivors else 'none'}. These outcomes are derived from the completed evidence, not the preparation hypotheses.

| Control | Baseline passed | Mutant passed / failed | Restored passed | Actual classification |
| --- | ---: | ---: | ---: | --- |
'''
    for m in matrices:
        before, mutant, restored = [p['classification'] for p in m['phases']]
        readme += f'| {m["control"]} | {before["passed"]} | {mutant["passed"]} / {mutant["failed"]} | {restored["passed"]} | {m["verdict"]} |\n'
    readme += '''
C1 removes the unknown and active legal-hold refusals together. The core uses injected hold callbacks and a stub SignedDigest signer. The shared refusal helper at line 99 can stop before the reason, snapshot, no-quarantine and reachability assertions. Exact observed error frames and masking remain in outcomes and the copied raw/observer evidence; no unrecorded later state is inferred.

C2 replaces only the forward rename with faithful copy then unlink while preserving rollback rename. A completed copy can keep every byte at the receipt-named path. The original EXDEV test depends on the third outside-to-quarantine rename, which this mechanism can bypass; receipt temp-file renames start inside quarantine. A rename-spy assertion failure is fault-path sensitivity, not observed byte loss or proof that the spec's byte-reachability mutation criterion is satisfied. Actual survivors and any remaining invariant-coverage gap stay explicit.

The core uses real encrypted-blob writers, verification and SHA-256 snapshots in owned fixtures. Writers and pools close before repair. The separate CLI cases spawn actual built dist/cli.js, validate a real local REPAIR_RECEIPT signature and an altered-byte refusal, and assert archived-store messages. All 4,529 compiled files remain unchanged during source-only controls, so the CLI passes do not establish sensitivity to the TS mutations. The CLI's afterAll deletes the owned fixture: retained source/raw/observer/outer streams do not provide a separately retained repair-receipt sample, per-product-child transcript or independently pinned external issuer proof. No sample criterion is silently closed.

Original command wrappers inherit the environment with private HOME and Node 22 PATH; CLI children add per-call AMC_HOME/passphrase. The causal copy is an owned physical filesystem copy without .git and borrows unchanged parent dependencies under a seven-key environment. Its owned-group signal-zero ESRCH observations do not prove OS/network isolation, universal detached-descendant absence or all-cache absence. Run-end observations precede global teardown; actual process exits and full known-late-diagnostic checks are separate. Supervisor waits do not change original 30-second core deadlines or 60-second CLI child timeouts. No terminating signal, compiler, import adaptation, source repair, assertion/config/guard/deadline/cleanup change or dist mutation formed these controls.

Final preservation covers 8,205 original tracked files, 4,529 compiled files, the 12,734-file private copy, native identity and pinned helper/plan/reservation inputs. Deliberate private TS mutations restored exactly. Private source closures, HOME/store/tmp, dependencies/native bodies and the 4,083,433-byte physical manifest are not copied. The manifest remains an unsplit private hash reference; no splitting or trimming bypasses the 1 MiB per-file cap. Raw bytes and EOF whitespace are retained unchanged.

The frozen root journal has 15 actual commands. Only the exact `git grep -n 'Removed corrupted' -- src` negative inventory exits 1 with an empty stream; every other root command exits 0. No source-guard failure is waived. These commands remain separate from the six causal processes. The direct verify action has no rmSync/unlinkSync call, but adjacent sign-config/relabel modes and rollback's own intent cleanup are separate effects; this is not a claim that every verify mode is read-only.

The adjacent doctor review identifies a broken top-level .amc symlink branch that unlinks dangling links without the evidence-name exclusion/gate; its cache branch has an existing gate. This is an unapproved adjacent follow-up with no assigned owner. P2-01 is only a lead, not an approved successor. No doctor deletion, byte loss or verify-repair defect was observed here, and no doctor or hold source changed.

Formal acceptance remains open: no historical origin/main red or PR/merge evidence, retained CLI receipt sample, active-writer/WAL race, interactive TTY, complete damaged-JSONL repair, genuine signed active/unknown hold registry, second signing failure, rollback failure, crash or interrupted publication proof is supplied. Required 1,269 duplicate and 2,751 dead-code findings remain failed and unwaived; prior exact-code type/lint/clean-source/quality checks keep their original source and command attribution. P021 literal 20/10-outside-R4 reconciliation, user-skipped P029, P022 arrays, P023 held API/Studio, P051 issuer/formal, P024 ISO/expert gaps, P019/P020 proposals and P030 held runner/full-batch/installed-pack gaps remain unresolved. Claude/shared CLI/API/Studio/A4 and paused P2-02 reservations and pending transfers stay intact. No full suite, coverage, Node 24, hosted CI, installed P0-31 acceptance, release, formal dependency closure, G0 or Done is established. P0-11 remains conditional read-only preparation.

The final independent review, including its informational acceptance/quality findings, and root outcome are copied unchanged. Their blocking evidence disposition is checked separately from those open formal requirements. The root outcome does not pin this future builder; a later postcommit handoff can pin both without a hash cycle.
'''
    text_new(Q / 'README.md', readme)
    notes = ('Bounded existing-source qualification, not formal acceptance or Done. tests records only original core12. '
        'Separate builtCLI5, separation4 and readonly10 runs and two controls repeating12 across six phases remain distinct in outcomes. '
        'Causal pass/failure/survivor totals are derived from actual evidence, not predicted kills. C1 uses callbacks/stub signing; '
        'C2 rename-spy sensitivity is not byte loss and may leave the byte-invariant mutation criterion open. '
        'Only the designated exact empty git-grep command exits1; all other root commands must exit0. No source-guard failure is waived. '
        'No retained CLI receipt sample, historical-red/PR/merge, live-writer/TTY/JSONL/late-sign/rollback-failure/crash or installedP031 proof. '
        'Adjacent doctor concern is unapproved and unassigned, not an observed deletion or repair-path failure. '
        'Quality1269/2751, P021 literal gap and all earlier holds/skips/transfers remain. '
        'No fullsuite/coverage/Node24/hosted/release/formal-dependency/G0/Done claim.')
    receipt = {'schemaVersion': 1, 'key': 'P0-45', 'date': '2026-10-15', 'commit': SOURCE,
        'branch': 'codex/p0-45-current-qualification', **RUNTIME,
        'commands': [{k: c[k] for k in ['cmd', 'exit', 'durationMs']} for c in commands],
        'tests': {'total': 12, 'passed': 12, 'failed': 0, 'skipped': 0},
        'artifacts': [{'path': p.relative_to(Q).as_posix(), 'sha256': pin(p)['sha256']}
                      for p in sorted(Q.rglob('*')) if p.is_file()], 'notes': notes}
    write_new(Q / 'receipt.json', receipt)
    need(all(p.stat().st_size <= MAX and marker not in p.read_bytes() for p in Q.rglob('*') if p.is_file()),
         'Final metadata cap/key check failed; retain the partial attempt, do not trim or split')
    print(json.dumps({'canonical': str(Q), 'files': len(receipt['artifacts']) + 1, 'artifacts': len(receipt['artifacts']),
        'privateReferences': len(references), 'primaryTests': receipt['tests'], 'causalExecutionCounts': totals,
        'survivors': survivors, 'formalAcceptanceClosed': False}), flush=True)


if __name__ == '__main__':
    main()
