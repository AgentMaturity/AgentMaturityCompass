"""Unexecuted freezer: validate completed P0-21 evidence, then create new private summaries.

This program performs metadata reads and new evidence writes only. It never runs a
product, test, compiler, installer, signal, source mutation, or canonical builder.
"""
from pathlib import Path
from datetime import datetime, timezone
import collections
import errno
import hashlib
import json
import os
import re
import subprocess

ROOT = Path('/Users/sid/.codex/worktrees/p0-21-qualification/AgentMaturityCompass')
PARENT = Path('/private/tmp/p0-21-qualification-20261015')
BASE = Path('/private/tmp/p0-21-causal-qualification-20261015')
COPY = BASE / 'closure'
SOURCE = 'f58d88d80ab490490184354cc8665631d6999cc1'
CODE = '58e91dcef111bf02f773dcbfd1921d428cf75e34'
JOURNAL = Path('/private/tmp/p0-21-commands-20261015.jsonl')
FROZEN_JOURNAL = PARENT / 'commands-frozen.jsonl'
PRESERVATION_OUT = PARENT / 'final-source-preservation.json'
INDEX_OUT = BASE / 'runtime-artifact-index-v3.json'
CAUSAL_JSON = Path('/private/tmp/p0-21-causal-qualification-20261015.json')
CAUSAL_MD = CAUSAL_JSON.with_suffix('.md')
LANE_JSON = Path('/private/tmp/p0-21-bounded-qualification-20261015.json')
LANE_MD = LANE_JSON.with_suffix('.md')
OUTPUTS = [FROZEN_JOURNAL, PRESERVATION_OUT, INDEX_OUT, CAUSAL_JSON, CAUSAL_MD, LANE_JSON, LANE_MD]
LATE = [r'Unhandled Errors?', r'Unhandled Rejection', r'uncaught exception',
        r'Error during teardown', r'Tests modified the repository workspace',
        r'Hook timed out', r'Error:.*global.?teardown', r'ELIFECYCLE',
        r'error during close', r'close timed out', r'error during global teardown',
        r'Tests closed successfully but something prevents']
ANSI = re.compile(r'\x1b\[[0-9;]*m')


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def now():
    return datetime.now(timezone.utc).isoformat()


def read(path):
    return json.loads(Path(path).read_text())


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def pin(path):
    path = Path(path)
    return {'path': str(path), 'bytes': path.stat().st_size, 'sha256': digest(path)}


def verify(p):
    path = Path(p['path'])
    require(path.is_file(), 'Missing pinned file: ' + str(path))
    actual = pin(path)
    require(actual['sha256'] == p['sha256'], 'Pinned digest changed: ' + str(path))
    if 'bytes' in p:
        require(actual['bytes'] == p['bytes'], 'Pinned size changed: ' + str(path))
    return actual


def native(path):
    p = pin(path)
    st = Path(path).stat()
    return p | {'device': st.st_dev, 'inode': st.st_ino, 'nlink': st.st_nlink, 'mode': st.st_mode & 0o7777}


def new_json(path, value):
    with Path(path).open('x') as out:
        json.dump(value, out, indent=2)
        out.write('\n')


def new_text(path, text):
    with Path(path).open('x') as out:
        out.write(text)


def plain(value):
    return ANSI.sub('', str(value)).replace('\r\n', '\n')


def clean_stream(path):
    text = Path(path).read_text(errors='replace')
    require(not [p for p in LATE if re.search(p, text, re.I)], 'Known late/infrastructure banner: ' + str(path))


def copy_map():
    result = {}
    for parent, directories, files in os.walk(COPY, followlinks=False):
        if Path(parent) == COPY:
            directories[:] = [name for name in directories if name != 'node_modules']
        for name in directories + files:
            require(not (Path(parent) / name).is_symlink(), 'Unexpected copy symlink: ' + name)
        for name in files:
            p = Path(parent) / name
            result[str(p.relative_to(COPY))] = digest(p)
    return result


