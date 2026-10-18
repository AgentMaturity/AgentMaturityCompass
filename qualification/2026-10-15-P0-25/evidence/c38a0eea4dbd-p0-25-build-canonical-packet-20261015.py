from pathlib import Path
import json, hashlib, subprocess, datetime, platform

R = Path('/Users/sid/.codex/worktrees/p0-25-qualification/AgentMaturityCompass')
B = Path('/private/tmp/p0-25-qualification-20261015')
T = Path('/private/tmp')
Q = R / 'qualification/2026-10-15-P0-25'
SOURCE = '2d552741d727aaf3a26759b9df9343f7804d157a'

def pin(p):
    p = Path(p)
    data = p.read_bytes()
    return {'path': str(p), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

def read(p):
    return json.loads(Path(p).read_text())

def write(p, value):
    p = Path(p)
    assert not p.exists(), str(p)
    p.write_text(json.dumps(value, indent=2) + '\n')

assert not Q.exists()
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=R, text=True).strip() == SOURCE
assert not subprocess.check_output(['git', 'status', '--porcelain=v1'], cwd=R, text=True)
packet = read(T / 'p0-25-bounded-qualification-20261015.json')
assert pin(T / 'p0-25-bounded-qualification-20261015.json')['sha256'] == '7575816b0d993a8327039bbe9d904271d1e2c5937d91d27f03e83ab2d2c36ae6'
index = read(B / 'artifact-index.json')
assert pin(B / 'artifact-index.json')['sha256'] == 'c652dff2952703b79bde504c8367be90cc67201dd5535d6ea910ba58ff134127'
for row in index['artifacts']:
    assert pin(row['path']) == row, row['path']
review_path = T / 'p0-25-bounded-independent-review-20261015.json'
review = read(review_path)
outcome_path = T / 'p0-25-root-bounded-outcome-20261015.json'
outcome = read(outcome_path)
assert outcome['formalAcceptanceClosed'] is False
assert outcome['review']['sha256'] == pin(review_path)['sha256']
tracked = read(B / 'tracked-source-before.json')
assert len(tracked) == 7888
assert all(pin(R / path)['sha256'] == sha for path, sha in tracked.items())
Q.mkdir()
(Q / 'evidence').mkdir()
sources = [
    T / 'p0-25-bounded-qualification-20261015.json',
    T / 'p0-25-bounded-qualification-20261015.md',
    review_path, review_path.with_suffix('.md'), outcome_path,
    B / 'artifact-index.json', B / 'initial-preflight.json',
    B / 'graph-navigation.json', B / 'runtime-fingerprint.cjs',
    B / 'observer-reporter.mjs', B / 'commands-frozen.jsonl',
    B / 'original32-summary.json', B / 'release22-summary.json',
    B / 'actual-collector-summary.json', B / 'actual-cli-refusals-summary.json',
    B / 'final-source-and-reuse-preservation.json',
    B / 'observers/original-citations-mapping.json',
    B / 'observers/release-executor-contracts.json',
    T / 'p0-25-original-citations-mapping-20261015.json',
    T / 'p0-25-release-executor-contracts-20261015.json',
    T / 'p0-25-readonly-readiness-20261015.json',
    T / 'p0-25-corpus-propagation-readonly-supplement-20261015.json',
    T / 'amc-next-after-p0-25-readonly-routing-20261015.json',
    T / 'p0-24-citation-causal-qualification-20261015.json',
    T / 'p0-24-citation-causal-20261015/artifact-index.json',
    T / 'p0-30-exact-source-validation-context-20261015.json',
    T / 'p0-30-canonical-postcommit-handoff-20261015.json',
    Path('/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/specs/P0-25.md'),
    T / 'p0-25-run-command-20261015.py',
    T / 'p0-25-run-observed-command-20261015.py',
    T / 'p0-25-freeze-qualified-evidence-20261015.py',
    Path(__file__),
] + [Path(row['log']) for row in packet['commands']]
mapping = []
for source in dict.fromkeys(sources):
    row = pin(source)
    target = Q / 'evidence' / (row['sha256'][:12] + '-' + source.name)
    data = source.read_bytes()
    assert len(data) <= 1048576 and (b'PRIVATE ' + b'KEY-----') not in data
    if target.exists():
        assert target.read_bytes() == data
    else:
        target.write_bytes(data)
    mapping.append({'original': row, 'copy': target.relative_to(Q).as_posix()})
write(Q / 'evidence-map.json', {'copies': mapping, 'immutableBytesPreserved': True})
write(Q / 'private-references.json', {
    'source': SOURCE, 'references': index['artifacts'],
    'boundary': 'Point-in-time immutable evidence; source and prior-run attribution remain distinct. Private HOME, stores and caches are not committed. The role inbox may receive a separately recorded prefix-preserving handoff after this freeze.'})
write(Q / 'outcomes.json', {
    'source': SOURCE, 'codeSource': packet['codeSource'],
    'originalFocused': packet['focusedOriginal32'],
    'separateInjectedReleaseContracts': packet['separateRelease22'],
    'actualCollector': packet['actualCollector'],
    'actualCLIRefusals': packet['actualCLIRefusals'],
    'historicalCausalReuse': packet['sameInputCausalReuse'],
    'review': pin(review_path), 'rootOutcome': outcome,
    'formalAcceptanceClosed': False})
