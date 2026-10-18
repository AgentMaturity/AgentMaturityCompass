"""UNEXECUTED P0-21 canonical builder; final exact bindings must be supplied first.

Only root may enact this after review. It creates one absent canonical directory,
copying curated immutable evidence unchanged. It runs no product or validation.
"""
from pathlib import Path
import hashlib
import json
import os
import stat
import subprocess

R = Path('/Users/sid/.codex/worktrees/p0-21-qualification/AgentMaturityCompass')
B = Path('/private/tmp/p0-21-qualification-20261015')
C = Path('/private/tmp/p0-21-causal-qualification-20261015')
T = Path('/private/tmp')
Q = R / 'qualification/2026-10-15-P0-21'
SOURCE = 'f58d88d80ab490490184354cc8665631d6999cc1'
CODE = '58e91dcef111bf02f773dcbfd1921d428cf75e34'
MAX = 1048576

# Deliberately incomplete: replace only after root supplies the real frozen pins.
# Each value must be {path, bytes, sha256}; no runtime result is invented here.
EXPECTED = {'packet': {'path': '/private/tmp/p0-21-bounded-qualification-20261015.json', 'bytes': 22661, 'sha256': '59f3e11fe15481cbcec48c0d77d4ce6c0ffbd723344a472c965a34368e96f5a2'}, 'packetMarkdown': {'path': '/private/tmp/p0-21-bounded-qualification-20261015.md', 'bytes': 3218, 'sha256': '13f47058cf8698a8cf409023061a2b9ce20f20c5e889e224e90e6646f9c2e87a'}, 'causal': {'path': '/private/tmp/p0-21-causal-qualification-20261015.json', 'bytes': 214028, 'sha256': 'dedf4697037ceaf365245141a3422852e5d8f1c6d9d1f12c662d7c8debf1955a'}, 'causalMarkdown': {'path': '/private/tmp/p0-21-causal-qualification-20261015.md', 'bytes': 3685, 'sha256': '15681f6d48f6bc635f385d1a5b83746d315e565af0023f2dc7d89e2ac4e54ac3'}, 'index': {'path': '/private/tmp/p0-21-causal-qualification-20261015/runtime-artifact-index-v3.json', 'bytes': 73776, 'sha256': 'a46ee93ebf9105bb3f335a60db052a56021e8228367c2a4aa6c96132f22c990e'}, 'review': {'path': '/private/tmp/p0-21-bounded-independent-review-20261015.json', 'bytes': 85246, 'sha256': 'bc7eda0247465310cc95166b0b951b1ea4677cbb063a7abb4f74033a1c8920b9'}, 'reviewMarkdown': {'path': '/private/tmp/p0-21-bounded-independent-review-20261015.md', 'bytes': 3904, 'sha256': '94c0bdddab765bfaa6beeed4f4ef0feea9cae5e72a807f81b192f0b86e7299cf'}, 'outcome': {'path': '/private/tmp/p0-21-root-bounded-outcome-20261015.json', 'bytes': 12793, 'sha256': 'ac295889ae3ac3aa7e18f52917f33410030decfeff4acec085fb0b9adcce6b46'}, 'freezerCorrection': {'path': '/private/tmp/p0-21-freezer-v2-static-review-20261015.json', 'bytes': 11393, 'sha256': 'f98c9e8e55412178ae9eb06c73fd4ae02075f6a0a43da56c05dc83aae86bcfd2'}}
# Root supplies actual runtime attribution; do not substitute packaging-time OS.
RUNTIME = {'node': 'v22.23.3', 'pnpm': '10.33.0', 'os': 'Darwin 25.6.0', 'arch': 'arm64'}
ADDITIONAL_PRIVATE_REFERENCES = [{'path': '/private/tmp/p0-21-build-canonical-packet-20261015.py', 'bytes': 20841, 'sha256': '23a5510a8a4c1191151dda5870477bd3604edf94d16c5e8e4daf2eed7d6eca97'}, {'path': '/private/tmp/p0-21-freezer-static-review-20261015.json', 'bytes': 26809, 'sha256': '08c300c748bc1b63b6fe518638114d2ff478c40a0445424068a5af4a1170da10'}, {'path': '/private/tmp/p0-21-freezer-static-review-20261015.md', 'bytes': 2846, 'sha256': '8729a85f8c87485363b1c5e83b5980dd5169676ec84f930ae80d1080b755fee3'}, {'path': '/private/tmp/p0-21-root-runtime-attribution-20261015.json', 'bytes': 900, 'sha256': '688ea7c228a8e8aa8f64e57c219e1ba2e0c7881c598fd92d3495a3eb9690dc6a'}, {'path': '/private/tmp/p0-21-run-final-command-20261015.py', 'bytes': 1148, 'sha256': 'befb21a5f4f8b138757b05098d6a61a0436b07d3d9b2d7821c3ce6b42c3f31c2'}]


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
    actual = pin(row['path'])
    need(all(actual[k] == row[k] for k in ['path', 'bytes', 'sha256']), 'Frozen binding changed: ' + row['path'])
    return actual


