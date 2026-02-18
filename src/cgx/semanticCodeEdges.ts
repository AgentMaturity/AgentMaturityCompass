/**
 * Semantic Code Edges for CGX
 *
 * Extends the Compliance Graph beyond governance nodes into code structure,
 * mapping source files, functions, modules, and configs with typed edges.
 *
 * Node types: CODE_FILE, CODE_FUNCTION, CODE_MODULE, CODE_CONFIG
 * Edges: IMPORTS, CALLS, CONFIGURES, TESTS
 *
 * CLI: amc cgx code-scan --agent <id> --path <repo-path>
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname, basename, dirname } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CodeNodeType = "CODE_FILE" | "CODE_FUNCTION" | "CODE_MODULE" | "CODE_CONFIG";
export type CodeEdgeType = "IMPORTS" | "CALLS" | "CONFIGURES" | "TESTS";

export interface CodeNode {
  id: string;
  type: CodeNodeType;
  label: string;
  filePath: string;
  hash: string;
}

export interface CodeEdge {
  id: string;
  type: CodeEdgeType;
  from: string;
  to: string;
  hash: string;
  confidence: number;
}

export interface CodeGraph {
  agentId: string;
  repoPath: string;
  scannedTs: number;
  nodes: CodeNode[];
  edges: CodeEdge[];
  stats: {
    fileCount: number;
    functionCount: number;
    moduleCount: number;
    configCount: number;
    edgeCount: number;
  };
}

// ---------------------------------------------------------------------------
// File scanning
// ---------------------------------------------------------------------------

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".rb", ".php",
  ".c", ".cpp", ".h", ".hpp", ".cs",
]);

const CONFIG_EXTENSIONS = new Set([
  ".json", ".yaml", ".yml", ".toml", ".ini", ".env",
  ".config.js", ".config.ts",
]);

const CONFIG_NAMES = new Set([
  "package.json", "tsconfig.json", "pyproject.toml",
  "Cargo.toml", "go.mod", "Makefile", "Dockerfile",
  ".env", ".env.local", ".env.production",
]);

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out",
  "__pycache__", ".next", "coverage", ".amc",
  "vendor", "target",
]);

function walkDir(dir: string, maxDepth = 8, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkDir(full, maxDepth, depth + 1));
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  } catch {
    // permission denied or similar
  }
  return results;
}

function isCodeFile(filePath: string): boolean {
  return CODE_EXTENSIONS.has(extname(filePath));
}

function isConfigFile(filePath: string): boolean {
  const ext = extname(filePath);
  const name = basename(filePath);
  return CONFIG_EXTENSIONS.has(ext) || CONFIG_NAMES.has(name);
}

function isTestFile(filePath: string): boolean {
  const name = basename(filePath).toLowerCase();
  return (
    name.includes(".test.") ||
    name.includes(".spec.") ||
    name.includes("_test.") ||
    name.startsWith("test_") ||
    filePath.includes("__tests__") ||
    filePath.includes("/test/") ||
    filePath.includes("/tests/")
  );
}

// ---------------------------------------------------------------------------
// Import/call extraction (lightweight regex-based)
// ---------------------------------------------------------------------------

const TS_IMPORT_RE = /(?:import|require)\s*\(?\s*['"]([^'"]+)['"]\)?/g;
const PY_IMPORT_RE = /(?:from\s+(\S+)\s+import|import\s+(\S+))/g;
const GO_IMPORT_RE = /import\s+(?:\(([^)]+)\)|"([^"]+)")/g;

function extractImports(content: string, ext: string): string[] {
  const imports: string[] = [];

  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    for (const match of content.matchAll(TS_IMPORT_RE)) {
      if (match[1]) imports.push(match[1]);
    }
  } else if (ext === ".py") {
    for (const match of content.matchAll(PY_IMPORT_RE)) {
      imports.push(match[1] || match[2] || "");
    }
  } else if (ext === ".go") {
    for (const match of content.matchAll(GO_IMPORT_RE)) {
      const block = match[1] || match[2] || "";
      for (const line of block.split("\n")) {
        const trimmed = line.trim().replace(/"/g, "");
        if (trimmed) imports.push(trimmed);
      }
    }
  }

  return imports.filter(Boolean);
}

const TS_FUNCTION_RE = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
const PY_FUNCTION_RE = /^def\s+(\w+)/gm;
const GO_FUNCTION_RE = /^func\s+(?:\([^)]*\)\s+)?(\w+)/gm;

function extractFunctions(content: string, ext: string): string[] {
  const fns: string[] = [];
  let re: RegExp;

  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    re = TS_FUNCTION_RE;
  } else if (ext === ".py") {
    re = PY_FUNCTION_RE;
  } else if (ext === ".go") {
    re = GO_FUNCTION_RE;
  } else {
    return fns;
  }

  for (const match of content.matchAll(re)) {
    if (match[1]) fns.push(match[1]);
  }
  return fns;
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

function nodeId(type: CodeNodeType, path: string, name?: string): string {
  const base = `${type}:${path}${name ? `:${name}` : ""}`;
  return sha256Hex(base).slice(0, 16);
}

function edgeId(type: CodeEdgeType, from: string, to: string): string {
  return sha256Hex(`${type}:${from}:${to}`).slice(0, 16);
}

function hashNode(node: Omit<CodeNode, "hash">): string {
  return sha256Hex(canonicalize(node));
}

/**
 * Scan a repository path and build a CodeGraph.
 */