def check_record(value, deviations, expected, expected_native):
    require(value['parentTrackedChecked'] == 7945 and value['parentCompiledChecked'] == 4529
            and value['privateFilesChecked'] == 12474, 'Preservation cardinality differs')
    for name in ['parentDelta', 'privateUnexpectedDelta', 'immutableExternalDelta']:
        require(value[name] == [], 'Recorded preservation delta: ' + name)
    require(value['expectedSourceDeviations'] == deviations, 'Unexpected recorded source deviation')
    require(value['native'] == expected_native, 'Recorded native differs')
    require(value['privateHashMapSha256'] == hashlib.sha256(json.dumps(expected, sort_keys=True).encode()).hexdigest(),
            'Recorded complete private map hash differs')


def phase(control, stage, corpus, identities, expected, deviations, expected_native):
    # Reuse the hash-released controller's completed classification; cross-check
    # its material facts and immutable raw/observer/error references, not rerun it.
    directory = BASE / 'phases' / (control + '--' + stage)
    names = {'inputs-before.json', 'owned-process.json', 'owned-group-after-exit.json', 'command.json',
             'raw.json', 'observer.json', 'stdout-stderr.log', 'inputs-after.json', 'classification.json', 'artifacts.json'}
    require({p.name for p in directory.iterdir()} == names, 'Incomplete/unexpected phase files')
    artifacts = read(directory / 'artifacts.json')
    require(len(artifacts) == len(names) - 1 and {p['path'] for p in artifacts} ==
            {str(directory / n) for n in names - {'artifacts.json'}}, 'Phase artifact membership differs')
    for p in artifacts:
        verify(p)
    command, owned = read(directory / 'command.json'), read(directory / 'owned-process.json')
    raw, obs = read(directory / 'raw.json'), read(directory / 'observer.json')
    recorded = read(directory / 'classification.json')
    require(all(command[k] == v for k, v in owned.items()) and command['pid'] == obs['pid']
            and command['ownedPgid'] == command['sessionLeaderExpected'] == command['pid']
            and command['observedPgidAfterLaunch'] in [None, command['pid']]
            and command['cwd'] == obs['cwd'] == str(COPY), 'Process/observer identity differs')
    require(command['exit'] in [0, 1] and command['durationMs'] >= 0
            and command['borrowedDependencies'] == str(ROOT / 'node_modules'), 'Actual command boundary differs')
    for flag in ['--cache=false', '--maxWorkers=1', '--no-file-parallelism', '--reporter=default', '--reporter=json']:
        require(command['argv'].count(flag) == 1, 'Missing execution flag: ' + flag)
    require(command['argv'][0] == '/opt/homebrew/Cellar/node@22/22.23.3_2/bin/node'
            and command['argv'][1] == str(ROOT / 'node_modules/vitest/vitest.mjs'), 'Executable differs')
    require(command['environmentKeys'] == sorted(['PATH', 'HOME', 'TMPDIR', 'NODE_ENV', 'NO_COLOR',
                                                'GIT_NO_LAZY_FETCH', 'AMC_P021_RUNTIME_OBSERVER_PATH']), 'Environment differs')
    verify(command['node'])
    group = read(directory / 'owned-group-after-exit.json')
    require(group['observations'] and group['lastProbe'] == group['observations'][-1]
            and command['ownedGroupProbes'] == group['observations'] and group['signalsOtherThanZeroSent'] is False
            and group['maxPollingSeconds'] == 5 and group['pollIntervalSeconds'] == 0.05
            and command['groupAbsentByESRCH'] is True and group['lastProbe']['absentByESRCH'] is True
            and group['lastProbe']['errno'] == errno.ESRCH
            and all(p['pgid'] == command['pid'] and p['signal'] == 0 for p in group['observations']), 'Owned group record differs')
    for name in ['inputs-before.json', 'inputs-after.json']:
        check_record(read(directory / name), deviations, expected, expected_native)
    rt, ot, current = {}, {}, None
    for file in raw['testResults']:
        rel = str(Path(file['name']).relative_to(COPY))
        require(rel in corpus and file.get('message', '') == '', 'Raw file/setup diagnostic')
        for case in file['assertionResults']:
            key = (rel, case['fullName'])
            require(key not in rt and case['status'] in ['passed', 'failed'], 'Duplicate/incomplete raw case')
            rt[key] = case
    for task in obs['tasks']:
        require(all(v == 'pass' for v in task['hooks'].values()), 'Hook did not pass')
        if task['kind'] == 'file':
            current = str(Path(task['filepath']).relative_to(COPY))
        if task['kind'] == 'test':
            key = (current, task['fullName'])
            require(key not in ot and task['state'] in ['pass', 'fail'], 'Duplicate/incomplete observer case')
            ot[key] = task
        else:
            require(task['errors'] == [], 'Observer file/suite diagnostic')
    require(set(rt) == set(ot) == identities and obs['testCount'] == raw['numTotalTests'] == recorded['total'] == 37
            and {str(Path(p).relative_to(COPY)) for p in obs['files']} == corpus and obs['unhandledErrors'] == [], 'Case membership differs')
    failures = {(f['file'], f['fullName']): f for f in recorded['failures']}
    require(len(failures) == len(recorded['failures']) == recorded['failed'] == raw['numFailedTests']
            and set(failures) == {k for k, v in rt.items() if v['status'] == 'failed'}, 'Failure classification differs')
    for key in identities:
        r, o = rt[key], ot[key]
        require((r['status'] == 'passed') == (o['state'] == 'pass'), 'Raw/observer state differs')
        if key not in failures:
            require(r['failureMessages'] == [] and o['errors'] == [], 'Passing case has errors')
            continue
        f = failures[key]
        require(f['rawFailureMessages'] == r['failureMessages'] and f['observerErrors'] == o['errors'] and o['errors'], 'Failure body reference differs')
        require(all(e.get('name') == 'AssertionError' and plain(e.get('message', ''))
                    and plain(e['message']) in plain('\n'.join(r['failureMessages']))
                    and 'tests/setup/' not in str(e.get('stack', '')) for e in o['errors']), 'Not a matching body AssertionError')
    require(recorded['passed'] == raw['numPassedTests'] == 37 - len(failures)
            and recorded['pending'] == recorded['todo'] == raw['numPendingTests'] == raw['numTodoTests'] == raw['numPendingTestSuites'] == 0,
            'Actual counters differ or pending cases remain')
    expected_class = 'body-assertion-failures-observed' if failures else ('survivor' if stage == 'mutant' else 'passed')
    require(recorded['classification'] == expected_class and (not failures or stage == 'mutant')
            and command['exit'] == (1 if failures else 0) and raw['success'] is (not bool(failures))
            and obs['reason'] == ('failed' if failures else 'passed')
            and (bool(failures) or raw['numFailedTestSuites'] == 0), 'Recorded verdict/process result differs')
    clean_stream(directory / 'stdout-stderr.log')
    return {'phase': directory.name, 'stage': stage, 'classification': recorded, 'command': command,
            'directory': str(directory), 'raw': pin(directory / 'raw.json'), 'observer': pin(directory / 'observer.json'),
            'combinedStream': pin(directory / 'stdout-stderr.log'), 'artifactManifest': pin(directory / 'artifacts.json')}