def write_new(path, value):
    with Path(path).open('x') as out:
        json.dump(value, out, indent=2)
        out.write('\n')


def text_new(path, value):
    with Path(path).open('x') as out:
        out.write(value)


def contains_pin(value, wanted):
    if isinstance(value, dict):
        if value.get('path') == wanted['path'] and value.get('sha256') == wanted['sha256']:
            return True
        return any(contains_pin(v, wanted) for v in value.values())
    if isinstance(value, list):
        return any(contains_pin(v, wanted) for v in value)
    return False


def main():
    need(all(isinstance(v, dict) and set(v) == {'path', 'bytes', 'sha256'} for v in EXPECTED.values()),
         'STOP: exact final packet/index/review/outcome/correction bindings have not been supplied')
    need(isinstance(RUNTIME, dict) and set(RUNTIME) == {'node', 'pnpm', 'os', 'arch'}, 'Actual runtime attribution missing')
    need(not Q.exists(), 'Canonical destination already exists; no overwrite or automatic resume')
    for row in EXPECTED.values():
        verify(row)
    packet, causal, index = [read(EXPECTED[k]['path']) for k in ['packet', 'causal', 'index']]
    review, outcome = read(EXPECTED['review']['path']), read(EXPECTED['outcome']['path'])
    need(packet['source'] == causal['source'] == index['source'] == SOURCE
         and packet['codeSource'] == causal['codeSource'] == index['codeSource'] == CODE, 'Source attribution differs')
    need(packet['formalAcceptanceClosed'] is False and causal['formalAcceptanceClosed'] is False
         and outcome['formalAcceptanceClosed'] is False, 'Formal acceptance was improperly closed')
    need(packet['state'] == causal['state'] == 'complete-pending-independent-review', 'Frozen measured packet boundary differs')
    need(contains_pin(packet, EXPECTED['index']) and contains_pin(packet, EXPECTED['causal']), 'Packet does not bind exact causal/index inputs')
    need(contains_pin(causal, EXPECTED['index']), 'Causal summary does not bind exact index')
    need(contains_pin(review, EXPECTED['packet']) and contains_pin(review, EXPECTED['index']), 'Review does not bind exact final packet/index')
    need(review['blockingPacketFindings'] == [] and review['allReadsFinished'] is True and review['formalAcceptanceClosed'] is False, 'Independent blocking packet findings require root resolution; informational/acceptance/quality findings remain preserved')
    need(contains_pin(outcome, EXPECTED['packet']) and contains_pin(outcome, EXPECTED['review']), 'Root outcome does not bind packet/review')
    need(index['artifactCount'] == len(index['artifacts']), 'Index cardinality differs')
    indexed = {}
    for row in index['artifacts']:
        verify(row)
        need(row['path'] not in indexed, 'Duplicate runtime index path')
        indexed[row['path']] = row
    original = packet['originalCorpora']
    need(original['distinctOriginalRegistrationsAcross11Files'] == 99
         and [r['registered'] for r in original['separateOriginalRuns']] == [37, 14, 48]
         and all(r['registered'] == r['passed'] and r['failed'] == r['pending'] == r['todo'] == 0
                 for r in original['separateOriginalRuns']), 'Primary/separate original results differ')
    need(packet['rootCommandCount'] == len(packet['rootCommands']) == 15
         and packet['separateCausalCommandCount'] == len(causal['causalCommandRecords']) == 18,
         'Command accounting differs')
    commands = packet['rootCommands']
    need(commands[-1]['phase'] == 'final-normal-freeze' and all(c['exit'] == 0 and c['head'] == SOURCE for c in commands),
         'Actual root journal is incomplete or nonzero')
    need(len(causal['controls']) == 6 and causal['executionCounts'] ==
         {'total': 666, 'passed': 655, 'failed': 11, 'pending': 0, 'todo': 0}
         and causal['distinctFailedFileTitlePairs'] == 10, 'Final causal execution accounting differs')
    need(causal['mutantPassedCounts'] == [35, 36, 34, 36, 36, 34], 'Measured control outcomes differ')
    need(RUNTIME['node'] == original['runtime']['node'] == 'v22.23.3'
         and RUNTIME['pnpm'] == '10.33.0' and RUNTIME['arch'] in ['arm64', 'x64'], 'Runtime attribution differs')
    env = os.environ.copy() | {'GIT_NO_LAZY_FETCH': '1'}
    need(subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=R, env=env, text=True).strip() == SOURCE, 'Parent HEAD differs')
    need(subprocess.check_output(['git', 'branch', '--show-current'], cwd=R, env=env, text=True).strip() ==
         'codex/p0-21-current-qualification', 'Parent branch differs')
    need(not subprocess.check_output(['git', 'status', '--porcelain=v1'], cwd=R, env=env, text=True), 'Parent source is not clean')
    tracked = read(C / 'inputs/source-manifest.json')
    compiled = read(C / 'inputs/compiled-manifest.json')
    need(len(tracked) == 7945 and len(compiled) == 4529, 'Source manifest counts differ')
    need(all(pin(R / name)['sha256'] == sha for name, sha in (tracked | compiled).items()), 'Parent source/dist no longer exact')
    preservation = read(packet['finalSourcePreservation']['path'])
    need(preservation['allBytesExact'] is True and preservation['physicalIdentityExact'] is True
         and preservation['parentTrackedChecked'] == 7945 and preservation['parentCompiledChecked'] == 4529
         and preservation['privateFilesChecked'] == 12474, 'Frozen final preservation incomplete')

    # Explicit curated selection only. The index contains private refs to excluded
    # data; references are not permission to copy their bodies into this packet.
    sources = [Path(row['path']) for row in EXPECTED.values()]
    sources += [B / n for n in ['initial-preflight.json', 'original-corpora-summary.json',
        'exact-source-validation-context.json', 'certification-wording-acceptance-gap.json',
        'known-late-close-retrospective-audit.json', 'commands-frozen.jsonl', 'final-source-preservation.json']]
    sources += [C / n for n in ['setup-v3.json', 'setup-index-v3.json', 'README-v3.md',
        'preparation-v3-change-note.json', 'proposal.json', 'driver/controller-v3.py',
        'driver/observer-reporter.mjs', 'inputs/case-identities.json', 'inputs/preservation.json']]
    sources += [T / n for n in ['p0-21-readonly-readiness-v2-20261015.json',
        'p0-21-causal-readonly-plan-v2-20261015.json', 'p0-21-canonical-outline-20261015.json',
        'p0-45-readonly-readiness-20261015.json', 'p0-21-causal-root-sealed-input-verification-20261015.json',
        'p0-21-recipes-static-review-20261015.json', 'p0-21-recipes-static-review-20261015.md',
        'p0-21-controller-code-static-review-20261015.json', 'p0-21-controller-code-static-review-20261015.md',
        'p0-21-controller-v1-root-blocked-review-20261015.json',
        'p0-21-controller-v3-code-static-review-20261015.json', 'p0-21-controller-v3-code-static-review-20261015.md',
        'p0-21-controller-v3-sealed-setup-review-20261015.json', 'p0-21-controller-v3-sealed-setup-review-20261015.md',
        'p0-21-freeze-qualified-evidence-v2-20261015.py']]
    sources += [Path(row['log']) for row in commands]
    for run in original['separateOriginalRuns']:
        sources += [Path(run[k]['path']) for k in ['raw', 'observer', 'combinedStream']]
    for matrix in causal['controls']:
        sources += [Path(matrix['result']['path']), Path(matrix['release']['path'])]
        need(len(matrix['phases']) == 3 and [p['stage'] for p in matrix['phases']] == ['baseline', 'mutant', 'restored'], 'Matrix phases differ')
        for phase in matrix['phases']:
            directory = Path(phase['directory'])
            need(directory.parent == C / 'phases', 'Unexpected phase root')
            sources += [directory / name for name in ['raw.json', 'observer.json', 'stdout-stderr.log', 'command.json',
                'owned-process.json', 'owned-group-after-exit.json', 'inputs-before.json', 'inputs-after.json',
                'classification.json', 'artifacts.json']]
    sources += [Path('/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/specs/P0-21.md'), Path(__file__).resolve()]
    sources = list(dict.fromkeys(sources))
    excluded = [C / 'closure', C / 'home', C / 'tmp', B / 'home', B / 'store', R / 'node_modules']
    forbidden_names = {'physical-copy-manifest.json', 'p0-21-freeze-qualified-evidence-20261015.py'}
    marker = b'PRIVATE ' + b'KEY-----'
    payloads = []
    for source in sources:
        need(not any(source == root or root in source.parents for root in excluded)
             and source.name not in forbidden_names, 'Excluded private input selected: ' + str(source))
        st = source.lstat()
        need(stat.S_ISREG(st.st_mode) and not source.is_symlink(), 'Selected evidence is not a regular file')
        data = source.read_bytes()
        need(len(data) <= MAX and marker not in data and b'-----BEGIN OPENSSH ' + b'PRIVATE ' + b'KEY-----' not in data,
             'Oversize or private-key body selected: ' + str(source))
        row = pin(source)
        if str(source) in indexed:
            need(row == indexed[str(source)], 'Selected evidence differs from final runtime index')
        payloads.append((source, row, data))
    references = dict(indexed)
    for row in ADDITIONAL_PRIVATE_REFERENCES:
        verify(row)
        references[row['path']] = row
    old_freezer = T / 'p0-21-freeze-qualified-evidence-20261015.py'
    need(pin(old_freezer)['sha256'] == '211bec712aed49ca900bfed3550f3185e8d8334156d0b99ae5bbc9268d779cf3', 'Superseded freezer-v1 changed')
    references[str(old_freezer)] = pin(old_freezer)
    # Every selected body is validated before creating Q. Raw bodies stay exact;
    # EOF whitespace and recorded failures are never trimmed or normalized.
    Q.mkdir()
    (Q / 'evidence').mkdir()
    mapping = []
    for source, row, data in payloads:
        target = Q / 'evidence' / (row['sha256'] + '-' + source.name)
        if target.exists():
            need(target.read_bytes() == data, 'Content-addressed copy collision')
        else:
            with target.open('xb') as out:
                out.write(data)
        need(target.read_bytes() == data, 'Copied bytes changed')
        mapping.append({'original': row, 'copy': target.relative_to(Q).as_posix()})
    write_new(Q / 'evidence-map.json', {'copies': mapping, 'immutableBytesPreserved': True})
    write_new(Q / 'private-references.json', {'source': SOURCE, 'codeSource': CODE,
        'references': [references[k] for k in sorted(references)],
        'boundary': 'Point-in-time hash references only. Private source closures, HOME/store/tmp, dependencies/native binaries and the 3.9MB physical manifest remain private. Superseded unexecuted freezer-v1 and its premature static-readiness context are private references; only corrected freezer-v2 is copied. Historical indices retain their original inbox pins; current approved prefix boundary is separate.'})
    write_new(Q / 'outcomes.json', {'source': SOURCE, 'codeSource': CODE,
        'originalCorpora': original, 'causalControls': causal['controls'], 'causalExecutionCounts': causal['executionCounts'],
        'distinctFailedFileTitlePairs': causal['distinctFailedFileTitlePairs'],
        'rootCommandCount': 15, 'separateCausalCommandCount': 18,
        'separateCausalCommandRecords': causal['causalCommandRecords'],
        'versionHistory': causal['versionHistory'], 'failuresAndMasking': causal['failuresAndMasking'],
        'review': EXPECTED['review'], 'rootOutcome': outcome, 'formalAcceptanceClosed': False,
        'counting': 'Original core37, CLI14 and consumers48 are separate invocations. Six controls repeat core37 across18 phases:666 executions,655passes11body assertion failures. Repeated executions are not new unique cases or one33-command test run.'})
    write_new(Q / 'acceptance-gaps.json', {'formalAcceptanceClosed': False,
        'wording': read(B / 'certification-wording-acceptance-gap.json'),
        'sourceQuality': packet['unwaivedSourceQuality'], 'limits': packet['limits'],
        'preserved': ['Current OBSERVED-supported L2', 'Audit schema /3', 'All original source/tests/config/guards/dist',
            'User P029 skip', 'Claude/shared/paused/reservation boundaries', 'Earlier unresolved choices and pending transfers'],
        'nextReadOnlyCandidate': packet['nextReadOnlyCandidate']})
    readme = '''# P0-21 bounded qualification

The unchanged original core passes **37/37** on source `f58d88d80ab490490184354cc8665631d6999cc1`, with production code equivalent to `58e91dcef111bf02f773dcbfd1921d428cf75e34`. Separate unchanged runs pass **14/14 CLI** and **48/48 scoring-consumer** cases. These are three invocations, not one 99-case run. The primary receipt count is the original core 37.

Six private controls repeat the same 37-case corpus across 18 phases: **666 repeated executions, 655 passes and 11 body assertion failures across 10 distinct file/title pairs**, with zero pending/todo cases. All baseline and restored phases pass 37. Controller-v3 is the executed hash-released controller; v1/v2 remain superseded unexecuted preparation. Generic nonzero exits are not guard kills.

| Control | Baseline passed | Mutant passed / failed | Restored passed |
| --- | ---: | ---: | ---: |
'''
    for m in causal['controls']:
        b, mut, r = [p['classification'] for p in m['phases']]
        readme += f'| {m["control"]} | {b["passed"]} | {mut["passed"]} / {mut["failed"]} | {r["passed"]} |\n'
    readme += '''
C1 changes the Likert origin: answer 1 actually returns 20 rather than expected 0. C1/C6 also produce actual domainScore 60 rather than expected 50 after the baseScore 60 assertion passes; later assertions can be masked. C2 returns level 1 at percent 30 where the existing table expects 2. C3 exposes eligibleLevel 5 instead of 1 at three existing pack/audit assertions while other regulated-result gates remain. C4 measures policy-array sensitivity only: existing evidence rewriting and provenance maps still block attained L3, so this is not observed unsafe L3 promotion. C5 measures the direct default-gate helper with hand-shaped events. C6 is a representative two-site historical size regression: raw 6/80 cease throwing and the valid-domain result becomes 60 rather than 50. The per-answer formula is not a directly measured final aggregate 6% result. Exact failure bodies and first frames remain in copied raw/observer/classification evidence.

The core uses mocked MCP entitlement/transport and hand-shaped diagnostic evidence. CLI 14 invokes the actual built entrypoint against locally authored run JSON, not authenticated stored results. Canned MCP capabilities and counters remain fixture data. Current OBSERVED-supported L2 and audit schema /3 are preserved; no earlier policy is silently restored and no expert/legal/compliance authority follows.

The original lane inherits its parent environment with a private HOME and Node PATH; it is not a credential-free allowlist. The separate causal lane is an owned physical filesystem copy without .git and borrows unchanged parent dependencies. Its seven-key environment, private HOME/TMPDIR and owned-group signal-zero ESRCH observations do not prove OS/network isolation, all-cache absence or universal descendant absence. The observer runs before global teardown; complete streams and actual process exits are separately retained. No termination signals, compiler, import rewrite, dist mutation or original assertion/config/deadline change formed these controls.

Final evidence preserves all 7,945 original tracked files, 4,529 compiled files, the 12,474-file private copy, native identity and pinned helpers/plan/reservations. Deliberate private TS mutations restored exactly. Private homes/stores/tmp, source closures, dependency/native bodies and the 3,978,574-byte physical manifest are not copied; the manifest stays private by exact hash reference. Raw EOF whitespace is retained.

The unchanged strict no-fabrication guard passes with zero pending entries. The literal certification-word inventory remains 20 lines: 10 inside explicit permanent R4 files and 10 outside. Different scanning domains mean the guard pass does not close literal acceptance reconciliation. Required **1,269 duplicate findings and 2,751 dead-code findings** remain failed and unwaived. Prior exact-code type/lint/clean-source/quality evidence retains its original source and command attribution; it is not a new P021 execution.

The independent actual review and root outcome are copied unchanged. The root command journal has 15 actual all-zero rows; the 18 causal process records remain separate in outcomes.json. Formal P0-21 acceptance stays open. Earlier skips, strict ISO/expert gaps, two empty arrays, held API/Studio/issuer/formal failures, shared-path proposals, held P0-30 runner/full-batch/installed-pack gaps, Claude reservations and pending transfers remain unresolved. Full suite, coverage, Node24, hosted CI, PR/merge, release, formal dependencies, G0 and Done are not established. P0-45 remains read-only next-lane preparation.
'''
    text_new(Q / 'README.md', readme)
    notes = ('Bounded existing-source qualification, not formal acceptance or Done. tests records only original core37. '
        'Separate CLI14 and consumers48, plus six controls repeating37 over18 phases (666/655/11;10failed file/title pairs), '
        'remain distinct in outcomes. Expected mutant exit1 body assertions are not setup failures or automatic unsafe-level proof. '
        'C4 is policy-only, C5 direct hand-shaped helper, C6 representative per-answer interpretation with invalid admission assertions. '
        'v1/v2 controllers are unexecuted; v3 actual execution and corrected freezer-v2 provenance are retained. '
        'Current OBSERVED L2/schema3, original source/tests/config/guards/dist, Claude/paused/shared boundaries are preserved. '
        'Literal20/10-outside-R4 reconciliation and duplicate1269/dead2751 remain unwaived; old validation is attributed reuse. '
        'No fullsuite/coverage/Node24/hosted/release/PR-merge/formal-dependency/G0/Done claim.')
    receipt = {'schemaVersion': 1, 'key': 'P0-21', 'date': '2026-10-15', 'commit': SOURCE,
        'branch': 'codex/p0-21-current-qualification', **RUNTIME,
        'commands': [{k: row[k] for k in ['cmd', 'exit', 'durationMs']} for row in commands],
        'tests': {'total': 37, 'passed': 37, 'failed': 0, 'skipped': 0},
        'artifacts': [{'path': p.relative_to(Q).as_posix(), 'sha256': pin(p)['sha256']}
                      for p in sorted(Q.rglob('*')) if p.is_file()], 'notes': notes}
    write_new(Q / 'receipt.json', receipt)
    need(all(p.stat().st_size <= MAX and marker not in p.read_bytes() for p in Q.rglob('*') if p.is_file()),
         'Final canonical size/private-key marker check failed; retain failed attempt, do not trim or overwrite')
    print(json.dumps({'canonical': str(Q), 'files': len(receipt['artifacts']) + 1, 'artifacts': len(receipt['artifacts']),
        'privateReferences': len(references), 'primaryTests': receipt['tests'], 'formalAcceptanceClosed': False}), flush=True)


if __name__ == '__main__':
    main()
