"""Reuse the sealed P1-25 raw/observer join without altering its evidence or checks."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys

B = Path('/private/tmp/p1-11-decisive-qualification-20261017')
HELPER = Path('/private/tmp/p1-25-time-qualification-20261016/receipt-preparation/assemble-receipt.py')
assert hashlib.sha256(HELPER.read_bytes()).hexdigest() == '28ddcb18ec76480886dc6856dee2a976adf15d2282c1b72d58c26ba22269a5c7'
spec = importlib.util.spec_from_file_location('prior_qualification_evidence', HELPER)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
phase, root, cohort = sys.argv[1:]
unchanged = ('tests/compliance/complianceFailClosed.test.ts', 'tests/compliance/evidenceBinding.test.ts', 'tests/compliance/coverageScorer.test.ts')
assert cohort in ('unchanged', 'combined')
helper.CORPUS = unchanged if cohort == 'unchanged' else ('tests/catalog/evidence/decisive.test.ts', *unchanged)
facts, publics = helper.observed(phase, Path(root))
facts['publicEvidencePaths'] = [str(path) for path in publics]
facts['reuseBoundary'] = 'Read-only import of the pinned existing ordered raw/observer/hook/late-error audit; only the finite cohort is selected here. No test execution or evidence rewriting.'
with (B / (phase + '-outcome.json')).open('x') as out:
    json.dump(facts, out, indent=2)
    out.write('\n')
print(json.dumps({key: facts[key] for key in ('phase', 'tests', 'hookTaskEntries', 'individualHookValues', 'rawObserverOrderedJoin', 'unhandledErrors', 'lateDiagnostics')}))