LIMITS = [
    'Bounded qualification is complete pending independent actual review; formal acceptance remains open.',
    'Original 37 core, 14 CLI and 48 consumer cases are three separate runs. Causal controls repeat the same 37 cases 18 times; they add no unique original cases.',
    'C4 observes registry policy acceptance of SELF_REPORTED at L3, not actual unsafe L3 behavior or a provenance-gate bypass. Later OBSERVED L2 and audit schema /3 remain unchanged.',
    'C6 is a representative two-site historical size regression, not an exact old-file restoration. The formula changes per-answer interpretation; actual assertions observe invalid raw 6/80 admission and domain 60 versus 50, not a directly measured final 6% aggregate.',
    'Failures retain first assertion frames. Later assertions in the same case can be masked; semantic root attribution and independent actual review remain pending.',
    'Source-mode execution uses an owned physical filesystem copy without .git and borrowed unchanged parent dependencies. No compiler, import rewrite, production edit, or dist mutation was performed.',
    'Only the owned process group was probed with signal zero after exit. Detached descendants, all caches, all dependency bytes and universal healthy teardown are not proven absent.',
    'Core entitlement/SDK transport are mocked; diagnostic ParsedEvidenceEvents are hand-shaped. CLI14 uses local hand-authored run JSON with inherited environment. Canned capabilities are not model, paid SDK, authentication, signed-storage, legal-truth or compliance-authority evidence.',
    'The literal certification wording inventory retains 20 lines, 10 outside explicit permanent R4 files. The unchanged strict no-fabrication guard passes with zero pending entries; that does not close literal acceptance reconciliation.',
    'Required source quality remains unwaived: 1269 duplicate findings and 2751 dead-code findings. Prior exact-code type/lint/clean-source validations retain their original source and command attribution; they are not fresh P021 runs.',
    'User-skipped P029, P022 two empty arrays, P023 held API/Studio failures, P051 issuer/formal failures, P024 strict ISO/expert gaps, P019 runner proposal, P020 shared-CLI proposal, and P030 held runner/full batch/installed-pack gaps remain unresolved as previously recorded.',
    'Claude work, shared CLI/API/Studio/A4, paused P2-02, reservations and pending transfers remain preserved. No ownership clearance follows from these results.',
    'Full suite, coverage, Node24, hosted CI, PR/merge, release, G0 and Done are not established. P045 is read-only next-lane preparation, not runtime evidence.'
]


