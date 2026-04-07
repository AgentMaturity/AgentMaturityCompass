import { query } from '../db.js';
import { chat, ChatMessage } from './anthropic.js';
import { toolDefinitions, executeTool } from './tools.js';

const SYSTEM_PROMPT = `You are OpenClaw QA, the AI release operations assistant for Agent Maturity Compass (AMC).
AMC is an evidence-backed trust/maturity framework for AI agents with 235 diagnostic questions,
5031+ tests (vitest), and a Commander-based CLI. Repo: AgentMaturity/AgentMaturityCompass.

Your job is to orchestrate the AMC release lifecycle: run tests, triage failures, check release
gates, monitor CI workflows, and coordinate releases.

Rules:
- When asked to run tests, proceed immediately. Do not ask for confirmation.
- When asked to check alerts or triage, use the tools right away.
- Be action-oriented: execute first, report results after.
- AMC uses vitest for testing. The test suite has 336 test files and 5031 tests.

Connected integrations and capabilities:
- GitHub: query PRs on AgentMaturity/AgentMaturityCompass, check releases, trigger CI workflows, view workflow runs
- Vitest: run the full AMC test suite or filtered subsets
- Database: query releases, get test run stats, find untriaged failures
- AI Triage: auto-classify test failures as real_bug / flaky / env_issue
- Release Gates: automated go/no-go checks before npm publish`;

const conversations = new Map<string, ChatMessage[]>();
const MAX_HISTORY = 40;

function getConversation(context: string): ChatMessage[] {
  if (!conversations.has(context)) {
    conversations.set(context, [
      { role: 'system', content: SYSTEM_PROMPT },
    ]);
  }
  return conversations.get(context)!;
}

function trimHistory(messages: ChatMessage[]): void {
  if (messages.length > MAX_HISTORY + 1) {
    const system = messages[0];
    const recent = messages.slice(-(MAX_HISTORY));
    messages.length = 0;
    messages.push(system, ...recent);
  }
}

export async function processMessage(
  userMessage: string,
  context: string = 'global',
): Promise<{ reply: string; toolsUsed: string[] }> {
  const messages = getConversation(context);
  messages.push({ role: 'user', content: userMessage });

  const toolsUsed: string[] = [];
  let iterations = 0;
  const maxIterations = 10;

  while (iterations < maxIterations) {
    iterations++;

    const result = await chat(messages, toolDefinitions);

    if (result.toolCalls.length === 0) {
      messages.push({ role: 'assistant', content: result.message });
      trimHistory(messages);

      await query('INSERT INTO bot_log (msg) VALUES ($1)', [
        `OpenClaw QA: ${result.message.slice(0, 200)}`,
      ]);

      return { reply: result.message, toolsUsed };
    }

    messages.push({
      role: 'assistant',
      content: result.message || null,
      tool_calls: result.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
    } as any);

    for (const tc of result.toolCalls) {
      const toolName = tc.function.name;
      toolsUsed.push(toolName);

      let args: Record<string, any>;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = {};
      }

      await query('INSERT INTO bot_log (msg) VALUES ($1)', [
        `Tool: ${toolName}(${JSON.stringify(args).slice(0, 150)})`,
      ]);

      const toolResult = await executeTool(toolName, args);

      messages.push({
        role: 'tool',
        content: toolResult,
        tool_call_id: tc.id,
        name: toolName,
      });
    }
  }

  const fallback = 'I reached the maximum number of tool calls. Here is what I have so far.';
  messages.push({ role: 'assistant', content: fallback });
  return { reply: fallback, toolsUsed };
}

export function clearConversation(context: string = 'global'): void {
  conversations.delete(context);
}

export function getHistory(context: string = 'global'): ChatMessage[] {
  return getConversation(context).filter(m => m.role !== 'system');
}

export async function runAction(action: string): Promise<string> {
  const { reply } = await processMessage(action);
  return reply;
}
