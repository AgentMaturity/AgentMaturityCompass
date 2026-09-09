#!/usr/bin/env python3
"""AUTHOR-ONLY preparation: source-specific AMC-1545/1546 mutation qualification."""
import argparse
import difflib
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import signal
import subprocess
import sys
import time

AUTHOR_SOURCE = 'd9d55034b1e856513eea1c68b09e50ecd433063e'
ROOT = Path('/Users/sid/AgentMaturityCompass').resolve()
STOP = 'tests/subagentStopConditions.test.ts'
DELEGATE = 'tests/delegateTool.test.ts'
KERNEL = 'tests/kernelDelegationGrant.test.ts'
INHERIT = 'tests/nativeDelegationInheritance.test.ts'
PROVIDER = 'tests/cliDelegateFlag.test.ts'
AUTH = 'tests/studioAgentCredentialBinding.test.ts'
FILES = [STOP, DELEGATE, KERNEL, INHERIT, PROVIDER, AUTH]
SPAWN = 'src/agent/subagentSpawn.ts'
CREDENTIAL = 'src/studio/agentCredentialAuth.ts'
STUDIO = 'src/studio/studioServer.ts'


def edit(path, old, new):
    return dict(path=path, old=old, new=new)


def case(file, group, title, anchor, offset=0, message=None):
    return dict(file=file, fullName=group + ' ' + title, anchor=anchor,
                assertionLineOffset=offset, requiredMessage=message)


def mutation(name, edits, cases, limitation, expectation='red'):
    return dict(name=name, edits=edits, cases=cases, limitation=limitation, expectation=expectation)


CEILING = 'one admitted-invocation ceiling for an entire delegation'
TIMEOUT = 'one nonresetting lifetime timeout and bounded cancellation'
IDENTITY = 'Studio binds agent identity before ToolHub execution'
SCOPES = 'all supplied credential scopes and validity constraints bind'
DUPLICATE = 'raw duplicate carrier lines cannot disappear during HTTP normalization'
OWNER_GUARD = '''        // Refuse before an execution can consume its intent, ticket or approval.
        if (!auth.isAdmin && auth.agentId !== null && intentAgent !== auth.agentId) {
          json(res, 403, { error: "scope does not include this agent" });
          return;
        }
'''
IDENTITY_GUARD = '  if (first === undefined || grants.some(grant => grant.agentId !== first.agentId)) return null;'
BYPASS_IDENTITY = '  if (first === undefined) return null;'
IDLE_CASE = case(STOP, TIMEOUT,
    'includes idle continuation time and releases the timed-out child exactly once',
    '    expect(signal.aborted).toBe(true); expect(child.close).toHaveBeenCalledTimes(1);')
