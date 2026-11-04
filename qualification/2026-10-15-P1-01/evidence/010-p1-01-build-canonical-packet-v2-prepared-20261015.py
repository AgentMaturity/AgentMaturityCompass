"""UNEXECUTED metadata builder. Root must bind final frozen inputs in a NEW version.

Writes only Q. All planned bytes/cap/secret checks precede Q mkdir; writes are not transactional.
No product imports/tests/builds, regeneration, deletion, source edits or retries.
"""
from pathlib import Path
import hashlib, json, os, re, shlex, stat, subprocess

T = Path('/private/tmp')
R = Path('/Users/sid/.codex/worktrees/p1-01-qualification/AgentMaturityCompass')
B = T / 'p1-01-qualification-20261015'
C = T / 'p1-01-source-strip-control-20261015'
FAILED = T / 'p1-01-source-control-20261015'
Q = R / 'qualification/2026-10-15-P1-01'
SOURCE = '559fafc4fb52e586606f5fdf471ce65f44c5cf58'
PRODUCTION = '58e91dcef111bf02f773dcbfd1921d428cf75e34'
BRANCH = 'codex/p1-01-current-qualification'
CAP = 1_048_576
# Root supplies exact pins only after runtime closure and final audit/outcome.
# Required: fixed-name pins below; privateManifests(role+pin); curatedInputs(pins);
# runtime(node,pnpm,os,arch); nonzeroRootExits(actual phase->exit mapping).
FINAL_BINDINGS = None
FIXED = {
    'frozenJournal': B / 'commands-frozen.jsonl',
    'closedFlag': B / 'commands-closed.json',
    'controlResult': C / 'result.json',
    'actualReview': T / 'p1-01-bounded-independent-actual-review-20261015.json',
    'rootOutcome': T / 'p1-01-root-outcome-20261015.json',
}
CONTROL_PHASES = ('baseline-receipt', 'baseline-schemas', 'mutant-compile',
                  'mutant-receipt', 'mutant-schemas', 'restored-receipt', 'restored-schemas')
FAILED_PHASES = CONTROL_PHASES[:3]
MANIFEST_NAMES = {'original-tracked-files.json', 'original-dist-files.json',
                  'physical-manifest.json', 'pages-output-files.json'}


