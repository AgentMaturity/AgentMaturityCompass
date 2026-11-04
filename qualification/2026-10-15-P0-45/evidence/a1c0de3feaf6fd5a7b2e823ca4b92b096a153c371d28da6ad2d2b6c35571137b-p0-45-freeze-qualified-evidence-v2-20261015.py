"""Unexecuted freezer: validate completed P0-45 evidence, then create new private summaries.

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

ROOT = Path('/Users/sid/.codex/worktrees/p0-45-qualification/AgentMaturityCompass')
PARENT = Path('/private/tmp/p0-45-qualification-20261015')
BASE = Path('/private/tmp/p0-45-causal-qualification-20261015')
COPY = BASE / 'closure'
SOURCE = '2024f25c79973987b44a4a1298488d55ee0d6227'
CODE = '58e91dcef111bf02f773dcbfd1921d428cf75e34'
JOURNAL = Path('/private/tmp/p0-45-commands-20261015.jsonl')
FROZEN_JOURNAL = PARENT / 'commands-frozen.jsonl'
PRESERVATION_OUT = PARENT / 'final-source-preservation.json'
INDEX_OUT = BASE / 'runtime-artifact-index.json'
CAUSAL_JSON = Path('/private/tmp/p0-45-causal-qualification-20261015.json')
CAUSAL_MD = CAUSAL_JSON.with_suffix('.md')
LANE_JSON = Path('/private/tmp/p0-45-bounded-qualification-20261015.json')
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
    require(value['parentTrackedChecked'] == 8205 and value['parentCompiledChecked'] == 4529
            and value['privateFilesChecked'] == 12734, 'Preservation cardinality differs')
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
    require(set(rt) == set(ot) == identities and obs['testCount'] == raw['numTotalTests'] == recorded['total'] == 12
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
    require(recorded['passed'] == raw['numPassedTests'] == 12 - len(failures)
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
    'Bounded qualification is complete pending independent actual review; formalAcceptanceClosed remains false.',
    'Original12 core,5 built CLI,4 separation and10 readonly verifier are four separate invocations. Six causal phases repeat only the same12 source-mode cases;72 executions add no new unique registrations.',
    'C1 removes unknown and active legal-hold refusals together under injected callbacks and a stub signer. Shared expectRefused99 can fail before reason/snapshot/quarantine/reachability assertions; retain actual first frames and masking.',
    'C2 changes only the forward rename to faithful copy then unlink; rollback rename remains unchanged. Byte-reachability checks may survive. A rename-fault-spy assertion failure is mechanism/fault-path sensitivity, not observed byte loss or proof of the spec invariant mutation criterion.',
    'Actual mutant outcomes, including survivors, are derived from completed raw/observer/process records. Body AssertionErrors await semantic attribution; generic nonzero, setup/hook/native/late/timeout/pending or group uncertainty is not a kill.',
    'Core12 uses real owned encrypted-blob writer/verifier and SHA256 snapshots, injected hold callbacks and stub SignedDigest signatures. Writers and pools close before repair; this is not active-writer or crash-atomic proof.',
    'Original builtCLI5 combines a source fixture parent with actual dist/cli.js children, real local REPAIR_RECEIPT signature verification and altered-byte refusal. It is separate from TS-only mutations with all4529 compiled files unchanged; no independently pinned external issuer or separate per-child ABI/transcript is inferred.',
    'Original CLI environment is inherited with per-call AMC_HOME/passphrase; the causal copy has a seven-key allowlist and borrowed unchanged parent dependencies. Neither proves OS/network, universal descendant or all-cache isolation.',
    'Only the owned process group was probed with signal zero after exit. The run-end reporter precedes global teardown; complete process exits and known late diagnostics are checked separately. Supervisor420s sends no terminating signal and does not alter original30s tests or CLI60s children.',
    'Original CLI assertions verify a real local repair receipt and altered-byte refusal, but afterAll deletes the owned fixture. Retained source/raw/observer/outer streams are not a separately retained CLI repair-receipt sample; no sample criterion is closed. Historical origin/main red, PR/merge, full suite and installed P031 remain formal open.',
    'Full JSONL repair, live writer/WAL race, interactive TTY, genuine active/unknown signed registry, second signing failure, rollback failure, crash/interrupted publication and arbitrary hostile-plan/symlink containment remain unqualified.',
    'The adjacent doctor static note identifies a dangling top-level .amc symlink deletion branch without the evidence-name exclusion/gate; its cache branch has an existing gate. This is an unapproved adjacent follow-up with no owner assigned, not observed deletion/byte loss or a verify-repair-path defect. No doctor/hold source was changed.',
    'Required source quality remains failed and unwaived:1269duplicates/2751dead-code findings. Older exact-code type/lint/clean-source/quality evidence retains its original command/source attribution; these are not fresh P045 runs.',
    'P021 literal20/10-outside-R4 reconciliation, P029 skip, P022 arrays, P023 held API/Studio, P051 issuer/formal, P024 ISO/expert gaps, P019/P020 proposals and P030 held runner/fullbatch/installed-pack gaps remain unresolved.',
    'Claude/shared CLI/API/Studio/A4 and paused P2-02 reservations and all pending transfers remain intact. Historical Done is not acceptance or ownership clearance.',
    'Historical original-red requirement, full suite, coverage, Node24, hosted CI, PR/merge, release, formal dependency/G0/Done are not established. P011 remains conditional read-only preparation after this bounded handoff.'
]


def main():
    require(all(not p.exists() for p in OUTPUTS), 'Write-once output already exists; do not overwrite or resume automatically')
    require(not (BASE / 'ACTIVE').exists() and not (BASE / 'HALTED.json').exists(), 'Active/halted state forbids freezing')
    setup = read(BASE / 'setup.json')
    setup_index = read(BASE / 'setup-index.json')
    require(digest(BASE / 'driver/controller.py') == '9479a7a7186ce97e740dad14fda9c0244f3f3173d8d41a30b659de8e5e40e192', 'Reviewed controller bytes changed')
    proposal = read(BASE / 'proposal.json')
    preservation = read(BASE / 'inputs/preservation.json')
    source = read(BASE / 'inputs/source-manifest.json')
    compiled = read(BASE / 'inputs/compiled-manifest.json')
    require(len(source) == 8205 and len(compiled) == 4529 and not set(source) & set(compiled), 'Manifest cardinality/overlap differs')
    require(len(setup['frozenOwnInputs']) > 0 and setup_index['artifactCount'] == len(setup_index['artifacts']) > 0
            and len({p['path'] for p in setup['frozenOwnInputs']}) == len(setup['frozenOwnInputs'])
            and len({p['path'] for p in setup_index['artifacts']}) == len(setup_index['artifacts']),
            'Frozen setup inventory differs')
    for p in setup['frozenOwnInputs'] + setup_index['artifacts'] + preservation['immutableInputs']:
        verify(p)
    preflight = read(PARENT / 'initial-preflight.json')
    require(len(preflight['planPins']) == 5, 'Plan authority inventory differs')
    for p in preflight['planPins'] + [preflight['reservation']]:
        verify(p)
    recipes = proposal['recipes']
    controls = [r['id'] for r in recipes]
    require(len(controls) == len(set(controls)) == 2 and controls == setup['controlIds'], 'Two-control inventory differs')
    plan_path = Path('/private/tmp/p0-45-causal-readonly-plan-20261015.json')
    require(digest(plan_path) == 'b67310ddfde9a75c550cb563386caa43967530e6412561888d176ae66ae8bab4'
            and proposal['causalPlan'] == pin(plan_path), 'Exact two-control plan binding differs')
    approved = read(plan_path)['recipes']
    require(len(approved) == 2 and proposal['corpus'] == ['tests/verifyRepair.test.ts'], 'Only original core12 is in scope')
    for candidate, original_recipe in zip(recipes, approved):
        require(candidate['id'] == original_recipe['id'] and candidate['file'] == original_recipe['target']
                and candidate['baselineSha256'] == original_recipe['targetPin']['sha256']
                and candidate['anchors'] == original_recipe['anchors']
                and candidate.get('protectedAnchor') == original_recipe.get('protectedAnchor'), 'Exact recipe differs')
    require({p.name for p in BASE.glob('result--*.json')} == {'result--' + c + '.json' for c in controls}, 'Missing/extra result')
    require({p.name for p in BASE.glob('started--*.json')} == {'started--' + c + '.json' for c in controls}, 'Missing/extra start')
    require({p.name for p in (BASE / 'phases').iterdir()} == {c + '--' + s for c in controls for s in ['baseline', 'mutant', 'restored']},
            'Incomplete/extra phase directories')
    require(not list((BASE / 'phases').rglob('timeout.json')), 'Timeout retained: qualification cannot freeze complete')
    journal_bytes = JOURNAL.read_bytes()
    commands = [json.loads(line) for line in journal_bytes.decode().splitlines()]
    require(len(commands) == 15 and len({c['phase'] for c in commands}) == 15, 'Root journal must contain 15 distinct actual phases')
    require(commands[-1]['phase'] == 'final-normal-freeze' and all(c['head'] == SOURCE for c in commands),
            'Final normal freeze missing or root command source differs')
    grep_rows = [c for c in commands if c['phase'] == 'old-delete-message-inventory']
    require(len(grep_rows) == 1 and grep_rows[0]['exit'] == 1
            and grep_rows[0]['ownedProcess']['argv'] == ['git', 'grep', '-n', 'Removed corrupted', '--', 'src']
            and Path(grep_rows[0]['log']).read_bytes() == b''
            and all(c['exit'] == 0 for c in commands if c['phase'] != 'old-delete-message-inventory'),
            'Only the exact empty negative grep may exit1; every other root phase must exit0')
    require(all(c['cwd'] == str(ROOT) and str(c['major']) == '22' and c['durationMs'] >= 0 for c in commands), 'Root command boundary differs')
    command_logs = [pin(c['log']) for c in commands]
    original = read(PARENT / 'original-corpora-summary.json')
    require(original['source'] == SOURCE and original['distinctOriginalFileTitleRegistrations'] == 31 and original['originalFileCount'] == 4
            and original['single31CaseRunClaimed'] is False
            and [r['registered'] for r in original['separateOriginalRuns']] == [12, 5, 4, 10], 'Original corpus summary differs')
    for run in original['separateOriginalRuns']:
        require(run['passed'] == run['registered'] and run['failed'] == run['pending'] == run['todo'] == 0, 'Original run incomplete')
        for name in ['sourceTest', 'raw', 'rawProducer', 'observer', 'combinedStream', 'command', 'ownedProcess', 'ownedGroupAfterExit']:
            verify(run[name])
        require(run['raw']['sha256'] == run['rawProducer']['sha256'], 'Original raw producer/snapshot differ')
        actual_raw = read(run['raw']['path'])
        actual_observer = read(run['observer']['path'])
        actual_command = read(run['command']['path'])
        require(actual_raw['numTotalTests'] == actual_raw['numPassedTests'] == run['registered']
                and actual_raw['numFailedTests'] == actual_raw['numPendingTests'] == actual_raw['numTodoTests'] == 0
                and actual_raw['success'] is True and actual_command['exit'] == 0
                and actual_command['groupAbsentByESRCH'] is True
                and actual_observer['pid'] == actual_command['ownedProcess']['pid']
                and actual_observer['testCount'] == run['registered']
                and actual_observer['unhandledErrors'] == [] and actual_observer['reason'] == 'passed',
                'Original summary/raw/observer/process disagreement')
        clean_stream(run['combinedStream']['path'])
    acceptance = read(PARENT / 'acceptance-static-inventory.json')
    context = read(PARENT / 'exact-source-validation-context.json')
    require(acceptance['source'] == SOURCE and acceptance['formalAcceptanceClosed'] is False
            and acceptance['removedCorruptedLiteralGrep'] == grep_rows[0]
            and acceptance['verifyActionRange']['directRmSyncCalls'] == 0
            and acceptance['verifyActionRange']['directUnlinkSyncCalls'] == 0, 'Static repair acceptance boundary differs')
    verify(acceptance['grepLog'])
    require(acceptance['grepLog']['bytes'] == 0, 'Negative grep was not empty')
    require(context['source'] == SOURCE and context['productionCodeSource'] == CODE
            and context['unwaivedSourceQuality']['duplicateFindings'] == 1269
            and context['unwaivedSourceQuality']['deadCodeFindings'] == 2751, 'Exact-source quality context differs')
    doctor_path = PARENT / 'adjacent-doctor-static-review.json'
    require(digest(doctor_path) == 'f64c23ecee537efe4eb5cc50d34785c9d325ed954ee30f64bdd43cb3754ec544', 'Adjacent static note changed')
    original_review = Path('/private/tmp/p0-45-original-corpora-independent-review-20261015.json')
    original_review_data = read(original_review)
    require(original_review_data['blockingFindings'] == [] and original_review_data['allReadsFinished'] is True and original_review_data['decision'] == 'FOUR_SEPARATE_ORIGINAL_CORPORA_VERIFIED_WITH_BOUNDED_MEANING' and original_review_data['formalAcceptanceClosed'] is False, 'Original blocking review boundary differs; informational findings remain preserved')
    corpus = set(proposal['corpus'])
    ids = read(BASE / 'inputs/case-identities.json')
    identities = {(p['file'], p['fullName']) for p in ids}
    require(len(corpus) == 1 and len(ids) == len(identities) == 12, 'Original causal corpus differs')
    expected_native = preservation['borrowedNative']
    require(native(expected_native['path']) == expected_native, 'Borrowed native identity changed')
    matrices, phases = [], []
    for recipe in recipes:
        control = recipe['id']
        started = read(BASE / ('started--' + control + '.json'))
        verify(started['release'])
        release = read(started['release']['path'])
        require(release['authorization'] == 'START_P045_CAUSAL_' + control, 'Root release token differs')
        require(all(release[k] == v for k, v in started['binding'].items()), 'Release/start binding differs')
        binding_paths = {'setupSha256': BASE / 'setup.json', 'setupIndexSha256': BASE / 'setup-index.json',
                         'controllerSha256': BASE / 'driver/controller.py', 'proposalSha256': BASE / 'proposal.json',
                         'sourceManifestSha256': BASE / 'inputs/source-manifest.json', 'compiledManifestSha256': BASE / 'inputs/compiled-manifest.json',
                         'preservationSha256': BASE / 'inputs/preservation.json', 'observerSha256': BASE / 'driver/observer-reporter.mjs'}
        require(all(release[k] == digest(p) for k, p in binding_paths.items()), 'Executed release input hash differs')
        require(release['control'] == control and release['parentRoot'] == str(ROOT) and release['closureRoot'] == str(COPY)
                and release['controllerPath'] == str(BASE / 'driver/controller.py')
                and release['setupPath'] == str(BASE / 'setup.json')
                and release['setupIndexPath'] == str(BASE / 'setup-index.json'), 'Executed controller/version path differs')
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
    require(head == SOURCE and len(tracked) == 8205 and set(tracked) == set(source), 'Current parent HEAD/tracked inventory differs')
    require(not (COPY / '.git').exists(), 'Filesystem copy acquired Git metadata')
    expected = source | compiled
    require(all((ROOT / rel).is_file() and digest(ROOT / rel) == value for rel, value in expected.items()), 'Final parent source/dist bytes changed')
    require({str(p.relative_to(ROOT)) for p in (ROOT / 'dist').rglob('*') if p.is_file()} == set(compiled), 'Parent dist membership changed')
    require(copy_map() == expected, 'Final complete private source/dist bytes differ')
    physical = read(BASE / 'inputs/physical-copy-manifest.json')
    require(len(physical) == 12734 and {p['relativePath'] for p in physical} == set(expected), 'Physical manifest membership differs')
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
    final_preservation = {'capturedUtc': now(), 'source': SOURCE, 'codeSource': CODE, 'parentTrackedChecked': 8205,
        'parentCompiledChecked': 4529, 'privateFilesChecked': 12734, 'allBytesExact': True,
        'physicalManifest': pin(BASE / 'inputs/physical-copy-manifest.json'), 'physicalIdentityExact': True,
        'nodeModulesLink': link, 'borrowedNative': expected_native, 'frozenOwnInputsChecked': len(setup['frozenOwnInputs']), 'setupIndexPinsChecked': len(setup_index['artifacts']),
        'planPins': preflight['planPins'], 'reservation': preflight['reservation'], 'inboxBoundary': preservation['inboxBoundary'],
        'boundary': 'Current full copy and parent bytes/recorded physical identities verified after all six phases. Borrowed dependency helpers and native only; no entire-dependency/cache or universal descendant-absence claim.'}
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
    for pattern in ['p0-45-*review*-20261015.*', 'p0-45-*readiness*-20261015.*',
                    'p0-45-causal-readonly-plan*-20261015.*', 'p0-45-canonical-outline-20261015.*',
                    'p0-45-causal-root-sealed-input-verification-20261015.json',
                    'p0-11-readonly-readiness-20261015.*']:
        selected.update(Path('/private/tmp').glob(pattern))
    selected.update(Path(p['path']) for p in command_logs)
    selected.update(Path(p['path']) for p in preservation['immutableInputs'])
    selected.update(Path(p['path']) for p in preflight['planPins'] + [preflight['reservation']])
    for run in original['separateOriginalRuns']:
        selected.update(Path(run[n]['path']) for n in ['raw', 'observer', 'combinedStream'])
    context = read(PARENT / 'exact-source-validation-context.json')
    selected.add(original_review)
    selected.add(original_review.with_suffix('.md'))
    selected.add(Path('/private/tmp/p0-21-qualification-20261015/certification-wording-acceptance-gap.json'))
    selected.add(Path(context['priorLaneContext']['path']))
    selected.add(Path(context['priorValidationContext']['path']))
    selected.update(Path(p['path']) for p in context['sourceValidationLogPins'])
    for p in [context['priorLaneContext'], context['priorValidationContext'], *context['sourceValidationLogPins']]:
        verify(p)
    # Index references do not copy native binaries, executable helper bodies, stores, homes or keys.
    selected.add(Path(expected_native['path']))
    selected.difference_update(OUTPUTS)
    selected.update([FROZEN_JOURNAL, PRESERVATION_OUT])
    excluded_roots = [COPY, BASE / 'home', BASE / 'tmp', PARENT / 'home', PARENT / 'store']
    require(not any(p == JOURNAL or any(p == root or root in p.parents for root in excluded_roots) for p in selected),
            'Excluded closure/home/store/tmp/live journal selected')
    index = {'schemaVersion': 1, 'capturedUtc': now(), 'key': 'P0-45', 'source': SOURCE, 'codeSource': CODE,
        'artifactCount': len(selected), 'artifacts': [pin(p) for p in sorted(selected)],
        'excluded': ['causal BASE/closure', 'causal BASE/home', 'causal BASE/tmp', 'PARENT/home', 'PARENT/store',
                     'live root journal', 'this index', 'new causal and whole-lane summaries'],
        'privateOnlyLargeManifest': pin(BASE / 'inputs/physical-copy-manifest.json'),
        'boundary': 'Hash references only. No indexed native/helper/source body is copied by this freezer; the 3.9 MB physical manifest remains private. Prior immutable indices retain historical pre-append inbox pins; current boundary is pinned independently.'}
    new_json(INDEX_OUT, index)
    totals = {k: sum(p['classification'][k] for p in phases) for k in ['total', 'passed', 'failed', 'pending', 'todo']}
    require(totals['total'] == 6 * 12 and totals['pending'] == totals['todo'] == 0, 'Derived repeated execution totals differ')
    failures = [f for p in phases for f in p['classification']['failures']]
    causal = {'schemaVersion': 1, 'key': 'P0-45', 'source': SOURCE, 'codeSource': CODE, 'capturedUtc': now(),
        'state': 'complete-pending-independent-review', 'formalAcceptanceClosed': False, 'runtimeArtifactIndex': pin(INDEX_OUT),
        'finalSourcePreservation': pin(PRESERVATION_OUT), 'controller': pin(BASE / 'driver/controller.py'),
        'freezer': pin(Path(__file__).resolve()), 'controls': matrices, 'causalCommandRecords': [p['command'] for p in phases],
        'executionCounts': totals, 'distinctRepeatedCorpusRegistrations': 12,
        'distinctFailedFileTitlePairs': len({(f['file'], f['fullName']) for f in failures}),
        'mutantPassedCounts': [m['phases'][1]['classification']['passed'] for m in matrices],
        'survivingControls': [m['control'] for m in matrices if m['verdict'] == 'survivor'],
        'controllerHistory': 'Derived from preserved P021v3; actual execution here is bound only to the two completed P045 controls, six phase commands and their exact releases.',
        'failuresAndMasking': failures,
        'manualRootAttribution': 'Pending independent actual review. Preserve original first frames and masked later assertions; a C2 rename-spy failure is not observed byte loss.',
        'limits': LIMITS}
    new_json(CAUSAL_JSON, causal)
    causal_md = '# P0-45 private causal qualification\n\n'
    causal_md += f'Source `{SOURCE}` preserves production code `{CODE}`. Two controls completed six source-mode phases with {totals["total"]} repeated case executions: {totals["passed"]} passed and {totals["failed"]} body assertion failures. No cases were pending or todo. The repeated corpus has 12 registrations.\n\n'
    causal_md += '| Control | Baseline passed | Mutant passed / failed | Restored passed | Actual classification |\n| --- | ---: | ---: | ---: | --- |\n'
    for m in matrices:
        baseline, mutant, restored = [p['classification'] for p in m['phases']]
        causal_md += f'| {m["control"]} | {baseline["passed"]} | {mutant["passed"]} / {mutant["failed"]} | {restored["passed"]} | {m["verdict"]} |\n'
    causal_md += '\n' + '\n\n'.join(LIMITS) + '\n'
    new_text(CAUSAL_MD, causal_md)
    lane = {'schemaVersion': 1, 'key': 'P0-45', 'source': SOURCE, 'codeSource': CODE, 'capturedUtc': now(),
        'state': 'complete-pending-independent-review', 'formalAcceptanceClosed': False, 'originalCorpora': original,
        'originalCorporaSummary': pin(PARENT / 'original-corpora-summary.json'),
        'originalCorporaIndependentReview': pin(original_review),
        'primaryOriginalCoreTests': {'total': 12, 'passed': 12, 'failed': 0, 'skipped': 0},
        'causalSummary': pin(CAUSAL_JSON), 'causalMarkdown': pin(CAUSAL_MD), 'runtimeArtifactIndex': pin(INDEX_OUT),
        'finalSourcePreservation': pin(PRESERVATION_OUT), 'commandsFrozen': pin(FROZEN_JOURNAL),
        'rootCommandCount': len(commands), 'rootCommands': commands, 'rootCommandLogPins': command_logs,
        'expectedEmptyGrep': grep_rows[0], 'separateCausalCommandCount': len(phases), 'causalExecutionCounts': totals,
        'countingRule': '15 root command records and six causal command records are separate. Four original runs contain12/5/4/10 registrations across four files, not one31-case run. Six causal phases repeat only original core12;72 executions are not new unique cases.',
        'acceptanceStaticInventory': pin(PARENT / 'acceptance-static-inventory.json'),
        'adjacentDoctorStaticReview': pin(doctor_path),
        'exactSourceValidationContext': pin(PARENT / 'exact-source-validation-context.json'),
        'unwaivedSourceQuality': context['unwaivedSourceQuality'], 'limits': LIMITS,
        'nextReadOnlyCandidate': {'key': 'P0-11', 'readiness': pin('/private/tmp/p0-11-readonly-readiness-20261015.json'),
                                'runtimePerformedByThisLane': False, 'authority': 'Conditional preparation only; no owner transfer or formal dependency closure.'}}
    new_json(LANE_JSON, lane)
    text = '# P0-45 bounded qualification\n\n'
    text += f'On source `{SOURCE}`, four separate unchanged original runs pass 12 core, 5 built CLI, 4 verification-separation and 10 readonly-verifier cases. The primary receipt scope is core12. Production code remains `{CODE}`.\n\n'
    text += f'Two private source controls completed six phases against the same core12: {totals["total"]} repeated executions, {totals["passed"]} passes and {totals["failed"]} body assertion failures across {causal["distinctFailedFileTitlePairs"]} distinct file/title pairs. All baseline and restored phases passed. Any mutant survivor remains explicit.\n\n'
    text += 'The frozen root journal has15 actual command records. Exactly the designated git grep negative inventory exits1 with an empty stream; all other root commands exit0. These are separate from the six causal test processes.\n\n'
    text += '\n\n'.join(LIMITS) + '\n'
    new_text(LANE_MD, text)
    # Metadata/errors only; never copy a private-key body. This is a nontransactional
    # write-once freezer: on any later check failure retain the partial attempt.
    markers = [b'-----BEGIN ' + name + b'PRIVATE ' + b'KEY-----' for name in [b'', b'RSA ', b'EC ', b'OPENSSH ', b'ENCRYPTED ']]
    for path in OUTPUTS:
        require(not any(m in path.read_bytes() for m in markers), 'Unexpected private-key body marker in new metadata')
    require(JOURNAL.read_bytes() == journal_bytes and not (BASE / 'ACTIVE').exists()
            and not (BASE / 'HALTED.json').exists(), 'Final journal/state changed')
    print(json.dumps({'state': lane['state'], 'causal': pin(CAUSAL_JSON), 'wholeLane': pin(LANE_JSON),
                      'artifactIndex': pin(INDEX_OUT), 'rootCommands': len(commands), 'causalCommands': len(phases),
                      'executionCounts': totals, 'survivors': causal['survivingControls']}), flush=True)


if __name__ == '__main__':
    main()