MUTATIONS = [
    mutation('stop-turn-ceiling-disabled', [edit(SPAWN,
        '  const limitReached = (): boolean => stops.maxTurns !== undefined && turns >= stops.maxTurns;',
        '  const limitReached = (): boolean => false;')], [
        case(STOP, CEILING, 'counts the initial invocation and closes immediately at max-turns:1',
             '    expect("handle" in outcome && outcome.handle).toBeFalsy();'),
        case(STOP, CEILING, 'admits the final continuation, closes it, and refuses every later dispatch',
             '    expect(await outcome.handle.continue("must not run")).toMatchObject({ ok: false, reason: expect.stringContaining("max-turns:2") });')],
        'Injected retained executors expose handle/admission behavior; native SQLite integration remains in baseline.'),
    mutation('stop-idle-timer-disabled', [edit(SPAWN,
        '  if (!closed && stops.timeoutMs !== undefined) {',
        '  if (false && !closed && stops.timeoutMs !== undefined) {')], [IDLE_CASE],
        'Discriminates whole-lifetime idle cancellation at the actual executor signal; not a wall-clock performance measurement.'),
    mutation('stop-late-admission-deadline-disabled', [edit(SPAWN,
        '    if (deadline !== undefined && performance.now() >= deadline) requestStop(`timeout-ms:${stops.timeoutMs} lifetime expired`);',
        '    // Mutation: delayed timer delivery incorrectly permits admission past its deadline.')], [
        case(STOP, TIMEOUT, 'refuses late admission even before the event loop delivers the timeout callback',
             '    expect(await outcome.handle.continue("after deadline")).toMatchObject({ ok: false, reason: expect.stringContaining("timeout-ms:100") });')],
        'The fake monotonic clock isolates admission before callback delivery; the independent timer remains installed.'),
    mutation('stop-runner-signal-disconnected', [edit(SPAWN,
        '    ...(request.stopConditions === undefined ? {} : { stopConditions: stops.conditions }), signal: controller.signal }));',
        '    ...(request.stopConditions === undefined ? {} : { stopConditions: stops.conditions }), signal: new AbortController().signal }));')],
        [IDLE_CASE], 'The runner receives the wrong signal while runtime settlement stays active. This is not native transport-abort mutation proof.'),
    mutation('delegate-operator-snapshot-removed', [edit('src/agent/delegateTool.ts',
        '  const stopConditions = capability.stopConditions === undefined\n    ? undefined : Object.freeze([...capability.stopConditions]);',
        '  const stopConditions = capability.stopConditions;')], [
        case(DELEGATE, "the model's arguments are not trusted", 'pins operator stop conditions and ignores model attempts to replace them',
             '      expect(spy.seen[0]!.stopConditions).toEqual(["max-turns:1", "timeout-ms:30000"]);')],
        'Caller-array mutation tests operator snapshot propagation; model input is also hostile in this case, but this mutation changes the snapshot only.'),
    mutation('kernel-operator-snapshot-removed', [edit('src/kernel/agentLoopRunner.ts',
        '      ...(options.delegation.stopConditions === undefined ? {} : { stopConditions: Object.freeze([...parsed.conditions]) })',
        '      ...(options.delegation.stopConditions === undefined ? {} : { stopConditions: options.delegation.stopConditions })')], [
        case(KERNEL, "the operator's delegation scope reaches the capability", 'pins stop conditions before caller mutation during composition',
             '    expect(grants[0]!.stopConditions).toEqual(["max-turns:2", "timeout-ms:30000"]);')],
        'Tests the kernel grant snapshot while the caller mutates its original array.'),
    mutation('descendant-minimum-widened', [edit('src/agent/subagentRunner.ts',
        '    a === undefined ? b : b === undefined ? a : Math.min(a, b);',
        '    a === undefined ? b : b === undefined ? a : Math.max(a, b);')], [
        case(INHERIT, 'native child cancellation and inherited governance', 'nested delegation receives numeric minima and snapshots the configured stops',
             '    expect(seen[0]!.stopConditions).toEqual(["max-turns:2", "timeout-ms:30000"]);')],
        'Actual native child composition reaches the grandchild context; this compares inherited declarations, not elapsed lifetime performance.'),
    mutation('provider-stop-forwarding-removed', [edit('src/agent/providers/delegationProviders.ts',
        '    ...(params.stopConditions === undefined ? {} : { stopConditions: Object.freeze([...params.stopConditions]) }),\n', '')], [
        case(PROVIDER, 'the delegation options a run is given',
             'carries explicit stop conditions, including an empty operator reset, without inventing an absent bound',
             '    expect(delegationTurnOptions({ grant, maxDepth: 3, stopConditions: ["max-turns:2", "timeout-ms:5000"] }).stopConditions)\n      .toEqual(["max-turns:2", "timeout-ms:5000"]);', 1),
        case(PROVIDER, 'operator delegation stop configuration', 'passes both repeated bounds into the actual composed run and describes their units',
             '    expect(composed.mock.calls[0]?.[0].delegation?.stopConditions).toEqual(["max-turns:2", "timeout-ms:5000"]);')],
        'Provider helper plus real CLI call-through. No foreign provider process or external model is started.'),
    mutation('studio-mixed-identity-admitted', [edit(CREDENTIAL, IDENTITY_GUARD, BYPASS_IDENTITY)], [
        case(AUTH, IDENTITY, "refuses A's static token with B's lease before fs.write, receipt creation or approval consumption",
             '    expect(refused.status, refused.body).toBe(401);')],
        'The remaining early owner guard still refuses with 403. This mutant proves mixed credential admission, not execution leakage.'),
    mutation('studio-scope-intersection-removed', [edit(CREDENTIAL,
        '  for (const grant of grants.slice(1)) {', '  for (const grant of grants.slice(1, 1)) {')], [
        case(AUTH, SCOPES, 'intersects the static token and narrower lease on every scope-only endpoint',
             '      const refused = await request(f, route.path, route.method, credentials(f, A, narrow.token), route.body);\n      expect(refused.status, `${route.path}: ${refused.body}`).toBe(403);', 1)],
        'The first actual scope-only HTTP refusal must fail; later routes in the loop are not independently proved by this one RED.'),
    mutation('studio-secondary-lease-ignored', [edit(CREDENTIAL,
        '      for (const token of leases) {', '      for (const token of leases.slice(0, 1)) {')], [
        case(AUTH, SCOPES, 'does not let another valid lease hide a revoked or invalid lower-priority carrier',
             '        "x-amc-agent-token": f.tokens[A]!, "x-amc-lease": full.token, "x-api-key": secondary\n      });\n      expect(response.status, response.body).toBe(401);', 2)],
        'First lower-priority revoked carrier is observed. The loop also covers other invalid carriers, which need separate negative probes for independent proof.'),
    mutation('studio-revocation-set-ignored', [edit(CREDENTIAL,
        '      const revokedLeaseIds = revokedLeaseIdSet(params.workspace);',
        '      const revokedLeaseIds = new Set<string>();')], [
        case(AUTH, SCOPES, 'rejects revoked supplied leases on all scope-only routes while preserving static-only compatibility',
             '      const refused = await request(f, route.path, route.method, credentials(f, A, revoked.token), route.body);\n      expect(refused.status, `${route.path}: ${refused.body}`).toBe(401);', 1)],
        'Actual signed temporary lease revocation; does not substitute for the managed revocation-store tampering protocol.'),
    mutation('studio-duplicate-authorization-ignored', [edit(CREDENTIAL,
        '    if (seen.has(name)) return null;', '    if (false && seen.has(name)) return null;')], [
        case(AUTH, DUPLICATE, 'rejects duplicate Authorization before a narrower lease can be dropped and a real write dispatched',
             '    expect(response.status, response.body).toBe(401);\n    expect(existsSync(prepared.sentinel)).toBe(false); expect(executionRows(f)).toEqual(before);')],
        'Original raw HTTP header pairs reach Node normalization. The leading status assertion fails before later sentinel assertions; do not claim each was mutation-proved.'),
    mutation('studio-owner-guard-overlap-control', [edit(STUDIO, OWNER_GUARD, '')], [
        case(AUTH, IDENTITY, 'retains lease-only execution and rejects a mismatched lease before any tool effect',
             '    const refused = await request(f, "/toolhub/execute", "POST", { "x-amc-lease": other.token }, prepared.body);\n'
             '    expect(refused.status, refused.body).toBe(403);\n'
             '    expect(existsSync(prepared.sentinel)).toBe(false); expect(executionRows(f)).toEqual(before);', 1)],
        'Expected survival control: existing lease expected-agent verification should still refuse. Survival is documented overlap, not an independently killed guard.', 'survival-control'),
    mutation('studio-owner-refusal-after-effect', [edit(CREDENTIAL, IDENTITY_GUARD, BYPASS_IDENTITY),
        edit(STUDIO, OWNER_GUARD, ''),
        edit(STUDIO, '        const intentRecord = toolhub.intent(parsed.intentId);',
             '        // Mutation diagnostic: preserve the expected HTTP status after the forbidden effect.\n'
             '        if (!auth.isAdmin && auth.agentId !== null && intentAgent !== auth.agentId) {\n'
             '          json(res, 401, { error: "mutation: owner refusal was too late" });\n'
             '          return;\n'
             '        }\n'
             '        const intentRecord = toolhub.intent(parsed.intentId);')], [
        case(AUTH, IDENTITY, "refuses A's static token with B's lease before fs.write, receipt creation or approval consumption",
             '    expect(existsSync(prepared.sentinel), "403 after execution would be too late").toBe(false);',
             message='403 after execution would be too late')],
        'Declared compound mutant restores mixed-identity admission and moves owner refusal after executeIntent. Diagnostic 401 lets the existing test reach the actual filesystem sentinel assertion. It is not an isolated owner-guard mutation.')
]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    # Only this invocation's new output tree is writable; logs/reports are separate per command.
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def group_exists(pgid):
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False


