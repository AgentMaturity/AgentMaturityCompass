#!/usr/bin/env python3
"""Reduce a local Graphify AST extraction to reviewable AMC navigation maps.

Run with the Python environment containing graphifyy==0.9.56. No model calls.
The raw graph is retained separately; file edges retain their AST evidence.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import subprocess

import networkx as nx
from graphify.export import to_canvas, to_html, to_json, to_obsidian


MAPS = {
    "native-studio": [
        "src/console/assets/nativeTasks.js", "src/console/assets/nativeTasksView.js",
        "src/console/assets/api.js", "src/api/nativeTasksRouter.ts",
        "src/studio/apiDelegation.ts", "src/studio/nativeAdmission.ts",
        "src/studio/nativeTaskService.ts", "src/studio/nativeTaskTypes.ts",
        "src/studio/nativeTaskDescriptors.ts", "src/studio/nativeTaskProjection.ts",
        "src/studio/studioApprovalAdmission.ts", "src/studio/nativeTaskOpenapi.ts",
        "src/approvals/approvalStudioService.ts", "src/approvals/approvalInbox.ts",
        "src/sdk/nativeAgentClient.ts", "src/acp/acpCli.ts", "src/acp/acpStdioMain.ts",
        "src/acp/acpAgentServer.ts", "src/acp/acpNativeSession.ts",
        "src/session/sessionResume.ts", "src/session/sessionRecovery.ts",
        "src/ledger/ledgerVerification.ts", "src/ledger/ledgerSessionTransactions.ts",
        "src/agent/agentSession.ts", "src/agent/agentToolset.ts",
        "src/tools/guards/policyGuards.ts", "src/toolhub/toolhubValidators.ts",
        "src/workspaces/workspaceRuntimeRegistry.ts", "src/workspaces/workspaceStudioProxy.ts",
        "src/workspaces/workspaceRouter.ts", "src/studio/studioServer.ts",
    ],
    "native-runtime": [
        "src/cli-agent-commands.ts", "src/cli-agent-options.ts", "src/kernel/agentLoopRunner.ts",
        "src/kernel/amcRuntime.ts",
        "src/kernel/services/agentLoopServices.ts", "src/kernel/services/llmServices.ts",
        "src/kernel/services/promptServices.ts", "src/kernel/services/approvalServices.ts",
        "src/agent/agentDriver.ts", "src/agent/stepRunner.ts", "src/agent/approvalGate.ts",
        "src/agent/pipelineToolSeam.ts", "src/agent/agentToolset.ts", "src/agent/subagentRunner.ts",
        "src/agent/delegateTool.ts", "src/agent/subagentSpawn.ts",
        "src/agent/delegationIdentity.ts", "src/agent/delegationScope.ts",
        "src/agent/delegationEvidenceWriter.ts", "src/fleet/delegationPacket.ts",
        "src/agent/runReport.ts",
        "src/tools/toolPipeline.ts", "src/llm/adapter/llmRuntime.ts",
        "src/session/sessionService.ts", "src/session/sessionSpine.ts",
        "src/session/sessionRecovery.ts", "src/session/sessionResume.ts",
        "src/session/sessionOwnership.ts",
        "src/session/surfaceProjection.ts", "src/session/surfaceCompaction.ts",
        "src/session/surfaceCompactionValidation.ts",
        "src/session/sessionCompactionWorkflow.ts", "src/cli-session-compaction-commands.ts",
        "src/persistence/openSessionEventStore.ts",
        "src/persistence/sqliteSessionEventStore.ts", "src/persistence/jsonl/jsonlSessionEventStore.ts",
        "src/ledger/ledger.ts", "src/ledger/ledgerSessionTransactions.ts",
        "packages/amc-core/src/composition.ts",
        "scripts/bundle-kernel.mjs", "scripts/packed-install-check.mjs",
        "scripts/packed-evidence-verification.mjs",
    ],
    "evidence-imports": [
        "src/cli-import-commands.ts", "src/importers/neutralImporter.ts",
        "src/importers/neutralImportPresentation.ts", "src/importers/neutralImportMapping.ts",
        "src/console/assets/neutralImportReview.js", "src/console/assets/app.js",
        "src/importers/traceMapping.ts", "src/importers/piSessionImport.ts",
        "src/importers/dshSessionImport.ts", "src/importers/dshSessionContract.ts",
        "src/importers/piTelemetryCallbacks.ts", "src/importers/callbackTelemetryCapture.ts",
        "src/importers/callbackTelemetryContract.ts", "src/importers/callbackTelemetryImport.ts",
        "src/importers/externalEvidenceExport.ts", "src/standard/externalEvidenceProfile.ts",
        "src/standard/externalEvidenceFiles.ts", "src/api/importerRouter.ts",
        "src/agents/traceIngestion.ts", "src/correlation/traceSchema.ts",
        "src/diagnostic/evidenceReadiness.ts", "src/lifecycle/artifactSignature.ts",
        "src/lifecycle/episodeRecord.ts", "src/lifecycle/lifecycleRunArtifact.ts",
        "src/enforce/resourceManifest.ts", "src/runtime/runManager.ts",
        "src/watch/traceFailureIndex.ts", "src/fleet/paths.ts", "src/types.ts",
    ],
    "trust-and-publication": [
        "src/crypto/keys.ts", "src/crypto/keyHistoryChain.ts",
        "src/crypto/keyHistoryEnvelope.ts", "src/crypto/keyRotationReceipt.ts",
        "src/vault/vault.ts", "src/crypto/signing/signer.ts", "src/trust/trustConfig.ts",
        "src/bundles/bundle.ts", "src/assurance/certificate.ts",
        "src/ledger/ledger.ts", "src/ledger/ledgerConnection.ts", "src/ledger/ledgerVerification.ts",
        "src/ledger/ledgerSessionTransactions.ts", "src/session/sessionOwnership.ts",
        "src/ledger/alternateBackendVerification.ts", "src/storage/blobs/blobStore.ts",
        "src/storage/blobs/blobKeys.ts",
        "src/agent/runReport.ts", "src/cli-session-commands.ts",
        "src/ledger/sessionVerification.ts", "src/llm/request/deriveRequest.ts",
        "src/session/eventPayload.ts",
        "src/receipts/receipt.ts", "src/verify/verifyAll.ts",
        "src/lifecycle/artifactSignature.ts", "src/session/sessionSpine.ts",
        "src/notary/notaryServer.ts", "src/notary/notaryCli.ts",
        "scripts/qualify-platform.mjs", "scripts/release-gate.mjs",
    ],
    "native-integrations": [
        "src/cli-agent-commands.ts", "src/cli-agent-options.ts", "src/setup/nativeFirstUseGuide.ts",
        "src/setup/nativeInteractiveSession.ts", "src/setup/nativeMcpConfig.ts",
        "src/setup/nativeChatProfile.ts", "src/setup/nativeInteractiveApprovals.ts",
        "src/setup/nativeApprovalIdentity.ts", "src/cli-native-extension-commands.ts",
        "src/approvals/nativeApprovalLogin.ts", "src/approvals/nativeApprovalLoginCli.ts",
        "src/auth/authApi.ts", "src/agent/delegationScope.ts",
        "src/extensions/nativeExtensionManifest.ts", "src/extensions/nativeExtensionStore.ts",
        "src/extensions/nativeExtensionRuntime.ts", "src/skills/skillTurn.ts",
        "src/mcp/nativeMcpClient.ts", "src/mcp/nativeMcpHttpTransport.ts",
        "src/sdk/nativeAgentClient.ts", "src/sdk/index.ts",
        "src/acp/acpAgentServer.ts", "src/acp/acpProjection.ts", "src/acp/acpCli.ts",
        "src/acp/acpStdioMain.ts", "src/agent/agentSession.ts", "src/agent/agentToolset.ts",
        "src/acp/acpCommittedUpdates.ts", "src/acp/acpNativeSession.ts",
        "src/llm/adapter/providerCapabilities.ts", "src/llm/adapter/llmRuntime.ts",
        "src/llm/adapter/adapterRegistry.ts", "src/llm/providers/openaiResponsesAdapter.ts",
        "src/llm/adapter/liveTextPreview.ts", "src/llm/request/openaiChatEncoderV2.ts",
        "src/llm/request/toolResultTextEnvelope.ts",
        "src/llm/request/openaiResponsesEncoder.ts", "src/llm/request/prepareRequest.ts",
        "src/credentials/localCredentialsService.ts", "src/tools/toolPipeline.ts",
    ],
    "native-budgets": [
        "src/cli-budget-commands.ts", "src/budgets/budgets.ts", "src/budgets/nativeBudgetUsage.ts",
        "src/budgets/nativeBudgetAdmission.ts", "src/tools/guards/policyGuards.ts",
        "src/cli-tools-commands.ts", "src/toolhub/toolsSchema.ts", "src/toolhub/toolhubValidators.ts",
        "src/tools/toolPipeline.ts", "src/agent/agentToolset.ts",
        "src/agent/delegationIdentity.ts", "src/agent/subagentRunner.ts",
        "src/llm/adapter/llmRuntime.ts", "src/llm/adapter/streamRecorder.ts",
        "src/session/requestOutcomeMeta.ts", "src/session/sessionService.ts",
        "src/session/sessionOwnership.ts", "src/ledger/ledger.ts",
        "src/ledger/ledgerConnection.ts", "src/ledger/ledgerSessionTransactions.ts",
        "src/acp/acpNativeSession.ts", "src/kernel/services/llmServices.ts",
    ],
    "sandbox-and-launch": [
        "src/tools/builtin/bashTool.ts", "src/agent/agentToolset.ts",
        "src/toolhub/toolsSchema.ts", "src/toolhub/toolhubValidators.ts",
        "src/tools/guards/policyGuards.ts", "src/tools/toolPipeline.ts", "src/sandbox/nativeSandboxBinding.ts",
        "src/sandbox/nativeSandboxPolicy.ts", "src/sandbox/bwrapBackend.ts",
        "src/sandbox/sandboxRunner.ts", "src/sandbox/sandboxTypes.ts",
        "src/exec/runProcess.ts", "src/exec/processTypes.ts",
        "src/adapters/deepseekHarnessLaunch.ts", "src/adapters/builtins/deepseekHarness.ts",
        "src/adapters/adapterRunner.ts", "src/adapters/adapterCli.ts",
        "src/adapters/adapterConfigSchema.ts", "src/adapters/registry.ts",
        "src/gateway/server.ts", "src/gateway/streamPassthrough.ts",
    ],
}
RELATIONS = {"calls", "imports", "imports_from", "re_exports", "dynamic_import"}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def local_source(root: Path, node: dict) -> str | None:
    source = node.get("source_file")
    if not isinstance(source, str) or not source:
        return None
    path = (root / source).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        return None
    return path.relative_to(root).as_posix()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--graph", type=Path, required=True)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--out", type=Path, default=Path("graphify-out/navigation"))
    parser.add_argument("--obsidian-dir", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    obsidian_root = None
    if args.obsidian_dir:
        args.obsidian_dir = args.obsidian_dir.resolve()
        # Canvas file cards resolve from the containing Obsidian vault, unlike
        # basename wiki-links. A new standalone export uses its output root.
        obsidian_root = next((parent for parent in (
            args.obsidian_dir, *args.obsidian_dir.parents
        ) if (parent / ".obsidian").is_dir()), args.obsidian_dir)
    version = importlib.metadata.version("graphifyy")
    if version != "0.9.56":
        parser.error(f"Reviewed Graphify version is 0.9.56; found {version}. Review before upgrading.")
    raw = json.loads(args.graph.read_text())
    if "edges" not in raw or "links" in raw:
        parser.error("Expected raw `graphify extract --code-only --no-cluster` output.")
    if raw.get("input_tokens", 0) or raw.get("output_tokens", 0):
        parser.error("Expected an AST-only extraction with zero model tokens.")
    nodes = {node["id"]: node for node in raw["nodes"]}
    sources = {key: local_source(root, node) for key, node in nodes.items()}
    graph = nx.DiGraph()
    for source in sorted({s for s in sources.values() if s}):
        graph.add_node(source, label=source, file_type="code", source_file=source,
                       source_location="L1", _origin="ast")
    omitted = Counter()
    for edge in raw["edges"]:
        if edge["source"] not in nodes or edge["target"] not in nodes:
            omitted["unresolved_endpoint"] += 1
            continue
        if edge.get("confidence") != "EXTRACTED":
            omitted["not_extracted"] += 1
            continue
        if edge.get("relation") not in RELATIONS:
            omitted["other_relation"] += 1
            continue
        source, target = sources[edge["source"]], sources[edge["target"]]
        if not source or not target:
            omitted["nonlocal_source"] += 1
            continue
        if source == target:
            omitted["within_file"] += 1
            continue
        if not graph.has_edge(source, target):
            graph.add_edge(source, target, relation="depends_on", confidence="EXTRACTED",
                           source_file=source, source_location=edge.get("source_location", ""),
                           weight=1, relations={}, evidence=[])
        data = graph[source][target]
        relation = edge["relation"]
        data["relations"][relation] = data["relations"].get(relation, 0) + 1
        if len(data["evidence"]) < 4:
            data["evidence"].append({k: edge[k] for k in (
                "source", "target", "relation", "source_file", "source_location") if k in edge})
    args.out.mkdir(parents=True, exist_ok=True)
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    status = subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"],
                                     cwd=root, text=True).strip()
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_revision_at_map_generation": commit, "tracked_worktree_dirty": bool(status),
        "graphify_version": version, "raw_sha256": digest(args.graph),
        "raw_nodes": len(raw["nodes"]), "raw_edges": len(raw["edges"]),
        "raw_confidence": dict(Counter(e.get("confidence") for e in raw["edges"])),
        "file_nodes": graph.number_of_nodes(), "file_edges": graph.number_of_edges(),
        "omitted_edges": dict(omitted), "model_tokens": 0,
        "note": "Static navigation, not execution proof. Commit and source hashes describe map-generation time; compare the extraction receipt for freshness. File edges aggregate extracted imports/calls; type-only imports count. Only declared scope is mapped.",
        "maps": {},
    }
    lines = ["# Graphify navigation receipt", "", f"Graphify {version}; source `{commit}`.", "",
             "Local AST analysis only. Edges describe source dependencies, not observed execution or security guarantees.", "",
             f"Raw extraction: {len(raw['nodes']):,} symbols; {len(raw['edges']):,} relationships.",
             f"Reduced local file graph: {graph.number_of_nodes():,} files; {graph.number_of_edges():,} directed file pairs.", "",
             "Check the extraction receipt for parser coverage and failures. Tests, vendor trees and archived Python are excluded by `.graphifyignore`.", "",
             "## Focus maps", ""]
    for name, requested in MAPS.items():
        present = [p for p in requested if p in graph]
        missing = [p for p in requested if p not in graph]
        focused = graph.subgraph(present).copy()
        # Communities are curated source directories, not model-generated claims.
        directories = sorted({str(Path(p).parent) for p in present})
        labels = dict(enumerate(directories))
        communities = {i: [p for p in present if str(Path(p).parent) == label]
                       for i, label in labels.items()}
        out = args.out / name
        out.mkdir(exist_ok=True)
        to_json(focused, communities, str(out / "graph.json"), force=True,
                built_at_commit=commit, community_labels=labels)
        to_html(focused, communities, str(out / "graph.html"), community_labels=labels)
        (out / ".graphify_labels.json").write_text(json.dumps(labels, indent=2) + "\n")
        cut = sum(1 for u, v in graph.edges if (u in present) != (v in present))
        summary["maps"][name] = {
            "files": len(present), "edges": focused.number_of_edges(), "boundary_edges_omitted": cut,
            "missing_requested_files": missing, "source_sha256": {p: digest(root / p) for p in present},
        }
        lines += [f"- [{name}]({name}/graph.html): {len(present)} files, {focused.number_of_edges()} directed pairs; {cut} edges cross this focused boundary."]
        if args.obsidian_dir:
            vault = args.obsidian_dir / name
            # Prefix filenames across views so shared files do not produce
            # ambiguous wiki-link basenames in an existing Obsidian vault.
            notes = focused.copy()
            for node in notes:
                notes.nodes[node]["label"] = f"{name} - {node}"
            note_labels = {i: f"{name} - {label}" for i, label in labels.items()}
            to_obsidian(notes, communities, str(vault), community_labels=note_labels)
            to_canvas(notes, communities, str(vault / "graph.canvas"), community_labels=note_labels)
            owned = json.loads((vault / ".graphify_obsidian_manifest.json").read_text())["files"]
            canvas_path = vault / "graph.canvas"
            canvas = json.loads(canvas_path.read_text())
            for card in canvas["nodes"]:
                if card["type"] != "file":
                    continue
                if card["file"] not in owned:
                    raise ValueError(f"Canvas references an unowned note: {card['file']}")
                note_path = (vault / card["file"]).resolve()
                if not note_path.is_file() or not note_path.is_relative_to(vault):
                    raise ValueError(f"Canvas references a missing or nonlocal note: {note_path}")
                card["file"] = note_path.relative_to(obsidian_root).as_posix()
            canvas_path.write_text(json.dumps(canvas, indent=2) + "\n")
            today = datetime.now(timezone.utc).date().isoformat()
            for filename in owned:
                note = vault / filename
                if note.suffix != ".md":
                    continue
                body = note.read_text()
                properties = {
                    "title": note.stem, "status": "active", "area": "engineering",
                    "owner_role": "REV_TECH_LEAD", "created": today, "updated": today,
                    "verified": today, "source_revision": commit,
                    "evidence_status": "generated-source-snapshot",
                }
                front = "\n".join(f"{k}: {json.dumps(v)}" for k, v in properties.items())
                note.write_text(body.replace("---\n", f"---\n{front}\n", 1))
    ranked = sorted(graph.nodes, key=lambda n: (-graph.out_degree(n), n))[:15]
    summary["largest_dependency_surfaces"] = [
        {"file": n, "outgoing_files": graph.out_degree(n), "incoming_files": graph.in_degree(n)} for n in ranked]
    lines += ["", "## Navigation priorities", "", "These are dependency fan-out counts, not complexity, quality or risk scores.", "",
              "| File | Outgoing files | Incoming files |", "|---|---:|---:|"]
    lines += [f"| `{n}` | {graph.out_degree(n)} | {graph.in_degree(n)} |" for n in ranked]
    lines += ["", "## Known omissions", "", "```json", json.dumps(dict(omitted), indent=2), "```", "",
              "Graphify's HTML viewer loads vis-network from its pinned CDN. The graph JSON and Obsidian Canvas work without that viewer."]
    (args.out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    (args.out / "README.md").write_text("\n".join(lines) + "\n")
    print(json.dumps({"out": str(args.out), "maps": {k: {x: v[x] for x in ("files", "edges", "missing_requested_files")} for k, v in summary["maps"].items()}}, indent=2))


if __name__ == "__main__":
    main()