def pin(path):
    path = Path(path)
    assert stat.S_ISREG(path.lstat().st_mode) and not path.is_symlink(), str(path)
    data = path.read_bytes()
    return {'path': str(path), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def load(path):
    return json.loads(Path(path).read_text())


def verified(entry, expected_path=None):
    assert isinstance(entry, dict) and {'path', 'bytes', 'sha256'} <= entry.keys()
    if expected_path is not None:
        assert Path(entry['path']) == expected_path
    actual = pin(entry['path'])
    assert all(actual[k] == entry[k] for k in ('path', 'bytes', 'sha256')), entry['path']
    return actual


def git(*args):
    return subprocess.check_output(['git', *args], cwd=R,
        env=os.environ | {'GIT_NO_LAZY_FETCH': '1'}, text=True).strip()


def safe_body(data):
    assert len(data) <= CAP, 'Keep oversized artifacts private and unsplit'
    assert (b'PRIVATE ' + b'KEY-----') not in data, 'Private-key material is forbidden'
    return data


def encoded(value):
    return safe_body((json.dumps(value, indent=2) + '\n').encode())


def main():
    assert isinstance(FINAL_BINDINGS, dict), 'UNBOUND PREPARATION: no canonical writes'
    bindings = FINAL_BINDINGS
    bound = {name: verified(bindings[name], path) for name, path in FIXED.items()}
    closed = load(FIXED['closedFlag'])
    original_journal = T / 'p1-01-commands-20261015.jsonl'
    assert closed['kind'] == 'closed' and Path(closed['journalPath']) == original_journal
    assert verified(closed['frozenJournal'], FIXED['frozenJournal']) == bound['frozenJournal']
    assert original_journal.read_bytes() == FIXED['frozenJournal'].read_bytes()
    rows = [json.loads(line) for line in FIXED['frozenJournal'].read_text().splitlines()]
    assert rows and len(rows) == closed['rows']
    phases = [row['phase'] for row in rows]
    assert len(phases) == len(set(phases))
    assert all(row['head'] == row['headAfter'] == SOURCE for row in rows)
    assert all(row['groupAbsentByESRCH'] is True and row['signalsOtherThanZeroSent'] is False for row in rows)
    assert all(isinstance(row['durationMs'], (int, float)) and row['durationMs'] >= 0 for row in rows)
    nonzero = {row['phase']: row['exit'] for row in rows if row['exit'] != 0}
    assert nonzero == bindings['nonzeroRootExits']
    assert rows[-1]['exit'] == 0 and 'check-freeze.mjs' in rows[-1]['cmd'] and SOURCE in rows[-1]['cmd']
    for phase in ('existing-tests', 'schemas', 'pages', 'vectors', 'publication', 'receipt-witness'):
        assert phases.count(phase) == 1 and rows[phases.index(phase)]['exit'] == 0
    for row in rows:
        assert load(B / ('command-' + row['phase']) / 'command.json') == row

    review, outcome = load(FIXED['actualReview']), load(FIXED['rootOutcome'])
    assert review['allReadsFinished'] is True and review['formalAcceptanceClosed'] is False
    blocks = [review[key] for key in ('blockingFindings', 'blockingPacketFindings') if key in review]
    assert blocks and all(value == [] for value in blocks)
    assert outcome['formalAcceptanceClosed'] is False
    assert SOURCE in json.dumps(review) and SOURCE in json.dumps(outcome)
    for entry in (bound['frozenJournal'], bound['controlResult']):
        assert entry['sha256'] in json.dumps(review) and entry['sha256'] in json.dumps(outcome)
    assert bound['actualReview']['sha256'] in json.dumps(outcome)

    raw = load(B / 'command-existing-tests/raw.json')
    assert raw['numTotalTests'] == raw['numPassedTests'] == 16 and raw['numFailedTests'] == 0
    assert raw['numPendingTests'] == raw['numTodoTests'] == 0 and raw['success'] is True
    identities = [(f['name'], a['fullName']) for f in raw['testResults'] for a in f['assertionResults']]
    assert len(identities) == len(set(identities)) == 16
    assert all(a['status'] == 'passed' for f in raw['testResults'] for a in f['assertionResults'])

    control = load(FIXED['controlResult'])
    assert control['allOriginalBytesRestored'] is True and control['parentUnchanged'] is True
    children = control['children']
    assert len(children) == 7 and tuple(child['phase'] for child in children) == CONTROL_PHASES
    assert control['nativeBefore'] == control['nativeAfter']
    assert not (C / 'ACTIVE.json').exists() and not (C / 'HALTED.json').exists()
    for child in children:
        expected = 1 if child['phase'] in ('mutant-receipt', 'mutant-schemas') else 0
        assert child['exit'] == child['expectedExit'] == expected
        assert child['signalsOtherThanZeroSent'] is False and child['ownedGroupProbes'][-1]['absentByESRCH'] is True
        assert load(C / child['phase'] / 'result.json') == child
    # The earlier literal-passthrough attempt remains halted, never silently restored or upgraded.
    assert (FAILED / 'ACTIVE.json').is_file() and (FAILED / 'HALTED.json').is_file()
    assert not (FAILED / 'result.json').exists()
    failed_children = [load(FAILED / phase / 'result.json') for phase in FAILED_PHASES]
    assert [child['phase'] for child in failed_children] == list(FAILED_PHASES)
    assert [child['exit'] for child in failed_children] == [0, 0, 2]
    assert failed_children[-1]['expectedExit'] == 0
    assert all(child['signalsOtherThanZeroSent'] is False and child['ownedGroupProbes'][-1]['absentByESRCH'] is True for child in failed_children)

    private = bindings['privateManifests']
    for entry in private: verified(entry)
    roles = [entry['role'] for entry in private]
    assert all(roles.count(role) == 1 for role in ('tracked', 'compiled', 'pages', 'physical', 'failedControlIndex'))
    manifest_paths = {Path(entry['path']) for entry in private}
    assert B / 'original-tracked-files.json' in manifest_paths and B / 'original-dist-files.json' in manifest_paths
    for role, count in (('tracked', 8751), ('compiled', 4529)):
        manifest = load(next(entry['path'] for entry in private if entry['role'] == role))
        assert len(manifest) == count
        for row in manifest:
            path = R / row['path']; actual = pin(path)
            assert actual['bytes'] == row['bytes'] and actual['sha256'] == row['sha256']
            assert stat.S_IMODE(path.stat().st_mode) == row['mode']
    for entry in bindings['curatedInputs']: verified(entry)
    runtime = bindings['runtime']
    assert all(isinstance(runtime[k], str) and runtime[k] for k in ('node', 'pnpm', 'os', 'arch'))
    assert runtime['arch'] in ('arm64', 'x64')
    assert git('rev-parse', 'HEAD') == SOURCE and git('branch', '--show-current') == BRANCH
    assert git('status', '--porcelain', '--untracked-files=all') == ''
    assert not Q.exists() and not Q.is_symlink() and Q.parent.resolve() == R.resolve() / 'qualification'

    selected = {}; private_refs = {entry['path']: entry for entry in private}
    def add(path, required=True):
        path = Path(path)
        if not path.exists():
            assert not required, str(path)
            return
        entry = pin(path)
        assert '.git' not in path.parts and 'node_modules' not in path.parts
        assert not re.search(r'(\.pem|\.key|\.p12|\.amcvault)$|^\.env', path.name)
        assert not path.is_relative_to(R), 'Do not copy product or fixture source bodies'
        excluded = path in manifest_paths or path.name in MANIFEST_NAMES or 'runtime-artifact-index' in path.name
        if excluded or entry['bytes'] > CAP:
            private_refs.setdefault(str(path), entry)
        else:
            selected[str(path)] = (entry, safe_body(path.read_bytes()))
    for path in FIXED.values(): add(path)
    add(Path(__file__))
    for entry in bindings['curatedInputs']: add(entry['path'])
    # No traversal into homes/stores/tmp/pages/copies/mutant-inputs or dependencies.
    for parent in (B, C, FAILED):
        for path in sorted(parent.iterdir()):
            if path.is_file() and path.suffix in ('.json', '.jsonl', '.md', '.log'): add(path)
    for row in rows:
        directory = B / ('command-' + row['phase'])
        for name in ('command.json', 'stdout-stderr.log', 'owned-process.json', 'owned-group-after-exit.json', 'raw.json', 'observer.json'):
            add(directory / name, required=name not in ('raw.json', 'observer.json'))
    for parent, cases in ((C, children), (FAILED, failed_children)):
        for child in cases:
            for name in ('launch.json', 'result.json', 'stdout.log', 'stderr.log'): add(parent / child['phase'] / name)
    for entry in private_refs.values(): verified(entry)
    commands = [{key: row[key] for key in ('cmd', 'exit', 'durationMs')} for row in rows]
    commands += [{'cmd': shlex.join(child['argv']), 'exit': child['exit'], 'durationMs': child['durationMs']} for child in children + failed_children]
    child_codes = [{'phase': child['phase'], 'exit': child['exit']} for child in children]
    readme = f'''# P1-01 bounded qualification — 15 October 2026

Measured source is {SOURCE}, production anchor {PRODUCTION}. The two unchanged original files passed 16/16 registered tests. Only those 16 tests populate this receipt. Separately, the generator checked 38 schemas and 75 direct parity fixtures; nine other A4 record/trust JSON files are outside that layout. Three private Node probe modes check literal vectors, one authorized receipt's unknown top-level member, and current publication bytes/markers. These are not additional registered tests or permanent regression coverage.

The closed root journal retains {len(rows)} command records, including these nonzero rows: {json.dumps(nonzero)}. Quality findings remain unwaived. The separate typed stripping control retains seven child records: {json.dumps(child_codes)}. They repeat receipt/schema checks in a private physical copy, including compilation and two expected negative checks, without regeneration. Their actual restoration and failure attribution remain in the result, audit and outcome. Nested child records and their parent wrapper row are not separate top-level runs.

The v4 control required real TypeScript compilation to exit 0. It retained the exact known thin compiler kernel output (SHA-256 prefix 7960e3a), then restored the accepted kernel bytes (SHA-256 prefix 501cb876) before the probes. The receipt/schema checks exercise direct compiled contract modules with that kernel held constant. This is not a fresh full mutant build or proof of a mutated bundled-kernel route.

The earlier literal passthrough attempt remains halted and preserved. Its actual children exited 0, 0 and 2: real TypeScript compilation reported TS2339 before either mutant negative check or restoration. It is a failed control attempt, not a product failure or successful sensitivity proof. The later stripping control does not close the exact literal-passthrough specification criterion.

Required permanent tests/contracts files remain absent. Shape parity does not verify lifecycle semantics, provenance authority, trust admission or truth. Publication byte/HTML marker checks do not establish full HTML equivalence or deployed HTTP availability. Evidence exports omit a portable hash preimage. Full suite, coverage, Node24, hosted CI, release/pack, external identity, formal dependency acceptance and tracker Done remain unqualified. Shared A4/index ownership, paused work and pending transfers remain. Source, compiled, Pages, physical and failed-attempt indices stay private, unsplit hash references. Formal acceptance is false.
'''
    summary = {'key': 'P1-01', 'source': SOURCE, 'productionSource': PRODUCTION,
        'primaryTests': {'total': 16, 'passed': 16, 'failed': 0, 'skipped': 0},
        'separateCounts': {'schemas': 38, 'parityFixtures': 75, 'outsideParityJson': 9, 'rootProbeModes': 3,
            'rootCommandRecords': len(rows), 'stripControlChildRecords': len(children), 'failedPassthroughChildRecords': len(failed_children)},
        'formalAcceptanceClosed': False, 'originalCaseIdentities': identities}
    # Freeze and validate EVERY planned output body before creating Q.
    # Later I/O errors can still leave partial output; no cleanup/retry is attempted.
    planned = {}; copied = []
    def plan(name, data):
        assert name not in planned
        planned[name] = safe_body(data)
    for number, (source, (entry, data)) in enumerate(sorted(selected.items())):
        label = re.sub(r'[^A-Za-z0-9._-]', '_', Path(source).name)
        name = 'evidence/' + str(number).zfill(3) + '-' + label
        plan(name, data); copied.append({'source': entry, 'copiedPath': name, 'sha256': entry['sha256']})
    plan('private-references.json', encoded({'copiedSources': copied, 'privateOnlyUnsplit': list(private_refs.values()),
        'finalBindings': bound, 'runtime': runtime, 'formalAcceptanceClosed': False}))
    plan('scope-summary.json', encoded(summary))
    plan('README.md', safe_body(readme.encode()))
    receipt = {'schemaVersion': 1, 'key': 'P1-01', 'date': '2026-10-15', 'commit': SOURCE, 'branch': BRANCH,
        **{key: runtime[key] for key in ('node', 'pnpm', 'os', 'arch')}, 'commands': commands,
        'tests': summary['primaryTests'], 'artifacts': [], 'notes': readme}
    receipt['artifacts'] = [{'path': name, 'sha256': hashlib.sha256(data).hexdigest()}
        for name, data in sorted(planned.items())]
    plan('receipt.json', encoded(receipt))
    Q.mkdir(); (Q / 'evidence').mkdir()
    for name, data in sorted(planned.items()):
        with (Q / name).open('xb') as stream: stream.write(data)
        assert (Q / name).read_bytes() == data
    assert git('rev-parse', 'HEAD') == SOURCE
    assert all(line.startswith('?? qualification/2026-10-15-P1-01/') for line in git('status', '--porcelain', '--untracked-files=all').splitlines())
    print(json.dumps({'qualification': str(Q), 'files': len(planned),
        'receipt': pin(Q / 'receipt.json'), 'formalAcceptanceClosed': False}))


if __name__ == '__main__':
    main()
