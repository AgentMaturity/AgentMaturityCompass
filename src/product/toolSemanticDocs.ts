/**
 * library-only, not enforced by native tool discovery: no production caller uses
 * this TF-IDF catalog. Canonical tool definitions and admission live in
 * src/tools/toolRegistry.ts and src/agent/agentToolset.ts. WP13 should reuse this
 * search implementation when wiring step-owned deferred discovery.
 *
 * toolSemanticDocs.ts — Semantic tool documentation with TF-IDF search,
 * pre-computed index, and related tool suggestions.
 */

export interface ToolSpec {
  id: string;
  name: string;
  description: string;
  params?: { name: string; type: string }[];
  tags?: string[];
}

export interface SemanticDoc {
  toolName: string;
  summary: string;
  examples: string[];
  params: string[];
  relatedTools: string[];
}

export interface SearchResult {
  tool: ToolSpec;
  score: number;
  matchedTerms: string[];
}

/* ── TF-IDF index ────────────────────────────────────────────────── */

interface ToolIndex {
  tools: ToolSpec[];
  idf: Map<string, number>;
  toolVectors: Map<string, Map<string, number>>;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s_-]/g, ' ').split(/\s+/).filter(Boolean);
}

function buildToolText(tool: ToolSpec): string {
  const parts = [tool.name, tool.description, ...(tool.tags ?? [])];
  if (tool.params) parts.push(...tool.params.map(p => `${p.name} ${p.type}`));
  return parts.join(' ');
}

export function buildIndex(tools: ToolSpec[]): ToolIndex {
  const df = new Map<string, number>();
  const toolDocs = tools.map(t => tokenize(buildToolText(t)));

  for (const tokens of toolDocs) {
    const unique = new Set(tokens);
    for (const t of unique) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const N = tools.length;
  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log(1 + N / (1 + count)));
  }

  const toolVectors = new Map<string, Map<string, number>>();
  for (let i = 0; i < tools.length; i++) {
    const tokens = toolDocs[i]!;
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const vec = new Map<string, number>();
    for (const [term, count] of tf) {
      vec.set(term, (count / tokens.length) * (idf.get(term) ?? 0));
    }
    toolVectors.set(tools[i]!.id, vec);
  }

  return { tools, idf, toolVectors };
}

/* ── Search ──────────────────────────────────────────────────────── */

export function searchTools(query: string, tools: ToolSpec[], index?: ToolIndex): SearchResult[] {
  const idx = index ?? buildIndex(tools);
  const queryTerms = tokenize(query);
  const queryTf = new Map<string, number>();
  for (const t of queryTerms) queryTf.set(t, (queryTf.get(t) ?? 0) + 1);

  const results: SearchResult[] = [];
  for (const tool of idx.tools) {
    const vec = idx.toolVectors.get(tool.id);
    if (!vec) continue;

    let score = 0;
    const matched: string[] = [];
    for (const [term, count] of queryTf) {
      const idfVal = idx.idf.get(term) ?? 0;
      const toolWeight = vec.get(term) ?? 0;
      if (toolWeight > 0) {
        score += (count / queryTerms.length) * idfVal * toolWeight;
        matched.push(term);
      }
    }
    if (score > 0) results.push({ tool, score, matchedTerms: matched });
  }

  return results.sort((a, b) => b.score - a.score);
}

/* ── Generate docs ───────────────────────────────────────────────── */

export function generateDocs(toolSpec: ToolSpec, allTools?: ToolSpec[]): SemanticDoc {
  const params = (toolSpec.params ?? []).map(p => `${p.name}: ${p.type}`);
  const examples = [
    `Use ${toolSpec.name} to ${toolSpec.description.toLowerCase()}`,
    `Example: await ${toolSpec.name}(${params.map(p => p.split(':')[0]).join(', ')})`,
  ];

  // Find related tools
  let relatedTools: string[] = [];
  if (allTools && allTools.length > 1) {
    const results = searchTools(toolSpec.description, allTools.filter(t => t.id !== toolSpec.id));
    relatedTools = results.slice(0, 3).map(r => r.tool.name);
  }

  return { toolName: toolSpec.name, summary: toolSpec.description, examples, params, relatedTools };
}

export function enrichSpec(toolId: string, examples: string[]): SemanticDoc {
  return { toolName: toolId, summary: '', examples, params: [], relatedTools: [] };
}

export function generateSemanticDocs(toolName: string, description: string): SemanticDoc {
  return { toolName, summary: description, examples: [`Use ${toolName} to...`], params: [], relatedTools: [] };
}
