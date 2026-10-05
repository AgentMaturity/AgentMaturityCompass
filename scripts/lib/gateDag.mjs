/** Execute a validated gate DAG sequentially; ordering never implies success. */
export async function runGateDag(nodes, skip) {
  const byId = new Map();
  for (const node of nodes) {
    if (!node.id || byId.has(node.id) || typeof node.run !== "function") throw new Error(`Invalid or duplicate gate: ${node.id}`);
    byId.set(node.id, node);
  }
  for (const node of nodes) {
    for (const dependency of [...(node.needs ?? []), ...(node.after ?? [])]) {
      if (!byId.has(dependency)) throw new Error(`Gate ${node.id} references missing dependency ${dependency}`);
    }
  }
  // Validate the entire graph before running any side effects.
  const ordered = [];
  const pending = new Set(byId.keys());
  while (pending.size) {
    const ready = nodes.find(node => pending.has(node.id)
      && [...(node.needs ?? []), ...(node.after ?? [])].every(id => !pending.has(id)));
    if (!ready) throw new Error(`Gate dependency cycle: ${[...pending].join(", ")}`);
    ordered.push(ready);
    pending.delete(ready.id);
  }
  const results = new Map();
  for (const node of ordered) {
    const blocked = (node.needs ?? []).filter(id => {
      const result = results.get(id);
      return result.status !== "passed" && !(result.status === "failed" && byId.get(id).allowFailure === true);
    });
    const result = blocked.length ? skip(node, blocked) : await node.run();
    if (result.id !== node.id || !["passed", "failed", "skipped"].includes(result.status)) {
      throw new Error(`Gate ${node.id} returned an invalid result`);
    }
    results.set(node.id, { ...result, needs: node.needs ?? [], after: node.after ?? [], allowFailure: node.allowFailure === true });
  }
  return [...results.values()];
}
