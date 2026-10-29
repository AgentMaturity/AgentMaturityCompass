// CR-1 to CR-6 (docs/deploy/reference/CRASH_RECOVERY.md, KEY_PROVIDER_OUTAGE.md).
import { criterion, fullname, governedTurn, isPrefix, kubectl, ledgerSnapshot, notRun, verdict, waitRollout } from "./lib.mjs";

/**
 * CR-2: cordon and drain the node that runs Studio. On one node (kind) the pod cannot move, so this exercises the
 * documented procedure: the PDB lets the single pod be evicted, the node is uncordoned, and Studio returns on its
 * volume with the chain intact.
 */
async function cr2(ctx) {
  const criteria = [];
  const node = kubectl(ctx, ["get", "pod", "-l", `app.kubernetes.io/instance=${ctx.release}`, "-o", "jsonpath={.items[0].spec.nodeName}"], { quiet: true }).stdout.trim();
  const nodes = kubectl(ctx, ["get", "nodes", "-o", "name"], { quiet: true }).stdout.trim().split("\n").filter(Boolean);
  criteria.push(criterion("node running Studio found", node !== "", { node, nodes: nodes.length }));
  if (!node) return verdict(criteria);
  const before = ledgerSnapshot(ctx);
  kubectl(ctx, ["cordon", node]);
  const drain = kubectl(ctx, ["drain", node, "--ignore-daemonsets", "--delete-emptydir-data", "--pod-selector", `app.kubernetes.io/instance=${ctx.release}`,
    "--timeout=180s"]);
  criteria.push(criterion("drain evicts Studio within 180 s (PodDisruptionBudget allows it)", drain.status === 0, { exit: drain.status, message: drain.stderr.trim().split("\n").at(-1) }));
  const elsewhere = nodes.length > 1 ? waitRollout(ctx) : { ready: false, ms: 0 };
  kubectl(ctx, ["uncordon", node]);
  const back = elsewhere.ready ? elsewhere : waitRollout(ctx);
  const placed = kubectl(ctx, ["get", "pod", "-l", `app.kubernetes.io/instance=${ctx.release}`, "-o", "jsonpath={.items[0].spec.nodeName}"], { quiet: true }).stdout.trim();
  criteria.push(criterion(elsewhere.ready ? "Ready on another node with its volume" : "Ready again after uncordon (single-node procedure)", back.ready,
    { node: placed, readyMs: back.ms }));
  const after = ledgerSnapshot(ctx);
  criteria.push(criterion("chain intact across the drain", isPrefix(before, after) && after.linked && after.integrity === "ok"));
  const turn = governedTurn(ctx);
  criteria.push(criterion("governed turn passes after the drain", turn.ok, turn));
  return verdict(criteria, { podName: fullname(ctx) });
}

export const checks = {
  "CR-1": async () => notRun("needs a consequential fixture action with a system of record (P1-19 finance fixture) and the P1-03/P2-12 resume semantics wired into this harness", ["P1-19", "P1-03", "P2-12"]),
  "CR-2": cr2,
  "CR-3": async () => notRun("filling the volume needs a size-limited storage class; kind's local-path volumes share the node disk", ["P2-06 follow-up"]),
  "CR-4": async () => notRun("the chart runs the file KeyProvider; blocking a networked KeyProvider (SoftHSM or a KMS) is not wired into the chart", ["P2-08"]),
  "CR-5": async () => notRun("the reference topology runs SQLite on one volume; the Postgres HA option is not part of it", ["P2-09"]),
  "CR-6": async () => notRun("no scraper or OTLP endpoint is deployed by this harness, so an outage cannot be staged yet", ["P2-06 follow-up"])
};