def run_process(argv, cwd, env, folder, timeout):
    folder.mkdir(mode=0o700)
    record = dict(command=[str(arg) for arg in argv], cwd=str(cwd), startedAt=time.time(),
                  timedOut=False, interrupted=False, cleanup={})
    proc = None
    started = time.monotonic()
    try:
        with (folder / 'stdout.log').open('xb') as stdout, (folder / 'stderr.log').open('xb') as stderr:
            proc = subprocess.Popen(record['command'], cwd=cwd, env=env, stdout=stdout,
                                    stderr=stderr, start_new_session=True)
            record['pid'] = proc.pid
            try:
                record['exitCode'] = proc.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                record['timedOut'] = True
    except BaseException:
        record['interrupted'] = True
        raise
    finally:
        if proc is not None:
            signals = []
            try:
                for sig in (signal.SIGTERM, signal.SIGKILL):
                    if group_exists(proc.pid):
                        try:
                            os.killpg(proc.pid, sig)
                            signals.append(sig.name)
                        except ProcessLookupError:
                            pass
                        until = time.monotonic() + 3
                        while group_exists(proc.pid) and time.monotonic() < until:
                            proc.poll()
                            time.sleep(0.05)
                proc.wait(timeout=3)
                record['cleanup'] = dict(processGroup=proc.pid, signals=signals, closed=not group_exists(proc.pid))
            except BaseException as exc:
                record['cleanup'] = dict(processGroup=proc.pid, signals=signals, closed=False,
                                         error=f'{type(exc).__name__}: {exc}')
        record['finishedAt'] = time.time()
        record['durationSeconds'] = time.monotonic() - started
        write_json(folder / 'process.json', record)
    return record