export function scanCodeGraph(agentId: string, repoPath: string): CodeGraph {
  const files = walkDir(repoPath);
  const nodes: CodeNode[] = [];
  const edges: CodeEdge[] = [];
  const fileNodeMap = new Map<string, string>(); // relative path -> node id
  const moduleMap = new Map<string, string>(); // module dir -> node id

  let functionCount = 0;
  let configCount = 0;

  // Pass 1: Create file and config nodes
  for (const filePath of files) {
    const rel = relative(repoPath, filePath);
    const ext = extname(filePath);

    if (isConfigFile(filePath)) {
      const id = nodeId("CODE_CONFIG", rel);
      const node: Omit<CodeNode, "hash"> = {
        id,
        type: "CODE_CONFIG",
        label: basename(filePath),
        filePath: rel,
      };
      nodes.push({ ...node, hash: hashNode(node) });
      fileNodeMap.set(rel, id);
      configCount++;
      continue;
    }

    if (!isCodeFile(filePath)) continue;

    const id = nodeId("CODE_FILE", rel);
    const node: Omit<CodeNode, "hash"> = {
      id,
      type: "CODE_FILE",
      label: basename(filePath),
      filePath: rel,
    };
    nodes.push({ ...node, hash: hashNode(node) });
    fileNodeMap.set(rel, id);

    // Track module (directory)
    const dir = dirname(rel);
    if (!moduleMap.has(dir)) {
      const modId = nodeId("CODE_MODULE", dir);
      const modNode: Omit<CodeNode, "hash"> = {
        id: modId,
        type: "CODE_MODULE",
        label: dir || "root",
        filePath: dir,
      };
      nodes.push({ ...modNode, hash: hashNode(modNode) });
      moduleMap.set(dir, modId);
    }
  }

  // Pass 2: Extract functions, imports, and edges
  for (const filePath of files) {
    if (!isCodeFile(filePath)) continue;
    const rel = relative(repoPath, filePath);
    const ext = extname(filePath);
    const fileId = fileNodeMap.get(rel);
    if (!fileId) continue;

    let content: string;
    try {
      content = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    // Functions
    const fns = extractFunctions(content, ext);
    for (const fnName of fns) {
      const fnId = nodeId("CODE_FUNCTION", rel, fnName);
      const fnNode: Omit<CodeNode, "hash"> = {
        id: fnId,
        type: "CODE_FUNCTION",
        label: fnName,
        filePath: rel,
      };
      nodes.push({ ...fnNode, hash: hashNode(fnNode) });
      functionCount++;

      // Function belongs to file (CALLS edge from file)
      const eid = edgeId("CALLS", fileId, fnId);
      edges.push({
        id: eid,
        type: "CALLS",
        from: fileId,
        to: fnId,
        hash: sha256Hex(`${eid}:CALLS`),
        confidence: 1.0,
      });
    }

    // Imports
    const imports = extractImports(content, ext);
    for (const imp of imports) {
      // Try to resolve import to a file node
      const candidates = [
        imp,
        `${imp}.ts`, `${imp}.js`, `${imp}.py`, `${imp}.go`,
        `${imp}/index.ts`, `${imp}/index.js`,
        join(dirname(rel), imp),
        join(dirname(rel), `${imp}.ts`),
        join(dirname(rel), `${imp}.js`),
      ];

      for (const candidate of candidates) {
        const normalized = candidate.replace(/^\.\//, "");
        const targetId = fileNodeMap.get(normalized);
        if (targetId && targetId !== fileId) {
          const eid = edgeId("IMPORTS", fileId, targetId);
          if (!edges.some((e) => e.id === eid)) {
            edges.push({
              id: eid,
              type: "IMPORTS",
              from: fileId,
              to: targetId,
              hash: sha256Hex(`${eid}:IMPORTS`),
              confidence: 0.9,
            });
          }
          break;
        }
      }
    }

    // Test files -> TESTS edges to the file they test
    if (isTestFile(filePath)) {
      const testTarget = basename(filePath)
        .replace(/\.test\.|\.spec\.|_test\./g, ".")
        .replace(/^test_/, "");
      for (const [candidateRel, candidateId] of fileNodeMap) {
        if (candidateId === fileId) continue;
        if (basename(candidateRel) === testTarget) {
          const eid = edgeId("TESTS", fileId, candidateId);
          edges.push({
            id: eid,
            type: "TESTS",
            from: fileId,
            to: candidateId,
            hash: sha256Hex(`${eid}:TESTS`),
            confidence: 0.8,
          });
        }
      }
    }
  }

  // Config edges: config files CONFIGURE code files in the same directory
  for (const [rel, id] of fileNodeMap) {
    const node = nodes.find((n) => n.id === id);
    if (!node || node.type !== "CODE_CONFIG") continue;
    const dir = dirname(rel);
    for (const [otherRel, otherId] of fileNodeMap) {
      if (otherId === id) continue;
      const otherNode = nodes.find((n) => n.id === otherId);
      if (!otherNode || otherNode.type === "CODE_CONFIG") continue;
      if (dirname(otherRel) === dir) {
        const eid = edgeId("CONFIGURES", id, otherId);
        if (!edges.some((e) => e.id === eid)) {
          edges.push({
            id: eid,
            type: "CONFIGURES",
            from: id,
            to: otherId,
            hash: sha256Hex(`${eid}:CONFIGURES`),
            confidence: 0.6,
          });
        }
      }
    }
  }

  return {
    agentId,
    repoPath,
    scannedTs: Date.now(),
    nodes,
    edges,
    stats: {
      fileCount: [...fileNodeMap.values()].length - configCount,
      functionCount,
      moduleCount: moduleMap.size,
      configCount,
      edgeCount: edges.length,
    },
  };
}

/**
 * Map code changes to affected governance nodes via semantic edges.
 * Given a list of changed file paths, find all connected code nodes
 * and return their IDs for impact simulation.
 */
export function propagateCodeChanges(
  graph: CodeGraph,
  changedFiles: string[]
): {
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  impactSummary: string;
} {
  const changedSet = new Set(changedFiles.map((f) => f.replace(/^\.\//, "")));
  const affectedNodeIds = new Set<string>();
  const affectedEdgeIds = new Set<string>();

  // Find directly changed file nodes
  for (const node of graph.nodes) {
    if (changedSet.has(node.filePath)) {
      affectedNodeIds.add(node.id);
    }
  }

  // Propagate through edges (1 hop)
  for (const edge of graph.edges) {
    if (affectedNodeIds.has(edge.from) || affectedNodeIds.has(edge.to)) {
      affectedEdgeIds.add(edge.id);
      affectedNodeIds.add(edge.from);
      affectedNodeIds.add(edge.to);
    }
  }

  // Second hop for transitive impact
  for (const edge of graph.edges) {
    if (affectedNodeIds.has(edge.from) || affectedNodeIds.has(edge.to)) {
      affectedEdgeIds.add(edge.id);
      affectedNodeIds.add(edge.from);
      affectedNodeIds.add(edge.to);
    }
  }

  return {
    affectedNodeIds: [...affectedNodeIds],
    affectedEdgeIds: [...affectedEdgeIds],
    impactSummary:
      `${changedFiles.length} file(s) changed → ${affectedNodeIds.size} nodes affected ` +
      `across ${affectedEdgeIds.size} edges`,
  };
}

/**
 * Render code graph summary for CLI output.
 */
export function renderCodeGraphMarkdown(graph: CodeGraph): string {
  const lines = [
    `# Code Graph: ${graph.agentId}`,
    "",
    `**Repo:** ${graph.repoPath}`,
    `**Scanned:** ${new Date(graph.scannedTs).toISOString()}`,
    "",
    "## Stats",
    "",
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Files | ${graph.stats.fileCount} |`,
    `| Functions | ${graph.stats.functionCount} |`,
    `| Modules | ${graph.stats.moduleCount} |`,
    `| Configs | ${graph.stats.configCount} |`,
    `| Edges | ${graph.stats.edgeCount} |`,
    `| Total Nodes | ${graph.nodes.length} |`,
    "",
    "## Edge Distribution",
    "",
  ];

  const edgeCounts: Record<string, number> = {};
  for (const edge of graph.edges) {
    edgeCounts[edge.type] = (edgeCounts[edge.type] ?? 0) + 1;
  }
  for (const [type, count] of Object.entries(edgeCounts).sort()) {
    lines.push(`- **${type}**: ${count}`);
  }

  return lines.join("\n");
}
