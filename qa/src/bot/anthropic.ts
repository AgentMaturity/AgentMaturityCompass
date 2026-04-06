import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface CompletionResult {
  message: string;
  toolCalls: { id: string; function: { name: string; arguments: string } }[];
}

function convertTools(tools: any[]): Anthropic.Tool[] {
  return tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

function convertMessages(messages: ChatMessage[]): { system: string; messages: Anthropic.MessageParam[] } {
  const system = messages.find(m => m.role === 'system')?.content || '';
  const rest = messages.filter(m => m.role !== 'system');

  const converted: Anthropic.MessageParam[] = [];
  for (const msg of rest) {
    if (msg.role === 'user') {
      converted.push({ role: 'user', content: msg.content || '' });
    } else if (msg.role === 'assistant') {
      if (msg.tool_calls?.length) {
        converted.push({
          role: 'assistant',
          content: msg.tool_calls.map(tc => ({
            type: 'tool_use' as const,
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          })),
        });
      } else {
        converted.push({ role: 'assistant', content: msg.content || '' });
      }
    } else if (msg.role === 'tool') {
      converted.push({
        role: 'user',
        content: [{
          type: 'tool_result' as const,
          tool_use_id: msg.tool_call_id!,
          content: msg.content || '',
        }],
      });
    }
  }

  return { system, messages: converted };
}

export async function chat(
  messages: ChatMessage[],
  tools?: any[],
  _fast?: boolean,
): Promise<CompletionResult> {
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const { system, messages: convertedMessages } = convertMessages(messages);

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system,
    messages: convertedMessages,
    tools: tools?.length ? convertTools(tools) : undefined,
  });

  const textBlocks = response.content.filter(b => b.type === 'text');
  const toolBlocks = response.content.filter(b => b.type === 'tool_use');

  return {
    message: textBlocks.map(b => (b as any).text).join('\n'),
    toolCalls: toolBlocks.map(b => ({
      id: (b as any).id,
      function: { name: (b as any).name, arguments: JSON.stringify((b as any).input) },
    })),
  };
}