write(Q / 'acceptance-gaps.json', {
    'formalAcceptanceClosed': False, 'gaps': packet['formalGaps'],
    'nextLane': 'P0-21', 'nextLaneAuthority': packet['nextPlanLane'],
    'earlierDecisions': 'P0-29 remains skipped and unresolved; P0-22 empty-result contract remains unresolved; D-03 live-health skip ends at P2-06. No pending ownership transfer is applied.'})
readme = '''# P0-25 bounded qualification

The existing citation and mapping tests pass **32/32** on source `2d552741d727aaf3a26759b9df9343f7804d157a` (production code equivalent to `58e91dcef111bf02f773dcbfd1921d428cf75e34`). A separate corpus of **22/22** injected release-executor contracts passes. These are separate runs, not one 54-test run.

The actual built collector and actual `npm run check:citations -- --json` both exit 0 with `ok: true`, **0 blocking errors**, **623 ratcheted findings**, and baseline 623. CIT002 contributes 3 findings and CIT004 contributes 620. Their structured outputs match exactly. Earlier informal wording calling these 623 findings errors is corrected here. Three real invalid CLI argument combinations exit 1 with the expected refusals; the project baseline remains unchanged. None is a test registration or a reasoned baseline update.

The 32 original cases include 21 linter tests, 9 in-process CLI contracts with injected findings, and 2 tests of mappings against actual registered packs. The 22 release tests inject an executor and simulate step results. They do not execute a full release gate, hosted workflow or deployment.

Prior 30-case causal evidence remains attributed to source `75cbdf8a1b83ed6b3851ecce3a069940352a40cd`: resolver 30→26→30 and ratchet 30→29→30. Its 2,471 protected inputs and 4,529 compiled files match the current files exactly. That evidence used a private compiled import-prefix adaptation; it is reused here, not rerun or relabelled as a current mutation of all 32 cases.

Fresh normal install, build and ordinary real-Git freeze checks pass on Node 22.23.3, ABI 127. An owned native SQLite binary completes an in-memory query and has an independent inode from the preserved P0-30 binary. All 7,888 prior tracked files and 4,529 compiled files remain exact. No production code, test, data, baseline, reference table, workflow, guard or counter changed. The private observer reports run-end facts; it does not prove universal child teardown or filesystem isolation. Command wrappers inherit the environment and set a private HOME and Node 22 PATH.

The separate strict ISO failure, empty ISO table, 31 empty expert cells and literal single-host-list requirement remain open. The register checker still reads a separate JSON policy list. Required duplicate (1,269) and dead-code (2,751) failures remain unwaived; exact-source prior checks are reused with their original attribution. Full-suite, Node 24, coverage, hosted CI, full release, PR/merge, G0, formal dependencies and Done are not claimed. Earlier unresolved decisions, skipped work, reservations and pending transfers remain intact.

`receipt.json` identifies the primary 32-case run; `outcomes.json` keeps the separate 22-case run, three operational refusals and historical causal evidence distinct. The independent review and root outcome are copied under `evidence/`. The current plan routes next to P0-21 after this bounded handoff.
'''
(Q / 'README.md').write_text(readme)
receipt = {
    'schemaVersion': 1, 'key': 'P0-25', 'date': '2026-10-15',
    'commit': SOURCE, 'branch': 'codex/p0-25-current-qualification',
    'node': 'v22.23.3', 'pnpm': '10.33.0',
    'os': 'Darwin ' + platform.release(), 'arch': 'arm64',
    'commands': [{k: row[k] for k in ['cmd', 'exit', 'durationMs']} for row in packet['commands']],
    'tests': {'total': 32, 'passed': 32, 'failed': 0, 'skipped': 0},
    'artifacts': [{'path': p.relative_to(Q).as_posix(), 'sha256': pin(p)['sha256']}
                  for p in sorted(Q.rglob('*')) if p.is_file()],
    'notes': 'Bounded existing-source qualification, not formal acceptance or Done. tests records only the original 32-case citation/mapping run. Separate 22 injected-executor cases, three actual parser-refusal commands and reused historical 30-case causal controls are distinct in outcomes.json. The three exit-1 commands are expected argument refusals and did not update the baseline. Actual collector/package both exit0 with zero errors and 623 ratcheted findings; prior informal errors wording is corrected. Strict ISO/expert/host-list gaps and duplicate1269/dead2751 remain unwaived. Original source/tests/config/guards/data and frozen historical evidence remain unchanged. No full-suite, Node24, hosted CI, complete release, PR/merge, formal dependency or G0 claim.'}
write(Q / 'receipt.json', receipt)
print(json.dumps({'canonical': str(Q), 'files': len([p for p in Q.rglob('*') if p.is_file()]), 'artifacts': len(receipt['artifacts']), 'privateReferences': len(index['artifacts']), 'sourcePreserved': len(tracked)}))