class Runner:
    def __init__(self, output, clone, env, node, timeout):
        self.output, self.clone, self.env, self.node, self.timeout = output, clone, env, node, timeout
        self.serial = 0
        self.unclosedProcess = None

    def process(self, argv, cwd, folder, timeout):
        if self.unclosedProcess is not None:
            raise RuntimeError('Previous process-group closure is unconfirmed; no further commands are permitted')
        result = None
        try:
            result = run_process(argv, cwd, self.env, folder, timeout)
            return result
        finally:
            # run_process preserves its record before propagating an interrupt.
            # Capture uncertainty on that path too, before source restoration.
            if result is None:
                try:
                    result = json.loads((folder / 'process.json').read_text())
                except (OSError, ValueError):
                    self.unclosedProcess = dict(folder=str(folder), reason='No readable final process record')
            if result is not None and result.get('pid') is not None and not result.get('cleanup', {}).get('closed'):
                self.unclosedProcess = dict(folder=str(folder), cleanup=result.get('cleanup', {}))

    def command(self, label, argv, cwd=None, timeout=None):
        self.serial += 1
        folder = self.output / f'{self.serial:03d}-{label}'
        result = self.process(argv, cwd or self.clone, folder, timeout or self.timeout)
        if result.get('exitCode') != 0 or result['timedOut'] or not result['cleanup'].get('closed'):
            raise RuntimeError(f'Command failed or cleanup unconfirmed: {folder}')
        return (folder / 'stdout.log').read_text().strip()

    def clean(self, source, label):
        if self.command(label + '-head', ['git', 'rev-parse', 'HEAD']) != source:
            raise RuntimeError('HEAD differs from explicit source pin; refusing reset')
        if self.command(label + '-status', ['git', 'status', '--porcelain', '--untracked-files=all']):
            raise RuntimeError('Checkout/index has drift; no automatic reset or deletion is permitted')
        flags = self.command(label + '-index', ['git', 'ls-files', '-v'])
        if any(line and line[0] != 'H' for line in flags.splitlines()):
            raise RuntimeError('Nonstandard assume-unchanged/skip-worktree index flags')

    def tests(self, label, files, cases=None):
        self.serial += 1
        folder = self.output / f'{self.serial:03d}-{label}'
        report = folder / 'vitest.json'
        argv = [str(self.node), str(self.clone / 'node_modules/vitest/vitest.mjs'), 'run', *files,
                '--maxWorkers=1', '--no-file-parallelism', '--reporter=json', '--outputFile=' + str(report)]
        if cases:
            escape = lambda text: re.sub(r'([.*+?^${}()|\[\]\\])', r'\\\1', text)
            argv += ['--testNamePattern', '^(?:' + '|'.join(escape(item['fullName']) for item in cases) + ')$']
        result = self.process(argv, self.clone, folder, self.timeout)
        result['folder'] = str(folder)
        try:
            parsed = json.loads(report.read_text())
            if not isinstance(parsed, dict):
                raise ValueError('Vitest report is not an object')
            result['reportPresent'] = True
        except (OSError, ValueError) as exc:
            parsed = {}
            result['reportPresent'] = False
            result['reportError'] = f'{type(exc).__name__}: {exc}'
        suites = parsed.get('testResults', [])
        result['assertions'] = [dict(file=suite.get('name'), fullName=item.get('fullName'),
                                    status=item.get('status'), failureMessages=item.get('failureMessages', []))
                                for suite in suites for item in suite.get('assertionResults', [])]
        result['counts'] = {key: value for key, value in parsed.items() if key.startswith('num')}
        result['unhandledErrors'] = parsed.get('unhandledErrors', [])
        result['suiteMessages'] = [suite.get('message') for suite in suites if suite.get('message')]
        result['emptyFailedSuites'] = [suite.get('name') for suite in suites
                                      if suite.get('status') == 'failed' and not suite.get('assertionResults')]
        write_json(folder / 'parsed.json', result)
        if self.unclosedProcess is not None:
            raise RuntimeError(f'Test process-group closure is unconfirmed; raw and parsed result preserved: {folder}')
        return result


