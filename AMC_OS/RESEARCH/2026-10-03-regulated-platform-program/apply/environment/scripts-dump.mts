import * as env from "/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-4/src/domains/packs/stations/environment.ts";
import { writeFileSync } from "node:fs";
const out: Record<string, unknown> = {};
for (const v of Object.values(env)) out[(v as { id: string }).id] = v;
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
