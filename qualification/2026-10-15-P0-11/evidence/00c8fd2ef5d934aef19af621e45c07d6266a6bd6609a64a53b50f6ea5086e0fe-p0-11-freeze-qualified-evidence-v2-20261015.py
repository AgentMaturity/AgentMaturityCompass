"""Unexecuted freezer: validate completed P0-11 evidence, then create new private summaries.

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

ROOT = Path('/Users/sid/.codex/worktrees/p0-11-qualification/AgentMaturityCompass')
PARENT = Path('/private/tmp/p0-11-qualification-20261015')
BASE = Path('/private/tmp/p0-11-causal-qualification-20261015')
COPY = BASE / 'closure'
SOURCE = 'fa3c3e5554f8a4013fb50cc373a4b5d644e6924e'
CODE = '58e91dcef111bf02f773dcbfd1921d428cf75e34'
JOURNAL = Path('/private/tmp/p0-11-commands-20261015.jsonl')
FROZEN_JOURNAL = PARENT / 'commands-frozen.jsonl'
PRESERVATION_OUT = PARENT / 'final-source-preservation.json'
INDEX_OUT = BASE / 'runtime-artifact-index.json'
CAUSAL_JSON = Path('/private/tmp/p0-11-causal-qualification-20261015.json')
CAUSAL_MD = CAUSAL_JSON.with_suffix('.md')
LANE_JSON = Path('/private/tmp/p0-11-bounded-qualification-20261015.json')
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
    require(value['parentTrackedChecked'] == 8362 and value['parentCompiledChecked'] == 4529
            and value['privateFilesChecked'] == 12891, 'Preservation cardinality differs')
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
    require(set(rt) == set(ot) == identities and obs['testCount'] == raw['numTotalTests'] == recorded['total'] == 7
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
        messages = plain('\n'.join(r['failureMessages']))
        require(all(plain(e.get('message', '')) and plain(e['message']) in messages
                    and 'tests/setup/' not in str(e.get('stack', '')) for e in o['errors']), 'Body message/setup mismatch')
        if all(e.get('name') == 'AssertionError' for e in o['errors']):
            require(f['failureKind'] == 'body-assertion', 'Assertion classification differs')
        else:
            require(control == C2_ID and stage == 'mutant' and key[0] == 'tests/toolEvidenceRecording.test.ts'
                    and r.get('title') == C2_TITLE and f['failureKind'] == 'exact-genuine-recorder-error-propagation',
                    'Unexpected non-AssertionError outside exact C2 body')
            for error in o['errors']:
                require(error.get('name') == 'Error' and error.get('message') == C2_MESSAGE, 'Wrong C2 Error')
                stack = '\n'.join(str(error.get(field, '')) for field in ['stack', 'stackStr']).replace('\\', '/')
                require('tests/setup/' not in stack, 'C2 hook/setup frame')
                for frame in ['tests/toolEvidenceRecording.test.ts:202:', 'tests/toolEvidenceRecording.test.ts:206:',
                              'src/tools/toolPipeline.ts:306:']:
                    require(frame in stack and frame in messages.replace('\\', '/'), 'Missing C2 original body frame')
    require(recorded['passed'] == raw['numPassedTests'] == 7 - len(failures)
            and recorded['pending'] == recorded['todo'] == raw['numPendingTests'] == raw['numTodoTests'] == raw['numPendingTestSuites'] == 0,
            'Actual counters differ or pending cases remain')
    expected_class = ('body-failures-observed' if any(f['failureKind'] != 'body-assertion' for f in failures.values())
                      else 'body-assertion-failures-observed') if failures else ('survivor' if stage == 'mutant' else 'passed')
    require(recorded['classification'] == expected_class and (not failures or stage == 'mutant')
            and command['exit'] == (1 if failures else 0) and raw['success'] is (not bool(failures))
            and obs['reason'] == ('failed' if failures else 'passed')
            and (bool(failures) or raw['numFailedTestSuites'] == 0), 'Recorded verdict/process result differs')
    clean_stream(directory / 'stdout-stderr.log')
    return {'phase': directory.name, 'stage': stage, 'classification': recorded, 'command': command,
            'directory': str(directory), 'raw': pin(directory / 'raw.json'), 'observer': pin(directory / 'observer.json'),
            'combinedStream': pin(directory / 'stdout-stderr.log'), 'artifactManifest': pin(directory / 'artifacts.json')}


# Prepared only. Root must create a NEW reviewed bound version; no output can be frozen as authored.
FINAL_BINDINGS = {'priorReviews': [{'role': 'original', 'pin': {'path': '/private/tmp/p0-11-original-corpora-independent-review-20261015.json', 'bytes': 23426, 'sha256': 'ad9128b687def99c672387e0c33ab1926a53082bb0b5087fa8a28905cb1d537a'}, 'blockingField': 'blockingFindings', 'requiredFields': {'allReadsFinished': True, 'formalAcceptanceClosed': False}, 'companionPins': [{'path': '/private/tmp/p0-11-original-corpora-independent-review-20261015.md', 'bytes': 3460, 'sha256': '1b42150ef1a54466cd24f81c739e506d103219e056c8bd00b4e09c0766cc95df'}]}, {'role': 'recipe', 'pin': {'path': '/private/tmp/p0-11-recipes-static-review-20261015.json', 'bytes': 21585, 'sha256': 'b7619c6e45d47c4782a6cd7be7607f4debc8a8180c649aa16e99a8b7a9b7b278'}, 'blockingField': 'blockingFindings', 'requiredFields': {'allReadsFinished': True, 'formalAcceptanceClosed': False}, 'companionPins': [{'path': '/private/tmp/p0-11-recipes-static-review-20261015.md', 'bytes': 5159, 'sha256': '8d86900942fd1dc460012bc27b75aab1d2d57633ea6aa39d90ef32ce5b40aee0'}]}, {'role': 'code', 'pin': {'path': '/private/tmp/p0-11-controller-code-static-review-20261015.json', 'bytes': 5353, 'sha256': '94899d5f0c2c54ba5625432c1a24942102f447a946f34e0a30b7e940d2323aba'}, 'blockingField': 'blockingFindings', 'requiredFields': {'allReadsFinished': True, 'formalAcceptanceClosed': False}, 'companionPins': [{'path': '/private/tmp/p0-11-controller-code-static-review-20261015.md', 'bytes': 4118, 'sha256': '7c337761b5d9dae852ec2f75e42959f350e624778b8878162dfe3e48578b7413'}]}, {'role': 'sealed', 'pin': {'path': '/private/tmp/p0-11-controller-sealed-setup-review-20261015.json', 'bytes': 15390, 'sha256': '17782c03541ccfe9be068809b2b25a1a4ffbba2d4bc0dde0b76354848b5ab76c'}, 'blockingField': 'blockingFindings', 'requiredFields': {'allReadsFinished': True, 'formalAcceptanceClosed': False}, 'companionPins': [{'path': '/private/tmp/p0-11-controller-sealed-setup-review-20261015.md', 'bytes': 3178, 'sha256': '5c7976bf076d45f9bf08adec369b8ca768252a1e7f115471ce813812987bf370'}]}], 'preflight': {'path': '/private/tmp/p0-11-qualification-20261015/initial-preflight.json', 'bytes': 26306, 'sha256': '23f1964928e523777c6f61b1a733011318427abfcf2ad9b25c3703e20590cbba'}, 'staticAcceptance': {'path': '/private/tmp/p0-11-qualification-20261015/acceptance-static-and-checker-inventory.json', 'bytes': 3818, 'sha256': 'b80a39f7212d1bb2de2afa5e8eb159ad858a56f22837f55cd5589bb9e6b63dea'}, 'sourceContext': {'path': '/private/tmp/p0-11-qualification-20261015/exact-source-validation-context.json', 'bytes': 3444, 'sha256': '8da5cb92cd12460dfc38c7572b1d6f2b74eb078f0032f6c38c28f533b2b82ffe'}, 'rootSealedInputProof': {'path': '/private/tmp/p0-11-causal-root-sealed-input-verification-20261015.json', 'bytes': 2515, 'sha256': 'f0e93980ecf307cc50ac8fa74b85d8d8b87839fcfaa3fe7b0d31ff50e2d2fce0'}, 'latePreparationHistory': [{'role': 'release-helper-v1', 'pin': {'path': '/private/tmp/p0-11-author-causal-release-20261015.py', 'bytes': 5152, 'sha256': '23eebeb4e9decca89cc5b6452ab2144a7d69d71b0374338cf4fbac4186c70475'}}, {'role': 'release-helper-v2', 'pin': {'path': '/private/tmp/p0-11-author-causal-release-v2-20261015.py', 'bytes': 5153, 'sha256': 'fbd1c829fd98444d69f913d45ecddd65e31581395c344ef7e661398ca13b817c'}}, {'role': 'release-helper-count-issue', 'pin': {'path': '/private/tmp/p0-11-release-helper-count-issue-20261015.json', 'bytes': 975, 'sha256': '134ae70f43e5c702c71461e0e8541824f39905589c603989e5269f2549433eed'}}, {'role': 'root-causal-attribution', 'pin': {'path': '/private/tmp/p0-11-root-causal-attribution-20261015.json', 'bytes': 4543, 'sha256': '275a99bc5f718abdfedd3d3688d99fc8645e4e0b47c2e859b5036f89b9e2a564'}}], 'journalContract': [{'role': 'install', 'phase': 'install', 'argv': ['pnpm', 'install', '--frozen-lockfile', '--store-dir', '/private/tmp/p0-11-qualification-20261015/store'], 'expectedExit': 0}, {'role': 'build', 'phase': 'build', 'argv': ['pnpm', 'run', 'build'], 'expectedExit': 0}, {'role': 'fingerprint', 'phase': 'runtime-fingerprint', 'argv': ['/opt/homebrew/opt/node@22/bin/node', '/private/tmp/p0-11-qualification-20261015/runtime-fingerprint.cjs'], 'expectedExit': 0}, {'role': 'initial-freeze', 'phase': 'normal-freeze', 'argv': ['pnpm', 'run', 'check:freeze'], 'expectedExit': 0}, {'role': 'original-map', 'phase': 'original-map', 'argv': ['/opt/homebrew/opt/node@22/bin/node', 'node_modules/vitest/vitest.mjs', 'run', 'tests/threatModelMap.test.ts', '--reporter=json', '--reporter=/private/tmp/p0-21-qualification-20261015/observer-reporter.mjs', '--outputFile=/private/tmp/p0-11-qualification-20261015/command-original-map/raw-producer.json'], 'expectedExit': 0}, {'role': 'original-telemetry', 'phase': 'original-telemetry', 'argv': ['/opt/homebrew/opt/node@22/bin/node', 'node_modules/vitest/vitest.mjs', 'run', 'tests/telemetryExporterFailure.test.ts', '--reporter=json', '--reporter=/private/tmp/p0-21-qualification-20261015/observer-reporter.mjs', '--outputFile=/private/tmp/p0-11-qualification-20261015/command-original-telemetry/raw-producer.json'], 'expectedExit': 0}, {'role': 'original-preview', 'phase': 'original-preview', 'argv': ['/opt/homebrew/opt/node@22/bin/node', 'node_modules/vitest/vitest.mjs', 'run', 'tests/observabilityOtelExporter.test.ts', '--reporter=json', '--reporter=/private/tmp/p0-21-qualification-20261015/observer-reporter.mjs', '--outputFile=/private/tmp/p0-11-qualification-20261015/command-original-preview/raw-producer.json'], 'expectedExit': 0}, {'role': 'original-recording', 'phase': 'original-recording', 'argv': ['/opt/homebrew/opt/node@22/bin/node', 'node_modules/vitest/vitest.mjs', 'run', 'tests/toolEvidenceRecording.test.ts', '--reporter=json', '--reporter=/private/tmp/p0-21-qualification-20261015/observer-reporter.mjs', '--outputFile=/private/tmp/p0-11-qualification-20261015/command-original-recording/raw-producer.json'], 'expectedExit': 0}, {'role': 'threat-model', 'phase': 'threat-model', 'argv': ['pnpm', 'run', 'check:threat-model'], 'expectedExit': 0}, {'role': 'fixture-valid', 'phase': 'checker-valid', 'argv': ['/opt/homebrew/opt/node@22/bin/node', 'scripts/check-threat-model.mjs', 'tests/fixtures/threat-model/valid.json'], 'expectedExit': 0}, {'role': 'fixture-missing-path', 'phase': 'checker-missing-path', 'argv': ['/opt/homebrew/opt/node@22/bin/node', 'scripts/check-threat-model.mjs', 'tests/fixtures/threat-model/missing-path.json'], 'expectedExit': 1}, {'role': 'fixture-missing-symbol', 'phase': 'checker-missing-symbol', 'argv': ['/opt/homebrew/opt/node@22/bin/node', 'scripts/check-threat-model.mjs', 'tests/fixtures/threat-model/missing-symbol.json'], 'expectedExit': 1}, {'role': 'fixture-bad-owner', 'phase': 'checker-bad-owner', 'argv': ['/opt/homebrew/opt/node@22/bin/node', 'scripts/check-threat-model.mjs', 'tests/fixtures/threat-model/bad-owner.json'], 'expectedExit': 1}, {'role': 'fixture-orphan-failure-row', 'phase': 'checker-orphan-failure', 'argv': ['/opt/homebrew/opt/node@22/bin/node', 'scripts/check-threat-model.mjs', 'tests/fixtures/threat-model/orphan-failure-row.json'], 'expectedExit': 1}, {'role': 'no-fabrication', 'phase': 'no-fabrication', 'argv': ['pnpm', 'run', 'check:no-fabrication'], 'expectedExit': 0}, {'role': 'architecture', 'phase': 'architecture', 'argv': ['pnpm', 'run', 'check:architecture-boundaries'], 'expectedExit': 0}, {'role': 'docs', 'phase': 'docs', 'argv': ['pnpm', 'run', 'check:docs-drift'], 'expectedExit': 0}, {'role': 'counts', 'phase': 'counts', 'argv': ['pnpm', 'run', 'check:counts'], 'expectedExit': 0}, {'role': 'pre-causal-freeze', 'phase': 'pre-causal-normal-freeze', 'argv': ['pnpm', 'run', 'check:freeze'], 'expectedExit': 0}, {'role': 'final-freeze', 'phase': 'final-normal-freeze', 'argv': ['pnpm', 'run', 'check:freeze'], 'expectedExit': 0}], 'referencePins': [{'path': '/private/tmp/p0-11-freeze-qualified-evidence-prepared-20261015.py', 'bytes': 44252, 'sha256': '3c87f034df3b79a10adce0a4f2f767d471c00dad2f86eef49ec8e87ea3f9236a'}, {'path': '/private/tmp/p0-11-freezer-preparation-20261015.json', 'bytes': 6918, 'sha256': '8afd693029f98f164593fce818dfb32d6fa32a2f029bc00506898e560cafb5de'}, {'path': '/private/tmp/p0-11-root-runtime-attribution-20261015.json', 'bytes': 920, 'sha256': '9a2c12d209e85a4d5f1a72997cce3fd2fb21a745653797be3156daf5c4da6f32'}, {'path': '/private/tmp/p0-11-run-final-command-20261015.py', 'bytes': 1148, 'sha256': 'bd36de3d82cb46994f05df616e9e93db44d06d3b30fc78693f4586314f9e64f9'}]}
CONTROLLER_SHA = '5c1981f23721d88c490c80f2e6c1f2324898f3f7acee719c8ece8c8c1f90e878'
PLAN = Path('/private/tmp/p0-11-causal-readonly-plan-20261015.json')
PLAN_SHA = '154463c7ef958626a2fc7c2426343abd5184fddf8b754c9088ff07abbbd2e1b3'
ORIGINAL_SHA = '820707b3b52608f9659db54f06da636dd5a8b52123d489ff6a166a10a13d20e9'
C1_ID = 'C1-map-missing-path-fail-open'
C2_ID = 'C2-tool-recorder-error-propagates'
L1_ID = 'L1-optional-historical-literal-whole-branch-removal'
CONTROL_CORPUS = {C1_ID: 'map', C2_ID: 'recording', L1_ID: 'map'}
CORPORA = {'map': ['tests/threatModelMap.test.ts'], 'recording': ['tests/toolEvidenceRecording.test.ts']}
C2_TITLE = "returns the tool's real outcome when the recorder throws"
C2_MESSAGE = 'the evidence store is unreachable'
ROOT_ROLES = ['install', 'build', 'fingerprint', 'initial-freeze', 'original-map', 'original-telemetry',
              'original-preview', 'original-recording', 'threat-model', 'fixture-valid', 'fixture-missing-path',
              'fixture-missing-symbol', 'fixture-bad-owner', 'fixture-orphan-failure-row',
              'no-fabrication', 'architecture', 'docs', 'counts', 'pre-causal-freeze', 'final-freeze']
FIXTURES = {
 'fixture-valid': ('valid.json', ['check-threat-model: ok']),
 'fixture-missing-path': ('missing-path.json', ['channel network-egress', 'src/tools/noSuchFile.ts does not exist']),
 'fixture-missing-symbol': ('missing-symbol.json', ['channel network-egress', 'hostAllowedX does not occur in src/gateway/server.ts']),
 'fixture-bad-owner': ('bad-owner.json', ['channel network-egress', 'P9-99']),
 'fixture-orphan-failure-row': ('orphan-failure-row.json', ['failure recorder-fails-after-effect', 'names no test and no owner'])
}
LIMITS = [
 'Formal acceptance is false; bounded evidence awaits independent actual review after freezing.',
 'Original map 7 / telemetry 2 / preview 5 / recording 7 are four separate runs, 21 distinct registrations across 4 files. Primary 9 aggregates two runs, not one 9-case process. Nine causal phases repeat 14 distinct existing registrations: 63 executions, no new tests.',
 'C1 semantic missing-path error removal retains continue. Status assertion 29 can mask diagnostic assertions 30-31. C1 is not historical literal L1.',
 'L1 whole-branch removal can still refuse through ENOENT while changed text fails an output assertion. No invalid-map admission or historical pass-after-removal acceptance follows from nonzero/diagnostic sensitivity.',
 'C2 rethrows the SAME original callback Error, possibly rejecting at await 206 before assertions 210-213. Preserve callback202/body-await 206/record306 frames, not inserted throwline. This is not a genuine durable-store outage, policy denial or journaled-effect reconciliation.',
 'Actual AssertionErrors, exact C2 Error and survivors are derived from finished records. Generic setup/native/timeout/hook/late/pending/process uncertainty is never a kill; masked later assertions remain unobserved.',
 'Map tests invoke actual Node MJS checker, not built amc. Text/schema/path checks are not sixteen-channel enforcement. Original checker children inherit environment, have no explicit timeout and no separately retained child PID/streams.',
 'Telemetry has genuine workspace/vault/governed fs.read/SQLite plus throwing-exporter/canned-fetch seams. Ordinary fixture batch transaction completes before queue; nested callers may use savepoints, not universal outer durable commits. No real collector outage, independent seal or fully cold/WAL-free proof.',
 'Preview 5 observes disabled serialization. Recording 7 uses local audit/metric rows plus direct READ_ONLY echo and genuinely throwing callback. No protected-effect or actual evidence-store failure claim.',
 'Original wrappers inherit environment. Absent endpoint overrides/default loopback is preflight, not zero network/credential/OS isolation. Causal seven-key environment borrows parent dependencies, not complete dependency/cache/transport isolation.',
 'Only owned process groups receive signal 0 probes after normal exits. Reporter precedes global teardown; full exits/streams/known banners are checked. The 420s supervisor sends no terminating signal and preserves original 30s deadlines; detached descendants are not universally excluded.',
 'Current 16 channels / 8 failure rows are legitimate later coverage. Sid residual-risk/status review, ASI experimental/re-verify titles, stale stamp, occupied P1-56/57/58 proposed keys and complete behavioral truth remain open.',
 'Required duplicate 1269 / dead 2751 source-quality debt remains failed/unwaived with prior exact-code attribution. Fullsuite/coverage/Node24/hosted/PR+merge/release/formal dependency/G0/Done are not established.',
 'All earlier strict gaps/user skips, shared/Claude/A4/paused P2-02 holds and pending transfers remain intact. Historical Done is not acceptance or ownership clearance.'
]


def prior_reviews(binding):
    records = binding['priorReviews']
    require(len(records) == 4 and {r['role'] for r in records} == {'original', 'recipe', 'code', 'sealed'},
            'Exactly prior original/recipe/code/sealed review contracts required')
    for record in records:
        verify(record['pin'])
        value, field = read(record['pin']['path']), record['blockingField']
        require(field in ['blockingFindings', 'blockingPacketFindings'] and field in value and value[field] == [],
                'Missing explicit blocking field or actual blocker')
        require(all(value.get(k) == v for k, v in record.get('requiredFields', {}).items()), 'Review completion/source differs')
    # Only prior reviews: own-output actual independent review runs after this freezer.
    return records


def main():
    require(isinstance(FINAL_BINDINGS, dict), 'Prepared only: root must author/review a NEW bound version')
    binding = FINAL_BINDINGS
    require(all(not path.exists() for path in OUTPUTS), 'Write-once output exists; no overwrite/resume')
    require(not (BASE / 'ACTIVE').exists() and not (BASE / 'HALTED.json').exists(), 'Active/halted execution forbids freezing')
    reviews = prior_reviews(binding)
    for name in ['preflight', 'staticAcceptance', 'sourceContext', 'rootSealedInputProof']:
        verify(binding[name])
    history = binding['latePreparationHistory']
    require({'release-helper-v1', 'release-helper-v2', 'release-helper-count-issue'}.issubset({r['role'] for r in history}),
            'Late release-helper history must remain separately pinned')
    for record in history:
        verify(record['pin'])
    require(any(r['role'] == 'release-helper-count-issue' and r['pin']['sha256'] ==
                '134ae70f43e5c702c71461e0e8541824f39905589c603989e5269f2549433eed' for r in history),
            'Known pre-START helper observer issue missing')
    require(digest(BASE / 'driver/controller.py') == CONTROLLER_SHA, 'Reviewed actual controller changed')
    setup, setup_index, preservation = read(BASE / 'setup.json'), read(BASE / 'setup-index.json'), read(BASE / 'inputs/preservation.json')
    source, compiled = read(BASE / 'inputs/source-manifest.json'), read(BASE / 'inputs/compiled-manifest.json')
    require(setup['parentSource'] == SOURCE and setup['productionSource'] == CODE
            and setup['parentRoot'] == str(ROOT) and setup['closureRoot'] == str(COPY), 'Setup source/root differs')
    require(len(source) == setup['trackedCopied'] == 8362 and len(compiled) == setup['compiledCopied'] == 4529
            and setup['totalPhysicalCopied'] == 12891 and not set(source) & set(compiled)
            and setup['originalCasesByCorpus'] == {'map': 7, 'recording': 7}, 'Manifest/corpus measured counts differ')
    require(setup['frozenOwnInputs'] and setup_index['artifactCount'] == len(setup_index['artifacts']) > 0, 'Incomplete sealed setup')
    require(len({r['path'] for r in setup['frozenOwnInputs']}) == len(setup['frozenOwnInputs'])
            and len({r['path'] for r in setup_index['artifacts']}) == len(setup_index['artifacts']), 'Duplicate frozen input')
    preflight = read(binding['preflight']['path'])
    require(len(preflight['planPins']) == 5, 'Five current plan pins required')
    immutable = setup['frozenOwnInputs'] + setup_index['artifacts'] + preservation['immutableInputs'] + preflight['planPins'] + [preflight['reservation']]
    for record in immutable + binding.get('referencePins', []):
        verify(record)
    acceptance, context = read(binding['staticAcceptance']['path']), read(binding['sourceContext']['path'])
    require(acceptance['source'] == SOURCE and acceptance['formalAcceptanceClosed'] is False, 'Static formal/source differs')
    require(context['source'] == SOURCE and context['productionCodeSource'] == CODE
            and context['unwaivedSourceQuality']['duplicateFindings'] == 1269
            and context['unwaivedSourceQuality']['deadCodeFindings'] == 2751, 'Unwaived source-context differs')
    require(digest(PLAN) == PLAN_SHA, 'Exact plan changed')
    plan, proposal = read(PLAN), read(BASE / 'proposal.json')
    approved = plan['recommendedMinimalControls'] + [next(r for r in plan['optionalDistinctDiagnostics'] if r['id'] == L1_ID)]
    recipes, controls = proposal['recipes'], [r['id'] for r in proposal['recipes']]
    require(controls == [C1_ID, C2_ID, L1_ID] == setup['controlIds'] and len(set(controls)) == 3, 'Three exact controls required')
    require(proposal['causalPlan'] == pin(PLAN) and proposal['corpora'] == CORPORA
            and proposal['staticExpectedCasesByCorpus'] == {'map': 7, 'recording': 7}, 'Plan/corpus binding differs')
    for recipe, original in zip(recipes, approved):
        require(recipe['id'] == original['id'] and recipe['file'] == original['target']
                and recipe['baselineSha256'] == original['sourcePin']['sha256']
                and recipe['anchors'] == [{'find': original['find'], 'replace': original['replace']}]
                and recipe['proposedMutantSha256'] == original['prospectiveTargetSha256']
                and recipe['corpusKey'] == CONTROL_CORPUS[recipe['id']], 'Exact recipe differs')
    require({path.name for path in BASE.glob('result--*.json')} == {'result--' + c + '.json' for c in controls}
            and {path.name for path in BASE.glob('started--*.json')} == {'started--' + c + '.json' for c in controls}, 'Incomplete control/start inventory')
    require({path.name for path in (BASE / 'phases').iterdir()} == {c + '--' + stage for c in controls for stage in ['baseline', 'mutant', 'restored']}
            and not list((BASE / 'phases').rglob('timeout.json')), 'Incomplete/extra/timeout phase')
    original_path = PARENT / 'original-corpora-summary.json'
    require(digest(original_path) == ORIGINAL_SHA, 'Closed original summary changed')
    original = read(original_path)
    require(original['source'] == SOURCE and original['codeSource'] == CODE
            and original['distinctOriginalFileTitleRegistrations'] == 21 and original['originalFileCount'] == 4
            and original['primaryDefinitionsAcrossTwoSeparateRuns'] == 9 and original['adjacentDefinitionsAcrossTwoSeparateRuns'] == 12
            and original['single21CaseRunClaimed'] is False and original['single9CaseRunClaimed'] is False
            and original['formalAcceptanceClosed'] is False
            and [(r['corpus'], r['registered']) for r in original['separateOriginalRuns']] == [('map', 7), ('telemetry', 2), ('preview', 5), ('recording', 7)],
            'Separate original source/counting contract differs')
    original_runs, unique = {}, set()
    for run in original['separateOriginalRuns']:
        require(run['passed'] == run['registered'] and run['failed'] == run['pending'] == run['todo'] == 0
                and run['knownLateDiagnostics'] == [], 'Original incomplete')
        for name in ['raw', 'rawProducer', 'observer', 'combinedStream', 'command', 'ownedProcess', 'ownedGroupAfterExit']:
            verify(run[name])
        require(run['raw']['sha256'] == run['rawProducer']['sha256'], 'Original raw producer/snapshot differs')
        raw, obs, command = read(run['raw']['path']), read(run['observer']['path']), read(run['command']['path'])
        require(raw['success'] is True and raw['numTotalTests'] == raw['numPassedTests'] == run['registered']
                and raw['numFailedTests'] == raw['numPendingTests'] == raw['numTodoTests'] == raw['numPendingTestSuites'] == raw['numFailedTestSuites'] == 0
                and command['exit'] == 0 and command['groupAbsentByESRCH'] is True
                and obs['pid'] == command['ownedProcess']['pid'] and obs['testCount'] == run['registered']
                and obs['reason'] == 'passed' and obs['unhandledErrors'] == [], 'Original process/raw/observer differs')
        actual_ids = []
        for file in raw['testResults']:
            rel = str(Path(file['name']).relative_to(ROOT))
            require(rel == run['file'] and file['status'] == 'passed' and file.get('message', '') == '', 'Original file/setup differs')
            for case in file['assertionResults']:
                require(case['status'] == 'passed' and case['failureMessages'] == [], 'Original nonpassing body')
                actual_ids.append({'file': rel, 'fullName': case['fullName']})
        require(len(actual_ids) == run['registered'] and sorted(actual_ids, key=lambda r: r['fullName']) == sorted(run['identities'], key=lambda r: r['fullName']), 'Original actual identities differ')
        for task in obs['tasks']:
            require(all(value == 'pass' for value in task['hooks'].values()) and task['errors'] == [], 'Original hook/nonbody diagnostic')
        unique.update((r['file'], r['fullName']) for r in actual_ids)
        original_runs[run['corpus']] = run
        clean_stream(run['combinedStream']['path'])
    require(len(unique) == 21, 'Original unique registration count differs')
    ids = read(BASE / 'inputs/case-identities.json')
    require(set(ids) == set(CORPORA) == set(proposal['originalReportPins']), 'Sealed two-corpus membership differs')
    for key in CORPORA:
        require(ids[key] == original_runs[key]['identities'] and proposal['originalReportPins'][key] == original_runs[key]['raw'], 'Original identity/report binding differs')
    journal_bytes = JOURNAL.read_bytes()
    commands, contract = [json.loads(line) for line in journal_bytes.decode().splitlines()], binding['journalContract']
    require(len(commands) == len(contract) == len({c['phase'] for c in commands}) == 20
            and sorted(c['role'] for c in contract) == sorted(ROOT_ROLES)
            and contract[-2]['phase'] == 'pre-causal-normal-freeze' and contract[-1]['phase'] == 'final-normal-freeze'
            and contract[-2]['role'] == 'pre-causal-freeze' and contract[-1]['role'] == 'final-freeze', 'Exact closed20-phase contract differs')
    negative_roles = set(FIXTURES) - {'fixture-valid'}
    for command, expected_command in zip(commands, contract):
        role, argv = expected_command['role'], command['ownedProcess']['argv']
        expected_exit = 1 if role in negative_roles else 0
        require(command['phase'] == expected_command['phase'] and command['head'] == SOURCE
                and command['cwd'] == str(ROOT) and str(command['major']) == '22' and command['durationMs'] >= 0
                and argv == expected_command['argv'] and command['exit'] == expected_exit == expected_command['expectedExit'], 'Root phase/argv/guard exit differs')
        clean_stream(command['log'])
        if role in FIXTURES:
            filename, diagnostics = FIXTURES[role]
            require(len(argv) == 3 and argv[0] in ['node', '/opt/homebrew/Cellar/node@22/22.23.3_2/bin/node', '/opt/homebrew/opt/node@22/bin/node']
                    and argv[1] in ['scripts/check-threat-model.mjs', str(ROOT / 'scripts/check-threat-model.mjs')]
                    and argv[2] in ['tests/fixtures/threat-model/' + filename, str(ROOT / 'tests/fixtures/threat-model' / filename)], 'Exact direct fixture command differs')
            require(all(text in Path(command['log']).read_text(errors='replace') for text in diagnostics), 'Direct fixture offending-entry diagnostic absent')
    command_logs = [pin(c['log']) for c in commands]
    expected_native = preservation['borrowedNative']
    require(native(expected_native['path']) == expected_native, 'Borrowed native changed')
    matrices, phases = [], []
    for recipe in recipes:
        control, corpus_key = recipe['id'], recipe['corpusKey']
        started = read(BASE / ('started--' + control + '.json'))
        verify(started['release'])
        release = read(started['release']['path'])
        require(release['authorization'] == 'START_P011_CAUSAL_' + control
                and all(release[k] == value for k, value in started['binding'].items()), 'Release/start binding differs')
        binding_paths = {'setupSha256': BASE / 'setup.json', 'setupIndexSha256': BASE / 'setup-index.json',
                         'controllerSha256': BASE / 'driver/controller.py', 'proposalSha256': BASE / 'proposal.json',
                         'sourceManifestSha256': BASE / 'inputs/source-manifest.json', 'compiledManifestSha256': BASE / 'inputs/compiled-manifest.json',
                         'preservationSha256': BASE / 'inputs/preservation.json', 'observerSha256': BASE / 'driver/observer-reporter.mjs',
                         'caseIdentitiesSha256': BASE / 'inputs/case-identities.json'}
        require(all(release[k] == digest(path) for k, path in binding_paths.items())
                and release['control'] == control and release['parentRoot'] == str(ROOT) and release['closureRoot'] == str(COPY)
                and release['controllerPath'] == str(BASE / 'driver/controller.py') and release['setupPath'] == str(BASE / 'setup.json')
                and release['setupIndexPath'] == str(BASE / 'setup-index.json'), 'Actual executed input/version differs')
        check_record(read(BASE / ('before--' + control + '.json')), [], source | compiled, expected_native)
        identities = {(r['file'], r['fullName']) for r in ids[corpus_key]}
        require(len(identities) == len(ids[corpus_key]) == 7, 'Actual original seven-case identities differ')
        matrix = []
        for stage in ['baseline', 'mutant', 'restored']:
            deviations = [recipe['file']] if stage == 'mutant' else []
            expected = source | compiled
            if deviations:
                expected[recipe['file']] = recipe['proposedMutantSha256']
            matrix.append(phase(control, stage, set(CORPORA[corpus_key]), identities, expected, deviations, expected_native))
        result = read(BASE / ('result--' + control + '.json'))
        require(result['control'] == control and result['corpusKey'] == corpus_key and result['restoredExactly'] is True, 'Control incomplete/restoration absent')
        for stage, record in zip(['baseline', 'mutant', 'restored'], matrix):
            require(result[stage] == record['classification'], 'Result/phase classification differs')
        require(result['verdict'] == ('survivor' if matrix[1]['classification']['failed'] == 0 else 'body-error-or-assertion-sensitivity-awaiting-root-attribution'), 'Control verdict differs')
        check_record(result['finalPreservation'], [], source | compiled, expected_native)
        matrices.append({'control': control, 'corpusKey': corpus_key, 'recipe': recipe, 'result': pin(BASE / ('result--' + control + '.json')),
                         'release': started['release'], 'verdict': result['verdict'], 'phases': matrix})
        phases.extend(matrix)
    # Final complete checks happen only after every runtime process has ended.
    git_env = os.environ.copy() | {'GIT_NO_LAZY_FETCH': '1'}
    head = subprocess.run(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], env=git_env, check=True, capture_output=True, text=True).stdout.strip()
    tracked = subprocess.run(['git', '-C', str(ROOT), 'ls-files', '-z'], env=git_env, check=True, capture_output=True).stdout.decode().split('\0')[:-1]
    require(head == SOURCE and len(tracked) == 8362 and set(tracked) == set(source), 'Final HEAD/tracked membership differs')
    require(not (COPY / '.git').exists(), 'Filesystem copy acquired Git metadata')
    expected = source | compiled
    require(all((ROOT / rel).is_file() and digest(ROOT / rel) == value for rel, value in expected.items()), 'Final parent source/dist differs')
    require({str(path.relative_to(ROOT)) for path in (ROOT / 'dist').rglob('*') if path.is_file()} == set(compiled)
            and copy_map() == expected, 'Final private/dist membership or bytes differ')
    physical = read(BASE / 'inputs/physical-copy-manifest.json')
    require(len(physical) == 12891 and {row['relativePath'] for row in physical} == set(expected), 'Physical manifest differs')
    for row in physical:
        parent, child = (ROOT / row['relativePath']).stat(), (COPY / row['relativePath']).stat()
        require((parent.st_dev, parent.st_ino) == (row['parentDevice'], row['parentInode'])
                and (child.st_dev, child.st_ino) == (row['privateDevice'], row['privateInode'])
                and child.st_nlink == row['privateNlink'] == 1
                and (parent.st_dev, parent.st_ino) != (child.st_dev, child.st_ino), 'Physical device/inode/single-link differs')
        for key, actual in [('parentNlink', parent.st_nlink), ('parentMode', parent.st_mode & 0o7777), ('privateMode', child.st_mode & 0o7777)]:
            require(key not in row or row[key] == actual, 'Additional physical field differs: ' + key)
    link = preservation['nodeModulesLink']
    require((COPY / 'node_modules').is_symlink() and os.readlink(COPY / 'node_modules') == link['target']
            and str((COPY / 'node_modules').resolve()) == link['resolved'] and native(expected_native['path']) == expected_native, 'Borrowed native/resolver differs')
    for record in immutable:
        verify(record)
    require(JOURNAL.read_bytes() == journal_bytes, 'Live journal changed during validation')
    totals = {key: sum(record['classification'][key] for record in phases) for key in ['total', 'passed', 'failed', 'pending', 'todo']}
    require(len(phases) == 9 and totals['total'] == 9 * 7 and totals['pending'] == totals['todo'] == 0, 'Derived repeated counts differ')
    failures = [failure for record in phases for failure in record['classification']['failures']]
    kinds = dict(collections.Counter(failure['failureKind'] for failure in failures))
    final = {'capturedUtc': now(), 'source': SOURCE, 'codeSource': CODE, 'parentTrackedChecked': 8362, 'parentCompiledChecked': 4529,
             'privateFilesChecked': 12891, 'allBytesExact': True, 'physicalIdentityExact': True,
             'physicalManifest': pin(BASE / 'inputs/physical-copy-manifest.json'), 'nodeModulesLink': link, 'borrowedNative': expected_native,
             'frozenOwnInputsChecked': len(setup['frozenOwnInputs']), 'setupIndexPinsChecked': len(setup_index['artifacts']),
             'planPins': preflight['planPins'], 'reservation': preflight['reservation'], 'inboxBoundary': preservation.get('inboxBoundary'),
             'boundary': 'Full final source/dist bytes/recorded physical identity; borrowed native/helpers, not complete dependency/cache/OS/network or detached-descendant absence.'}
    # Runtime/preservation prerequisites precede writes. Later wx/index/scanner checks
    # may still stop this nontransactional attempt: no rollback/overwrite/retry.
    with FROZEN_JOURNAL.open('xb') as out:
        out.write(journal_bytes)
    new_json(PRESERVATION_OUT, final)
    selected = set()
    excluded = [COPY, BASE / 'home', BASE / 'tmp', PARENT / 'home', PARENT / 'store']
    for directory in [BASE, PARENT]:
        for parent, directories, files in os.walk(directory, followlinks=False):
            if Path(parent) == BASE:
                directories[:] = [name for name in directories if name not in ['closure', 'home', 'tmp']]
            elif Path(parent) == PARENT:
                directories[:] = [name for name in directories if name not in ['home', 'store']]
            for name in files:
                path = Path(parent) / name
                if path not in OUTPUTS and path != JOURNAL and not path.is_symlink():
                    selected.add(path)
    selected.update(Path(record['path']) for record in command_logs + preservation['immutableInputs'] + preflight['planPins'] + [preflight['reservation']] + binding.get('referencePins', []))
    selected.update(Path(binding[name]['path']) for name in ['preflight', 'staticAcceptance', 'sourceContext', 'rootSealedInputProof'])
    selected.update(Path(record['pin']['path']) for record in reviews + history)
    for record in reviews:
        for extra in record.get('companionPins', []):
            verify(extra)
            selected.add(Path(extra['path']))
    for run in original['separateOriginalRuns']:
        selected.update(Path(run[name]['path']) for name in ['raw', 'rawProducer', 'observer', 'combinedStream', 'command', 'ownedProcess', 'ownedGroupAfterExit'])
    selected.update([Path(expected_native['path']), Path(__file__).resolve(), PLAN])
    selected.difference_update(OUTPUTS)
    selected.update([FROZEN_JOURNAL, PRESERVATION_OUT])
    require(len(excluded) == 5 and not any(path == JOURNAL or any(path == root or root in path.parents for root in excluded) for path in selected), 'Excluded private closure/home/store/tmp/live journal selected')
    manifests = [pin(BASE / 'inputs' / name) for name in ['source-manifest.json', 'compiled-manifest.json', 'physical-copy-manifest.json']]
    index = {'schemaVersion': 1, 'key': 'P0-11', 'source': SOURCE, 'codeSource': CODE, 'capturedUtc': now(),
             'artifactCount': len(selected), 'artifacts': [pin(path) for path in sorted(selected)], 'privateOnlyManifests': manifests,
             'excluded': ['causal BASE/closure', 'causal BASE/home', 'causal BASE/tmp', 'PARENT/home', 'PARENT/store', 'live root journal', 'this index', 'new causal/lane summaries'],
             'boundary': 'Only hash references. All source/compiled/physical manifest bodies remain private and unsplit regardless of cap; no source/native/dependency/store/key body copies or future builder/outcome/own-output-review cycle.'}
    new_json(INDEX_OUT, index)
    causal = {'schemaVersion': 1, 'key': 'P0-11', 'source': SOURCE, 'codeSource': CODE, 'capturedUtc': now(),
              'state': 'complete-pending-independent-review', 'formalAcceptanceClosed': False, 'runtimeArtifactIndex': pin(INDEX_OUT),
              'finalSourcePreservation': pin(PRESERVATION_OUT), 'controller': pin(BASE / 'driver/controller.py'), 'freezer': pin(Path(__file__).resolve()),
              'priorReviewContracts': reviews, 'latePreparationHistory': history, 'controls': matrices,
              'causalCommandRecords': [record['command'] for record in phases], 'executionCounts': totals, 'failureKinds': kinds,
              'distinctRepeatedCorpusRegistrations': 14, 'distinctFailedFileTitlePairs': len({(failure['file'], failure['fullName']) for failure in failures}),
              'mutantPassedCounts': [matrix['phases'][1]['classification']['passed'] for matrix in matrices],
              'survivingControls': [matrix['control'] for matrix in matrices if matrix['verdict'] == 'survivor'], 'failuresAndMasking': failures,
              'manualRootAttribution': 'Pending independent actual review. Preserve C1 status masks, same genuine C2 Error and L1 ENOENT/refusal difference; no generic nonzero-as-admission.', 'limits': LIMITS}
    new_json(CAUSAL_JSON, causal)
    text = '# P0-11 private causal qualification\n\n'
    text += f'Source `{SOURCE}` preserves production `{CODE}`. Three controls completed nine phases: {totals["total"]} repeated executions, {totals["passed"]} passed and {totals["failed"]} failed. Fourteen original registrations are reused; no new tests.\n\n'
    text += '| Control | Corpus | Baseline passed | Mutant passed / failed | Restored passed | Actual classification |\n| --- | --- | ---: | ---: | ---: | --- |\n'
    for matrix in matrices:
        before, mutant, restored = [record['classification'] for record in matrix['phases']]
        text += f'| {matrix["control"]} | {matrix["corpusKey"]} | {before["passed"]} | {mutant["passed"]} / {mutant["failed"]} | {restored["passed"]} | {matrix["verdict"]} |\n'
    new_text(CAUSAL_MD, text + '\n' + '\n\n'.join(LIMITS) + '\n')
    lane = {'schemaVersion': 1, 'key': 'P0-11', 'source': SOURCE, 'codeSource': CODE, 'capturedUtc': now(),
            'state': 'complete-pending-independent-review', 'formalAcceptanceClosed': False, 'originalCorpora': original,
            'originalCorporaSummary': pin(original_path), 'primaryOriginalTestsAcrossTwoRuns': {'total': 9, 'passed': 9, 'failed': 0, 'skipped': 0, 'pending': 0, 'todo': 0, 'single9CaseRunClaimed': False},
            'priorReviewContracts': reviews, 'latePreparationHistory': history, 'causalSummary': pin(CAUSAL_JSON), 'causalMarkdown': pin(CAUSAL_MD),
            'runtimeArtifactIndex': pin(INDEX_OUT), 'finalSourcePreservation': pin(PRESERVATION_OUT), 'commandsFrozen': pin(FROZEN_JOURNAL),
            'rootCommandCount': len(commands), 'rootCommands': commands, 'rootCommandLogPins': command_logs, 'rootJournalContract': contract,
            'expectedNegativeCheckerRoles': sorted(negative_roles), 'separateCausalCommandCount': len(phases), 'causalExecutionCounts': totals,
            'countingRule': '20 root commands include four originals 7 / 2 / 5 / 7, 21 distinct registrations across 4 files. Primary 9 is 7 + 2 across two runs, never one 9-case process. Nine separate causal commands repeat 14 existing registrations over 63 executions, no new unique tests.',
            'acceptanceStaticInventory': binding['staticAcceptance'], 'rootSealedInputProof': binding['rootSealedInputProof'],
            'exactSourceValidationContext': binding['sourceContext'], 'unwaivedSourceQuality': context['unwaivedSourceQuality'], 'limits': LIMITS}
    new_json(LANE_JSON, lane)
    text = '# P0-11 bounded qualification\n\n'
    text += f'On `{SOURCE}`, original map 7, telemetry 2, preview 5 and recorder 7 pass in four separate runs, 21 registrations across 4 files. Primary 9 aggregates two runs, not one 9-case process. Production remains `{CODE}`.\n\n'
    text += f'Three controls completed nine phases with {totals["total"]} repeated executions: {totals["passed"]} passes and {totals["failed"]} body failures across {causal["distinctFailedFileTitlePairs"]} distinct file/title pairs. AssertionError/C2 Error kinds, survivors and masking remain explicit.\n\n'
    text += 'The frozen root journal has 20 commands: exactly four original negative checker fixtures exit 1 with named diagnostics/exact argv; every other command and guard exits 0. These are separate from nine causal processes.\n\n'
    new_text(LANE_MD, text + '\n\n'.join(LIMITS) + '\n')
    # Late write-once metadata errors preserve partial output; never trim/split/retry.
    markers = [b'-----BEGIN ' + name + b'PRIVATE ' + b'KEY-----' for name in [b'', b'RSA ', b'EC ', b'OPENSSH ', b'ENCRYPTED ']]
    for path in OUTPUTS:
        require(not any(marker in path.read_bytes() for marker in markers), 'Private-key body in new metadata')
        require(path.stat().st_size <= 1024 * 1024, 'Compact output exceeds 1MiB; retain without splitting/truncating')
    require(JOURNAL.read_bytes() == journal_bytes and not (BASE / 'ACTIVE').exists() and not (BASE / 'HALTED.json').exists(), 'Final journal/lifecycle changed')
    print(json.dumps({'state': lane['state'], 'causal': pin(CAUSAL_JSON), 'wholeLane': pin(LANE_JSON), 'artifactIndex': pin(INDEX_OUT),
                      'rootCommands': len(commands), 'causalCommands': len(phases), 'executionCounts': totals,
                      'failureKinds': kinds, 'survivors': causal['survivingControls']}), flush=True)


if __name__ == '__main__':
    main()