def main():
    require(all(not p.exists() for p in OUTPUTS), 'Write-once output already exists; do not overwrite or resume automatically')
    require(not (BASE / 'ACTIVE').exists() and not (BASE / 'HALTED.json').exists(), 'Active/halted state forbids freezing')
    setup = read(BASE / 'setup-v3.json')
    setup_index = read(BASE / 'setup-index-v3.json')
    proposal = read(BASE / 'proposal.json')
    preservation = read(BASE / 'inputs/preservation.json')
    source = read(BASE / 'inputs/source-manifest.json')
    compiled = read(BASE / 'inputs/compiled-manifest.json')
    require(len(source) == 7945 and len(compiled) == 4529 and not set(source) & set(compiled), 'Manifest cardinality/overlap differs')
    require(len(setup['frozenOwnInputs']) == 23 and setup_index['artifactCount'] == len(setup_index['artifacts']) == 24,
            'Frozen setup inventory differs')
    for p in setup['frozenOwnInputs'] + setup_index['artifacts'] + preservation['immutableInputs']:
        verify(p)
    preflight = read(PARENT / 'initial-preflight.json')
    require(len(preflight['planPins']) == 5, 'Plan authority inventory differs')
    for p in preflight['planPins'] + [preflight['reservation']]:
        verify(p)
    recipes = proposal['recipes']
    controls = [r['id'] for r in recipes]
    require(len(controls) == len(set(controls)) == 6 and controls == setup['controlIds'], 'Six-control inventory differs')
    require({p.name for p in BASE.glob('result--*.json')} == {'result--' + c + '.json' for c in controls}, 'Missing/extra result')
    require({p.name for p in BASE.glob('started--*.json')} == {'started--' + c + '.json' for c in controls}, 'Missing/extra start')
    require({p.name for p in (BASE / 'phases').iterdir()} == {c + '--' + s for c in controls for s in ['baseline', 'mutant', 'restored']},
            'Incomplete/extra phase directories')
    require(not list((BASE / 'phases').rglob('timeout.json')), 'Timeout retained: qualification cannot freeze complete')
    journal_bytes = JOURNAL.read_bytes()
    commands = [json.loads(line) for line in journal_bytes.decode().splitlines()]
    require(len(commands) == 15 and len({c['phase'] for c in commands}) == 15, 'Root journal must contain 15 distinct actual phases')
    require(commands[-1]['phase'] == 'final-normal-freeze' and all(c['exit'] == 0 and c['head'] == SOURCE for c in commands),
            'Final normal freeze missing or actual root command failed/source differs')
    require(all(c['cwd'] == str(ROOT) and str(c['major']) == '22' and c['durationMs'] >= 0 for c in commands), 'Root command boundary differs')
    command_logs = [pin(c['log']) for c in commands]
    original = read(PARENT / 'original-corpora-summary.json')
    require(original['source'] == SOURCE and original['distinctOriginalRegistrationsAcross11Files'] == 99
            and [r['registered'] for r in original['separateOriginalRuns']] == [37, 14, 48], 'Original corpus summary differs')
    for run in original['separateOriginalRuns']:
        require(run['passed'] == run['registered'] and run['failed'] == run['pending'] == run['todo'] == 0, 'Original run incomplete')
        for name in ['raw', 'observer', 'combinedStream']:
            verify(run[name])
        clean_stream(run['combinedStream']['path'])
    corpus = set(proposal['corpus'])
    ids = read(BASE / 'inputs/case-identities.json')
    identities = {(p['file'], p['fullName']) for p in ids}
    require(len(corpus) == 6 and len(ids) == len(identities) == 37, 'Original causal corpus differs')
    expected_native = preservation['borrowedNative']
    require(native(expected_native['path']) == expected_native, 'Borrowed native identity changed')
    matrices, phases = [], []
    for recipe in recipes:
        control = recipe['id']
        started = read(BASE / ('started--' + control + '.json'))
        verify(started['release'])
        release = read(started['release']['path'])
        require(release['authorization'] == 'START_P021_CAUSAL_' + control, 'Root release token differs')
        require(all(release[k] == v for k, v in started['binding'].items()), 'Release/start binding differs')
        binding_paths = {'setupSha256': BASE / 'setup-v3.json', 'setupIndexSha256': BASE / 'setup-index-v3.json',
                         'controllerSha256': BASE / 'driver/controller-v3.py', 'proposalSha256': BASE / 'proposal.json',
                         'sourceManifestSha256': BASE / 'inputs/source-manifest.json', 'compiledManifestSha256': BASE / 'inputs/compiled-manifest.json',
                         'preservationSha256': BASE / 'inputs/preservation.json', 'observerSha256': BASE / 'driver/observer-reporter.mjs'}
        require(all(release[k] == digest(p) for k, p in binding_paths.items()), 'Executed release input hash differs')
        require(release['control'] == control and release['parentRoot'] == str(ROOT) and release['closureRoot'] == str(COPY)
                and release['controllerPath'] == str(BASE / 'driver/controller-v3.py')
                and release['setupPath'] == str(BASE / 'setup-v3.json')
                and release['setupIndexPath'] == str(BASE / 'setup-index-v3.json'), 'Executed controller/version path differs')
        check_record(read(BASE / ('before--' + control + '.json')), [], source | compiled, expected_native)
        matrix = []
        for stage in ['baseline', 'mutant', 'restored']:
            deviations = [recipe['file']] if stage == 'mutant' else []
            expected = source | compiled
            if deviations:
                expected[recipe['file']] = recipe['proposedMutantSha256']
            matrix.append(phase(control, stage, corpus, identities, expected, deviations, expected_native))
        result = read(BASE / ('result--' + control + '.json'))
        require(result['control'] == control and result['restoredExactly'] is True, 'Control not complete/restored')
        for stage, p in zip(['baseline', 'mutant', 'restored'], matrix):
            require(result[stage] == p['classification'], 'Result/phase classification differs')
        require(result['verdict'] == ('survivor' if matrix[1]['classification']['failed'] == 0 else
                                     'body-assertion-sensitivity-awaiting-root-attribution'), 'Control verdict differs')
        check_record(result['finalPreservation'], [], source | compiled, expected_native)
        matrices.append({'control': control, 'recipe': recipe, 'result': pin(BASE / ('result--' + control + '.json')),
                         'release': started['release'], 'verdict': result['verdict'], 'phases': matrix})
        phases.extend(matrix)
    # Final complete parent/copy check is deliberately performed after all runtime has ended.
    git_env = os.environ.copy() | {'GIT_NO_LAZY_FETCH': '1'}
    head = subprocess.run(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], env=git_env, check=True, capture_output=True, text=True).stdout.strip()
    tracked = subprocess.run(['git', '-C', str(ROOT), 'ls-files', '-z'], env=git_env, check=True, capture_output=True).stdout.decode().split('\0')[:-1]
    require(head == SOURCE and len(tracked) == 7945 and set(tracked) == set(source), 'Current parent HEAD/tracked inventory differs')
    require(not (COPY / '.git').exists(), 'Filesystem copy acquired Git metadata')
    expected = source | compiled
    require(all((ROOT / rel).is_file() and digest(ROOT / rel) == value for rel, value in expected.items()), 'Final parent source/dist bytes changed')
    require({str(p.relative_to(ROOT)) for p in (ROOT / 'dist').rglob('*') if p.is_file()} == set(compiled), 'Parent dist membership changed')
    require(copy_map() == expected, 'Final complete private source/dist bytes differ')
    physical = read(BASE / 'inputs/physical-copy-manifest.json')
    require(len(physical) == 12474 and {p['relativePath'] for p in physical} == set(expected), 'Physical manifest membership differs')
    for p in physical:
        parent, child = (ROOT / p['relativePath']).stat(), (COPY / p['relativePath']).stat()
        require((parent.st_dev, parent.st_ino) == (p['parentDevice'], p['parentInode'])
                and (child.st_dev, child.st_ino) == (p['privateDevice'], p['privateInode'])
                and child.st_nlink == p['privateNlink'] == 1
                and (parent.st_dev, parent.st_ino) != (child.st_dev, child.st_ino), 'Physical identity changed')
    link = preservation['nodeModulesLink']
    require((COPY / 'node_modules').is_symlink() and os.readlink(COPY / 'node_modules') == link['target']
            and str((COPY / 'node_modules').resolve()) == link['resolved'], 'Borrowed resolver changed')
    require(native(expected_native['path']) == expected_native, 'Final native changed')
    for p in setup['frozenOwnInputs'] + setup_index['artifacts'] + preservation['immutableInputs'] + preflight['planPins'] + [preflight['reservation']]:
        verify(p)
    require(JOURNAL.read_bytes() == journal_bytes, 'Live root journal changed during freezing checks')
    final_preservation = {'capturedUtc': now(), 'source': SOURCE, 'codeSource': CODE, 'parentTrackedChecked': 7945,
        'parentCompiledChecked': 4529, 'privateFilesChecked': 12474, 'allBytesExact': True,
        'physicalManifest': pin(BASE / 'inputs/physical-copy-manifest.json'), 'physicalIdentityExact': True,
        'nodeModulesLink': link, 'borrowedNative': expected_native, 'frozenOwnInputsChecked': 23, 'setupIndexPinsChecked': 24,
        'planPins': preflight['planPins'], 'reservation': preflight['reservation'], 'inboxBoundary': preservation['inboxBoundary'],
        'boundary': 'Current full copy and parent bytes/recorded physical identities verified after all 18 phases. Borrowed dependency helpers and native only; no entire-dependency/cache or universal descendant-absence claim.'}
    # Runtime and preservation prerequisites are checked before writing. Later write-once metadata checks can still stop; no overwrite, rollback or retry is implicit.
    with FROZEN_JOURNAL.open('xb') as out:
        out.write(journal_bytes)
    new_json(PRESERVATION_OUT, final_preservation)
    selected = set()
    for directory in [BASE, PARENT]:
        for parent, directories, files in os.walk(directory, followlinks=False):
            if Path(parent) == BASE:
                directories[:] = [n for n in directories if n not in ['closure', 'home', 'tmp']]
            elif Path(parent) == PARENT:
                directories[:] = [n for n in directories if n not in ['home', 'store']]
            for name in files:
                p = Path(parent) / name
                if p not in OUTPUTS and p != JOURNAL and not p.is_symlink():
                    selected.add(p)
    selected.update([FROZEN_JOURNAL, PRESERVATION_OUT])
    for pattern in ['p0-21-*review*-20261015.*', 'p0-21-*readiness*-20261015.*',
                    'p0-21-causal-readonly-plan*-20261015.*', 'p0-21-canonical-outline-20261015.*',
                    'p0-21-causal-root-sealed-input-verification-20261015.json', 'p0-45-readonly-readiness-20261015.*']:
        selected.update(Path('/private/tmp').glob(pattern))
    selected.update(Path(p['path']) for p in command_logs)
    selected.update(Path(p['path']) for p in preservation['immutableInputs'])
    selected.update(Path(p['path']) for p in preflight['planPins'] + [preflight['reservation']])
    for run in original['separateOriginalRuns']:
        selected.update(Path(run[n]['path']) for n in ['raw', 'observer', 'combinedStream'])
    context = read(PARENT / 'exact-source-validation-context.json')
    selected.add(Path(context['priorValidationContext']['path']))
    selected.update(Path(p['path']) for p in context['sourceValidationLogPins'])
    for p in [context['priorValidationContext'], *context['sourceValidationLogPins']]:
        verify(p)
    # Index references do not copy native binaries, executable helper bodies, stores, homes or keys.
    selected.add(Path(expected_native['path']))
    selected.difference_update(OUTPUTS)
    selected.update([FROZEN_JOURNAL, PRESERVATION_OUT])
    excluded_roots = [COPY, BASE / 'home', BASE / 'tmp', PARENT / 'home', PARENT / 'store']
    require(not any(p == JOURNAL or any(p == root or root in p.parents for root in excluded_roots) for p in selected),
            'Excluded closure/home/store/tmp/live journal selected')
    index = {'schemaVersion': 1, 'capturedUtc': now(), 'key': 'P0-21', 'source': SOURCE, 'codeSource': CODE,
        'artifactCount': len(selected), 'artifacts': [pin(p) for p in sorted(selected)],
        'excluded': ['causal BASE/closure', 'causal BASE/home', 'causal BASE/tmp', 'PARENT/home', 'PARENT/store',
                     'live root journal', 'this index', 'new causal and whole-lane summaries'],
        'privateOnlyLargeManifest': pin(BASE / 'inputs/physical-copy-manifest.json'),
        'boundary': 'Hash references only. No indexed native/helper/source body is copied by this freezer; the 3.9 MB physical manifest remains private. Prior immutable indices retain historical pre-append inbox pins; current boundary is pinned independently.'}
    new_json(INDEX_OUT, index)
    totals = {k: sum(p['classification'][k] for p in phases) for k in ['total', 'passed', 'failed', 'pending', 'todo']}
    require(totals['total'] == 18 * 37 and totals['pending'] == totals['todo'] == 0, 'Derived execution totals differ')
    failures = [f for p in phases for f in p['classification']['failures']]
    causal = {'schemaVersion': 1, 'key': 'P0-21', 'source': SOURCE, 'codeSource': CODE, 'capturedUtc': now(),
        'state': 'complete-pending-independent-review', 'formalAcceptanceClosed': False, 'runtimeArtifactIndex': pin(INDEX_OUT),
        'finalSourcePreservation': pin(PRESERVATION_OUT), 'controller': pin(BASE / 'driver/controller-v3.py'),
        'freezer': pin(Path(__file__).resolve()), 'controls': matrices, 'causalCommandRecords': [p['command'] for p in phases],
        'executionCounts': totals, 'distinctRepeatedCorpusRegistrations': 37,
        'distinctFailedFileTitlePairs': len({(f['file'], f['fullName']) for f in failures}),
        'mutantPassedCounts': [m['phases'][1]['classification']['passed'] for m in matrices],
        'versionHistory': {'v1': 'Blocked static preparation; unexecuted.', 'v2': 'Superseded static preparation; unexecuted.',
                           'v3': 'Hash-released actual execution, six controls and 18 completed phase processes.'},
        'failuresAndMasking': failures, 'manualRootAttribution': 'Pending independent actual review; retained errors are not automatic unsafe-level or full-flow proof.',
        'limits': LIMITS}
    new_json(CAUSAL_JSON, causal)
    causal_md = '# P0-21 private causal qualification\n\n'
    causal_md += f'Source `{SOURCE}` preserves production code `{CODE}`. Six controls completed 18 source-mode phases with {totals["total"]} repeated case executions: {totals["passed"]} passed and {totals["failed"]} body assertion failures; none were pending or todo. The repeated corpus has 37 registrations.\n\n'
    causal_md += '| Control | Baseline passed | Mutant passed / failed | Restored passed | Verdict |\n| --- | ---: | ---: | ---: | --- |\n'
    for m in matrices:
        b, mut, r = [p['classification'] for p in m['phases']]
        causal_md += f'| {m["control"]} | {b["passed"]} | {mut["passed"]} / {mut["failed"]} | {r["passed"]} | {m["verdict"]} |\n'
    causal_md += '\n' + '\n\n'.join(LIMITS) + '\n'
    new_text(CAUSAL_MD, causal_md)
    wording = read(PARENT / 'certification-wording-acceptance-gap.json')
    require(wording['counts'] == {'literalLines': 20, 'inExplicitPermanentR4Files': 10, 'outsideThoseFiles': 10}
            and wording['ordinaryGuard']['strictActualOutput']['ok'] is True
            and wording['ordinaryGuard']['strictActualOutput']['pending'] == 0
            and wording['formalLiteralAcceptanceEstablished'] is False, 'Wording acceptance boundary changed')
    lane = {'schemaVersion': 1, 'key': 'P0-21', 'source': SOURCE, 'codeSource': CODE, 'capturedUtc': now(),
        'state': 'complete-pending-independent-review', 'formalAcceptanceClosed': False, 'originalCorpora': original,
        'originalCorporaSummary': pin(PARENT / 'original-corpora-summary.json'),
        'causalSummary': pin(CAUSAL_JSON), 'causalMarkdown': pin(CAUSAL_MD), 'runtimeArtifactIndex': pin(INDEX_OUT),
        'finalSourcePreservation': pin(PRESERVATION_OUT), 'commandsFrozen': pin(FROZEN_JOURNAL),
        'rootCommandCount': len(commands), 'rootCommands': commands, 'rootCommandLogPins': command_logs,
        'separateCausalCommandCount': len(phases), 'causalExecutionCounts': totals,
        'countingRule': '15 root command records and 18 separate causal command records are not one 33-test invocation. Original three runs contain 99 registrations across 11 files; the same core 37 are repeated in causal phases.',
        'wordingAcceptanceGap': pin(PARENT / 'certification-wording-acceptance-gap.json'),
        'exactSourceValidationContext': pin(PARENT / 'exact-source-validation-context.json'),
        'unwaivedSourceQuality': context['unwaivedSourceQuality'], 'limits': LIMITS,
        'nextReadOnlyCandidate': {'key': 'P0-45', 'readiness': pin('/private/tmp/p0-45-readonly-readiness-20261015.json'), 'runtimePerformed': False}}
    new_json(LANE_JSON, lane)
    text = '# P0-21 bounded qualification\n\n'
    text += f'The unchanged source `{SOURCE}` qualified three separate original corpora: 37 core, 14 CLI and 48 consumer registrations, all passing. Production code remains `{CODE}`. Six private source controls completed baseline, mutant and restored phases against the same 37-case corpus.\n\n'
    text += f'The causal phases registered {totals["total"]} repeated executions, with {totals["passed"]} passes and {totals["failed"]} body assertion failures across {causal["distinctFailedFileTitlePairs"]} distinct file/title pairs. All baseline and restored phases passed. The 15 actual root command records and 18 causal process records remain separate.\n\n'
    text += '\n\n'.join(LIMITS) + '\n'
    new_text(LANE_MD, text)
    # Text outputs contain metadata/errors only; never persist a private-key body.
    markers = [b'-----BEGIN ' + name + b'PRIVATE ' + b'KEY-----' for name in [b'', b'RSA ', b'EC ', b'OPENSSH ', b'ENCRYPTED ']]
    for path in OUTPUTS:
        require(not any(m in path.read_bytes() for m in markers), 'Unexpected private-key body marker in new metadata')
    require(JOURNAL.read_bytes() == journal_bytes and not (BASE / 'ACTIVE').exists()
            and not (BASE / 'HALTED.json').exists(), 'Final journal/state changed')
    print(json.dumps({'state': lane['state'], 'causal': pin(CAUSAL_JSON), 'wholeLane': pin(LANE_JSON),
                      'artifactIndex': pin(INDEX_OUT), 'rootCommands': len(commands), 'causalCommands': len(phases),
                      'executionCounts': totals}), flush=True)


if __name__ == '__main__':
    main()
