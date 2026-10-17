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
FINAL_BINDINGS = {'privateManifests': [{'path': '/private/tmp/p1-01-qualification-20261015/original-tracked-files.json', 'bytes': 1432354, 'sha256': '4e9cb8099bb2faab68082a7ee231970f6c2741319dfa36f0f902b238f2b1176a', 'role': 'tracked'}, {'path': '/private/tmp/p1-01-qualification-20261015/original-dist-files.json', 'bytes': 656697, 'sha256': '2af55d06288b5b6046e7acb8c819dc8b271e3a035190e14e61460c50f59ee1d2', 'role': 'compiled'}, {'path': '/private/tmp/p1-01-qualification-20261015/pages-output-files.json', 'bytes': 1037058, 'sha256': '8d841f01c1a3b7e497fabcce36d64d7e6ced6055c80556625c30986f77694ba4', 'role': 'pages'}, {'path': '/private/tmp/p1-01-source-strip-control-20261015/physical-manifest.json', 'bytes': 2646294, 'sha256': 'a98f799f66118fd8296606f80493ce54a83e465ed626c69f9a032049ff49b0c8', 'role': 'physical'}, {'path': '/private/tmp/p1-01-literal-control-failed-artifact-index-20261015.json', 'bytes': 3341530, 'sha256': 'cf225683857de5dd6a47578dab5b8173b0f638c09bc6928e65cdbaf60c9b985d', 'role': 'failedControlIndex'}, {'path': '/private/tmp/p1-01-strip-control-runtime-artifact-index-20261015.json', 'bytes': 3426456, 'sha256': '971676ba19e3b83c53e456f521642d8d8d4df00290b53be6ba82d111fcda2111', 'role': 'stripRuntimeIndex'}, {'path': '/private/tmp/p1-01-root-runtime-artifact-index-20261015.json', 'bytes': 19971, 'sha256': 'e59a161085b19acb37283ae88b849aa39309228f1a232ab93c39bc0a1b386f4e', 'role': 'rootRuntimeIndex'}, {'path': '/private/tmp/p1-01-source-strip-control-20261015/compiler-kernel-thin.js', 'bytes': 1003, 'sha256': '7960e3a179f94a8ed511eb24176d49da67e8e162919e71878b4cc14c514e14d1', 'role': 'retainedThinCompilerKernel'}], 'curatedInputs': [{'path': '/private/tmp/amc-dependabot-wip-decision-20261015.md', 'bytes': 1019, 'sha256': '893fc80ad0597a95d83b5c996aa2ec1f82973fb0c4cec3043fb97c452701b920'}, {'path': '/private/tmp/amc-dependabot-wip-decision-append-20261015.json', 'bytes': 751, 'sha256': 'e69a7d6b6bafd45387574904e2e4383387090d7dffc8afd291c8189e6d6a8b42'}, {'path': '/private/tmp/amc-next-unblocked-user-wip-routing-20261015.json', 'bytes': 18177, 'sha256': '14cbe20a63b3e7e01e672d0c8bdd0c73f6c433703d98dd2980728001f925875f'}, {'path': '/private/tmp/amc-next-unblocked-user-wip-routing-20261015.md', 'bytes': 4405, 'sha256': '5f2d6b061129bfa1b2c6f703b0f446bc99e82982cde44c200815e0a37e0e0b15'}, {'path': '/private/tmp/amc-wip-after-dependabot-exclusion-readonly-20261015.json', 'bytes': 20710, 'sha256': '3856facfad75ab3600dc352e8e951a9607d06d3c29d5e607c33bf09a7ae906cd'}, {'path': '/private/tmp/amc-wip-after-dependabot-exclusion-readonly-20261015.md', 'bytes': 3011, 'sha256': '7582380d1d23c6c2fd54c1ab7ec982d26d51521dd1d23bebbb9b543393f6a80a'}, {'path': '/private/tmp/p1-01-build-canonical-packet-prepared-20261015.py', 'bytes': 14982, 'sha256': '9f500ed7f3f18dc1df733dc342c1a44e5a6356c6574ebb33cf9362f2143ad7ae'}, {'path': '/private/tmp/p1-01-build-canonical-packet-v2-prepared-20261015.py', 'bytes': 15566, 'sha256': 'e2109ad1fdfd6cabbcd75d53a1b3645819ce5849e5cdd5833f2161dc2a835a79'}, {'path': '/private/tmp/p1-01-canonical-builder-preparation-20261015.json', 'bytes': 4241, 'sha256': '01304b53faa7a51480247bcb2ffdbf3ff62dc55420243040448ea860fc5c517a'}, {'path': '/private/tmp/p1-01-canonical-builder-preparation-20261015.md', 'bytes': 1616, 'sha256': '369457de63998fa99120fa676cd2002b5c6f35a07013763ed68d6bbee695472d'}, {'path': '/private/tmp/p1-01-canonical-builder-prepared-static-review-20261015.json', 'bytes': 5822, 'sha256': 'e574c095cb9ca73854544a447e5309c045ca915503353007204899bf50f44494'}, {'path': '/private/tmp/p1-01-canonical-builder-prepared-static-review-20261015.md', 'bytes': 1418, 'sha256': '49f1ed3d64987f04509fd63bbb1e4487d6eac5a1693d4500dc535331b44f889c'}, {'path': '/private/tmp/p1-01-canonical-builder-v2-preparation-20261015.diff', 'bytes': 5771, 'sha256': '263d15607c504f314a799b4d61c410d8dba40f068772cb50c6331d4198332772'}, {'path': '/private/tmp/p1-01-canonical-builder-v2-preparation-20261015.json', 'bytes': 2242, 'sha256': 'a281d481f79a41017aade3e6b30b017e188228eb8ccc88b6e7db10a7558c6a01'}, {'path': '/private/tmp/p1-01-contract-probe-prepared-20261015.mjs', 'bytes': 8591, 'sha256': 'c5c395f95edcafa17d43280a2ffbfec602b2245a927997fbcc063465fc245a1a'}, {'path': '/private/tmp/p1-01-contract-probe-v2-prepared-20261015.mjs', 'bytes': 8360, 'sha256': '0b09ff2ad62cd487bd1cd997024f2464e89de8c4130d400d181fe3658bc093ab'}, {'path': '/private/tmp/p1-01-existing-runtime-preliminary-review-20261015.json', 'bytes': 33955, 'sha256': '10986f30d30af13e1a9246118470812ca0368f95d4603dd7b7893ab26446e7ca'}, {'path': '/private/tmp/p1-01-existing-runtime-preliminary-review-20261015.md', 'bytes': 3431, 'sha256': 'dd2203336a3a09bdcb797420e2a53bba4768e7e2b6f4ad08370835a3e1d3b4b7'}, {'path': '/private/tmp/p1-01-final-command-wrapper-prepared-20261015.py', 'bytes': 10497, 'sha256': 'b11d50594ab53fdf0703c91974f5362bc9bdefd53d17503c8055f50b0e494f77'}, {'path': '/private/tmp/p1-01-final-wrapper-preparation-20261015.json', 'bytes': 483, 'sha256': '1fe4b8e17b3333f10ef8fbc3c841fb0994b3acdb583435939938eb6def2813e5'}, {'path': '/private/tmp/p1-01-literal-control-failure-review-20261015.json', 'bytes': 1940, 'sha256': 'ae1acee9963c0be95b324c479c15daf1c2bc9e9d6ddd51fe0df660e40f7d8761'}, {'path': '/private/tmp/p1-01-readonly-readiness-20261015.json', 'bytes': 72936, 'sha256': '8bb6a88dab9f30be9132a2095558332dfee54de823e666fabebbfccd5209163d'}, {'path': '/private/tmp/p1-01-readonly-readiness-20261015.md', 'bytes': 3211, 'sha256': '0a52318b45ec3e7d86a81b7d0898271d7ece10566b9bc57b6f84ec229a1f55b5'}, {'path': '/private/tmp/p1-01-run-command-prepared-20261015.py', 'bytes': 10488, 'sha256': '4e3eac5c592c708ebce09ff8aa0814b0e5d7da4b2ada64b4aad1733fc1106736'}, {'path': '/private/tmp/p1-01-source-control-prepared-20261015.py', 'bytes': 9918, 'sha256': '4369a2058ecf174edd74036ec322180257aefbd62a0d4ec1df8340df70b8a0c0'}, {'path': '/private/tmp/p1-01-source-control-v1-static-review-20261015.json', 'bytes': 5304, 'sha256': '1fa8cb654fc8430d013755e1402730ffd0b87a8fff5a92c1baff728de8e20edc'}, {'path': '/private/tmp/p1-01-source-control-v1-static-review-20261015.md', 'bytes': 1440, 'sha256': '8a46dbf819296b143b009f740efaa09fa5a51c03d932a448af0d5bc6734b2c55'}, {'path': '/private/tmp/p1-01-source-control-v2-preparation-20261015.json', 'bytes': 584, 'sha256': '3f3597d7a524558b65630e6633aee1092bd740c49cf1c6abd101b900504e7614'}, {'path': '/private/tmp/p1-01-source-control-v2-prepared-20261015.py', 'bytes': 9978, 'sha256': 'b5985003cd2d469ceb6800b84938e3389a09664414d35fc46a2425d9b8511205'}, {'path': '/private/tmp/p1-01-source-control-v2-static-review-20261015.json', 'bytes': 2985, 'sha256': 'c388fbf595bd56f31f2bc548015aa51f2e4127fe1c83c4891f9953754643d822'}, {'path': '/private/tmp/p1-01-source-control-v2-static-review-20261015.md', 'bytes': 1117, 'sha256': '489d9db2b34607559cbc15b28700741e4bde32981bd405b81f10d45a6faccd91'}, {'path': '/private/tmp/p1-01-source-strip-control-v3-preparation-20261015.json', 'bytes': 807, 'sha256': '6f54c939ced5aa8e96c7e04f6e66f53665758d04a488f0c9a8fb3f7d45a684e2'}, {'path': '/private/tmp/p1-01-source-strip-control-v3-prepared-20261015.py', 'bytes': 10086, 'sha256': '2bfcf3374a0d3cd26388d334c887c27cae0c2957ff7d09a9b66eeba2c76fa5b5'}, {'path': '/private/tmp/p1-01-source-strip-control-v3-static-review-20261015.json', 'bytes': 3752, 'sha256': '176a627d6fc7f4a5328b6cb7052c8627622e14fc29688a46a8eda8cb70db5412'}, {'path': '/private/tmp/p1-01-source-strip-control-v3-static-review-20261015.md', 'bytes': 1247, 'sha256': '1feafa47e9232a637acfd1cd2ca103b10cf1d91708734405c6e21c4c67d17d45'}, {'path': '/private/tmp/p1-01-source-strip-control-v4-preparation-20261015.json', 'bytes': 710, 'sha256': '529ac4187cf125cc513d04514922283ea9f0b0abf0e2d8a1daf93ac526e5196a'}, {'path': '/private/tmp/p1-01-source-strip-control-v4-prepared-20261015.py', 'bytes': 11064, 'sha256': '01931c4fd626984a21946ed5276df8eed94d7ab716052509c9f67dea7ea4cb59'}, {'path': '/private/tmp/p1-01-source-strip-control-v4-static-review-20261015.json', 'bytes': 5269, 'sha256': '034cc187390e1c026f1e8c9d29c7cc2ed337c8a0e78cbd0a75fe72b07f63fdef'}, {'path': '/private/tmp/p1-01-source-strip-control-v4-static-review-20261015.md', 'bytes': 1254, 'sha256': '78e04d9b767e35fbdcacd355713824809ccbecaac0ccad822872b37e4a7f464d'}, {'path': '/private/tmp/p1-01-supplemental-coverage-readonly-review-20261015.json', 'bytes': 21265, 'sha256': '569d8bbe12d4b660d4e55b39be17705a651ca13d776957c0bfeb50b220e88978'}, {'path': '/private/tmp/p1-01-supplemental-coverage-readonly-review-20261015.md', 'bytes': 2327, 'sha256': '9d33e83eddd640f2c6a8a093811028cb4849785a41448591c6855210046fe4f0'}, {'path': '/private/tmp/p1-01-wrapper-static-review-20261015.json', 'bytes': 1901, 'sha256': 'c9cf7c1da4b3cfa1c4c17d922bf6084c0a9a9f82963f3c22104b6bc8f35cbdf3'}, {'path': '/private/tmp/p1-01-wrapper-static-review-20261015.md', 'bytes': 1473, 'sha256': '16b36d27ecc52962b1f04ff189feb83f4e68da9cd844b1455fab251deede571a'}, {'path': '/private/tmp/p1-01-bounded-independent-actual-review-20261015.md', 'bytes': 4395, 'sha256': 'bd9f92796a669691f76b5400df95f9ce189cb71ccaa04fc9de4fcd07807d75ff'}, {'path': '/private/tmp/p1-01-canonical-input-selection-prepared-20261015.json', 'bytes': 10781, 'sha256': 'f444e8f035dcce0a30459a52bf7562cd00cd295d2b40bff06e369228938c0e25'}], 'runtime': {'node': 'v22.23.3', 'pnpm': '10.33.0', 'os': 'Darwin 25.6.0', 'arch': 'arm64'}, 'nonzeroRootExits': {'duplicates': 1, 'dead-code': 1, 'source-control': 1}, 'frozenJournal': {'path': '/private/tmp/p1-01-qualification-20261015/commands-frozen.jsonl', 'bytes': 29025, 'sha256': '18d349e1868c2fe83a78dfbe31bfb81f3bfe9ed4c857bb5b598c22572cc07510'}, 'closedFlag': {'path': '/private/tmp/p1-01-qualification-20261015/commands-closed.json', 'bytes': 500, 'sha256': 'ecef558460558ca8f6941555cbb5f8db7a332c73a74d509a26f5bb639c2ee12a'}, 'controlResult': {'path': '/private/tmp/p1-01-source-strip-control-20261015/result.json', 'bytes': 5188, 'sha256': '75da6150f94040f1bdeda3ce71626e119c985cca77394ad93b38ff9a1e2186dc'}, 'actualReview': {'path': '/private/tmp/p1-01-bounded-independent-actual-review-20261015.json', 'bytes': 26388, 'sha256': 'ef87b3461d584dd71e8c8886728f43545fd636186c495e257ed0c3453ab62bc1'}, 'rootOutcome': {'path': '/private/tmp/p1-01-root-outcome-20261015.json', 'bytes': 5026, 'sha256': 'c71d6c87a3402c9801490685494747297a413a00251c3a1748c21c6fcd904216'}}
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
