const MODES = new Set(['error_before_commit', 'error_after_commit', 'drop_response_after_commit', 'delay_then_commit', 'crash_after_commit', 'reset_before_body']);
export const emptyPlan = () => ({ schemaVersion: 'lighthouse-finance-faults/1', faults: [] });
export function validateFaultPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || plan.schemaVersion !== 'lighthouse-finance-faults/1'
    || Object.keys(plan).some(key => !['schemaVersion', 'faults'].includes(key)) || !Array.isArray(plan.faults) || plan.faults.length > 100) throw new Error('invalid_fault_plan');
  const ids = new Set(), matches = new Set();
  for (const rule of plan.faults) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule) || Object.keys(rule).some(key => !['id', 'method', 'path', 'nth', 'mode', 'status', 'delayMs'].includes(key))
      || typeof rule.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(rule.id) || ids.has(rule.id)
      || !['GET', 'POST'].includes(rule.method) || typeof rule.path !== 'string' || !/^\/v1\/[A-Za-z0-9_/-]{1,200}$/.test(rule.path)
      || !Number.isSafeInteger(rule.nth) || rule.nth < 1 || rule.nth > 1_000_000 || !MODES.has(rule.mode)
      || (rule.status !== undefined && (!Number.isInteger(rule.status) || rule.status < 500 || rule.status > 599))
      || (rule.delayMs !== undefined && (!Number.isInteger(rule.delayMs) || rule.delayMs < 0 || rule.delayMs > 120_000))
      || (!['reset_before_body', 'error_before_commit'].includes(rule.mode) && (rule.method !== 'POST' || rule.path !== '/v1/payments'))
      || matches.has(`${rule.method}:${rule.path}:${rule.nth}`)) throw new Error('invalid_fault_plan');
    ids.add(rule.id); matches.add(`${rule.method}:${rule.path}:${rule.nth}`);
  }
  return structuredClone(plan);
}
export function createFaults(initial) {
  let plan = validateFaultPlan(initial), counts = new Map();
  return { get plan() { return structuredClone(plan); },
    replace(next) { plan = validateFaultPlan(next); counts = new Map(); },
    restoreCounts(snapshot) {
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
        || Object.entries(snapshot).some(([key, value]) => !plan.faults.some(rule => rule.id === key) || !Number.isSafeInteger(value) || value < 0)) throw new Error('invalid fault log state');
      for (const [key, value] of Object.entries(snapshot)) counts.set(key, Math.max(counts.get(key) ?? 0, value));
    },
    match(method, path) {
      let chosen = null;
      for (const rule of plan.faults) if (rule.method === method && rule.path === path) {
        const count = (counts.get(rule.id) ?? 0) + 1; counts.set(rule.id, count);
        if (count === rule.nth && chosen === null) chosen = rule;
      }
      return chosen;
    }, snapshot() { return { ...structuredClone(plan), counts: Object.fromEntries(counts) }; } };
}