def healthy(result):
    return (result.get('reportPresent') and not result.get('timedOut') and not result.get('interrupted')
            and result['cleanup'].get('closed') and not result['unhandledErrors']
            and not result['emptyFailedSuites'] and not result['counts'].get('numRuntimeErrorTestSuites', 0))


def active(result):
    return [item for item in result['assertions'] if item['status'] not in ('pending', 'skipped', 'todo', 'disabled')]


def exact_names(result, cases):
    names = [item['fullName'] for item in active(result)]
    expected = [item['fullName'] for item in cases]
    return len(names) == len(expected) and set(names) == set(expected)


def green(result, cases=None):
    selected = active(result)
    return (healthy(result) and result.get('exitCode') == 0 and bool(selected)
            and all(item['status'] == 'passed' for item in selected)
            and result['counts'].get('numFailedTests') == 0
            and (exact_names(result, cases) if cases else len(selected) == len(result['assertions'])))


def classify(result, spec):
    if not healthy(result) or not exact_names(result, spec['cases']):
        return 'inconclusive'
    if green(result, spec['cases']):
        return 'survival-control-confirmed' if spec['expectation'] == 'survival-control' else 'survived'
    if spec['expectation'] == 'survival-control':
        return 'unexpected-control-failure'
    if result.get('exitCode') != 1 or result['counts'].get('numFailedTests') != len(spec['cases']):
        return 'inconclusive'
    expected = {item['fullName']: item for item in spec['cases']}
    for assertion in active(result):
        item = expected[assertion['fullName']]
        messages = '\n'.join(assertion['failureMessages'])
        location = re.escape(item['file']) + ':' + str(item['assertionLine']) + r'(?::\d+|\b)'
        if (assertion['status'] != 'failed' or 'AssertionError' not in messages
                or not re.search(location, messages)
                or (item['requiredMessage'] and item['requiredMessage'] not in messages)):
            return 'inconclusive'
    return 'intended-assertions-red-review-required'


