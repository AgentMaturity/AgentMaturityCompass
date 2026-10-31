import sys,subprocess,os
F='src/persistence/postgres/postgresMigration.ts'
orig=open(F).read()
M={
 'M1 no copy proof': ('const problems = copyProblems(client, workspace, db, chainId, expected);','const problems: string[] = [];'),
 'M2 commit instead of rollback': ('try { client.query("ROLLBACK"); }','try { client.query("COMMIT"); }'),
 'M3 resume any chain': ('if (problems.length > 0) {\n        throw','if (problems.length > 0 && !resumed) {\n        throw'),
 'M4 chain id before copy': ('const chainId = readPostgresChainId(workspace) ?? randomUUID();','const chainId = ensurePostgresChainId(workspace);'),
 'M5 chain id first after commit': ('  recordSignedPostgresHead(workspace, chainId, expected.events.hash, expected.events.seq);\n','  ensurePostgresChainId(workspace, chainId);\n  recordSignedPostgresHead(workspace, chainId, expected.events.hash, expected.events.seq);\n'),
 'M6 no mirror parity': ('problems.push(...expected.scopes.flatMap(','problems.push(...[].flatMap('),
 'M7 head row check off': ('if (row === undefined || String(row.head_hash) !== head.hash || Number(row.head_seq) !== head.seq) problems.push','if (false) problems.push'),
 'M8 chain never holds rows': ('const resumed = chainHoldsRows(client, chainId);','const resumed = false;'),
 'M9 table compare off': ('return local.length !== copied.length || local.some((row, i) => row !== copied[i]);','return false;'),
}
env=dict(os.environ)
for name,(a,b) in M.items():
    assert orig.count(a)==1,(name)
    open(F,'w').write(orig.replace(a,b))
    r=subprocess.run(['npx','vitest','run','tests/postgresSessionEventStore.test.ts','tests/a4PostgresMirror.test.ts','--maxWorkers=2','-t','migrate'],capture_output=True,text=True,env=env)
    line=[l for l in r.stdout.splitlines() if 'Tests ' in l]
    print(name,'->',line, 'KILLED' if r.returncode!=0 else 'SURVIVED',flush=True)
open(F,'w').write(orig)
