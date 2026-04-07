import { query } from '../db.js';

type ToolDef = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
};

export const toolDefinitions: ToolDef[] = [
  // === Database queries (always) ===
  {
    type: 'function',
    function: {
      name: 'get_releases',
      description: 'Get AMC releases from the database',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by status (active, completed)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_test_run_stats',
      description: 'Get AMC vitest run statistics for a release',
      parameters: {
        type: 'object',
        properties: {
          releaseId: { type: 'number', description: 'Release ID' },
        },
        required: ['releaseId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_untriaged_failures',
      description: 'Get untriaged test failures',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max results (default 20)' },
        },
      },
    },
  },
  // === AMC Vitest Runner ===
  {
    type: 'function',
    function: {
      name: 'run_tests',
      description: 'Run AMC vitest test suite. Can run full suite or filter by pattern.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Test file pattern to filter (e.g. "score" to run score tests only)' },
          full: { type: 'boolean', description: 'Run full suite (default: true if no pattern)' },
        },
      },
    },
  },
  // === GitHub Integration ===
  {
    type: 'function',
    function: {
      name: 'github_get_prs',
      description: 'Get open PRs on AgentMaturity/AgentMaturityCompass',
      parameters: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'PR state: open, closed, all (default: open)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_get_workflow_runs',
      description: 'Get recent CI workflow runs',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_trigger_workflow',
      description: 'Trigger a CI workflow on GitHub',
      parameters: {
        type: 'object',
        properties: {
          workflowId: { type: 'string', description: 'Workflow file name (e.g. ci.yml)' },
          ref: { type: 'string', description: 'Branch or tag (default: main)' },
        },
        required: ['workflowId'],
      },
    },
  },
  // === AI Triage ===
  {
    type: 'function',
    function: {
      name: 'triage_failure',
      description: 'AI-triage a test failure: classify as real_bug, flaky, or env_issue',
      parameters: {
        type: 'object',
        properties: {
          failureId: { type: 'number', description: 'Test failure ID to triage' },
        },
        required: ['failureId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'triage_run',
      description: 'AI-triage all untriaged failures in a test run',
      parameters: {
        type: 'object',
        properties: {
          testRunId: { type: 'number', description: 'Test run ID' },
        },
        required: ['testRunId'],
      },
    },
  },
  // === Release Gates ===
  {
    type: 'function',
    function: {
      name: 'check_release_gate',
      description: 'Run automated go/no-go release gate checks',
      parameters: {
        type: 'object',
        properties: {
          releaseId: { type: 'number', description: 'Release ID to check' },
        },
        required: ['releaseId'],
      },
    },
  },
];

async function executeToolInner(name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'get_releases': {
      const status = args.status || 'active';
      const { rows } = await query('SELECT * FROM releases WHERE status = $1 ORDER BY id DESC LIMIT 20', [status]);
      return rows;
    }
    case 'get_test_run_stats': {
      const { rows } = await query(
        `SELECT runner, platform, status, SUM(passed) as passed, SUM(failed) as failed, COUNT(*) as runs
         FROM test_runs WHERE release_id = $1 GROUP BY runner, platform, status`,
        [args.releaseId]
      );
      return rows;
    }
    case 'get_untriaged_failures': {
      const limit = args.limit || 20;
      const { rows } = await query(
        `SELECT tf.*, tr.runner, tr.platform FROM test_failures tf
         JOIN test_runs tr ON tf.test_run_id = tr.id
         WHERE tf.triage_status = 'untriaged'
         ORDER BY tf.created_at DESC LIMIT $1`,
        [limit]
      );
      return rows;
    }
    case 'run_tests': {
      const { runAmcTests } = await import('../runners.js');
      return runAmcTests(args.pattern);
    }
    case 'github_get_prs': {
      const { github } = await import('../integrations/github.js');
      return github.getPRs('AgentMaturityCompass', args.state || 'open');
    }
    case 'github_get_workflow_runs': {
      const { github } = await import('../integrations/github.js');
      return github.getWorkflowRuns('AgentMaturityCompass', args.limit || 10);
    }
    case 'github_trigger_workflow': {
      const { github } = await import('../integrations/github.js');
      await github.triggerWorkflow('AgentMaturityCompass', args.workflowId, args.ref || 'main');
      return { success: true };
    }
    case 'triage_failure': {
      const { triageFailure } = await import('./decisions.js');
      return triageFailure(args.failureId);
    }
    case 'triage_run': {
      const { triageRun } = await import('./decisions.js');
      return triageRun(args.testRunId);
    }
    case 'check_release_gate': {
      const { checkReleaseGate } = await import('./decisions.js');
      return checkReleaseGate(args.releaseId);
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export async function executeTool(name: string, args: Record<string, any>): Promise<string> {
  try {
    const result = await executeToolInner(name, args);
    return JSON.stringify(result);
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}