def preflight(clone):
    # Refuse source/meaningful-assertion drift before installing or running anything.
    paths = sorted(set(FILES + [item['path'] for spec in MUTATIONS for item in spec['edits']]))
    originals = {}
    for path in paths:
        target = clone / path
        if target.is_symlink() or clone not in target.resolve().parents or not target.is_file():
            raise RuntimeError('Unsafe or missing source/test path: ' + path)
        originals[path] = target.read_bytes()
    for spec in MUTATIONS:
        simulated = dict(originals)
        for item in spec['edits']:
            old = item['old'].encode()
            if simulated[item['path']].count(old) != 1:
                raise RuntimeError('Mutation anchor absent/ambiguous: ' + spec['name'])
            simulated[item['path']] = simulated[item['path']].replace(old, item['new'].encode(), 1)
        for item in spec['cases']:
            text = originals[item['file']].decode()
            if text.count(item['anchor']) != 1:
                raise RuntimeError('Intended assertion anchor absent/ambiguous: ' + spec['name'])
            item['assertionLine'] = text[:text.index(item['anchor'])].count('\n') + 1 + item['assertionLineOffset']
    return originals


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', required=True, type=Path, help='Local committed source repository (read-only)')
    parser.add_argument('--source', required=True, help='Explicit full forty-character candidate SHA')
    parser.add_argument('--clone', required=True, type=Path, help='New nonexistent scratch clone path')
    parser.add_argument('--output', required=True, type=Path, help='New nonexistent receipt directory outside clone/root')
    parser.add_argument('--node', required=True, type=Path, help='Absolute Node 22 executable')
    parser.add_argument('--pnpm', required=True, type=Path, help='Absolute pnpm JavaScript entrypoint matching packageManager')
    parser.add_argument('--timeout', type=int, default=600)
    parser.add_argument('--install-timeout', type=int, default=1200)
    args = parser.parse_args()
    if not re.fullmatch('[0-9a-f]{40}', args.source) or os.name != 'posix':
        parser.error('Require explicit lowercase full SHA and POSIX process-group support')
    if args.timeout <= 0 or args.install_timeout <= 0:
        parser.error('Timeouts must be positive')
    for value in (args.repository, args.clone, args.output, args.node, args.pnpm):
        if not value.is_absolute():
            parser.error('All supplied filesystem paths must be absolute')
    if args.clone.exists() or args.clone.is_symlink() or args.output.exists() or args.output.is_symlink():
        parser.error('Clone/output must not exist; previous attempts are never reused or overwritten')
    repository, clone, out, node, pnpm = [value.resolve() for value in
                                         (args.repository, args.clone, args.output, args.node, args.pnpm)]
    if not repository.is_dir() or not node.is_file() or not pnpm.is_file():
        parser.error('Source directory and explicit runtime entrypoints must exist')
    for target in (clone, out):
        if target == ROOT or ROOT in target.parents or target == repository or repository in target.parents:
            parser.error('Clone/output must be outside the shared root and source repository')
        if not target.parent.is_dir():
            parser.error('The new directory parent must already exist')
    if clone == out or clone in out.parents or out in clone.parents:
        parser.error('Clone and output must be disjoint')
    out.mkdir(mode=0o700)
    for name in ('home', 'tmp', 'pnpm-store'):
        (out / name).mkdir(mode=0o700)
    env = dict(PATH=str(node.parent) + ':' + str(pnpm.parent) + ':/usr/bin:/bin:/usr/sbin:/sbin', HOME=str(out / 'home'),
               TMPDIR=str(out / 'tmp'), CI='1', NO_COLOR='1', LANG='en_US.UTF-8',
               GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL='/dev/null', GIT_TERMINAL_PROMPT='0',
               NPM_CONFIG_USERCONFIG='/dev/null', NPM_CONFIG_GLOBALCONFIG='/dev/null',
               COREPACK_ENABLE_PROJECT_SPEC='0', AMC_VAULT_PASSPHRASE='stop-auth-mutation-test-only-passphrase')
    runner = Runner(out, clone, env, node, args.timeout)
    summary = dict(schemaVersion=1, authorSource=AUTHOR_SOURCE, source=args.source,
                   repository=str(repository), clone=str(clone), output=str(out),
                   helperSha256=digest(Path(__file__).read_bytes()), startedAt=time.time(), status='incomplete',
                   environment=dict(hostOS=platform.platform(), machine=platform.machine(), python=sys.version),
                   mutations=[], scope='Focused source mutation protocol only; no full-suite/package/platform/release/human qualification',
                   fixtureBoundary='Real temporary workspace keys, local scripted transports and loopback HTTP; no production/provider credentials forwarded')
    started = time.monotonic()
    cloned = False
    write_json(out / 'summary.json', summary)
    try:
        runtime = json.loads(runner.command('node-environment', [node, '-p',
            'JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,versions:process.versions})'], out))
        if not runtime['node'].startswith('v22.'):
            raise RuntimeError('Node 22 is required')
        summary['environment']['node'] = runtime
        summary['environment']['nodeExecutable'] = dict(path=str(node), sha256=digest(node.read_bytes()))
        runner.command('clone', ['git', 'clone', '--no-hardlinks', '--no-checkout', '--', repository, clone], out)
        cloned = True
        if not (clone / '.git').is_dir() or (clone / '.git').is_symlink():
            raise RuntimeError('Expected a new standalone clone, not a linked worktree')
        runner.command('checkout-pin', ['git', '-c', 'advice.detachedHead=false', 'checkout', '--detach', args.source])
        runner.clean(args.source, 'fresh')
        originals = preflight(clone)
        write_json(out / 'mutation-map.json', MUTATIONS)
        write_json(out / 'source-files.json', {path: digest(data) for path, data in originals.items()})
        package = json.loads((clone / 'package.json').read_text())
        manager = re.fullmatch(r'pnpm@([^+]+)(?:\+.*)?', package.get('packageManager', ''))
        version = runner.command('pnpm-version', [node, pnpm, '--version'])
        if manager is None or manager.group(1) != version:
            raise RuntimeError('Explicit pnpm version does not match candidate packageManager')
        summary['environment']['pnpm'] = dict(version=version, entrypoint=str(pnpm), sha256=digest(pnpm.read_bytes()))
        summary['lockfileSha256'] = digest((clone / 'pnpm-lock.yaml').read_bytes())
        runner.command('frozen-install', [node, pnpm, 'install', '--frozen-lockfile', '--store-dir', out / 'pnpm-store'],
                       timeout=args.install_timeout)
        summary['installProvenance'] = 'This helper created a fresh clone and completed the logged frozen install'
        if not (clone / 'node_modules/vitest/vitest.mjs').is_file():
            raise RuntimeError('Frozen installation did not provide Vitest')
        runner.clean(args.source, 'installed')
        summary['installedLockfileSha256'] = digest((clone / 'node_modules/.pnpm/lock.yaml').read_bytes())
        baseline = runner.tests('baseline', FILES)
        summary['baseline'] = dict(folder=baseline['folder'], green=green(baseline))
        if not green(baseline):
            raise RuntimeError('Focused baseline is not entirely green; no mutation applied')
        passed = [item['fullName'] for item in active(baseline)]
        for spec in MUTATIONS:
            if any(passed.count(item['fullName']) != 1 for item in spec['cases']):
                raise RuntimeError('Expected baseline case missing or ambiguous: ' + spec['name'])
        for spec in MUTATIONS:
            runner.clean(args.source, spec['name'] + '-before')
            changed = {}
            for item in spec['edits']:
                path = item['path']
                data = changed.get(path, originals[path])
                if data.count(item['old'].encode()) != 1:
                    raise RuntimeError('Mutation anchor drift: ' + spec['name'])
                changed[path] = data.replace(item['old'].encode(), item['new'].encode(), 1)
            artifact = out / ('source-' + spec['name'])
            artifact.mkdir(mode=0o700)
            row = dict(name=spec['name'], expectation=spec['expectation'], limitation=spec['limitation'],
                       expectedCases=spec['cases'], status='incomplete', files={}, restored=False)
            summary['mutations'].append(row)
            for path, data in changed.items():
                row['files'][path] = dict(originalSha256=digest(originals[path]), mutatedSha256=digest(data))
                (artifact / (path.replace('/', '__') + '.original')).write_bytes(originals[path])
                (artifact / (path.replace('/', '__') + '.mutated')).write_bytes(data)
                diff = ''.join(difflib.unified_diff(originals[path].decode().splitlines(True), data.decode().splitlines(True),
                                                   fromfile='a/' + path, tofile='b/' + path))
                (artifact / (path.replace('/', '__') + '.patch')).write_text(diff)
            write_json(out / 'summary.json', summary)
            try:
                for path, data in changed.items():
                    target = clone / path
                    if target.read_bytes() != originals[path]:
                        raise RuntimeError('Source bytes changed before mutation: ' + path)
                    target.write_bytes(data)
                result = runner.tests(spec['name'], sorted({item['file'] for item in spec['cases']}), spec['cases'])
                row['mutantResult'] = result['folder']
                row['status'] = classify(result, spec)
            finally:
                if runner.unclosedProcess is not None:
                    # A surviving worker may still observe or change these files.
                    # Preserve its clone and the original-byte backups untouched.
                    row['restored'] = False
                    row['restorationDeferred'] = 'Process-group closure unconfirmed; no clone writes or acceptance claim'
                    row['unclosedProcess'] = runner.unclosedProcess
                else:
                    for path in changed:
                        (clone / path).write_bytes(originals[path])
                    row['restored'] = all((clone / path).read_bytes() == originals[path] for path in changed)
                write_json(out / 'summary.json', summary)
            runner.clean(args.source, spec['name'] + '-restored')
            restored = runner.tests(spec['name'] + '-restored', sorted({item['file'] for item in spec['cases']}), spec['cases'])
            row['restoredResult'] = restored['folder']
            row['restoredGreen'] = green(restored, spec['cases'])
            write_json(out / 'summary.json', summary)
            if not row['restoredGreen']:
                raise RuntimeError('Restored named baseline failed; stop before another mutation')
        runner.clean(args.source, 'final')
        wanted = lambda row: ('survival-control-confirmed' if row['expectation'] == 'survival-control'
                              else 'intended-assertions-red-review-required')
        summary['status'] = ('intended-assertions-red-review-required' if all(
            row['status'] == wanted(row) and row['restoredGreen'] for row in summary['mutations']) else 'not-qualified')
    except BaseException as exc:
        summary['status'] = 'incomplete'
        summary['error'] = f'{type(exc).__name__}: {exc}'
    finally:
        if runner.unclosedProcess is not None:
            summary['finalCleanAtPin'] = False
            summary['unclosedProcess'] = runner.unclosedProcess
            summary['cleanupError'] = 'Process-group closure unconfirmed; no further commands or clone writes attempted'
            summary['status'] = 'incomplete'
        elif cloned:
            try:
                runner.clean(args.source, 'exit')
                summary['finalCleanAtPin'] = True
            except BaseException as exc:
                summary['finalCleanAtPin'] = False
                summary['cleanupError'] = f'{type(exc).__name__}: {exc}'
                summary['status'] = 'incomplete'
        summary['finishedAt'] = time.time()
        summary['durationSeconds'] = time.monotonic() - started
        summary['retainedArtifacts'] = 'Clone, temporary fixture files, logs, raw reports and mutation backups retained; no automatic removal'
        write_json(out / 'summary.json', summary)
    print(json.dumps(dict(status=summary['status'], summary=str(out / 'summary.json'))))
    return 0 if summary['status'] == 'intended-assertions-red-review-required' else 1


def interrupted(signum, _frame):
    raise KeyboardInterrupt('Received signal ' + str(signum))


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    sys.exit(main())
