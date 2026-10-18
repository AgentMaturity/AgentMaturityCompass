"""UNEXECUTED P0-11 canonical builder preparation, derived from reviewed P045v2.
Root must author and review a NEW bound version after actual final review/outcome.
No final pins/runtime/curation are invented. No product/check is run by builder.
"""
from pathlib import Path
import collections
import hashlib
import json
import os
import stat
import subprocess

R = Path('/Users/sid/.codex/worktrees/p0-11-qualification/AgentMaturityCompass')
B = Path('/private/tmp/p0-11-qualification-20261015')
C = Path('/private/tmp/p0-11-causal-qualification-20261015')
T = Path('/private/tmp')
Q = R / 'qualification/2026-10-15-P0-11'
SOURCE = 'fa3c3e5554f8a4013fb50cc373a4b5d644e6924e'
CODE = '58e91dcef111bf02f773dcbfd1921d428cf75e34'
MAX = 1048576
FREEZER = T / 'p0-11-freeze-qualified-evidence-v2-20261015.py'
FREEZER_SHA = '00c8fd2ef5d934aef19af621e45c07d6266a6bd6609a64a53b50f6ea5086e0fe'
EXPECTED = {'packet': {'path': '/private/tmp/p0-11-bounded-qualification-20261015.json', 'bytes': 70959, 'sha256': 'b6aa7d4281ea76cce222dc4186d985efb837936910bac1ae5783153f2bd8d26d'}, 'packetMarkdown': {'path': '/private/tmp/p0-11-bounded-qualification-20261015.md', 'bytes': 3853, 'sha256': '9e12c11b37e5f00598a8fd435ad318b701e94a8e1a78b8572f8e236c7cd93793'}, 'causal': {'path': '/private/tmp/p0-11-causal-qualification-20261015.json', 'bytes': 88229, 'sha256': '86a94bff3755d5856808fb5c0f7edfe7cbc21605355030a4e5eb6482678f4d17'}, 'causalMarkdown': {'path': '/private/tmp/p0-11-causal-qualification-20261015.md', 'bytes': 3958, 'sha256': 'd4677cdceea01637b2eab7ce1b313eacf21f1818a0818a057dafdb3b2e5e3754'}, 'index': {'path': '/private/tmp/p0-11-causal-qualification-20261015/runtime-artifact-index.json', 'bytes': 83753, 'sha256': 'cbb4b53af633b4879df157c1357df1c325310c64980f83cc7dd02f240ba874ed'}, 'review': {'path': '/private/tmp/p0-11-bounded-independent-review-20261015.json', 'bytes': 25410, 'sha256': 'a7f2f420e7b92a9030ebfff6efbdb56f21bb7b9d7b3286da83130adc6ae86a1d'}, 'reviewMarkdown': {'path': '/private/tmp/p0-11-bounded-independent-review-20261015.md', 'bytes': 3607, 'sha256': '686b6dd0c9023af386d95150f3f1b5c14b723b623f9a671a771eb0eb84ee174e'}, 'outcome': {'path': '/private/tmp/p0-11-root-bounded-outcome-20261015.json', 'bytes': 10705, 'sha256': 'de2b6cdd947be8551cc27b3c9c168bce5f91de91143192d8eaf51e75731ed034'}, 'freezerReview': {'path': '/private/tmp/p0-11-freezer-v2-static-review-20261015.json', 'bytes': 11714, 'sha256': '13487e2d64722a73ac5e6a0ff54f614937bba7b304138055a27e8c1e4deb88f8'}, 'nextReadiness': {'path': '/private/tmp/p0-41-readonly-readiness-20261015.json', 'bytes': 31386, 'sha256': 'd140b27cb51b6b6f30fb5bdec2a8ca9e8eacdf138c58e563866f5e217031ff83'}, 'nextReadinessMarkdown': {'path': '/private/tmp/p0-41-readonly-readiness-20261015.md', 'bytes': 3989, 'sha256': 'd644f6b9856c6359778cd5f9c37578764771e4bd44429c1434f74345f308a659'}, 'nextRouting': {'path': '/private/tmp/amc-next-after-p0-11-readonly-routing-20261015.json', 'bytes': 19261, 'sha256': '304e5211228163818bcda63f8a9583ebf8a19f47db290e04e52ea1abc66b7116'}, 'nextRoutingMarkdown': {'path': '/private/tmp/amc-next-after-p0-11-readonly-routing-20261015.md', 'bytes': 5042, 'sha256': 'e8227e6e11e174ca14994ceb0aee7d89027439c8ca14f87b9e1515ec75a62677'}}
RUNTIME = {'node': 'v22.23.3', 'pnpm': '10.33.0', 'os': 'Darwin 25.6.0', 'arch': 'arm64'}
CURATED_COMPACT_INPUTS = [{'path': '/private/tmp/p0-11-qualification-20261015/initial-preflight.json', 'bytes': 26306, 'sha256': '23f1964928e523777c6f61b1a733011318427abfcf2ad9b25c3703e20590cbba'}, {'path': '/private/tmp/p0-11-qualification-20261015/post-build-provenance.json', 'bytes': 1251, 'sha256': 'e984f1f5c1d819e86ad21d13d7d8378a9dc03a15389874fc30a29323781f73fb'}, {'path': '/private/tmp/p0-11-run-command-prepared-20261015.py', 'bytes': 10488, 'sha256': 'b28dec64355192e41615628c8219fe831b83a62f8ee709834844a962301e079a'}, {'path': '/private/tmp/p0-11-wrapper-static-review-20261015.json', 'bytes': 3720, 'sha256': '43390cccbc1f122267cd822f5f72b107759dc51fd66363636471605459006fcf'}, {'path': '/private/tmp/p0-11-wrapper-static-review-20261015.md', 'bytes': 2275, 'sha256': '9124f50fd6356f32c5be27cb6d89f416a91bd933e72d8b0613b5f9559e9055a4'}, {'path': '/private/tmp/p0-11-copy-helper-authoring-issue-20261015.json', 'bytes': 488, 'sha256': 'c9ba516b4082c5415977261f7693bc381e4dfcb46ec380e36621fbe4df4d55a8'}, {'path': '/private/tmp/p0-11-prepare-causal-copy-20261015.py', 'bytes': 12636, 'sha256': 'a34e4f0491272921aa871a8c04443a4711e46f198e61b9a5da3fd8ed324e18da'}, {'path': '/private/tmp/p0-11-freezer-v2-binding-note-20261015.json', 'bytes': 995, 'sha256': '7bcaa1d1b5da29eaf493a26694e9eb399d4bed2b4f60ed05b4dd95672ffaf75c'}, {'path': '/private/tmp/p0-11-freezer-v2-static-review-20261015.md', 'bytes': 4505, 'sha256': '9bc2c1209a3e6fb08a218e8ddbf4da8959462fa28c91041474b3b57c39bbcbb7'}, {'path': '/private/tmp/p0-11-canonical-builder-preparation-20261015.json', 'bytes': 5334, 'sha256': 'ad65048696f7385ac9fe33c55d4b806af5293bcd66589d9899b3a63b04ba62f5'}, {'path': '/private/tmp/p0-11-canonical-validation-helper-static-review-20261015.json', 'bytes': 3509, 'sha256': '93b9a6f5358b82cb9e1675e7199ff2b0748e99a55e98d0468c25b3a430fc8435'}, {'path': '/private/tmp/p0-11-canonical-validation-helper-static-review-20261015.md', 'bytes': 2945, 'sha256': '650aadaccc32cde6f119331929fa61009c1eb899fe4684b0dfd60d834a523cb6'}, {'path': '/private/tmp/p0-11-build-canonical-packet-prepared-20261015.py', 'bytes': 28675, 'sha256': '2d2e5dd9c63e14c3cf45d3fee975b339e0283c3ca5ab916877947b738dcdf6dd'}]
ADDITIONAL_PRIVATE_REFERENCES = [{'path': '/private/tmp/p0-11-bounded-qualification-20261015.json', 'bytes': 70959, 'sha256': 'b6aa7d4281ea76cce222dc4186d985efb837936910bac1ae5783153f2bd8d26d'}, {'path': '/private/tmp/p0-11-bounded-qualification-20261015.md', 'bytes': 3853, 'sha256': '9e12c11b37e5f00598a8fd435ad318b701e94a8e1a78b8572f8e236c7cd93793'}, {'path': '/private/tmp/p0-11-causal-qualification-20261015.json', 'bytes': 88229, 'sha256': '86a94bff3755d5856808fb5c0f7edfe7cbc21605355030a4e5eb6482678f4d17'}, {'path': '/private/tmp/p0-11-causal-qualification-20261015.md', 'bytes': 3958, 'sha256': 'd4677cdceea01637b2eab7ce1b313eacf21f1818a0818a057dafdb3b2e5e3754'}, {'path': '/private/tmp/p0-11-causal-qualification-20261015/runtime-artifact-index.json', 'bytes': 83753, 'sha256': 'cbb4b53af633b4879df157c1357df1c325310c64980f83cc7dd02f240ba874ed'}, {'path': '/private/tmp/p0-11-bounded-independent-review-20261015.json', 'bytes': 25410, 'sha256': 'a7f2f420e7b92a9030ebfff6efbdb56f21bb7b9d7b3286da83130adc6ae86a1d'}, {'path': '/private/tmp/p0-11-bounded-independent-review-20261015.md', 'bytes': 3607, 'sha256': '686b6dd0c9023af386d95150f3f1b5c14b723b623f9a671a771eb0eb84ee174e'}, {'path': '/private/tmp/p0-11-root-bounded-outcome-20261015.json', 'bytes': 10705, 'sha256': 'de2b6cdd947be8551cc27b3c9c168bce5f91de91143192d8eaf51e75731ed034'}, {'path': '/private/tmp/p0-11-freezer-v2-static-review-20261015.json', 'bytes': 11714, 'sha256': '13487e2d64722a73ac5e6a0ff54f614937bba7b304138055a27e8c1e4deb88f8'}, {'path': '/private/tmp/p0-41-readonly-readiness-20261015.json', 'bytes': 31386, 'sha256': 'd140b27cb51b6b6f30fb5bdec2a8ca9e8eacdf138c58e563866f5e217031ff83'}, {'path': '/private/tmp/p0-41-readonly-readiness-20261015.md', 'bytes': 3989, 'sha256': 'd644f6b9856c6359778cd5f9c37578764771e4bd44429c1434f74345f308a659'}, {'path': '/private/tmp/amc-next-after-p0-11-readonly-routing-20261015.json', 'bytes': 19261, 'sha256': '304e5211228163818bcda63f8a9583ebf8a19f47db290e04e52ea1abc66b7116'}, {'path': '/private/tmp/amc-next-after-p0-11-readonly-routing-20261015.md', 'bytes': 5042, 'sha256': 'e8227e6e11e174ca14994ceb0aee7d89027439c8ca14f87b9e1515ec75a62677'}, {'path': '/private/tmp/p0-11-qualification-20261015/initial-preflight.json', 'bytes': 26306, 'sha256': '23f1964928e523777c6f61b1a733011318427abfcf2ad9b25c3703e20590cbba'}, {'path': '/private/tmp/p0-11-qualification-20261015/post-build-provenance.json', 'bytes': 1251, 'sha256': 'e984f1f5c1d819e86ad21d13d7d8378a9dc03a15389874fc30a29323781f73fb'}, {'path': '/private/tmp/p0-11-run-command-prepared-20261015.py', 'bytes': 10488, 'sha256': 'b28dec64355192e41615628c8219fe831b83a62f8ee709834844a962301e079a'}, {'path': '/private/tmp/p0-11-wrapper-static-review-20261015.json', 'bytes': 3720, 'sha256': '43390cccbc1f122267cd822f5f72b107759dc51fd66363636471605459006fcf'}, {'path': '/private/tmp/p0-11-wrapper-static-review-20261015.md', 'bytes': 2275, 'sha256': '9124f50fd6356f32c5be27cb6d89f416a91bd933e72d8b0613b5f9559e9055a4'}, {'path': '/private/tmp/p0-11-copy-helper-authoring-issue-20261015.json', 'bytes': 488, 'sha256': 'c9ba516b4082c5415977261f7693bc381e4dfcb46ec380e36621fbe4df4d55a8'}, {'path': '/private/tmp/p0-11-prepare-causal-copy-20261015.py', 'bytes': 12636, 'sha256': 'a34e4f0491272921aa871a8c04443a4711e46f198e61b9a5da3fd8ed324e18da'}, {'path': '/private/tmp/p0-11-freezer-v2-binding-note-20261015.json', 'bytes': 995, 'sha256': '7bcaa1d1b5da29eaf493a26694e9eb399d4bed2b4f60ed05b4dd95672ffaf75c'}, {'path': '/private/tmp/p0-11-freezer-v2-static-review-20261015.md', 'bytes': 4505, 'sha256': '9bc2c1209a3e6fb08a218e8ddbf4da8959462fa28c91041474b3b57c39bbcbb7'}, {'path': '/private/tmp/p0-11-canonical-builder-preparation-20261015.json', 'bytes': 5334, 'sha256': 'ad65048696f7385ac9fe33c55d4b806af5293bcd66589d9899b3a63b04ba62f5'}, {'path': '/private/tmp/p0-11-canonical-validation-helper-static-review-20261015.json', 'bytes': 3509, 'sha256': '93b9a6f5358b82cb9e1675e7199ff2b0748e99a55e98d0468c25b3a430fc8435'}, {'path': '/private/tmp/p0-11-canonical-validation-helper-static-review-20261015.md', 'bytes': 2945, 'sha256': '650aadaccc32cde6f119331929fa61009c1eb899fe4684b0dfd60d834a523cb6'}, {'path': '/private/tmp/p0-11-build-canonical-packet-prepared-20261015.py', 'bytes': 28675, 'sha256': '2d2e5dd9c63e14c3cf45d3fee975b339e0283c3ca5ab916877947b738dcdf6dd'}, {'path': '/private/tmp/p0-11-root-runtime-attribution-20261015.json', 'bytes': 920, 'sha256': '9a2c12d209e85a4d5f1a72997cce3fd2fb21a745653797be3156daf5c4da6f32'}, {'path': '/private/tmp/p0-11-run-final-command-20261015.py', 'bytes': 1148, 'sha256': 'bd36de3d82cb46994f05df616e9e93db44d06d3b30fc78693f4586314f9e64f9'}, {'path': '/private/tmp/p0-11-append-canonical-validation-prepared-20261015.py', 'bytes': 4356, 'sha256': '6c369654a0eba1cb7ed2f2e58e17d82959c8de6c887a3100372725a714484a5a'}]
C1_ID = 'C1-map-missing-path-fail-open'
C2_ID = 'C2-tool-recorder-error-propagates'
L1_ID = 'L1-optional-historical-literal-whole-branch-removal'
CONTROL_CORPUS = {C1_ID: 'map', C2_ID: 'recording', L1_ID: 'map'}
FIXTURES = {
 'fixture-valid': ('valid.json', ['check-threat-model: ok']),
 'fixture-missing-path': ('missing-path.json', ['channel network-egress', 'src/tools/noSuchFile.ts does not exist']),
 'fixture-missing-symbol': ('missing-symbol.json', ['channel network-egress', 'hostAllowedX does not occur in src/gateway/server.ts']),
 'fixture-bad-owner': ('bad-owner.json', ['channel network-egress', 'P9-99']),
 'fixture-orphan-failure-row': ('orphan-failure-row.json', ['failure recorder-fails-after-effect', 'names no test and no owner'])
}
ROOT_ROLES = ['install', 'build', 'fingerprint', 'initial-freeze', 'original-map', 'original-telemetry',
    'original-preview', 'original-recording', 'threat-model', 'fixture-valid', 'fixture-missing-path',
    'fixture-missing-symbol', 'fixture-bad-owner', 'fixture-orphan-failure-row',
    'no-fabrication', 'architecture', 'docs', 'counts', 'pre-causal-freeze', 'final-freeze']


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
    need(all(isinstance(row, dict) and set(row) == {'path', 'bytes', 'sha256'} for row in EXPECTED.values()),
         'Prepared only: final packet/index/review/outcome/readiness pins remain unset')
    need(isinstance(RUNTIME, dict) and set(RUNTIME) == {'node', 'pnpm', 'os', 'arch'}, 'Actual runtime missing')
    need(isinstance(CURATED_COMPACT_INPUTS, list) and CURATED_COMPACT_INPUTS
         and isinstance(ADDITIONAL_PRIVATE_REFERENCES, list), 'Final explicit compact/private curation missing')
    need(not Q.exists(), 'Q exists; no overwrite or automatic resume')
    for row in list(EXPECTED.values()) + CURATED_COMPACT_INPUTS + ADDITIONAL_PRIVATE_REFERENCES:
        verify(row)
    packet, causal, index = [read(EXPECTED[key]['path']) for key in ['packet', 'causal', 'index']]
    review, outcome = read(EXPECTED['review']['path']), read(EXPECTED['outcome']['path'])
    need(packet['source'] == causal['source'] == index['source'] == SOURCE
         and packet['codeSource'] == causal['codeSource'] == index['codeSource'] == CODE, 'Source differs')
    need(packet['formalAcceptanceClosed'] is causal['formalAcceptanceClosed'] is outcome['formalAcceptanceClosed'] is False
         and packet['state'] == causal['state'] == 'complete-pending-independent-review', 'Formal/measured boundary differs')
    need(contains_pin(packet, EXPECTED['index']) and contains_pin(packet, EXPECTED['causal'])
         and contains_pin(causal, EXPECTED['index']), 'Packet/index/causal binding differs')
    need(contains_pin(review, EXPECTED['packet']) and contains_pin(review, EXPECTED['index']), 'Final review does not bind packet/index')
    blocking = [key for key in ['blockingFindings', 'blockingPacketFindings'] if key in review]
    need(blocking and all(isinstance(review[key], list) and review[key] == [] for key in blocking)
         and review['allReadsFinished'] is True and review['formalAcceptanceClosed'] is False,
         'Explicit blocking disposition absent; informational findings remain preserved')
    need(contains_pin(outcome, EXPECTED['packet']) and contains_pin(outcome, EXPECTED['review'])
         and not contains_pin(outcome, pin(Path(__file__).resolve())), 'Root outcome binding/hash cycle')
    need(index['artifactCount'] == len(index['artifacts']), 'Index count differs')
    indexed = {}
    for row in index['artifacts']:
        verify(row)
        need(row['path'] not in indexed, 'Duplicate runtime reference')
        indexed[row['path']] = row
    manifests = index['privateOnlyManifests']
    need(len(manifests) == 3 and {Path(row['path']).name for row in manifests}
         == {'source-manifest.json', 'compiled-manifest.json', 'physical-copy-manifest.json'}, 'Three private manifests required')
    for row in manifests:
        verify(row)
    need(next(row for row in manifests if Path(row['path']).name == 'physical-copy-manifest.json')['bytes'] > MAX,
         'Physical manifest remains private and unsplit')
    original = packet['originalCorpora']
    need(original['source'] == SOURCE and original['codeSource'] == CODE
         and original['distinctOriginalFileTitleRegistrations'] == 21 and original['originalFileCount'] == 4
         and original['primaryDefinitionsAcrossTwoSeparateRuns'] == 9 and original['adjacentDefinitionsAcrossTwoSeparateRuns'] == 12
         and original['single21CaseRunClaimed'] is False and original['single9CaseRunClaimed'] is False
         and [(run['corpus'], run['registered']) for run in original['separateOriginalRuns']]
             == [('map', 7), ('telemetry', 2), ('preview', 5), ('recording', 7)]
         and all(run['registered'] == run['passed'] and run['failed'] == run['pending'] == run['todo'] == 0
                 for run in original['separateOriginalRuns']), 'Four separate original results differ')
    primary = packet['primaryOriginalTestsAcrossTwoRuns']
    need(primary == {'total': 9, 'passed': 9, 'failed': 0, 'skipped': 0, 'pending': 0, 'todo': 0, 'single9CaseRunClaimed': False},
         'Primary nine is an aggregate of two original runs')
    commands, contract = packet['rootCommands'], packet['rootJournalContract']
    need(packet['rootCommandCount'] == len(commands) == len(contract) == len({c['phase'] for c in commands}) == 20
         and sorted(c['role'] for c in contract) == sorted(ROOT_ROLES)
         and commands[-1]['phase'] == contract[-1]['phase'] == 'final-normal-freeze', 'Twenty-command contract differs')
    negative_roles = set(FIXTURES) - {'fixture-valid'}
    for command, expected in zip(commands, contract):
        argv, role = command['ownedProcess']['argv'], expected['role']
        required_exit = 1 if role in negative_roles else 0
        need(command['head'] == SOURCE and command['phase'] == expected['phase']
             and argv == expected['argv'] and command['exit'] == expected['expectedExit'] == required_exit,
             'Only four exact negative checker fixtures may exit1; every guard must exit0')
        if role in FIXTURES:
            filename, diagnostics = FIXTURES[role]
            need(len(argv) == 3 and argv[0] in ['node', '/opt/homebrew/opt/node@22/bin/node', '/opt/homebrew/Cellar/node@22/22.23.3_2/bin/node']
                 and argv[1] in ['scripts/check-threat-model.mjs', str(R / 'scripts/check-threat-model.mjs')]
                 and argv[2] in ['tests/fixtures/threat-model/' + filename, str(R / 'tests/fixtures/threat-model' / filename)]
                 and all(text in Path(command['log']).read_text(errors='replace') for text in diagnostics), 'Exact fixture argv/diagnostics differ')
    matrices, phases = causal['controls'], []
    need([matrix['control'] for matrix in matrices] == [C1_ID, C2_ID, L1_ID], 'Three exact controls required')
    for matrix in matrices:
        need(matrix['corpusKey'] == CONTROL_CORPUS[matrix['control']]
             and [phase['stage'] for phase in matrix['phases']] == ['baseline', 'mutant', 'restored'], 'Matrix corpus/order differs')
        phases.extend(matrix['phases'])
        for phase in matrix['phases']:
            result = phase['classification']
            need(result['total'] == 7 and result['pending'] == result['todo'] == 0
                 and result['passed'] + result['failed'] == 7, 'Seven-case phase incomplete')
            if phase['stage'] != 'mutant':
                need(result['passed'] == 7 and result['failed'] == 0 and result['classification'] == 'passed', 'Baseline/restored not green')
            elif not result['failed']:
                need(result['classification'] == 'survivor', 'Measured survivor absent')
            else:
                nonassertion = any(failure['failureKind'] != 'body-assertion' for failure in result['failures'])
                need(result['classification'] == ('body-failures-observed' if nonassertion else 'body-assertion-failures-observed'), 'Failure classification differs')
                for failure in result['failures']:
                    if failure['failureKind'] == 'body-assertion':
                        need(all(error.get('name') == 'AssertionError' for error in failure['observerErrors']), 'Assertion kind differs')
                    else:
                        need(matrix['control'] == C2_ID and failure['failureKind'] == 'exact-genuine-recorder-error-propagation'
                             and failure['file'] == 'tests/toolEvidenceRecording.test.ts'
                             and failure['fullName'].endswith("returns the tool's real outcome when the recorder throws")
                             and all(error.get('name') == 'Error' and error.get('message') == 'the evidence store is unreachable'
                                     for error in failure['observerErrors']), 'Unexpected genuine Error')
        expected = 'survivor' if matrix['phases'][1]['classification']['failed'] == 0 else 'body-error-or-assertion-sensitivity-awaiting-root-attribution'
        need(matrix['verdict'] == expected, 'Actual matrix verdict differs')
    totals = {key: sum(phase['classification'][key] for phase in phases) for key in ['total', 'passed', 'failed', 'pending', 'todo']}
    need(len(phases) == packet['separateCausalCommandCount'] == len(causal['causalCommandRecords']) == 9
         and totals['total'] == 63 and totals['pending'] == totals['todo'] == 0
         and totals == causal['executionCounts'] == packet['causalExecutionCounts'], 'Derived repeated counts differ')
    failures = [failure for phase in phases for failure in phase['classification']['failures']]
    distinct_failed = len({(failure['file'], failure['fullName']) for failure in failures})
    kinds = dict(collections.Counter(failure['failureKind'] for failure in failures))
    survivors = [matrix['control'] for matrix in matrices if matrix['verdict'] == 'survivor']
    need(distinct_failed == causal['distinctFailedFileTitlePairs'] and kinds == causal['failureKinds']
         and survivors == causal['survivingControls']
         and causal['mutantPassedCounts'] == [matrix['phases'][1]['classification']['passed'] for matrix in matrices], 'Actual failures/kinds/survivors differ')
    need(RUNTIME['node'] == original['runtime']['node'] == 'v22.23.3' and RUNTIME['pnpm'] == '10.33.0'
         and original['runtime']['modulesABI'] == '127' and original['runtime']['native']['inode'] == 538824643,
         'Runtime/native attribution differs; no per-child ABI inferred')
    env = os.environ.copy() | {'GIT_NO_LAZY_FETCH': '1'}
    need(subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=R, env=env, text=True).strip() == SOURCE, 'Parent source differs')
    need(subprocess.check_output(['git', 'branch', '--show-current'], cwd=R, env=env, text=True).strip()
         == 'codex/p0-11-current-qualification', 'Parent branch differs')
    need(not subprocess.check_output(['git', '--no-optional-locks', 'status', '--porcelain=v1'], cwd=R, env=env, text=True), 'Parent not clean')
    source, compiled = [read(C / ('inputs/' + name + '-manifest.json')) for name in ['source', 'compiled']]
    need(len(source) == 8362 and len(compiled) == 4529 and not set(source) & set(compiled)
         and all(pin(R / path)['sha256'] == sha for path, sha in (source | compiled).items()), 'Parent source/dist changed')
    preservation = read(packet['finalSourcePreservation']['path'])
    need(preservation['allBytesExact'] is preservation['physicalIdentityExact'] is True
         and preservation['parentTrackedChecked'] == 8362 and preservation['parentCompiledChecked'] == 4529
         and preservation['privateFilesChecked'] == 12891, 'Final preservation incomplete')
    native = preservation['borrowedNative']
    verify({key: native[key] for key in ['path', 'bytes', 'sha256']})
    st = Path(native['path']).stat()
    need(st.st_dev == native['device'] and st.st_ino == native['inode'] == 538824643 and st.st_nlink == native['nlink'], 'Native identity changed')
    need(pin(FREEZER)['sha256'] == FREEZER_SHA, 'Reviewed bound freezer changed')
    # Curated compact bodies only. Runtime reference membership is not copy permission.
    sources = [Path(row['path']) for row in EXPECTED.values()]
    for name in ['originalCorporaSummary', 'finalSourcePreservation', 'commandsFrozen', 'acceptanceStaticInventory', 'exactSourceValidationContext', 'rootSealedInputProof']:
        verify(packet[name]); sources.append(Path(packet[name]['path']))
    sources += [C / name for name in ['setup.json', 'setup-index.json', 'proposal.json', 'driver/controller.py',
        'driver/observer-reporter.mjs', 'inputs/case-identities.json', 'inputs/preservation.json']]
    need({record['role'] for record in packet['priorReviewContracts']} == {'original', 'recipe', 'code', 'sealed'}, 'Prior review roles differ')
    for record in packet['priorReviewContracts']:
        verify(record['pin']); sources.append(Path(record['pin']['path']))
        need(record.get('companionPins'), 'Every prior review pair must retain its companion')
        for companion in record['companionPins']:
            verify(companion); sources.append(Path(companion['path']))
    for record in packet['latePreparationHistory']:
        verify(record['pin']); sources.append(Path(record['pin']['path']))
    sources += [T / name for name in ['p0-11-readonly-readiness-20261015.json', 'p0-11-readonly-readiness-20261015.md',
        'p0-11-causal-readonly-plan-20261015.json', 'p0-11-causal-readonly-plan-20261015.md',
        'p0-11-causal-controller-prepared-20261015.py', 'p0-11-causal-controller-preparation-20261015.json',
        'p0-11-freeze-qualified-evidence-prepared-20261015.py', 'p0-11-freezer-preparation-20261015.json']]
    sources += [FREEZER, Path(__file__).resolve(), Path('/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/specs/P0-11.md')]
    sources += [Path(command['log']) for command in commands] + [Path(row['path']) for row in CURATED_COMPACT_INPUTS]
    for run in original['separateOriginalRuns']:
        sources += [Path(run[key]['path']) for key in ['raw', 'rawProducer', 'observer', 'combinedStream', 'command', 'ownedProcess', 'ownedGroupAfterExit']]
    for matrix in matrices:
        sources += [Path(matrix['result']['path']), Path(matrix['release']['path'])]
        for phase in matrix['phases']:
            directory = Path(phase['directory']); need(directory.parent == C / 'phases', 'Unexpected phase directory')
            sources += [directory / name for name in ['raw.json', 'observer.json', 'stdout-stderr.log', 'command.json',
                'owned-process.json', 'owned-group-after-exit.json', 'inputs-before.json', 'inputs-after.json', 'classification.json', 'artifacts.json']]
    sources = list(dict.fromkeys(sources))
    excluded = [C / 'closure', C / 'home', C / 'tmp', B / 'home', B / 'store', R]
    forbidden_names = {'source-manifest.json', 'compiled-manifest.json', 'physical-copy-manifest.json', 'tracked-source-before.json', 'compiled-after-build.json'}
    forbidden_paths = {Path(row['path']).resolve() for row in manifests}
    forbidden_paths.update((B / name).resolve() for name in ['tracked-source-before.json', 'compiled-after-build.json'])
    marker, payloads = b'PRIVATE ' + b'KEY-----', []
    for path in sources:
        resolved = path.resolve()
        need(not any(resolved == root.resolve() or root.resolve() in resolved.parents for root in excluded)
             and resolved not in forbidden_paths and path.name not in forbidden_names, 'Private source/store/manifest body selected regardless of size')
        need(stat.S_ISREG(path.lstat().st_mode) and not path.is_symlink(), 'Evidence is not a regular file')
        data = path.read_bytes(); need(len(data) <= MAX and marker not in data, 'Oversize/private-key body: do not split/trim/omit silently')
        row = pin(path)
        if str(path) in indexed:
            need(row == indexed[str(path)], 'Selected evidence differs from frozen index')
        payloads.append((path, row, data))
    references = dict(indexed)
    for row in ADDITIONAL_PRIVATE_REFERENCES:
        references[row['path']] = row
    # Validate all selected bodies before mkdir. Writes are exclusive/nontransactional;
    # any later failure preserves a partial attempt without rollback or automatic retry.
    Q.mkdir(); (Q / 'evidence').mkdir()
    mapping = []
    for path, row, data in payloads:
        target = Q / 'evidence' / (row['sha256'] + '-' + path.name)
        if target.exists():
            need(target.read_bytes() == data, 'Content-addressed filename collision')
        else:
            with target.open('xb') as out: out.write(data)
        need(target.read_bytes() == data, 'Evidence copy mismatch')
        mapping.append({'original': row, 'copy': target.relative_to(Q).as_posix()})
    write_new(Q / 'evidence-map.json', {'copies': mapping, 'immutableBytesPreserved': True})
    write_new(Q / 'private-references.json', {'source': SOURCE, 'codeSource': CODE,
        'references': [references[key] for key in sorted(references)], 'privateOnlyManifests': manifests,
        'boundary': 'Point-in-time hashes only. Source/copy/HOME/store/tmp/native/dependency bodies and all source/compiled/physical manifests stay private, unsplit, regardless of cap. Indexed is not copy permission.'})
    write_new(Q / 'outcomes.json', {'source': SOURCE, 'codeSource': CODE, 'formalAcceptanceClosed': False,
        'originalCorpora': original, 'primaryOriginalTestsAcrossTwoRuns': primary, 'causalControls': matrices,
        'causalExecutionCounts': totals, 'failureKinds': kinds, 'distinctFailedFileTitlePairs': distinct_failed,
        'survivingControls': survivors, 'failuresAndMasking': failures, 'rootCommandCount': 20, 'rootJournalContract': contract,
        'expectedNegativeCheckerRoles': sorted(negative_roles), 'separateCausalCommandCount': 9,
        'separateCausalCommandRecords': causal['causalCommandRecords'], 'priorReviewContracts': packet['priorReviewContracts'],
        'latePreparationHistory': packet['latePreparationHistory'], 'review': EXPECTED['review'], 'rootOutcome': outcome,
        'countingRule': 'Four original invocations 7 / 2 / 5 / 7 contain 21 distinct registrations. Primary 9 is 7 + 2 across two runs, not one 9-case process. Nine causal commands repeat 14 existing registrations across 63 executions; C1/L1 reuse map cases.'})
    write_new(Q / 'acceptance-gaps.json', {'formalAcceptanceClosed': False,
        'currentAcceptanceStaticInventory': read(packet['acceptanceStaticInventory']['path']),
        'sourceQuality': packet['unwaivedSourceQuality'], 'limits': packet['limits'],
        'preserved': ['Production/original tests/config/guards/deadlines/cleanup', 'Sid review/ASI labels/stamp/follow-up keys',
            'Historical literal invalid-fixture-pass criterion', 'All prior skips/strict gaps/Claude/shared/A4/paused holds and pending transfers'],
        'nextReadOnlyCandidate': {'key': 'P0-41', 'readiness': EXPECTED['nextReadiness'], 'routing': EXPECTED['nextRouting'],
            'meaning': 'Conditional qualification eligibility, not runtime, owner transfer, external posting permission or formal dependency closure.'}})
    paragraphs = [
        '# P0-11 bounded qualification',
        f'Four separate unchanged original runs pass **7 map, 2 telemetry, 5 preview and 7 recorder cases** on `{SOURCE}`. Production remains `{CODE}`. These are 21 distinct registrations across four files, not one 21-case run. The receipt primary **9** aggregates map and telemetry across two runs; no single nine-case process is claimed.',
        f'Three private controls completed nine phases: **{totals["total"]} repeated executions, {totals["passed"]} passes and {totals["failed"]} body failures across {distinct_failed} distinct file/title pairs**. Actual kinds: {json.dumps(kinds, sort_keys=True)}. Every baseline/restored phase passes seven; pending/todo are zero. Survivors: {", ".join(survivors) if survivors else "none"}. These values derive from completed evidence, not predictions. C1/L1 can fail the same map case and are not extra unique tests.',
        '| Control | Corpus | Baseline passed | Mutant passed / failed | Restored passed | Actual classification |\n| --- | --- | ---: | ---: | ---: | --- |']
    for matrix in matrices:
        before, mutant, restored = [phase['classification'] for phase in matrix['phases']]
        paragraphs[-1] += f'\n| {matrix["control"]} | {matrix["corpusKey"]} | {before["passed"]} | {mutant["passed"]} / {mutant["failed"]} | {restored["passed"]} | {matrix["verdict"]} |'
    paragraphs += [
        'C1 removes the missing-path error while retaining continue: a new semantic fail-open recipe, not literal L1. First status assertion 29 can mask diagnostics 30-31. L1 removes the entire branch; readFileSync ENOENT may still refuse the invalid fixture while output text fails. Changed diagnostics/nonzero do not establish the historical requirement that the invalid fixture pass. Exact first frames and reached/masked assertions remain in evidence; this strict criterion is not waived.',
        'C2 rethrows the SAME original recorder Error. It may reject at await 206 before recorderCalled/outcome/output/denied assertions 210-213. Preserve callback202/record306/await 206, not the inserted throw line. This is distinct from AssertionErrors, actual durable-store outage, policy denial, protected-effect dispatch or reconciliation. Generic setup/native/timeout/hook/late/pending/process errors never become kills.',
        'Map tests launch actual Node MJS checker, not built amc. File/schema/text/headings do not prove sixteen-channel enforcement. Telemetry uses real workspace/vault/governed fs.read/SQLite with throwing-exporter/canned-fetch seams. Ordinary fixture transaction completes before queue; nested callers may use savepoints, not universal outer durable commits. No real collector outage, independent seal, fully cold reader or no-WAL-effect proof. Preview is disabled serialization; recording combines local rows and direct callback. Cleanup deletes fixtures; retained reports are not replayable key/store samples.',
        'Original wrappers inherit environment. Absent endpoint overrides/default loopback is preflight, not zero network or credential/OS isolation. The private physical copy has no Git metadata and borrows parent dependencies under seven-key environment. Signal-zero ESRCH describes only owned group absence at the probe. Reporter precedes global teardown; full exits/streams/known banners are separate. The 420s supervisor sends no terminating signal and preserves original 30s deadlines. No universal detached-descendant, cache/dependency or transport-isolation claim.',
        'Final preservation covers 8,362 tracked, 4,529 compiled and 12,891 private files, native inode 538824643 and pinned helpers/plans/reservation. Private mutations restore exactly. All three source/compiled/physical manifest bodies, including parent tracked-source-before/compiled-after-build, remain private unsplit regardless of cap. Source, HOME/store/tmp, native/dependency and closure bodies are not copied. Raw bytes and EOF whitespace remain unchanged.',
        'The journal contains 20 actual root commands: exactly four named original negative checker fixtures exit 1 with exact argv/offending-entry diagnostics; every other command and guard exits 0. These are separate from nine causal processes. Author-only quoting/count errors before START/mutants remain preserved with old/corrected helpers; they are not product failures.',
        'Formal acceptance stays open: Sid residual-risk/status review, ASI experimental/re-verify titles, stale map stamp, occupied P1-56/P1-57/P1-58 proposals, behavioral truth and PR/merge evidence. Current 16 channels and 8 failure rows are legitimate later coverage; historical 15 is not restored by deleting coverage. Required 1,269 duplicate/2,751 dead-code findings remain failed/unwaived with prior attribution. All earlier strict gaps, user skips, Claude/shared CLI/API/Studio/A4/paused P2-02 holds and pending transfers remain. No fullsuite/coverage/Node24/hosted/release/formal dependency/G0/Done.',
        'P0-41 is a conditional next existing-source qualification candidate under copied routing/readiness, not runtime/owner transfer/approval/permission to post status. Informational formal gaps remain separate from empty blocking evidence findings. Root outcome does not pin this future builder; a later handoff can pin both without a cycle.']
    text_new(Q / 'README.md', '\n\n'.join(paragraphs) + '\n')
    receipt = {'schemaVersion': 1, 'key': 'P0-11', 'date': '2026-10-15', 'commit': SOURCE,
        'branch': 'codex/p0-11-current-qualification', **RUNTIME,
        'commands': [{key: command[key] for key in ['cmd', 'exit', 'durationMs']} for command in commands],
        'tests': {'total': 9, 'passed': 9, 'failed': 0, 'skipped': 0},
        'artifacts': [{'path': path.relative_to(Q).as_posix(), 'sha256': pin(path)['sha256']} for path in sorted(Q.rglob('*')) if path.is_file()],
        'notes': 'Bounded, not formal acceptance/Done. Primary 9 aggregates map 7 + telemetry 2 across two runs, never one 9-case process; preview 5 / recording 7 remain separate, all originals 21 across 4 files. Three controls across 9 phases repeat 14 originals over 63 executions. Actual kinds/failures/survivors derived; C1/L1 may share failed case. C2 same genuine Error distinct from Assertions; L1 ENOENT does not prove invalid admission or close literal criterion. Only four exact checker negatives exit 1; every guard exits 0. All manifests private unsplit regardless cap. Sid/ASI/stamp/followups/quality 1269 / 2751/all earlier holds remain; no fullsuite/coverage/Node24/hosted/PR+merge/release/G0/Done. P0-41 conditional.'}
    write_new(Q / 'receipt.json', receipt)
    need(all(path.stat().st_size <= MAX and marker not in path.read_bytes() for path in Q.rglob('*') if path.is_file()),
         'Final cap/key failure; retain partial without splitting/trimming')
    print(json.dumps({'canonical': str(Q), 'files': len(receipt['artifacts']) + 1, 'artifacts': len(receipt['artifacts']),
        'privateReferences': len(references), 'primaryTestsAcrossTwoRuns': receipt['tests'], 'causalExecutionCounts': totals,
        'distinctFailedFileTitlePairs': distinct_failed, 'failureKinds': kinds, 'survivors': survivors, 'formalAcceptanceClosed': False}), flush=True)


if __name__ == '__main__':
    main()
