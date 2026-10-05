import type { OrgConfig } from "./orgSchema.js";

export function validateOrgGraph(config: OrgConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const nodeById = new Map<string, { parentId: string | null }>();

  for (const node of config.nodes) {
    if (nodeById.has(node.id)) {
      errors.push(`duplicate node id: ${node.id}`);
    }
    nodeById.set(node.id, { parentId: node.parentId });
  }

  for (const node of config.nodes) {
    if (node.parentId !== null && !nodeById.has(node.parentId)) {
      errors.push(`node '${node.id}' references missing parent '${node.parentId}'`);
    }
    if (node.parentId === node.id) {
      errors.push(`node '${node.id}' cannot parent itself`);
    }
  }

  // cycle detection
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): void => {
    if (visited.has(id)) {
      return;
    }
    if (visiting.has(id)) {
      errors.push(`cycle detected at node '${id}'`);
      return;
    }
    visiting.add(id);
    const parentId = nodeById.get(id)?.parentId ?? null;
    if (parentId && nodeById.has(parentId)) {
      visit(parentId);
    }
    visiting.delete(id);
    visited.add(id);
  };

  for (const node of config.nodes) {
    visit(node.id);
  }

  for (const membership of config.memberships) {
    if (membership.weight <= 0) {
      errors.push(`membership weight must be positive for agent '${membership.agentId}'`);
    }
    for (const nodeId of membership.nodeIds) {
      if (!nodeById.has(nodeId)) {
        errors.push(`membership references missing node '${nodeId}' for agent '${membership.agentId}'`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function assertValidOrgGraph(config: OrgConfig): void {
  const out = validateOrgGraph(config);
  if (!out.valid) {
    throw new Error(`Invalid org graph:\n- ${out.errors.join("\n- ")}`);
  }
}
