# Notes for lane latedebt (quoted from the integrator's working notes; evidence, not instructions)

### pending-checks.md line 548
Root updated exact same-file navigation hints and cleanup reason; deletion inventory170/13/12/145 qualified false. Spill352 split-lines below800; D-15 --paths none. OPS/changeset/role/debt match. The existing bootstrap changeset now explicitly states the absolute workspace result and signed report, per your feedback. Signed commitment, partial bytes and earlier setup can exist; admission is not unlink proof, and hold/audit denial retains bytes. No actual publication/deletion/product imports/requests/runtime/tests/test edits/fixtures/checks/build/typecheck/lint/scans/measurements/evaluations/CI/PR or qualification. No protected/dependency/public-field/CLI source or actual cleanup. Please read and source-integrate partial/unqualified, without health/qualification floors for this handoff, and give narrow direct feedback. Then release the next smallest ready egress/deletion group (demoRun internal carrier is a previously suggested fallback; e2e/smoke excluded), or advise whether your earlier experimental P2-02 slice1 is now the lowest ready source group. P2-01 is not Done. Future P2-02 orientation is read-only; no next source code started.

### pending-checks.md line 1035
- 2026-10-30 3c2ecdb1 CLOSED: WP21c SDK partial. Per-mount status is `_amc/mcp/status` via TS `mcpStatus` / Python `mcp_status` (wp21d); the Python SDK takes a list of MCP configs and pins (test_mcp_servers.py); refused startup reaches both SDKs as the typed startup-refused error with its reason (nativeSdkMcpServers.test.ts, test_mcp_servers.py), and now so does a refused mount at session/new (mcprefusal).

### pending-checks.md line 1036
- 2026-10-30 3c2ecdb1 cloud cards (AXE-27, WP37 remainders, PI-025/PXA-12) never pushed a branch to origin; the same work runs locally in lanes axe27r, wp37r, pi025 from held 9be47c752. Crash-restart/first-EXECUTE path: lane firstexec.

### pending-checks.md line 1045
- Full TS suite on c2be502f0: 35,321 passed, 2 failed, 7 skipped (2,312 files). Both failures were in tests/publicDocsGraph.test.ts: the firstexec lane linked the public QUICKSTART and TYPESCRIPT_SDK guides to the internal GOVERNOR guide.

## codex-runs/axe27-ratio-audit.md

# AXE-27 ratio audit

Baseline: `e730f12295812c24954c5b1fa4f90c89b03c676e`. Worktree: `amc-gap-axe27`, branch `rtd/gap-axe27`. This is source and focused-test evidence for Claude review; no commit, push, or merge was performed.

The broad baseline grep below contains every match of the requested literal families, including configuration and rendering false positives. The reviewed inventories distinguish repaired evidence ratios, positive-denominator invariants, mathematical identities, non-ratio defaults, and remaining ownership or scope boundaries. Searches for multiline guards and inverse-score formulas also found sites not matched by this literal grep.

## Baseline grep: all 179 matches

Command:

```sh
rg -n '\?[^:\n]*/[^:\n]*:\s*(1(?:\.0)?|100)\b|length === 0 \? (1|100)|/ Math\.max\(1,|\|\| 1\b|\?\? 1\b' src
```

```text
src/snapshot/snapshot.ts:85:    `- Overall: ${(run.layerScores.reduce((sum, row) => sum + row.avgFinalLevel, 0) / Math.max(1, run.layerScores.length)).toFixed(2)}`,
src/governor/governorReport.ts:87:  const autonomyAllowanceIndex = Math.round((executeAllowedCount / Math.max(1, ACTION_CLASSES.length)) * 100);
src/toolhub/toolhubExecutors/git.ts:21:    code: out.status ?? 1,
src/studio/studioServer.ts:2696:          weight: parsed.weight ?? 1
src/studio/studioServer.ts:2706:            weight: parsed.weight ?? 1
src/session/spill/spillTypes.ts:171:  const locator = `amc-spill:v${parts.version ?? 1}:${parts.sessionHash}:${parts.objectName}`;
src/cgx/cgxDiff.ts:152:      const confChange = (edge.confidence ?? 1) - (old.confidence ?? 1);
src/cgx/cgxDiff.ts:251:        `| ${e.edgeId.slice(0, 30)} | ${e.type} | ${(e.oldConfidence ?? 1).toFixed(2)} | ${(e.newConfidence ?? 1).toFixed(2)} | ${e.confidenceChange?.toFixed(3) ?? "—"} |`,
src/toolhub/toolhubExecutors/process.ts:29:    code: out.status ?? 1,
src/studio/cliBridge.ts:237:      const exitCode = code ?? 1;
src/session/sessionOwnership.ts:54:    epoch: owner.epoch ?? 1, leaseMs: owner.leaseMs ?? DEFAULT_SESSION_LEASE_MS };
src/domains/domainAssessmentEngine.ts:89:  return likert(domainQuestionScores[question.id] ?? 1);
src/studio/nativeTaskService.ts:332:      nextCursor: p?.nextCursor ?? 0, firstCursor: p?.firstCursor ?? 1, droppedEvents: p?.droppedEvents ?? 0,
src/cgx/cgxSimulator.ts:130:      const edgeConfidence = edge.confidence ?? 1.0;
src/identity/scim/scimUsers.ts:80:  const start = Math.max(1, params.startIndex || 1);
src/org/orgEngine.ts:167:    const baseWeight = memberWeightForNode(params.config, agentId, params.node.id) || 1;
src/redteam/mcpAgentProvider.ts:1020:      score: data.tested > 0 ? Math.round(data.totalScore / data.tested) : 100,
src/org/orgStore.ts:212:  const weight = params.weight ?? 1, memberships = [...config.memberships];
src/redteam/jailbreak/normalizer.ts:150:  const totalLen = cleaned.length || 1; // avoid div by zero
src/shield/trustPipeline.ts:109:      stepNumber: input.stepNumber ?? 1,
src/business/fairScenario.ts:123:  let state = (seed >>> 0) || 1;
src/forecast/forecastSignals.ts:297:          .reduce((sum, task) => sum + Number(task.effort ?? 1), 0)
src/forecast/forecastSignals.ts:396:        return usage.deniedActionCount / Math.max(1, usage.toolActionCount);
src/shield/continuousRedTeam.ts:594:  const se = Math.sqrt(var1 / group1.length + var2 / Math.max(1, group2.length));
src/value/valueScoring.ts:195:    kpis.length === 0 ? 0 : kpis.reduce((sum, row) => sum + row.trustKindSummary.observed, 0) / Math.max(1, kpis.length)
src/values/valueCoherence.ts:234:    const delta = clamp01(Math.abs(rankA - rankB) / Math.max(1, allValues.size));
src/cli.ts:1137:    child.on("close", (code) => resolvePromise(code ?? 1));
src/cli.ts:14334:    const concurrency = Math.max(1, Number.parseInt(opts.concurrency, 10) || 1);
src/cli.ts:20002:      const confidence = parseBoundedNumberOption(opts.confidence, "--confidence", 0, 1) ?? 1;
src/cli.ts:20003:      const stepNumber = Math.floor(parseBoundedNumberOption(opts.step, "--step", 1, 100000) ?? 1);
src/assurance/packs/mcpSecurityResiliencePack.ts:291:  const attackSuccessRate = results.length === 0 ? 1 : round4((results.length - blocked.length) / results.length);
src/diagnostic/runner.ts:1237:    const dualityComplianceRatio = executeAttempted > 0 ? executeWithValidTicket / executeAttempted : 1;
src/bench/benchComparer.ts:121:  if (low / Math.max(1, population.length) > 0.5) {
src/bench/benchPercentiles.ts:121:    vectors.reduce((sum, row) => sum + row[0], 0) / Math.max(1, vectors.length),
src/bench/benchPercentiles.ts:122:    vectors.reduce((sum, row) => sum + row[1], 0) / Math.max(1, vectors.length),
src/bench/benchPercentiles.ts:123:    vectors.reduce((sum, row) => sum + row[2], 0) / Math.max(1, vectors.length),
src/bench/benchPercentiles.ts:124:    vectors.reduce((sum, row) => sum + row[3], 0) / Math.max(1, vectors.length)
src/bench/benchPercentiles.ts:225:    size: finalClusters.get(localMedoidId)?.length ?? 1,
src/ledger/monitor.ts:259:        exitCode: outcome.exitCode ?? 1,
src/ledger/monitor.ts:267:        value: outcome.exitCode ?? 1,
src/ledger/monitor.ts:281:    return { sessionId, exitCode: outcome.exitCode ?? 1, terminatedBy: outcome.terminatedBy ?? null };
src/runtimes/common.ts:202:      resolve({ code: code ?? 1, stdout, stderr });
src/diagnostic/autoAnswer/autoAnswerEvidenceQueries.ts:57:      Math.min(1, score.evidenceEventIds.length / Math.max(1, rule.minEvents)).toFixed(4)
src/assurance/indices.ts:189:    (metrics.reduce((sum, metric) => sum + metric.score0to100, 0) / Math.max(1, metrics.length)).toFixed(2)
src/diagnostic/autoAnswer/traceEvidenceMapper.ts:150:    toolSuccessRate: toolSpans.length > 0 ? toolSuccesses.length / toolSpans.length : 1,
src/a4/a4Schema.ts:206:  const ttl = (days: number): number => Math.min(Math.max(days, floor.minTtlDays ?? 1), floor.maxTtlDays ?? 90);
src/a4/a4Schema.ts:252:    ...A4_GATE_POLICY_KEYS.filter((key) => next.gates[key].ttlDays > (floor.maxTtlDays ?? 90) || next.gates[key].ttlDays < (floor.minTtlDays ?? 1))
src/diagnostic/bank/bankV1.ts:56:    minEvents: Math.max(1, gate3?.minEvents ?? 1),
src/diagnostic/bank/bankV1.ts:59:    minRuns: Math.max(1, Math.ceil((gate3?.minSessions ?? 1) / 2))
src/a4/a4Readiness.ts:693:      || ((gate.status === "PENDING" || gate.status === "QUORUM_MET") && (live.driftedSlots?.length ?? 1) > 0)))
src/runtime/stateCheckpoint.ts:320:    ? Math.min(100, 55 + Math.min(35, input.stateDiff.length * 10) + (input.restoreTestEvidenceRefs.length === 0 ? 10 : 0))
src/diagnostic/levelSemantics.ts:227:    if (score) rows.push({ finalLevel: score.finalLevel, confidence: score.confidence, weight: Math.max(0, question.scoringWeight ?? 1) });
src/diagnostic/riskTiers.ts:117:  if ((agentCapabilities.agentCount ?? 1) > 10) {
src/catalog/evidence/dimensions.ts:57:    const ratio = own.length === 0 ? 1 : own.filter((row) => isObservedTier(row.trustTier)).length / own.length;
src/catalog/evidence/dimensions.ts:64:    admitted.filter(({ item }) => item.producerId === contract.producer).length < (contract.sampling.minItems ?? 1));
src/catalog/evidence/dimensions.ts:65:  for (const contract of short) reasons.push(`${contract.id}: fewer than ${contract.sampling.minItems ?? 1} admitted records in the window`);
src/correlation/correlate.ts:149:  const correlationRatio = validReceipts / Math.max(1, totalTracesWithReceipt);
src/tools/builtin/fsTools.ts:273:          : { offset: args.offset ?? 1, limit: args.limit ?? DEFAULT_LINE_LIMIT };
src/console/assets/app.js:1517:      <p>Overall: <strong>${((report.layerScores || []).reduce((s, x) => s + x.avgFinalLevel, 0) / Math.max(1, (report.layerScores || []).length)).toFixed(3)}</strong></p>
src/domains/stations.ts:70:  const minStations = opts.minStations ?? 1;
src/enforce/circuitBreaker.ts:65:    state.calls += cost?.calls ?? 1;
src/enforce/semanticGuardrails.ts:231:      minKeywordMatches: config?.minKeywordMatches ?? 1,
src/sandbox/processCap.ts:24:      if (Number(/^Uid:\s+(\d+)/m.exec(status)?.[1]) === uid) count += Number(/^Threads:\s+(\d+)/m.exec(status)?.[1] ?? 1);
src/integrations/integrationJournalProtocol.ts:91:      const expected = { bytes: output, mode, links: recipe === "atomic600" || recipe === "atomic644" ? 1 : original?.links ?? 1 };
src/dashboard/templates/app.js:1338:  const sx = i => P.l + (i / (n - 1 || 1)) * cw;
src/product/dependencyGraph.ts:79:      const newDeg = (deg.get(neighbour) ?? 1) - 1;
src/product/dependencyGraph.ts:145:    const w = weights?.get(node) ?? 1;
src/product/dependencyGraph.ts:165:  return { path, length: maxDist + (weights?.get(maxNode) ?? 1) };
src/product/dependencyGraph.ts:188:        deg.set(nb, (deg.get(nb) ?? 1) - 1);
src/product/toolFallback.ts:61:  const current = chain.healthScores.get(toolId) ?? 1.0;
src/product/toolFallback.ts:103:    if (chain && (chain.healthScores.get(toolId) ?? 1) < 0.1 && toolId !== allTools[allTools.length - 1]) {
src/product/fixGenerator.ts:138:  const coverage = gaps.length > 0 ? fixes.length / gaps.length : 1;
src/product/conversationSummarizer.ts:40:      const idf = Math.log(1 + N / (1 + (df.get(t) ?? 1)));
src/product/approvalWorkflow.ts:55:        ? { stages: chain.stages, currentStage: 0, requiredApprovals: chain.requiredApprovals ?? 1 }
src/dashboard/components/timeline.js:16:    x: margin + (i * (width - margin * 2)) / Math.max(1, trends.length - 1),
src/audit/insiderRisk.ts:536:      Object.values(categoryScores).reduce((s, v) => s + v, 0) / Math.max(1, Object.values(categoryScores).filter((v) => v > 0).length),
src/audit/binderCollector.ts:705:      maturityOverall = Number((run.layerScores.reduce((sum, row) => sum + row.avgFinalLevel, 0) / Math.max(1, run.layerScores.length)).toFixed(6));
src/audit/binderCollector.ts:712:      selfReportedShare = Number((run.evidenceTrustCoverage?.selfReported ?? 1).toFixed(6));
src/mirofish/engine.ts:361:  const totalWeight = fleet.reduce((s, a) => s + (a.weight ?? 1), 0);
src/mirofish/engine.ts:367:      const w = (agent.weight ?? 1) / totalWeight;
src/passport/passportApi.ts:638:  const page = Math.max(1, Math.trunc(params.page ?? 1));
src/cli-eval-dataset-commands.ts:305:              weight: item.weight ?? 1.0,
src/observability/costTracker.ts:222:    const avgCostPerDay = days > 0 ? totalCost / Math.min(days, byDay.length || 1) : 0;
src/api/scoreRouter.ts:501:        level: Math.round(score / Math.max(result.layerScores?.length ?? 1, 1)),
src/adapters/adapterRunner.ts:441:        exitCode = isDsh && requestedSignal ? (requestedSignal === "SIGINT" ? 130 : 143) : (code ?? 1);
src/score/memoryIntegrity.ts:70:  const consistencyScore = stores > 0 ? Math.max(0, 1.0 - conflicts / stores) : 1.0;
src/score/memoryIntegrity.ts:90:    poisoningAttempts > 0 ? Math.max(0, 1.0 - poisoningSuccesses / poisoningAttempts) : 1.0;
src/score/industryTrustModels.ts:184:    const weight = model.dimensionWeights[dim] ?? 1.0;
src/score/industryTrustModels.ts:219:  const rawAvg = Object.values(rawDimensionScores).reduce((s, v) => s + v, 0) / Math.max(1, Object.keys(rawDimensionScores).length);
src/observability/anomalyDetector.ts:174:  const minRankDrop = options.minRankDrop ?? 1;
src/observability/anomalyDetector.ts:216:  const minimumAbsoluteVolatility = options.minimumAbsoluteVolatility ?? 1;
src/console/assets/components/cgxViewer.js:15:    const angle = (Math.PI * 2 * index) / Math.max(1, nodes.length);
src/product/escalation.ts:142:  return { escalationId: randomUUID(), reason, level: level ?? 1 };
src/observability/sessionCorrelator.ts:433:  const errorFreeRate = traces.length > 0 ? (traces.length - errorCount) / traces.length : 1;
src/observability/sessionCorrelator.ts:438:  const toolReliabilityScore = toolSpans.length > 0 ? (toolSuccess.length / toolSpans.length) * 100 : 100;
src/observability/sessionCorrelator.ts:440:  const completionRate = traces.length > 0 ? completedTraces.length / traces.length : 1;
src/fleet/cascadeSimulator.ts:340:    const currentQuality = agentQuality.get(fault.targetAgentId) ?? 1.0;
src/fleet/cascadeSimulator.ts:356:    const sourceQuality = agentQuality.get(sourceId) ?? 1.0;
src/score/domainPacks.ts:79:    const level = likert(assessment[q.id] ?? 1);
src/score/calibrationGap.ts:128:  const dimCount = dimensions.size || 1;
src/compliance/regulatoryAutomation.ts:583:    const currentCoverage = change.impactedControls.length > 0 ? (coveredCount / change.impactedControls.length) * 100 : 100;
src/compliance/regulatoryAutomation.ts:665:      complianceRisk: Math.min(100, Math.round((affectedAgents / Math.max(1, fleetScores.length)) * 100)),
src/steer/microScore.ts:83:  { pattern: /\bfor\s+(?:safety|ethical|legal)\s+reasons?\b/i, weight: 1, label: "safety_reasons" },
src/steer/microScore.ts:169:  const hedgeDensity = hedgeCount / Math.max(1, text.split(/\s+/).length);
src/score/formalSpec.ts:62:  const allWeights = [...byDimension.keys()].map(dim => weights?.[dim] ?? 1.0);
src/score/formalSpec.ts:68:    const w = weights?.[dim] ?? 1.0;
src/score/operationalIndependence.ts:643:  const exceptionResolutionRate = exceptionEvents.length > 0 ? resolvedExceptions.length / exceptionEvents.length : 1;
src/score/operationalIndependence.ts:1108:  const multiVendorCoverage = inventory.totalDependencies > 0 ? portableDependencies / inventory.totalDependencies : 1;
src/score/operationalIndependence.ts:1208:  const escalationRate = events.length === 0 ? 100 : Math.round((escalated / events.length) * 100);
src/score/mcpCompliance.ts:471:  const attackTaxonomyCoverage = round4(attackCategoriesCovered.length / Math.max(1, MCP_SECURITY_TAXONOMY.length));
src/score/mcpCompliance.ts:473:  const performanceUnderAttack = capabilities.mcpSecurityBenchPerformanceUnderAttack ?? 1;
src/steer/research/eval_feedback_convergence.ts:188:  const initialDistance = trace[0]?.distanceToTarget ?? 1;
src/steer/research/eval_feedback_convergence.ts:207:  const finalDistance = trace[trace.length - 1]?.distanceToTarget ?? 1;
src/score/memoryDepth.ts:152:    const resolutionRate = contradictions > 0 ? resolved / contradictions : 1;
src/score/memoryDepth.ts:169:    const blockRate = injAttempts > 0 ? injBlocked / injAttempts : 1;
src/score/memoryDepth.ts:202:    const evictionResponse = warnings > 0 ? Math.min(1, evictions / warnings) : 1;
src/cli/claimOutput.ts:176:      status: "NOT_EVALUATED", level: null, eventCount: artifact.recordCount ?? 1, now })
src/cli/claimOutput.ts:177:    : unverifiedClaim(producer, artifact.recordCount ?? 1);
src/score/statisticalAnalysis.ts:207:  return denom > 0 ? num / denom : 1;
src/score/simplicityScoring.ts:29:  const layers = input.frameworkLayerCount ?? 1;
src/benchmarks/replayBenchmarkCorpus.ts:15053:  const minBenchmarkCount = longTermMemory.minMemEvalBenchmarkCount ?? 1;
src/benchmarks/replayBenchmarkCorpus.ts:15060:  const minMemorySystemCount = longTermMemory.minMemEvalMemorySystemCount ?? 1;
src/benchmarks/replayBenchmarkCorpus.ts:15067:  const minMetricKindCount = longTermMemory.minMemEvalMetricKindCount ?? 1;
src/benchmarks/replayBenchmarkCorpus.ts:15076:  } else if (longTermMemory.memEvalQuestionCount < (longTermMemory.minMemEvalQuestionCount ?? 1)) {
src/benchmarks/replayBenchmarkCorpus.ts:15081:  } else if (longTermMemory.memEvalConversationCount < (longTermMemory.minMemEvalConversationCount ?? 1)) {
src/benchmarks/replayBenchmarkCorpus.ts:26620:      } else if (longTermMemory.realTalkParticipantCount < (longTermMemory.minRealTalkParticipantCount ?? 1)) {
src/benchmarks/replayBenchmarkCorpus.ts:26638:        } else if (longTermMemory.realTalkQuestionCount < (longTermMemory.minRealTalkQuestionCount ?? 1)) {
src/benchmarks/replayBenchmarkCorpus.ts:26748:      } else if (longTermMemory.cloneMemPersonaCount < (longTermMemory.minCloneMemPersonaCount ?? 1)) {
src/benchmarks/replayBenchmarkCorpus.ts:26753:      } else if (longTermMemory.cloneMemQuestionCount < (longTermMemory.minCloneMemQuestionCount ?? 1)) {
src/score/interpretability.ts:79:  const refusalTransparency = refusals.length > 0 ? transparentRefusals.length / refusals.length : 1.0;
src/console/assets/charts.js:27:  const range = max - min || 1;
src/console/assets/charts.js:32:    const x = (idx / Math.max(1, values.length - 1)) * (w - 16) + 8;
src/score/antiGaming.ts:191:    const avg = f.scoreDistribution.reduce((s, v) => s + v, 0) / (f.scoreDistribution.length || 1);
src/score/antiGaming.ts:213:    const cv = Math.sqrt(variance) / (mean || 1);
src/score/pauseQuality.ts:81:  const relevanceScore = pauses.length > 0 ? relevantPauses.length / pauses.length : 1.0;
src/fleet/trustInheritance.ts:259:      const nextDegree = (indegree.get(child) ?? 1) - 1;
src/fleet/fleetScoring.ts:391:  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, targetAgentIds.length || 1));
src/benchmarks/academicPaper.ts:71:  const pooledVariance = ((groupA.length - 1) * varianceA + (groupB.length - 1) * varianceB) / Math.max(1, groupA.length + groupB.length - 2);
src/benchmarks/academicPaper.ts:75:  const standardError = Math.sqrt((varianceA / Math.max(1, groupA.length)) + (varianceB / Math.max(1, groupB.length)));
src/fleet/contradictionDetector.ts:61:  const minDelta = options?.minDelta ?? 1;
src/score/reputationPortability.ts:36:  const platforms = input.platformCount ?? 1;
src/score/capabilityElicitation.ts:205:    const confidence = signal.confidence ?? 1;
src/eval/judgeCalibration.ts:631:  if ((rowWithoutHash.dataQuality0to1 ?? 1) < thresholds.minDataQuality0to1) {
src/eval/judgeCalibration.ts:634:  if ((rowWithoutHash.ocrReadability0to1 ?? 1) < thresholds.minOcrReadability0to1) {
src/eval/judgeCalibration.ts:667:    meanDataQuality0to1: dataQualityScores.length === 0 ? 1 : mean(dataQualityScores),
src/eval/judgeCalibration.ts:668:    meanOcrReadability0to1: ocrScores.length === 0 ? 1 : mean(ocrScores),
src/trust/rootRotation.ts:45:}).refine(file => (file.threshold ?? 1) <= file.roots.length, "threshold cannot exceed the number of roots");
src/trust/rootRotation.ts:106:  const signatureVersion = opts.signatureVersion ?? parsed.signatureVersion ?? 1;
src/trust/rootRotation.ts:107:  if (signatures.length > 0 && signatureVersion !== (parsed.signatureVersion ?? 1)) throw new Error("a root rotation cannot mix signature versions");
src/trust/rootRotation.ts:115:  const signatureVersion = opts.signatureVersion ?? parsed.signatureVersion ?? 1;
src/trust/rootRotation.ts:116:  if (signatures.length > 0 && signatureVersion !== (parsed.signatureVersion ?? 1)) throw new Error("a root rotation cannot mix signature versions");
src/trust/rootRotation.ts:237:  if (!sortedEqual(installed.statement.newRoots, roots.roots) || installed.statement.newThreshold !== (roots.threshold ?? 1)) {
src/trust/rootRotation.ts:277:  authorize(signed, { roots: current.roots, threshold: current.threshold ?? 1 }, pinnedPems(current.roots, opts.currentRootPublicKeyPems));
src/trust/rootRotation.ts:299:  if (sortedEqual(installed.newRoots, file.roots) && installed.newThreshold === (file.threshold ?? 1)) refuse(`rotation ${anchored.sequence} is already applied`);
src/trust/rootRotation.ts:300:  const pinned = { roots: file.roots, threshold: file.threshold ?? 1 };
src/score/architectureTaskAlignment.ts:269:    const propagation = Math.max(0, stage.propagationFactor ?? 1);
src/trust/temporalDecay.ts:301:  const total = report.evidenceItems.length || 1;
src/trust/trustContext.ts:87:    const list = verifySignedTrustList(signed, { pinnedRootKeyIds: roots, now, threshold: Math.max(policy?.threshold ?? 1, marks.threshold) });
src/trust/trustContext.ts:88:    marks.accept(list, Math.max(policy?.threshold ?? 1, list.rootThreshold ?? 1));
src/trust/trustContext.ts:112:  try { threshold = readHighWater(key("trust-list-threshold"), opts)?.sequence ?? 1; } catch (error) { rethrow(error); }
src/trust/trustList.ts:188:  const signatureVersion = opts.signatureVersion ?? 1;
src/trust/trustList.ts:202:  const threshold = Math.max(1, opts.threshold ?? 1, list.rootThreshold ?? 1);
src/keys/rotationStatement.ts:230:  const threshold = Math.max(1, opts.roots?.threshold ?? 1);
src/keys/purposeKeys.ts:246:  const rootThreshold = pinned?.threshold ?? 1;
src/cli-business-commands.ts:675:            const avgLevel = latest.layerScores?.reduce((s: number, l: any) => s + l.avgFinalLevel, 0) / (latest.layerScores?.length || 1) || 0;
src/cli-business-commands.ts:737:            const avgLevel = latest.layerScores?.reduce((s: number, l: any) => s + l.avgFinalLevel, 0) / (latest.layerScores?.length || 1) || 0;
src/vault/privacyBudget.ts:15:    const budget = totalBudget ?? 1.0;
src/keys/revocationList.ts:83:  const signatureVersion = opts.signatureVersion ?? 1;
src/agent/stubProvider.ts:106:  const retryAfterSeconds = options.retryAfterSeconds ?? 1;
src/dogfood/maturityEvidence.ts:253:    params.gate.requiredEvidenceTypes.length || 1
src/agents/metricTemplates.ts:153:    const score = outputTerms.length > 0 ? grounded / outputTerms.length : 1;
src/agents/metricTemplates.ts:246:    const score = inputTerms.length > 0 ? addressed / inputTerms.length : 1;
src/agents/metricTemplates.ts:330:    const recall = expectedTerms.length > 0 ? covered / expectedTerms.length : 1;
src/agents/sessionEval.ts:237:    const totalWeight = goalEvals.reduce((s, g) => s + (goals.find(gg => gg.id === g.goalId)?.weight ?? 1), 0);
src/agents/sessionEval.ts:242:        if (ge.completed) goalScore += (goal?.weight ?? 1) / totalWeight;
src/agents/sessionEval.ts:385:    const coherence = pairs > 0 ? totalSim / pairs : 1;
src/agents/sessionEval.ts:386:    const responsive = responsePairs > 0 ? responsiveness / responsePairs : 1;
src/ops/governanceSlo.ts:473:    observedValue = values.length === 0 ? 1 : compliantCount / values.length;
src/watch/realtimeAssurance.ts:547:      score: this.checks.length > 0 ? (passedChecks.length / this.checks.length) * 100 : 100,
```

## Reviewed site inventories

The inventories below record every reviewed site and its disposition. Verification is recorded in `REV_QA_LEAD.md`.


## Agent, observability, and external sites

# AXE-27 external ratio audit

Audit scope: `src/`, excluding `src/watch/**`, `src/score/**`, and `src/assurance/**`, which the parent agent audited. Baseline line numbers refer to `e730f1229` before edits. The audit used these patterns and inspected surrounding source and callers:

- Division by `Math.max(1, n)` and `Math.max(n, 1)`.
- Zero or empty guards returning `1`, `1.0`, or `100`.
- Ternaries such as `n > 0 ? numerator / n : 1`.
- `|| 1` and `?? 1`, including ratio-like names.
- Explicit `return 1` and `return 100` branches, to catch multiline guards.

No files in other lanes were edited. The table records source findings; the parent report records final disposition.

## Default-perfect findings

| Baseline source | Finding | Disposition / interpretation |
| --- | --- | --- |
| `src/agents/metricTemplates.ts:153` | Hallucination grounding defaults to 1 with no evaluable output terms. | Fixed in this subtask: nullable score, outcome and sample size. |
| `src/agents/metricTemplates.ts:246` | Intent coverage defaults to 1 with no input terms. | Fixed in this subtask. |
| `src/agents/metricTemplates.ts:330` | Expected-term recall defaults to 1 with no expected terms. | Fixed in this subtask. |
| `src/agents/metricTemplates.ts:485` | Missing duration defaults to perfect latency; zero budget also permits invalid division. | Fixed in this subtask; explicit observed zero latency remains a measured score of 1 with a positive budget. |
| `src/agents/sessionEval.ts:245` | Zero total goal weight, including absent goals, becomes completion 1. | Fixed in this subtask. |
| `src/agents/sessionEval.ts:350,353,385,386` | No cross-turn or response pairs become perfect coherence/responsiveness. | Fixed in this subtask; absent components are excluded from weighted means. |
| `src/agents/sessionEval.ts:431` | No agent turns become safety 1. | Fixed in this subtask. |
| `src/observability/sessionCorrelator.ts:438` | No tool spans become reliability 100. | Fixed in this subtask; per-factor outcome marks the missing denominator. |
| `src/observability/sessionCorrelator.ts:433,440` | Empty traces become error-free/completion 1. | Empty groups are already refused by `getSession` at baseline line 267. Removed impossible fallback and documented the nonempty invariant. |
| `src/eval/judgeCalibration.ts:667,668` | Missing optional quality/OCR observations become perfect means. | Fixed in this subtask; summary values null with per-metric outcomes. |
| `src/eval/judgeCalibration.ts:631,634` | Optional quality/OCR guard uses `?? 1`. | Replaced with explicit non-null conditional; omission remains optional, without manufacturing a numerical observation. |
| `src/diagnostic/autoAnswer/traceEvidenceMapper.ts:150,300` | No tool spans or empty metrics initialize tool success to 1. | Fixed in this package: nullable measurement, evidence outcome, and sample count. |
| `src/values/valueCoherence.ts:47,71,280,290` | Too few rankings, tied tau denominator, too few preferences/value dimensions return VCI/tau 1. | Fixed in this package: nullable measurement, evidence outcome, and sample count. |
| `src/org/orgEngine.ts:463,464,465,471` | No peers, or no eligible percentile rows, become rank 100. | Fixed in this package: nullable measurement, evidence outcome, and sample count. |
| `src/compliance/regulatoryAutomation.ts:583` | No impacted controls become coverage 100. | Fixed in this package: nullable measurement, evidence outcome, and sample count. |
| `src/product/fixGenerator.ts:138` | No gaps become fix coverage 1. | Fixed in this package: nullable measurement, evidence outcome, and sample count. |
| `src/redteam/jailbreak/runner.ts:177` | No tests become defended score 100. | Fixed in this package: nullable measurement, evidence outcome, and sample count. |
| `src/redteam/mcpAgentProvider.ts:1020` | Category accumulator with `tested === 0` becomes score 100. | Zero is unreachable: each accumulator is created and incremented together before being enumerated. Removed the impossible fallback and documented the positive-denominator invariant. |
| `src/catalog/evidence/dimensions.ts:57` | No admitted records become observed-trust ratio 1. | Local ratio is not published; later minimum-item check already produces incomplete evidence and `not_evaluated`. Replaced the local fallback with ratioOrNull while preserving the completeness guard. |
| `src/ops/governanceSlo.ts:473` | No SLO samples become compliance ratio 1 and HEALTHY. | Fixed in this package: nullable measurement, evidence outcome, and sample count. |
| `src/diagnostic/runner.ts:1237` | No execute attempts become duality compliance 1. | Owned by wp05r; do not edit. |
| `src/experiments/experimentGatePolicy.ts:42` | Baseline/candidate cost 0 returns ratio 1. | Owned by wp05r; do not edit. This is a relative-cost equality convention, not an observed pass ratio. |

## Genuine similarity identities retained with comments

| Baseline source | Explanation |
| --- | --- |
| `src/agents/autoTestGen.ts:118` | Equal empty token sets have similarity 1 for grouping failures. This is set equality, not evaluation coverage. |
| `src/agents/sessionEval.ts:139` | Equal empty token sets have lexical similarity 1. Missing session-quality denominators are handled separately. |
| `src/product/outputDiff.ts:45` | Two empty word sets are identical, so their output-diff similarity is 1. |
| `src/product/conversationSummarizer.ts:80,83` | Two empty token sets are identical for topic segmentation. Added identity comment and removed the redundant second zero-union ternary. |

## Other denominator clamps and zero-denominator ratio candidates

These sites were inspected to distinguish genuine zero denominators, unreachable branches, non-evaluator math, and further missing-evidence work. They are not all default-perfect defects. Explicit zero values in reports may still need a separate null migration if the package scope includes all absent observations rather than default-perfect ratios only.

| Baseline source | Classification |
| --- | --- |
| `src/snapshot/snapshot.ts:85` | Rendered layer mean divides by `Math.max(1, layerScores.length)` and emits 0 for empty layers. Not perfect; mean absent. |
| `src/governor/governorReport.ts:87` | Denominator is the fixed, nonempty `ACTION_CLASSES` catalog, not an observation count. |
| `src/values/valueCoherence.ts:234` | Denominator is `allValues.size` inside iteration over that set; it is positive whenever executed. |
| `src/forecast/forecastSignals.ts:396` | Denied-action rate divides by clamped tool-action count and yields 0 for absent actions. Not observed zero; parent notified. |
| `src/bench/benchComparer.ts:121` | Empty population returns earlier at lines 116-119; division only sees positive population. |
| `src/bench/benchPercentiles.ts:121-124` | K-medoids initial-centroid coordinates use clamped point counts; algorithm guard prevents empty input reaching selection. Not an evaluation success ratio. |
| `src/value/valueScoring.ts:195` | Explicit empty KPI branch returns 0 before the clamped mean; not perfect. |
| `src/diagnostic/autoAnswer/autoAnswerEvidenceQueries.ts:57` | Denominator is configured minimum event threshold, normalized to at least 1 by `autoAnswerMappings.ts:20`. Not zero empirical sample count. |
| `src/correlation/correlate.ts:149` | No receipted traces becomes correlation 0. Not perfect, but absent ratio rather than measured zero. |
| `src/compliance/regulatoryAutomation.ts:665` | Fixed: empty-fleet compliance risk and absent dimension means are null with not_evaluated. |
| `src/console/assets/app.js:1517` | Rendered empty-layer mean 0, same class as snapshot rendering. |
| `src/api/scoreRouter.ts:501` | Empty layer mean becomes level 0. Not perfect; report shape migration requires caller consideration. |
| `src/audit/binderCollector.ts:705` | Empty-layer maturity mean 0. |
| `src/audit/binderCollector.ts:696,712` | Self-reported share defaults to 1 when coverage is missing. This is conservative distrust, not successful coverage. |
| `src/diagnostic/runner.ts:1120` | Question-evidence coverage divides by clamped active-question count, yielding 0 if none. File also has wp05r-owned duality ratio. |
| `src/diagnostic/levelSemantics.ts:202` | Empty-row fallback is a numerical mean 0; no success ratio. |
| `src/context/contextGraph.ts:146` | No evidence gives disclosure-omission ratio 0, contributing no drift. Missing-evidence semantics need caller changes. |
| `src/forecast/robustStats.ts:154` | Forecast uncertainty uses clamped n inside a prediction-band formula. Not evaluation coverage; statistical policy, not identity. |
| `src/forecast/leadingIndicators.ts:32` | Previous event count clamps to 1 for relative-change/z-score stabilization. Statistical smoothing, not evidence coverage. |
| `src/product/reasoningCoach.ts:52,65` | Depth/evidence terms per sentence use clamped denominator; empty text gives 0. Not perfect. |
| `src/product/determinism.ts:64,74` | Empty result list returns `deterministic: true` with zero summary values before guarded variance calculation. Parent notified; absence is not evidence of determinism. |
| `src/agents/traceIngestion.ts:233` | Flag rate initially used clamped scored count. Updated while repairing nullable metric consumers to use `ratioOrNull`; initial rate and mean score are null. |
| `src/agents/metricTemplates.ts:193,404,408` | Nonempty content guard plus JavaScript split ensures a positive word count. Removed redundant clamps in this subtask. |
| `src/steer/microScore.ts:169,215` | JavaScript `text.split(/\s+/)` always has at least one member, so the clamp cannot see a zero denominator. |
| `src/hallucination/detector.ts:182` | Findings density uses at least one sentence even for short text; this is heuristic scaling and empty findings return earlier. Not a success ratio. |
| `src/shield/continuousRedTeam.ts:594` | Standard-error computation clamps second group count. Adjacent red-team statistical scoring is owned by wp05r; do not edit without integration coordination. |
| `src/benchmarks/academicPaper.ts:71,75` | Legacy paper statistics clamp degrees of freedom/group sizes. It explicitly documents sparse-group conventions; not a coverage success ratio. |
| `src/mirofish/engine.ts:201` | Confidence margin divides by square root of clamped n. Simulation statistical policy, not success ratio. |
| `src/audit/insiderRisk.ts:536` | Average category risk divides by the positive-category count, clamped to 1. No positive risk categories gives zero; this is category-risk aggregation, not success coverage. |
| `src/outcomes/outcomeReport.ts:285` | Category maturity average uses clamped category count. Not perfect by default. |
| `src/compliance/complianceEngine.ts:235-239` | Trust-tier shares all become 0 when no trusted subject evidence is admitted. Not perfect; nullable report contract would require broader migration. |
| `src/trust/temporalDecay.ts:301-303` | Markdown freshness percentages divide by `evidenceItems.length || 1`, rendering 0 for absent evidence. |
| `src/observability/costTracker.ts:222` | Daily mean uses `byDay.length || 1`; empty observation set produces zero cost, not positive success. |
| `src/redteam/jailbreak/normalizer.ts:150` | Preamble fraction uses `cleaned.length || 1`; pivot detection cannot find a pivot in empty text, so the ratio branch is not entered. |
| `src/product/conversationSummarizer.ts:41` | Term frequency division occurs only while iterating tokens; positive token denominator. |
| `src/product/instructionFormatter.ts:115` | Budget allocation divides by instruction count clamped to 1; this allocates configuration budget, not evidence. |
| `src/cli-business-commands.ts:675,737` | Presentation of empty layer means defaults to 0 through `length || 1` and final `|| 0`. |

## Non-ratio `1` defaults and non-evaluator exclusions

- `src/cgx/cgxDiff.ts:152,251` and `src/cgx/cgxSimulator.ts:130`: optional edge-confidence metadata defaults, including multiplicative propagation weights. They do not divide an evidence numerator by an empty sample count.
- `src/product/toolFallback.ts:61,103`: initial routing-health prior for a tool that has not been tried; not an evaluator ratio.
- `src/fleet/cascadeSimulator.ts:340,356`: initial simulated quality state, not a measured coverage ratio.
- `src/fleet/trustInheritance.ts:207`: default edge weight, not an evidence-denominator ratio.
- `src/org/orgEngine.ts:167`, `src/diagnostic/selfCalibration.ts:107`, and `src/diagnostic/levelSemantics.ts:227`: default aggregation weights, not published ratio values.
- `src/agents/sessionEval.ts:237,242` and `src/mirofish/engine.ts:361,367`: default item weights; the session aggregate's zero total-weight branch was repaired separately.
- Pagination, retry counts, concurrency limits, TTL/duration lower bounds, version/epoch defaults, process exit codes, byte offsets, integer counters, chart coordinates, fixed scoring thresholds, Likert levels, proof depth, and catalog minimum item counts are not zero-denominator evidence ratios. The raw broad grep produced many such false positives; they do not warrant behavioral edits.

## Implemented consumer propagation and validation

The agent-metrics subtask additionally migrated `src/agents/runHistory.ts` to preserve unevaluated records as `score: null`, rather than dropping records. Comparison deltas and improvement flags remain null when either side is unavailable. Trend summaries retain unknown points and aggregate only measured scores. Empty testsets have null pass rates and averages. `src/agents/traceIngestion.ts` and `src/agents/monitor.ts` propagate nullable metric aggregates; unsampled monitors expose `not_evaluated` rather than healthy status.

Validation: the initial parent-coordinated red run failed all 11 original regression cases. The final dedicated suite contains 18 passing cases. The affected existing suites passed in two batches: 7 files / 244 tests before the last RunHistory case was added, and 17 additional files / 158 tests; the subsequently changed three files passed 182 tests after the RunHistory preservation extension. These represent 24 unique test files and 403 unique final cases. The only existing assertion changed is `tests/scorecardInspired.test.ts:832`, which had excluded the new correct `not_evaluated` dashboard state for monitors with no samples.

Mutation validation killed all 24 final-implementation mutants, and each source file was restored in a `finally` block. Summary: `../codex-runs/axe27-mutations-agent-metrics.txt`. Individual logs use `axe27-mutation-*.log`. The older `axe27-mutation-history-refusal.log` is superseded historical evidence for the discarded throw-based implementation and is not counted in the final 24 mutants.

## Additional watch audit requested during review

Outside live-drift-owned modules, no explicit fallback of 1 or 100 remains in the searched watch ratios. Remaining zero-valued absent ratios are `src/watch/observabilityBridge.ts:771-772` (empty trace statistics), `src/watch/behavioralProfiler.ts:342` (no latency samples), and `src/watch/behavioralProfiler.ts:346-347` (empty events; profiles normally contain events). `src/watch/behavioralProfiler.ts:207` has a positive denominator because the current event was ingested before the error-surge check. `src/watch/realtimeAssurance.ts:190` likewise includes the current trace in its window. Shared live-drift helpers `src/watch/proofDelegatedMonitor.ts:220` and `src/watch/driftMath.ts:63` return 0 for empty proof/fraction denominators; they are AXE-23 integration territory and were not edited by this subtask.


## Memory, value coherence, and evaluator divisions

# AXE-27 memory, value, and additional evaluator ratio inventory

This is the distinct memory-ratio lane inventory. It supersedes this lane's earlier triage text at `axe27-score-audit.md`, whose filename was also used by another agent. It does not supersede that other agent's inventory.

Base: `e730f12295812c24954c5b1fa4f90c89b03c676e`. Locations below were freshly read from the current uncommitted worktree after implementation. This follow-up performed read-only source inspection and wrote only this report: no source edits, builds, or tests.

## Classification and scope

- **Fixed null:** an evidence denominator may be zero. The result now becomes null, its published metric/dimension outcome uses shared `EvidenceOutcome`, and unavailable components are excluded from weighted aggregation.
- **Guarded positive:** the source still contains a division, but a prior branch or fixed nonempty collection guarantees that its denominator is positive. No zero-denominator ratio is evaluated there.
- **Fixed scale/model identity:** the denominator is a positive unit/rounding constant or a modeled ordinal domain, not an observed sample count. A neutral multiplier of 1 is separately identified.
- **Retained measured-failure convention:** the mathematical ratio would be undefined at zero, but the implementation explicitly returns unfavorable zero for a known measured failure. This is not an identity and is not classified as a null measurement. These retained sites are called out below rather than claimed fixed.
- **Retained empty summary convention:** a descriptive empty collection returns zero counts, zero risk index, or an unfavorable scalar score without performing the division. These are not perfect/healthy ratios, but they are also not nullable outcomes. They remain explicit exceptions.

An AST scan using the installed TypeScript parser found **58 direct division expressions** in these nine source modules: memoryIntegrity 5, memoryDepth 17, memoryMaturity 7, valueCoherence 6, valueTypes 0, calibrationGap 6, capabilityElicitation 0, architectureTaskAlignment 9, ragMaturity 8. Imports, comments, regular expressions, and text containing `/` were excluded. There are also **27 direct ratioOrNull calls** and **17 weightedMean calls** in the modules; their evidence-denominator cases are inventoried separately below.

The shared helper `src/utils/ratio.ts:2-5` returns null for a nonfinite numerator/denominator, denominator <= 0, or nonfinite quotient. `weightedMean` at `src/utils/ratio.ts:9-19` excludes unavailable/nonfinite components and nonpositive/nonfinite weights; an empty eligible weight sum routes through ratioOrNull and returns null.

## Memory integrity — src/score/memoryIntegrity.ts

| Current site | Denominator or default | Classification and final behavior |
| --- | --- | --- |
| 69-70, 174-184 | Empty event array; former numeric empty scores | Fixed null: all published component/overall scores are null; outcome not_evaluated; sampleSize 0. |
| 76-77 | conflicts / stores+updates | Fixed null through ratioOrNull when stores=0; consistency is null rather than 1. |
| 81-82 | Former decay=1 with fewer than two retrievals | Fixed null: no comparison yields null decay and not_evaluated component outcome. |
| 83,84 | retrieval count / 2 | Fixed positive constant: partitions a sequence, not an evidence ratio. |
| 85 | first-half confidence sum / first-half length | Guarded positive: retrievals.length >= 2 at line 82 makes firstHalf nonempty. |
| 86 | second-half confidence sum / second-half length | Guarded positive under the same >=2 check. |
| 96-97 | poisoning successes / poisoning attempts | Fixed null when no attempts; no perfect poisoning-resistance credit. |
| 104 | recovery successes / recovery attempts | Fixed null when no attempts; no synthetic .5 recovery value. |
| 106-111 | Weighted component denominator | Fixed null when no component is measured; otherwise weights normalize over measured components. |
| 118 | scaled/bonus score / 100 | Fixed positive unit constant. Null overall stays null, so bonuses cannot resurrect absent evidence. |
| 149-156 | Report outcome, sampleSize, metricOutcomes | Published score outcomes distinguish each unavailable component. |

## Memory depth — src/score/memoryDepth.ts

| Current site | Denominator or default | Classification and final behavior |
| --- | --- | --- |
| 87-99,108 | No events | Fixed null overall and dimensions, not_evaluated, sampleSize 0. |
| 117-120 | No backend failures; former .5 | Fixed null backend resilience. |
| 121,122 | recovered/failures; fallback activations/failures | Guarded positive by failures !== 0 after counting nonnegative events. |
| 123-128 | failed fallbacks / activated fallbacks | Fixed null when none activated; unavailable reliability is excluded from the backend score. |
| 137-138 | No compression events; former .5 | Fixed null compression fidelity. |
| 140,141,142 | verified, lossy, lost-fact counts / compression count | Guarded positive by compressions !== 0. |
| 155-156 | No session boundaries; former .5 | Fixed null cross-session consistency. |
| 158,159 | merges/boundaries; contradictions/boundaries | Guarded positive by boundaries !== 0. |
| 160-164 | resolutions / contradictions | Fixed null when contradictions=0; no synthetic resolution rate 1. Other observed consistency terms can still score the published dimension. |
| 174-175 | No injection attempts, including wash-only evidence | Fixed null poisoning resistance. The old wash-only branch was reachable with zero injection denominator. |
| 177,178 | blocked/injection attempts; successful/injection attempts | Guarded positive by the line 174 early branch. |
| 192-193 | No TTL enforcement/violation events; former .5 | Fixed null TTL compliance. |
| 195 | enforced / (enforced+violated) | Guarded positive by totalTtl !== 0. |
| 207-208 | No capacity events; former .5 | Fixed null capacity management. |
| 210-211 | evictions / warnings | Fixed null at warnings=0; no synthetic eviction response 1. |
| 212 | budget failures / (warnings+evictions+budget failures) | Fixed null on an empty relevant denominator. |
| 213 | degradation / (warnings+evictions+degradation) | Fixed null on an empty relevant denominator. |
| 214-219 | Capacity subcomponent weighted denominator | Fixed null if all relevant terms are unavailable; otherwise normalize measured terms. |
| 125-128,161-164,223-227 | Backend, consistency, overall weighted denominators | Fixed null for an empty eligible set; nonempty sets normalize their actual weights. |
| 260,261,262,263,264,265,266 | Rounded value / 1000 | Fixed positive rounding constant; null is retained before rounding. |
| 250-258 | Report outcomes | Published dimension outcomes are explicit. Internal subratios are not independently serialized: a dimension can remain measured when some of its subratios are null and other subcomponents are measured. |

## Memory maturity — src/score/memoryMaturity.ts

| Current site | Denominator or default | Classification and final behavior |
| --- | --- | --- |
| 135 | score / 20 | Fixed positive level-conversion constant. |
| 184 | (manual+derived level) / 2 | Fixed positive averaging constant; derived null/undefined returns the existing level before this expression. |
| 215-216 | matched keys / expected-key count | Fixed null for an empty expected-key universe. Such probes do not enter measured averages. |
| 224,225 | retained/adjusted sums / admitted probe count | Fixed null if no probe had an evaluable denominator. sampleSize is admitted probes; probeCount retains all input probes. |
| 232-236 | Verification after null persistence ratio | Null cannot set verified=true; scores and metric outcomes retain missingness. |
| 256-266 | Empty hash chain | Fixed null integrity score and not_evaluated rather than finite zero measurement. |
| 308 | valid entries / ordered entry count | Guarded positive by the empty-entry return at line 256. |
| 351-353 | stdDev with <=1 values | Retained descriptive convention: returns 0. Its caller at 432 only reaches it with a nonempty entry list. A single observation has population spread 0; this is not a success ratio. Shared experiments/stats.ts was not edited. |
| 357-361 | symbol count / content length | Guarded positive in the actual call flow: detectEntryAnomaly returns at 370-372 for empty trimmed content. The private helper's empty return 0 remains an unreachable empty-string convention on that path, not a measured perfect ratio. |
| 415-425 | Empty poisoning evidence | Fixed null anomaly rate, precision, recall, poisoning score and not_evaluated. |
| 440 | flagged entry count / entries length | Guarded positive by the empty-entry return at 415. |
| 454 | true positives / predicted positives | Fixed null when predicted positives=0. |
| 455 | true positives / actual positives | Fixed null when actual positives=0. |
| 460-462 | 2*precision*recall / (precision+recall) | **Retained measured-failure convention, not an identity:** when both measured precision and recall are 0, F1 explicitly returns 0. Both positive-class universes had nonzero counts before reaching this branch. This is unfavorable measured failure, not missing-data success. For precision+recall>0 the direct division is guarded positive. The measured-failure convention is retained and documented in source. |
| 499-500 | matched facts / expected-fact count | Fixed null for an empty expected-fact universe; exclude that checkpoint from measured averages. |
| 509,510 | coherence/drift sums / admitted checkpoint counts | Fixed null with no evaluable checkpoints. checkpointCount retains total inputs; sampleSize is measured checkpoints. |
| 518 | Stability after null continuity | Null cannot set stable=true. |
| 556,571-575 | Integrity and maturity weighted denominators | Fixed null when no component is measurable; available dimensions are normalized. |
| 651-654 | scoreMemoryDimension sum / (score count*5) | **Retained empty summary convention:** an empty input explicitly returns scalar 0 before division. This is an unfavorable legacy scalar, not null/not_evaluated and not a mathematical identity. For nonempty inputs the denominator is positive. |
| 199,431 | average(lengths) | Guarded positive at the call: lengths has one item per entry after the nonempty entry guard. |

## Value coherence — src/values/valueCoherence.ts and valueTypes.ts

| Current site | Denominator or default | Classification and final behavior |
| --- | --- | --- |
| valueCoherence.ts:48 | Fewer than two ranks; former tau=1 | Fixed null. |
| valueCoherence.ts:70 | pair count / 2 | Fixed positive combinatorial constant. |
| valueCoherence.ts:71-72 | concordance difference / tie-adjusted pair denominator | Fixed null through ratioOrNull when the denominator is zero/nonfinite. |
| valueCoherence.ts:219,282 | preference count / 2 | Fixed positive partition constant. |
| valueCoherence.ts:217,222 | Fewer than four preferences or two per segment | Guarded data sufficiency: emit no drift points. |
| valueCoherence.ts:234 | absolute rank delta / distinct dimension count | Guarded positive: the loop iterates that same nonempty set. Removed max(1,n) and documented this invariant. |
| valueCoherence.ts:247-255 | Empty drift analytics | **Retained empty summary convention:** returns zero maxDelta/meanDelta and zero trend counts without evaluating a ratio. It does not establish VCI or measured correlation. |
| valueCoherence.ts:258 | drift sum / point count | Guarded positive by the empty-points return at 247. |
| valueCoherence.ts:280 | Fewer than two admitted preferences; former VCI=1 | Fixed null. |
| valueCoherence.ts:290 | Fewer than two dimensions; former VCI=1 | Fixed null. |
| valueCoherence.ts:296 | (tau+1) / 2 | Fixed positive scale conversion. Null tau stays null before conversion. |
| valueCoherence.ts:314-327 | Signed report | VCI null is explicit; shared outcome and sampleSize participate in the signed payload. |
| valueTypes.ts:39-48 | Report type | vci allows null; outcome and sampleSize added. No ratio expressions occur in this file. |

The private tau n<2/zero-pair-denominator branches are defensive and cannot be reached through the currently sanitized public ranking path after its outer guards: both halves are nonempty and each ranking has a first-ranked value. They were still repaired to null; no public export was added solely to expose a private branch to a test.

## Calibration gap — src/score/calibrationGap.ts

| Current site | Denominator or default | Classification and final behavior |
| --- | --- | --- |
| 63 | Empty ECE observations; former error=1 | Fixed null. |
| 83-86 | Bin confidence sum/bin count; accuracy sum/bin count; bin count/total | Guarded positive: empty bins continue at 83, and empty total observations return at 63. |
| 99-113 | Paired finite dimensions | Fixed null all calibration metrics and score when no paired finite dimensions exist. Unpaired fields no longer become zero-valued observations. |
| 143 | total absolute error / paired dimension count | Guarded positive by the new empty-dimension return at 104. |
| 145,146 | over/underconfident count / paired dimension count | Guarded positive by the same return. |
| 182-183 | Measured report | Explicit sampleSize and metric outcomes; actual zero calibration error still yields measured score 100. |
| 245,252-263 | Infrastructure criteria denominator and report | Separate control-rubric aggregation. No assessable criteria makes score null/not_evaluated; actual calibration error/rate fields remain null even when the infrastructure rubric is measurable. Source presence is not calibration observation. |

## Capability elicitation — src/score/capabilityElicitation.ts

| Current site | Denominator or default | Classification and final behavior |
| --- | --- | --- |
| 100-102 | successes / attempts | Fixed null for an unattempted arm. Baseline and elicitation no longer substitute one another. |
| 160-174 | Empty evaluation universe | Fixed null score and ratio fields; not_evaluated, sampleSize 0. |
| 190-199 | Delta comparison set | Only capabilities with both arms measured enter positiveGapSum/comparedCount. No missing arm creates measured delta 0. |
| 216-217 | hidden-signal confidence ?? 1 | **Retained conservative policy, not a ratio:** omitted confidence admits an adverse hidden-capability signal. It cannot create positive performance credit; source now comments this policy. |
| 226 | discovered capabilities / evaluated capability count | Fixed null helper contract. Outside the empty-set return its denominator is positive. |
| 227-228 | hidden capabilities / evaluated count | Fixed null when there are no comparative measurements and no adverse signal; otherwise denominator is positive after the empty-set guard. |
| 229 | positive comparative gap sum / compared capability count | Fixed null when no capabilities have both arms. |
| 231-233 | probed targets / target inventory length | Fixed null when the declared inventory is empty; former default was 1. |
| 235-241 | Weighted score denominator | Fixed null when no component is measurable; otherwise normalize measured components. |
| 273-281 | Report | Shared outcomes per metric; sampleSize counts admitted probes. No direct division expressions remain in this module. |

## Architecture/task alignment — src/score/architectureTaskAlignment.ts

| Current site | Denominator or default | Classification and final behavior |
| --- | --- | --- |
| 257-268 | No stages; former score=100, ratio=1 | Fixed null score, relative ratio and absolute error-rate fields; not_evaluated, sampleSize 0. |
| 277-278 | propagationFactor ?? 1 | **True multiplicative identity:** omitted factor adds no amplification. Source explicitly comments this. |
| 309-313 | propagated residual / independent residual | Fixed null for zero/nonfinite independent residual. Removed the <=0.000001 fabricated 1/2 fallback. Tiny positive rates remain positive in JSON; division uses unrounded rates. |
| 318-322 | Relative and absolute containment score denominator | Normalize available modeled components. A nonempty, explicitly error-free pipeline has measured absolute error=0 and can have containment score 100 while relative amplification is null/not_evaluated. This does not claim a defined 0/0 ratio. |
| 343-344 | Published metric outcomes | Absolute rates/containment can be measured while relative amplification is not_evaluated. |
| 360-361,370 | overprovision / required complexity | **Modeled positive domain, not missing samples:** scoreArchitectureTaskFit clamps required complexity to [1,10]. The retained max(1,...) is redundant domain protection, documented in source. |
| 474-480,585-590 | Failure-mode weighted denominators | Unavailable relative/absolute amplification terms are excluded; architecture-derived terms keep the eligible weight denominator positive. |
| 475 | orchestration depth / 8 | Fixed positive model scale. |
| 499 | capped SPOF count / 5 | Fixed positive model scale. |
| 637-642 | failure-mode risk sum / listed mode count | **Retained empty summary convention:** no modeled modes returns risk index 0 before division. This is not an observed pass ratio and not an identity. A nonempty mode list divides by its actual positive count. |
| 663,664 | critical path redundancy /2; SPOF count /5 | Fixed positive model scales. |
| 730 | modeled stage count /3 | Fixed positive scale. max(1, task steps/depth) is a model-construction floor, not a denominator substitution. |
| 734 | task complexity /150 | Fixed positive model scale. |
| 737 | retry+circuit-breaker coverage /2 | Fixed positive averaging constant. |
| 768-772 | Overall modeled score weighted denominator | Normalize available components. Required fit/complexity/redundancy/risk components remain defined. |

## RAG maturity — src/score/ragMaturity.ts

| Current site | Denominator or default | Classification and final behavior |
| --- | --- | --- |
| 184-189 | 2*p*r/(p+r) | **Retained measured-failure convention, not an identity:** supplied/measured p=r=0 returns F1=0 explicitly. If p+r>0 the direct division is positive-denominator. Raw retrieval missing rates are now null before this function is called. History snapshots supply their own precomputed rates. |
| 219,220 | true positives / retrieved or relevant set size | Fixed null independently for each zero denominator. |
| 225,226 | admitted per-query rate sums / admitted per-query counts | Fixed null for empty component observations; empty query sets no longer enter averages as measured zero. |
| 227-230 | Retrieval F1 and weighted score | Null input rates cannot become a measured F1. Other measured components can still contribute a normalized score. |
| 235-240 | No metadata samples; former attribution rate=1 from a flag | Fixed null metadata rates/score and not_evaluated. |
| 256 | present metadata fields / field-list length | Guarded positive: completenessFields is a literal five-element list. |
| 263,264,265 | Metadata averages | Guarded positive: arrays receive one value per sample after the empty-samples return. |
| 285-293 | Fewer than four history samples | Fixed null drift delta/score, not_evaluated, insufficient_data. |
| 297 | history count /2 | Fixed positive partition constant. |
| 301-310 | Empty drift partition defensive branch | Fixed null rather than synthetic drift score 50. With >=4 history points it is unreachable through the current split. |
| 312,313 | Older/newer F1 averages | Guarded positive by the partition check at 301. |
| 335-342 | Claims eligibility and no eligible outputs | Fixed null risk/rates if no positive finite claim denominator. Former zero-claim max(1,n) and empty-output .85/.8 heuristics are removed. |
| 350,352 | grounded claims / claim count | Guarded positive: every surviving row has finite claimCount>0 at line 335. |
| 353 | citations / claim count | Guarded positive by the same eligible-row filter. |
| 355 | contradictions / claim count | Guarded positive by the same filter. Optional missing contradictory-evidence count remains 0 as the existing row-field default; it is not a zero denominator replacement. |
| 357,358,359,360 | Output-rate averages | Guarded positive: arrays have one item per eligible row after the no-samples return. |
| 374-379 | No citation samples; former integrity/accuracy=.7 | Fixed null citation rates and integrity score, not_evaluated. |
| 381,382,383 | Citation rate averages | Guarded positive after the empty-citation return. |
| 429,448,470,483 | Profile/diagnostic composition denominators | Normalize available diagnostic weights; explicit structural profile-rubric components remain defined separately from observed ratios. |
| 529 | six dimension scores /6 | Fixed positive rubric constant, not a sample denominator. Structural rubric scores are retained; their existence does not make null sample diagnostics measured. |
| 543-551 | Deployment risk with missing output/citation metrics | Missing measurements cannot yield the low-risk branch. |

## Remaining actual zero-denominator conventions, stated explicitly

These are the remaining sites where an empty or zero domain receives a finite zero convention instead of null. None is a genuine multiplicative identity, and none is being represented here as repaired to null:

1. `memoryMaturity.ts:461`: measured precision=recall=0 gives F1=0 for known failure on nonempty positive-class universes.
2. `ragMaturity.ts:188`: p=r=0 gives F1=0 for supplied/measured zero rates, including supplied history snapshots.
3. `memoryMaturity.ts:651-654`: empty legacy scalar scoreMemoryDimension returns unfavorable 0 before ratio evaluation.
4. `memoryMaturity.ts:357-358`: empty symbol-density helper returns 0, but its current caller rejects empty content first at 370-372.
5. `valueCoherence.ts:247-255`: empty drift analytics return descriptive zero delta/count summaries before division.
6. `architectureTaskAlignment.ts:637-642`: no modeled failure modes returns descriptive risk index 0 before division.

No unguarded direct division in these nine modules has an evidence denominator that can be zero under its documented typed call flow. The two F1 conventions and the empty-summary/scalar conventions above are the explicit remaining semantic exceptions. Nonfinite numerator validation outside ratioOrNull is not claimed as an exhaustive result of this denominator audit.

## Recreated sibling triage, refreshed against the current worktree

This table records the final disposition of sibling scoring candidates.

| Site | Current classification |
| --- | --- |
| industryTrustModels.ts:190 | True neutral multiplier: dimensionWeights[dim] ?? 1.0; source comment present. |
| industryTrustModels.ts:197,227 | Now repaired by another lane/root to ratioOrNull for weighted score and raw dimension mean. Empty scores are nullable with metric outcomes. The initial audit had classified the old max(1,count) zero as unfavorable, but that old expression no longer exists. |
| alignmentIndex.ts:167-174,260-262 | Guarded unused default weight: countDefined clamps zero to one, but no Bloom dimension is emitted if all four optional scores are absent. Four required dimensions ensure positive final normalization weight. This is not measured optional score credit. |
| antiGaming.ts:195,233-235 | Now repaired by another lane/root: missing score means and zero-mean timing CV use ratioOrNull and metric outcomes. The earlier denominator fallbacks are gone. |
| statisticalAnalysis.ts:203-208 | Retained conservative Welch degrees-of-freedom bound=1 for degenerate variances, documented as a distribution parameter rather than success/coverage. Caller requires >=2 observations per group; separate zero-standard-error branches produce p=1, not significance. No experiment statistics semantics were edited. |
| domainPacks.ts:79 | assessment answer ??1 is minimum Likert L1, not 100%; missing answers produce compliance gaps. It is a rubric value default, not a ratio denominator. |
| domainPacks.ts:90 | Empty question/weight domain returns unfavorable scalar 0 before division. This is a retained empty-rubric convention, not a defined measured rate. |
| reputationPortability.ts:36 | platformCount ??1 is descriptive count metadata; it never enters the scoring formula. Not a ratio or perfect score. |
| capabilityElicitation.ts:216-217 | Omitted signal confidence conservatively admits an adverse signal; documented policy, not positive evidence ratio. The actual target-coverage and arm-denominator defects are fixed above. |
| architectureTaskAlignment.ts:277-278,360-361 | Documented neutral propagation multiplier and modeled ordinal positive floor. Actual empty-pipeline/relative-rate defects are fixed above. |

## Evidence already obtained before this read-only follow-up

The subtask's previous validation remains: 42 added regressions; 244 passing tests across 13 files; 44 distinct mutants ultimately killed, including two initial memory survivors that caused targeted regressions and successful kill retests. Detailed commands, source changes, existing assertion changes, red/green logs, and mutation log paths remain in `axe27-memory-value-report.md`. This inventory follow-up did not rerun any test or build while the parent performed final verification.


## Operational, industry, anti-gaming, and predictive sites

# AXE-27 score and organization contribution audit

All paths below are in the assigned worktree. The list covers this sub-agent contribution, not the entire source audit.

- `src/score/pauseQuality.ts:81`: Empty action count has no pause-rate measurement.
- `src/score/pauseQuality.ts:87`: No pauses no longer imply perfect relevance.
- `src/score/pauseQuality.ts:90`: No pauses no longer manufacture a timing score.
- `src/score/pauseQuality.ts:93`: No pauses no longer manufacture resolution quality.
- `src/score/pauseQuality.ts:96`: No resolved pauses no longer manufacture a mean resolution time.
- `src/score/pauseQuality.ts:161`: Empty actions publish null scores and not_evaluated outcomes.
- `src/score/interpretability.ts:62`: No explanations have no faithfulness ratio.
- `src/score/interpretability.ts:68`: No confidence/outcome observations no longer imply zero error and perfect calibration.
- `src/score/interpretability.ts:85`: No refusals have no transparency ratio.
- `src/score/interpretability.ts:142`: Empty actions publish null scores and not_evaluated outcomes.
- `src/score/operationalIndependence.ts:512`: Empty shipment cohort has no on-time ratio.
- `src/score/operationalIndependence.ts:533`: Empty exception cohort has no resolution ratio or perfect component score.
- `src/score/operationalIndependence.ts:572`: Absent warehouse evidence has a null component score; actual warehouse samples retain measured scoring.
- `src/score/operationalIndependence.ts:593`: Empty SLA cohort has no breach ratio.
- `src/score/operationalIndependence.ts:609`: Empty logistics cohort has no traceability ratio.
- `src/score/operationalIndependence.ts:625`: Empty cold-chain cohort has no excursion ratio or perfect component score.
- `src/score/operationalIndependence.ts:768`: Retained valid division: every inventory bucket is created by a usage sample; positive denominator is commented.
- `src/score/operationalIndependence.ts:792`: Empty event cohort has no dependency-coverage ratio.
- `src/score/operationalIndependence.ts:810`: Uses ratioOrNull; empty comparison slices cannot fabricate failure rates.
- `src/score/operationalIndependence.ts:898`: No dependency comparison evidence no longer implies a perfect drift score.
- `src/score/operationalIndependence.ts:920`: No failures no longer imply measured perfect recovery or degradation score.
- `src/score/operationalIndependence.ts:980`: No dependencies no longer imply perfect portability or measured low risk.
- `src/score/operationalIndependence.ts:1016`: Retained valid division after explicit empty-inventory return; positive denominator is commented.
- `src/score/operationalIndependence.ts:1017`: Retained valid division after explicit empty-inventory return; positive denominator is commented.
- `src/score/operationalIndependence.ts:1069`: No dependencies have no fallback-coverage ratio.
- `src/score/operationalIndependence.ts:1070`: No dependencies have no portability ratio.
- `src/score/operationalIndependence.ts:1114`: Empty events have no escalation rate.
- `src/score/operationalIndependence.ts:1151`: Zero windowDays cannot be replaced with denominator one; missing run component is excluded.
- `src/org/orgEngine.ts:177`: Retained identity: one preserves an observed weight when no freeze/configuration penalty applies; commented.
- `src/org/orgEngine.ts:458`: Empty peer populations and absent peer value rows return null, never rank 100.
- `src/score/industryTrustModels.ts:190`: Retained identity: one is a neutral multiplier for an observed dimension; commented.
- `src/score/industryTrustModels.ts:197`: Zero total dimension weight has no adjusted score, decay, or maturity measurement.
- `src/score/industryTrustModels.ts:227`: Empty dimensions have no raw mean; denominator one is not fabricated.
- `src/score/antiGaming.ts:43`: Empty question cohort has no clean gaming score.
- `src/score/antiGaming.ts:195`: Empty session distributions are excluded from convergence comparisons.
- `src/score/antiGaming.ts:233`: Zero timing mean has no coefficient of variation or timing anomaly.
- `src/score/antiGaming.ts:280`: Empty evidence sets have no cross-agent similarity measurement.
- `src/score/antiGaming.ts:201`: A single session has no cross-session gaming verdict.
- `src/score/antiGaming.ts:317`: No usable session observations have no finite clean adaptation score.
- `src/score/antiGaming.ts:349`: Empty stabilization input has null score, interval bounds, and variance.
- `src/score/antiGaming.ts:359`: A single score with no usable confidence weight has no weighted score.
- `src/score/antiGaming.ts:382`: Unusable confidence weights contribute neither numerator nor denominator.
- `src/score/antiGaming.ts:386`: Zero usable confidence weight has no score; it cannot fall back to an unweighted perfect result.
- `src/score/predictiveValidity.ts:532`: No distinct comparable rater pairs have no average difference or agreement score; actual equal pairs remain measured perfect agreement.

Verification:

- Initial score red: 9 regression failures in the coordinated root red run; expanded focused score suite passed 44 tests.
- Score and organization final existing/regression run: 53 passed, 2 existing HTTP cases skipped after the full attempt failed with listen EPERM on 127.0.0.1.
- Industry/gaming initial red: 8 failures. Inter-rater initial red: 5 failures.
- Industry/gaming/predictive final six-file run: 105 passed, including AXE-30 nonempty statistical characterization.
- Mutation checks: 16 score guards, 1 organization percentile guard, 14 industry/gaming guards, and 4 inter-rater guards were each independently killed; originals were restored.
- All source files were stable before the root agent was cleared to build. No commit, push, or git metadata mutation was performed.

Predictive follow-up sites:

- `src/score/predictiveValidity.ts:474`: Empty target denominator has no average rater count; populated targets retain the direct positive-denominator calculation.
- `src/score/predictiveValidity.ts:475`: Empty target denominator has no multi-rater coverage; an observed single-rater target retains measured zero coverage.
- `src/score/predictiveValidity.ts:603`: Empty stability input has null empirical moments and unavailable stability; a single observation retains its real score and population SD zero.
- `src/score/predictiveValidity.ts:630`: No adjacent observations provide no absolute-delta mean.
- `src/score/predictiveValidity.ts:631`: No adjacent observations provide no maximum delta.
- `src/score/predictiveValidity.ts:632`: A measured zero score mean provides no coefficient of variation.
- `src/score/predictiveValidity.ts:637`: No adjacent delta evidence can no longer produce a perfect stability index.

Follow-up verification:

- Tests-first red: 2 empty-target cases and 4 stability cases failed before source edits.
- Latest green: 401 tests passed across the expanded regression file, predictiveValidity.test.ts, and metricCoverageSummaryParity.test.ts.
- Twelve additional target/stability guard mutations were independently killed and restored. Total contribution mutation checks: 47/47 killed.
- Frozen metricValidity.ts remained untouched: its existing consumer already accepts number or null and requires at least three observations.
- Source was stable before the root build was cleared. Existing ICC and correlation inference policies were preserved.

Architecture ratchet repair:

- Extracted public type declarations into `src/score/operationalIndependenceTypes.ts` and `src/score/predictiveValidityTypes.ts`; original modules re-export all prior public types. Runtime and JSON behavior did not change.
- `operationalIndependence.ts` is 1201 lines against a 1295-line budget; `predictiveValidity.ts` is 853 against 927. No budgets were changed.
- After extraction, four targeted regression/existing files passed 62 tests (`axe27-type-extraction-green.log`).


## Baseline grep disposition and remaining boundaries

# AXE-27 final scope classifications

This supplement classifies every one of the 179 baseline grep sites in `axe27-ratio-grep.txt`, then records additional sites discovered by examining multiline `return 1` guards and default-zero ratios. Baseline references use `e730f1229`; current line numbers may differ.

## Baseline grep inventory

| Baseline source | Classification |
| --- | --- |
| `src/snapshot/snapshot.ts:85` | Deferred: rendered empty-layer mean is 0; unowned report consumer. |
| `src/governor/governorReport.ts:87` | Guarded by fixed nonempty ACTION_CLASSES catalog; denominator cannot be zero. |
| `src/toolhub/toolhubExecutors/git.ts:21` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/studio/studioServer.ts:2696` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/studio/studioServer.ts:2706` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/session/spill/spillTypes.ts:171` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/cgx/cgxDiff.ts:152` | Configured/default edge confidence or routing/simulation prior; not a computed empirical ratio. |
| `src/cgx/cgxDiff.ts:251` | Configured/default edge confidence or routing/simulation prior; not a computed empirical ratio. |
| `src/toolhub/toolhubExecutors/process.ts:29` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/studio/cliBridge.ts:237` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/session/sessionOwnership.ts:54` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/domains/domainAssessmentEngine.ts:89` | Default Likert level 1 (lowest), not a perfect 0-1 ratio. |
| `src/studio/nativeTaskService.ts:332` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/cgx/cgxSimulator.ts:130` | Configured/default edge confidence or routing/simulation prior; not a computed empirical ratio. |
| `src/identity/scim/scimUsers.ts:80` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/org/orgEngine.ts:167` | Default aggregation/edge weight or graph indegree metadata; not a zero-denominator evidence ratio. |
| `src/redteam/mcpAgentProvider.ts:1020` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/org/orgStore.ts:212` | Default aggregation/edge weight or graph indegree metadata; not a zero-denominator evidence ratio. |
| `src/redteam/jailbreak/normalizer.ts:150` | Guarded: empty text cannot contain the pivot that enters preamble-ratio branch. |
| `src/shield/trustPipeline.ts:109` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/business/fairScenario.ts:123` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/forecast/forecastSignals.ts:297` | Default task-effort weight 1, not an empirical ratio. fcastfix owns separate paths in this file. |
| `src/forecast/forecastSignals.ts:396` | Deferred: denied-action empirical ratio defaults 0; fcastfix owns this file. |
| `src/shield/continuousRedTeam.ts:594` | Statistical clamp is guarded by minimum group counts; other empty attack-rate fields belong to wp05r. |
| `src/value/valueScoring.ts:195` | Deferred: empty KPI mean/trust observation is 0; unowned. |
| `src/values/valueCoherence.ts:234` | Guarded: iteration over allValues implies positive allValues.size; VCI/tau absence fixed separately. |
| `src/cli.ts:1137` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/cli.ts:14334` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/cli.ts:20002` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/cli.ts:20003` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/assurance/packs/mcpSecurityResiliencePack.ts:291` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/diagnostic/runner.ts:1237` | Deferred: no executions yield duality ratio 1; wp05r owns the duality-compliance consumer. |
| `src/bench/benchComparer.ts:121` | Guarded: empty population returns before ratio evaluation. |
| `src/bench/benchPercentiles.ts:121` | Non-success clustering math; initial-medoid selection receives nonempty points; size fallback is metadata. |
| `src/bench/benchPercentiles.ts:122` | Non-success clustering math; initial-medoid selection receives nonempty points; size fallback is metadata. |
| `src/bench/benchPercentiles.ts:123` | Non-success clustering math; initial-medoid selection receives nonempty points; size fallback is metadata. |
| `src/bench/benchPercentiles.ts:124` | Non-success clustering math; initial-medoid selection receives nonempty points; size fallback is metadata. |
| `src/bench/benchPercentiles.ts:225` | Non-success clustering math; initial-medoid selection receives nonempty points; size fallback is metadata. |
| `src/ledger/monitor.ts:259` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/ledger/monitor.ts:267` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/ledger/monitor.ts:281` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/runtimes/common.ts:202` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/diagnostic/autoAnswer/autoAnswerEvidenceQueries.ts:57` | Configured minimum-event threshold, normalized positive; not empirical evidence denominator. |
| `src/assurance/indices.ts:189` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/diagnostic/autoAnswer/traceEvidenceMapper.ts:150` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/a4/a4Schema.ts:206` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/a4/a4Schema.ts:252` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/diagnostic/bank/bankV1.ts:56` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/diagnostic/bank/bankV1.ts:59` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/a4/a4Readiness.ts:693` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/runtime/stateCheckpoint.ts:320` | Not a ratio: heuristic point addition based on state differences/restore references; outside AXE-27. |
| `src/diagnostic/levelSemantics.ts:227` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/diagnostic/riskTiers.ts:117` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/catalog/evidence/dimensions.ts:57` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/catalog/evidence/dimensions.ts:64` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/catalog/evidence/dimensions.ts:65` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/correlation/correlate.ts:149` | Deferred: no receipted trace denominator publishes ratio 0; unowned. |
| `src/tools/builtin/fsTools.ts:273` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/console/assets/app.js:1517` | Deferred: empty-layer mean renders 0; unowned display consumer. |
| `src/domains/stations.ts:70` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/enforce/circuitBreaker.ts:65` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/enforce/semanticGuardrails.ts:231` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/sandbox/processCap.ts:24` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/integrations/integrationJournalProtocol.ts:91` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/dashboard/templates/app.js:1338` | Chart geometry/range normalization or display metadata; not evidence evaluation. |
| `src/product/dependencyGraph.ts:79` | Default aggregation/edge weight or graph indegree metadata; not a zero-denominator evidence ratio. |
| `src/product/dependencyGraph.ts:145` | Default aggregation/edge weight or graph indegree metadata; not a zero-denominator evidence ratio. |
| `src/product/dependencyGraph.ts:165` | Default aggregation/edge weight or graph indegree metadata; not a zero-denominator evidence ratio. |
| `src/product/dependencyGraph.ts:188` | Default aggregation/edge weight or graph indegree metadata; not a zero-denominator evidence ratio. |
| `src/product/toolFallback.ts:61` | Configured/default edge confidence or routing/simulation prior; not a computed empirical ratio. |
| `src/product/toolFallback.ts:103` | Configured/default edge confidence or routing/simulation prior; not a computed empirical ratio. |
| `src/product/fixGenerator.ts:138` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/product/conversationSummarizer.ts:40` | Term weighting/smoothing over tokens; denominator is positive when used. Empty-set similarity has an identity comment. |
| `src/product/approvalWorkflow.ts:55` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/dashboard/components/timeline.js:16` | Chart geometry/range normalization or display metadata; not evidence evaluation. |
| `src/audit/insiderRisk.ts:536` | Risk aggregation divides by positive-category count; zero positive categories gives 0; unowned. |
| `src/audit/binderCollector.ts:705` | Empty-layer mean is deferred; missing self-reported share defaults 1 conservatively; unowned. |
| `src/audit/binderCollector.ts:712` | Empty-layer mean is deferred; missing self-reported share defaults 1 conservatively; unowned. |
| `src/mirofish/engine.ts:361` | Default aggregation/edge weight or graph indegree metadata; not a zero-denominator evidence ratio. |
| `src/mirofish/engine.ts:367` | Default aggregation/edge weight or graph indegree metadata; not a zero-denominator evidence ratio. |
| `src/passport/passportApi.ts:638` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/cli-eval-dataset-commands.ts:305` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/observability/costTracker.ts:222` | Deferred: empty daily-cost mean is 0; unowned observability aggregation. |
| `src/api/scoreRouter.ts:501` | Deferred: empty-layer mean publishes level 0; unowned report/API consumer. |
| `src/adapters/adapterRunner.ts:441` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/score/memoryIntegrity.ts:70` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/score/memoryIntegrity.ts:90` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/score/industryTrustModels.ts:184` | Default aggregation/edge weight or graph indegree metadata; not a zero-denominator evidence ratio. |
| `src/score/industryTrustModels.ts:219` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/observability/anomalyDetector.ts:174` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/observability/anomalyDetector.ts:216` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/console/assets/components/cgxViewer.js:15` | Chart geometry/range normalization or display metadata; not evidence evaluation. |
| `src/product/escalation.ts:142` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/observability/sessionCorrelator.ts:433` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/observability/sessionCorrelator.ts:438` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/observability/sessionCorrelator.ts:440` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/fleet/cascadeSimulator.ts:340` | Configured/default edge confidence or routing/simulation prior; not a computed empirical ratio. |
| `src/fleet/cascadeSimulator.ts:356` | Configured/default edge confidence or routing/simulation prior; not a computed empirical ratio. |
| `src/score/domainPacks.ts:79` | Default Likert level 1 (lowest), not a perfect 0-1 ratio. |
| `src/score/calibrationGap.ts:128` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/compliance/regulatoryAutomation.ts:583` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/compliance/regulatoryAutomation.ts:665` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/steer/microScore.ts:83` | Regex scoring weight or split-word density; JS split guarantees a nonzero array length. |
| `src/steer/microScore.ts:169` | Regex scoring weight or split-word density; JS split guarantees a nonzero array length. |
| `src/score/formalSpec.ts:62` | Default aggregation/edge weight or graph indegree metadata; not a zero-denominator evidence ratio. |
| `src/score/formalSpec.ts:68` | Default aggregation/edge weight or graph indegree metadata; not a zero-denominator evidence ratio. |
| `src/score/operationalIndependence.ts:643` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/score/operationalIndependence.ts:1108` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/score/operationalIndependence.ts:1208` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/score/mcpCompliance.ts:471` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/score/mcpCompliance.ts:473` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/steer/research/eval_feedback_convergence.ts:188` | Synthetic experiment distance fallback; 1 is maximal distance/worst result, not success coverage. |
| `src/steer/research/eval_feedback_convergence.ts:207` | Synthetic experiment distance fallback; 1 is maximal distance/worst result, not success coverage. |
| `src/score/memoryDepth.ts:152` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/score/memoryDepth.ts:169` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/score/memoryDepth.ts:202` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/cli/claimOutput.ts:176` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/cli/claimOutput.ts:177` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/score/statisticalAnalysis.ts:207` | Retained with comment: conservative Welch degrees-of-freedom bound, not a success ratio. |
| `src/score/simplicityScoring.ts:29` | Default model input count (layers/platforms), not a computed empirical ratio. |
| `src/benchmarks/replayBenchmarkCorpus.ts:15053` | Configured minimum required evidence counts; 1 is the least nonzero requirement, not ratio success. |
| `src/benchmarks/replayBenchmarkCorpus.ts:15060` | Configured minimum required evidence counts; 1 is the least nonzero requirement, not ratio success. |
| `src/benchmarks/replayBenchmarkCorpus.ts:15067` | Configured minimum required evidence counts; 1 is the least nonzero requirement, not ratio success. |
| `src/benchmarks/replayBenchmarkCorpus.ts:15076` | Configured minimum required evidence counts; 1 is the least nonzero requirement, not ratio success. |
| `src/benchmarks/replayBenchmarkCorpus.ts:15081` | Configured minimum required evidence counts; 1 is the least nonzero requirement, not ratio success. |
| `src/benchmarks/replayBenchmarkCorpus.ts:26620` | Configured minimum required evidence counts; 1 is the least nonzero requirement, not ratio success. |
| `src/benchmarks/replayBenchmarkCorpus.ts:26638` | Configured minimum required evidence counts; 1 is the least nonzero requirement, not ratio success. |
| `src/benchmarks/replayBenchmarkCorpus.ts:26748` | Configured minimum required evidence counts; 1 is the least nonzero requirement, not ratio success. |
| `src/benchmarks/replayBenchmarkCorpus.ts:26753` | Configured minimum required evidence counts; 1 is the least nonzero requirement, not ratio success. |
| `src/score/interpretability.ts:79` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/console/assets/charts.js:27` | Chart geometry/range normalization or display metadata; not evidence evaluation. |
| `src/console/assets/charts.js:32` | Chart geometry/range normalization or display metadata; not evidence evaluation. |
| `src/score/antiGaming.ts:191` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/score/antiGaming.ts:213` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/score/pauseQuality.ts:81` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/fleet/trustInheritance.ts:259` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/fleet/fleetScoring.ts:391` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/benchmarks/academicPaper.ts:71` | Sparse-group statistical convention, documented in source; not evaluation success coverage. |
| `src/benchmarks/academicPaper.ts:75` | Sparse-group statistical convention, documented in source; not evaluation success coverage. |
| `src/fleet/contradictionDetector.ts:61` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/score/reputationPortability.ts:36` | Default model input count (layers/platforms), not a computed empirical ratio. |
| `src/score/capabilityElicitation.ts:205` | Default input signal confidence, not a zero-denominator ratio; denominator handling fixed elsewhere in this file. |
| `src/eval/judgeCalibration.ts:631` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/eval/judgeCalibration.ts:634` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/eval/judgeCalibration.ts:667` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/eval/judgeCalibration.ts:668` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/trust/rootRotation.ts:45` | Signature version/quorum/threshold metadata; no empirical evidence division. |
| `src/trust/rootRotation.ts:106` | Signature version/quorum/threshold metadata; no empirical evidence division. |
| `src/trust/rootRotation.ts:107` | Signature version/quorum/threshold metadata; no empirical evidence division. |
| `src/trust/rootRotation.ts:115` | Signature version/quorum/threshold metadata; no empirical evidence division. |
| `src/trust/rootRotation.ts:116` | Signature version/quorum/threshold metadata; no empirical evidence division. |
| `src/trust/rootRotation.ts:237` | Signature version/quorum/threshold metadata; no empirical evidence division. |
| `src/trust/rootRotation.ts:277` | Signature version/quorum/threshold metadata; no empirical evidence division. |
| `src/trust/rootRotation.ts:299` | Signature version/quorum/threshold metadata; no empirical evidence division. |
| `src/trust/rootRotation.ts:300` | Signature version/quorum/threshold metadata; no empirical evidence division. |
| `src/score/architectureTaskAlignment.ts:269` | Default aggregation/edge weight or graph indegree metadata; not a zero-denominator evidence ratio. |
| `src/trust/temporalDecay.ts:301` | Deferred: empty freshness percentages render 0; unowned display consumer. |
| `src/trust/trustContext.ts:87` | Signature version/quorum/threshold metadata; no empirical evidence division. |
| `src/trust/trustContext.ts:88` | Signature version/quorum/threshold metadata; no empirical evidence division. |
| `src/trust/trustContext.ts:112` | Signature version/quorum/threshold metadata; no empirical evidence division. |
| `src/trust/trustList.ts:188` | Signature version/quorum/threshold metadata; no empirical evidence division. |
| `src/trust/trustList.ts:202` | Signature version/quorum/threshold metadata; no empirical evidence division. |
| `src/keys/rotationStatement.ts:230` | Signature version/quorum/threshold metadata; no empirical evidence division. |
| `src/keys/purposeKeys.ts:246` | Signature version/quorum/threshold metadata; no empirical evidence division. |
| `src/cli-business-commands.ts:675` | Deferred: empty-layer averages render 0; unowned display consumer. |
| `src/cli-business-commands.ts:737` | Deferred: empty-layer averages render 0; unowned display consumer. |
| `src/vault/privacyBudget.ts:15` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/keys/revocationList.ts:83` | Signature version/quorum/threshold metadata; no empirical evidence division. |
| `src/agent/stubProvider.ts:106` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/dogfood/maturityEvidence.ts:253` | Non-ratio 1 default: configuration bound, index/version, exit code, counter, seed, or weight; no empirical division. |
| `src/agents/metricTemplates.ts:153` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/agents/metricTemplates.ts:246` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/agents/metricTemplates.ts:330` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/agents/sessionEval.ts:237` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/agents/sessionEval.ts:242` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/agents/sessionEval.ts:385` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/agents/sessionEval.ts:386` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/ops/governanceSlo.ts:473` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |
| `src/watch/realtimeAssurance.ts:547` | Fixed/refactored by AXE-27; the baseline expression is absent from current source. |

## Additional findings beyond the baseline grep

- `src/score/faithfulness.ts:160,479`: zero claim tokens and empty output previously read as perfectly grounded. Fixed in this subtask with null grounding/confidence, per-claim outcomes and measured-only claim aggregation. Empty context/no extracted claims likewise return null, preserving the result shape. Existing `tests/score/faithfulness.test.ts` defect expectations were updated.
- `src/score/ragGroundingEval.ts:260,319-326`: the local ratio helper defaulted all absent claim/chunk/citation metrics to 0. Migrated in this subtask to nullable shared ratios, per-metric outcomes and denominators, nullable measured-subset penalty, and null-aware audit rendering.
- `src/score/predictiveValidity.ts:626-627,673-674`: zero rater pairs previously produced pairwise difference 0 and agreement 1; the score agent fixed the pairwise difference/agreement absence. Empty-target average/coverage fields are now null as well. No-delta stability, empty empirical moments, and zero-mean CV also preserve unavailable measurements.
- `src/score/densityMap.ts:75,124`: empty input returns a zero-valued report before the clamp. The division's denominator is therefore positive. The explicit empty report's zero coverage remains an unowned default-zero migration candidate.
- `src/score/metricValidity.ts:10419,10424`: empty question scores return before the clamp. The division denominator is positive; the explicit empty construct-validity score remains 0. Unowned default-zero candidate.
- `src/score/outputAttestation.ts:211`: shield penalty clamps total pack count if failures are positive. Inconsistent failed-positive/total-zero input produces a conservative penalty rather than a perfect result. It remains an unowned input-validation/statistical-contract candidate.
- `src/score/diagnosticResponseScoring.ts:6-7` and `src/score/forecastLegitimacy.ts:110-111`: required/bonus weight allocation clamps criterion counts. Empty lists never consume the corresponding weight. This is configured weight allocation, not an observed success ratio.
- `src/score/statisticalAnalysis.ts:299`: singular standard error yields p-value 1. This is a conservative non-significance convention over observed groups of at least two points, not a success ratio. Welch's degree-of-freedom fallback has a source comment.
- `src/assurance/packs/economicAmplificationPack.ts:63`: zero actual/expected tool calls retain amplification factor 1 as a documented multiplicative identity; positive actual calls with no expected budget are Infinity/critical.

## Ownership boundaries for remaining absent-denominator candidates

| Source | Candidate and boundary |
| --- | --- |
| `src/diagnostic/runner.ts:1237` | Default-perfect duality compliance on no executions. wp05r owns this exact consumer. It must be deferred to that lane, not silently called fixed here. |
| `src/experiments/experimentGatePolicy.ts:42` | Relative cost 0/0 identity convention; wp05r owns the gate-policy module and its consumers. |
| `src/experiments/experimentRunner.ts:417-429` | No paired observations return before all paired-rate/mean divisions; this is an existing guard. wp05r owns gate-policy consumers. |
| `src/shield/continuousRedTeam.ts:440,489` | Empty attack batches publish success rates 0; red-team scorer/statistical semantics belong to wp05r. Its standard-error denominator at 594 is guarded by baseline >=2 and candidate >=1 checks. |
| `src/experiments/stats.ts` | Shared statistical empty-input conventions are explicitly owned by AXE-30; this package did not change them. |
| `src/forecast/forecastSignals.ts:396,492,536` | Empty tool-action rate and empty feature means remain 0. fcastfix owns transform-plan loading/error paths in this file; integration coordination is required before editing the same file. |
| `src/watch/proofDelegatedMonitor.ts:220`, `src/watch/driftMath.ts:63` | Empty proof/fraction ratios remain 0 in shared live-drift plumbing. AXE-23 owns live-drift coverage and parity fixtures; preserve that lane and generator protocol. |
| `src/watch/observabilityBridge.ts:771-772` | Empty trace error/latency stats remain 0. This is Watch/observability source; coordinate with AXE-23's broad watch ownership and h2xr's narrower bridge usage scope. |
| `src/watch/behavioralProfiler.ts:342,346-347` | Empty latency/event summaries remain 0. Watch ownership requires AXE-23 coordination. Error-surge rate 207 follows ingestion of a current event and cannot divide by zero. |
| `src/experiments/architectureExperiment.ts:463-464,541-546` | Empty experimental pass/choice-awareness rates remain 0. This non-perfect absence migration was not implemented in this package; adjacent gate-policy consumers require wp05r coordination. |

The other unowned default-zero report/display candidates are listed explicitly in the earlier external audit: snapshot, console/API/business mean rendering, correlation, value scoring, context drift, evidence freshness, and daily-cost means. They were reported rather than expanded into unrelated migrations during the final bounded pass. No native-composition, MCP lifecycle, tool, session-fork, pricing, incident, or research-owned files were edited by this audit subtask.

## Final subtask checks and integration limits

Faithfulness: 7 new regression tests failed before implementation; all 7 new tests and 19 existing tests pass afterward. Four mutants were killed and restored. Existing defect assertions changed in `tests/score/faithfulness.test.ts` for empty output, empty context, no extracted claims, nullable score bounds, and empty-token overlap.

RAG grounding: the corrected tests-first run failed all 4 new cases on the intended missing-evidence assertions. The new suite and five existing RAG boundary suites pass (6 files, 25 cases). The local generic fallback was replaced by the shared finite ratio helper. The penalty excludes unavailable components and remains null with no measured components. Existing receipt fail-closed checks and signing paths remain in place.

The existing residency tests that exercise the faithfulness judge could not reach their bodies in this sandbox. A bounded targeted run reported `listen EPERM: operation not permitted 127.0.0.1` from its `beforeEach` fixture, followed by `Hook timed out in 5000ms` and an undefined `origin.server` cleanup error. Result: exit 1, 2 failed, 30 skipped, 2 unhandled EPERM errors. The earlier full-file attempts were interrupted with exit 130 after hanging in that same fixture. No security checks, residency rules, test fixtures, or sandbox permissions were weakened.

Final validation after restoration: 8 newly affected faithfulness/RAG test files passed all 51 cases; the subtask's earlier 24 files passed 403 final cases, giving 32 unique successful files and 454 cases. The separate targeted residency fixture failure above remains unresolved. Four RAG mutants were killed and restored, bringing this subtask's final implementation to 32 killed mutants. `git diff --check` passes for the added faithfulness/RAG files. No commits, pushes, builds, research edits, or other-worktree edits were performed by this subtask.


## Runtime, coverage, and shared-helper sites

| Current source | Decision |
| --- | --- |
| `src/utils/ratio.ts:2` | export function ratioOrNull(numerator: number, denominator: number): number \| null { |
| `src/utils/ratio.ts:9` | export function weightedMean(components: ReadonlyArray<readonly [number \| null, number]>): number \| null { |
| `src/utils/ratio.ts:17` | return ratioOrNull(numerator, denominator); |
| `src/ops/governanceSlo.ts:432` | const p50 = values.length > 0 ? percentile(values, 50) : null; |
| `src/ops/governanceSlo.ts:433` | const p95 = values.length > 0 ? percentile(values, 95) : null; |
| `src/ops/governanceSlo.ts:434` | const p99 = values.length > 0 ? percentile(values, 99) : null; |
| `src/ops/governanceSlo.ts:464` | const observedValue = values.length === 0 ? null |
| `src/ops/governanceSlo.ts:466` | : ratioOrNull(values.filter(value => value <= (definition.thresholdValue ?? 0)).length, values.length); |
| `src/ops/governanceSlo.ts:467` | const status: SloStatus = observedValue === null ? "NO_DATA" |
| `src/watch/realtimeAssurance.ts:551` | score: ratioOrNull(passedChecks.length * 100, this.checks.length), |
| `src/watch/realtimeAssurance.ts:620` | const avgScore = weightedMean(measured.map(result => [result.score, 1])); |
| `src/assurance/packs/mcpSecurityResiliencePack.ts:163` | const attackSuccessRate = input.attackSuccessRate === null \|\| !Number.isFinite(input.attackSuccessRate) ? null : clamp01(input.attackSuccessRate); |
| `src/assurance/packs/mcpSecurityResiliencePack.ts:164` | const performanceUnderAttack = input.performanceUnderAttack === null \|\| !Number.isFinite(input.performanceUnderAttack) ? null : clamp01(input.performanceUnderAttack); |
| `src/assurance/packs/mcpSecurityResiliencePack.ts:301` | const attackRatio = ratioOrNull(results.length - blocked.length, results.length); |
| `src/assurance/packs/mcpSecurityResiliencePack.ts:302` | const attackSuccessRate = attackRatio === null ? null : round4(attackRatio); |
| `src/assurance/packs/mcpSecurityResiliencePack.ts:303` | const falsePositiveRate = ratioOrNull(falsePositives.length, results.length); |
| `src/assurance/packs/mcpSecurityResiliencePack.ts:304` | const performanceUnderAttack = results.length === 0 ? null |
| `src/assurance/packs/economicAmplificationPack.ts:62` | // Zero actual and expected calls mean no amplification; one is the multiplicative identity. |
| `src/assurance/indices.ts:188` | // The three metrics above are always constructed, so this denominator cannot be zero. |
| `src/score/mcpCompliance.ts:377` | safety.overall = Math.round(weightedMean([ |
| `src/score/mcpCompliance.ts:471` | // The fixed taxonomy contains twelve categories, independent of submitted observations. |
| `src/score/mcpCompliance.ts:474` | const attackSuccessRate = attackInstanceCount > 0 ? capabilities.mcpSecurityBenchAttackSuccessRate ?? null : null; |
| `src/score/mcpCompliance.ts:475` | const performanceUnderAttack = attackInstanceCount > 0 ? capabilities.mcpSecurityBenchPerformanceUnderAttack ?? null : null; |
| `src/score/mcpCompliance.ts:481` | ? Math.round(weightedMean([[netResilientPerformance.score0to100, 0.65], [attackTaxonomyCoverage * 100, 0.35]])!) : null; |
| `src/score/statisticalAnalysis.ts:207` | // One is the conservative degrees-of-freedom bound for degenerate variances, not a success ratio. |
| `src/compliance/regulatoryAutomation.ts:123` | complianceRisk: number \| null; |
| `src/compliance/regulatoryAutomation.ts:589` | const currentCoverage = ratioOrNull(coveredCount * 100, change.impactedControls.length); |
| `src/compliance/regulatoryAutomation.ts:649` | const currentAvg = ratioOrNull(dimScores.reduce((a, b) => a + b, 0), dimScores.length); |
| `src/compliance/regulatoryAutomation.ts:651` | const projectedAvg = ratioOrNull(projectedScores.reduce((a, b) => a + b, 0), projectedScores.length); |
| `src/compliance/regulatoryAutomation.ts:675` | complianceRisk: fleetScores.length === 0 ? null : Math.min(100, Math.round((affectedAgents / fleetScores.length) * 100)), |
| `src/diagnostic/autoAnswer/traceEvidenceMapper.ts:153` | toolSuccessRate: ratioOrNull(toolSuccesses.length, toolSpans.length), |
| `src/catalog/evidence/dimensions.ts:58` | const ratio = ratioOrNull(own.filter((row) => isObservedTier(row.trustTier)).length, own.length); |
| `src/product/fixGenerator.ts:142` | const coverage = ratioOrNull(fixes.length, gaps.length); |
| `src/redteam/jailbreak/runner.ts:152` | const jailbreakRate = ratioOrNull(totalJailbroken, totalTests); |
| `src/redteam/jailbreak/runner.ts:161` | rate: ratioOrNull(catJailbroken, catResults.length), |
| `src/redteam/jailbreak/runner.ts:174` | rate: ratioOrNull(sevJailbroken, sevResults.length), |
| `src/redteam/jailbreak/runner.ts:183` | const defendedRatio = ratioOrNull(totalDefended, totalTests); |
| `src/redteam/jailbreak/runner.ts:184` | const overallScore = defendedRatio === null ? null : Math.round(defendedRatio * 100); |
| `src/redteam/mcpAgentProvider.ts:1014` | // Every category accumulator is created and incremented together for an executed scenario. |
| `src/redteam/mcpAgentProvider.ts:1028` | const overallScore = |


## Supplementary current-source grep

This supplementary search covers reversed denominator clamps and defaults of 100. Configuration limits, fixed model scales, guarded denominators, and unchanged default-zero migration candidates are distinguished in the inventories above. It does not claim that every default-zero API was migrated.

```text
src/context/contextGraph.ts:146:  const total = Math.max(evidenceWindow.length, 1);
src/integrations/integrationDeliveryQueue.ts:427:  const limit = Math.max(1, Math.min(500, Math.floor(params.limit ?? 100)));
src/integrations/integrationDeliveryQueue.ts:510:  const limit = Math.max(1, Math.min(500, Math.floor(options?.limit ?? 100)));
src/integrations/integrationDeliveryQueue.ts:542:  const limit = Math.max(1, Math.min(500, Math.floor(params.limit ?? 100)));
src/integrations/integrationDeliveryStore.ts:295:  const bounded = Math.max(0, Math.floor(params.limit ?? 100));
src/ledger/ledger.ts:426:        confidence = Math.max(confidence, 1);
src/exports/oscal/oscalProfile.ts:71:    return { document: null, losses: [loss("profile", "requirements[]", Math.max(plan.requirements.length, 1), "omitted",
src/api/scoreRouter.ts:501:        level: Math.round(score / Math.max(result.layerScores?.length ?? 1, 1)),
src/llm/providers/deepseekAdapter.ts:142:        phase = Math.max(phase, 1);
src/studio/studioServer.ts:7991:        const count = Math.max(1, Number(url.searchParams.get("n") ?? "100") || 100);
src/studio/studioServer.ts:8068:        const count = Math.max(1, Number(url.searchParams.get("n") ?? "100") || 100);
src/product/rolloutManager.ts:137:  const pct = percentage ?? 100;
src/drift/continuousMonitor.ts:579:    maxTicks: params.maxTicks ?? 100,
src/product/reasoningCoach.ts:52:  const depth = clamp01((causalCount * 0.3 + connectorCount * 0.2) / Math.max(sentences, 1));
src/product/reasoningCoach.ts:65:  const evidence = clamp01((evidenceCount * 0.4 + quantCount * 0.3) / Math.max(sentences, 1));
src/product/determinism.ts:74:  const variance = unique / Math.max(results.length, 1);
src/shield/advancedThreats.ts:504:  const acceptanceRate = Number(((events.length - rejected) / Math.max(events.length, 1)).toFixed(4));
src/product/conversationSummarizer.ts:41:      score += (count / Math.max(tokens.length, 1)) * idf;
src/claims/claimConfidence.ts:577:      const maxCount = Math.max(...h.bins.map((b) => b.count), 1);
src/product/instructionFormatter.ts:115:  const perItemBudget = totalBudget ? Math.floor(totalBudget / Math.max(instructions.length, 1)) : undefined;
src/identity/scim/scimUsers.ts:81:  const limit = Math.max(1, Math.min(200, params.count || 100));
src/observability/anomalyDetector.ts:173:  const lookbackPoints = options.lookbackPoints ?? 100;
src/dogfood/maturityEvidence.ts:436:    meta.auditType = gate.mustInclude.auditTypes?.[ordinal % Math.max(gate.mustInclude.auditTypes.length, 1)] ?? "ALIGNMENT_CHECK_PASS";
src/dogfood/maturityEvidence.ts:439:    meta.metricKey = gate.mustInclude.metricKeys?.[ordinal % Math.max(gate.mustInclude.metricKeys.length, 1)] ?? "dogfood_metric";
src/lab/packs/advancedThreatsPack.ts:164:      Math.max(evaluated.length, 1)
src/mirofish/engine.ts:201:  const margin = 1.96 * (sd / Math.sqrt(Math.max(n, 1)));
src/sdk/frameworkAdapters.ts:319:    super({ framework: 'crewai', agentId, agentType: options?.agentType ?? 'crewai-agent', capturePayloads: options?.capturePayloads ?? false, enforceSafety: options?.enforceSafety ?? true, maxActions: options?.maxActions ?? 100, costBudgetUsd: options?.costBudgetUsd, metadata: options?.metadata }, callbacks);
src/sdk/frameworkAdapters.ts:381:    default: return new FrameworkAdapter({ framework, agentId, agentType: options?.agentType ?? 'custom', capturePayloads: options?.capturePayloads ?? false, enforceSafety: options?.enforceSafety ?? true, maxActions: options?.maxActions ?? 100, costBudgetUsd: options?.costBudgetUsd, metadata: options?.metadata }, callbacks);
src/adapters/hookForwarder.ts:146:  const retryDelayMs = input.retryDelayMs ?? 100;
src/adapters/hookForwarder.ts:265:  const retryDelayMs = input.retryDelayMs ?? 100;
src/score/outputAttestation.ts:211:    ? 0.5 * (attestation.shieldSummary.failed / Math.max(attestation.shieldSummary.totalPacks, 1))
src/agents/agentBase.ts:40:      maxActionsPerRun: config.maxActionsPerRun ?? 100,
src/enforce/safetyDSL.ts:252:      priority: options?.priority ?? 100,
src/diagnostic/runner.ts:1120:      questionScores.filter((score) => score.evidenceEventIds.length > 0).length / Math.max(activeQuestions.length, 1);
src/monitoring/driftDetection.ts:141:    const changeRate = 1 - overlap.length / Math.max(baselineHashes.size, 1);
src/fleet/cascadeSimulator.ts:753:        Math.max(report.layerScores.length, 1);
src/fleet/cascadeSimulator.ts:867:      avgPropagationDepth: allSteps.length / Math.max(allFaults.length / iterations, 1),
src/score/densityMap.ts:89:  const maxCount = Math.max(...records.map((r) => r.count), 1);
src/score/densityMap.ts:124:  const overallCoverage = coveredCells / Math.max(cells.length, 1);
src/score/diagnosticResponseScoring.ts:6:  const requiredWeight = 0.7 / Math.max(criteria.required.length, 1);
src/score/diagnosticResponseScoring.ts:7:  const bonusWeight = 0.3 / Math.max(criteria.bonus.length, 1);
src/score/scoreExplainer.ts:369:    Math.max(report.layerScores.length, 1);
src/diagnostic/levelSemantics.ts:202:    : rows.reduce((sum, row) => sum + row.finalLevel, 0) / Math.max(rows.length, 1);
src/score/forecastLegitimacy.ts:110:  const requiredWeight = 0.7 / Math.max(criteria.required.length, 1);
src/score/forecastLegitimacy.ts:111:  const bonusWeight = 0.3 / Math.max(criteria.bonus.length, 1);
src/score/architectureTaskAlignment.ts:186:    Math.max(architecture.layerCount, 1) * 1.25 +
src/score/architectureTaskAlignment.ts:188:      Math.max(architecture.agentCount, 1) * 0.65 +
src/score/architectureTaskAlignment.ts:730:    Math.round((Math.max(task.stepCount, 1) + Math.max(architecture.orchestrationDepth, 1)) / 3),
src/fleet/trustComposition.ts:279:      Math.max(report.layerScores.length, 1);
src/fleet/trustComposition.ts:554:    const total = Math.max(fromEvents.length, 1);
src/score/humanOversightQuality.ts:588:    Math.round((overallScore / 100) * Math.max(evidenceSignals, 1)),
src/score/humanOversightQuality.ts:589:    Math.max(evidenceSignals, 1)
src/score/metricValidity.ts:10424:  const unsupportedRate = clamp(params.unsupportedClaimCount / Math.max(sampleSize, 1), 0, 1);
src/fleet/report.ts:43:      const overall = report.layerScores.reduce((sum, layer) => sum + layer.avgFinalLevel, 0) / Math.max(report.layerScores.length, 1);
src/watch/realtimeAssurance.ts:477:      costBudgetUsd: config.costBudgetUsd ?? 100,
src/watch/realtimeAssurance.ts:483:      recentTraceWindow: config.recentTraceWindow ?? 100,
src/watch/realtimeAssurance.ts:592:    return this.results.slice(-(limit ?? 100));
src/watch/realtimeAssurance.ts:598:    return filtered.slice(-(limit ?? 100));
```

## Architecture and quality verification changes

Public declarations were extracted into `src/score/operationalIndependenceTypes.ts`, `src/score/predictiveValidityTypes.ts`, and `src/eval/judgeCalibrationStabilityTypes.ts`; the original modules re-export the same public types. This respects the existing descending line budgets without raising them. The new RAG metric-key alias remains private. Five pre-existing capability probe/diagnostic API findings and three existing duplicate boundaries were accepted individually through the repository quality CLI with AXE-27 reasons; six disappeared findings were removed through its shrink ratchet. No blanket rebaseline was used.

Graphify navigation was unavailable because this worktree has no `graphify-out/graph.json`; current source and callers were inspected directly.


## codex-runs/wp28c-compaction-report.md

# WP28C compaction lane report

Date: 2026-10-30. Worktree: `~/AgentMaturityCompass-worktrees/s442cd919/work/amc-gap-wp28c`.

Base and unchanged tip: `b1d722eb4e6aec2f86e9471164a7c70591c7c6ee`. No staging, commits, pushes, merges, dependency changes, other worktree edits, or AMC_OS writes were performed.

## Scope and status

- DXA-37 compaction consumer: selected immutable route metadata now supplies the default context window. Unknown, tampered, or mismatched metadata stays unknown. The same captured PinnedRoute drives compaction and every request, including after registry replacement.
- PXA-12 bounded partial: automatic compaction defaults on for a known selected context window, with a 16,384-token reserve when the effective window exceeds that reserve. Smaller windows retain the existing ratio trigger. Explicit reserves must fit the effective window.
- PXA-12 signed presets: optional strict compaction settings and exact provider/model overrides resolve each field independently. They use the existing BUNDLE async preparation, publication, signature verification, and trust paths. No keys or signing scheme were added.
- Reserve receipts retain v2 historical compatibility. Optional reserveTokens is replay-validated against the signed usage measurement and must be smaller than the context window. Legacy v2 receipts retain ratio validation.
- SDK and ACP preserve absent settings until route-aware resolution. Existing CLI help describes reviewed route defaults. CLI preset overrides use the final selected route and model.
- PXA-12 keepRecentTokens is deferred. Existing keepRecentSteps remains 2 by default. Provider usage measures whole prompts/output, not individual visible history entries; hidden reasoning and unmeasured tool results prevent an honest per-entry retention token count without further tokenizer work.
- PXA-15 is deferred. Long cache retention requires encoder-version, registration, and replay changes outside this bounded compaction slice.

## Files changed by this lane

`src/agent/compaction/promptPressure.ts`, `src/agent/compaction/autoCompact.ts`, compaction settings in `src/agent/loopTypes.ts`, compaction construction in `src/agent/agentDriver.ts`, `src/session/surfaceCompactionValidation.ts`, compaction schema in `src/presets/agentPresets.ts`, compaction-only settings/help in `src/cli-agent-options.ts`, `src/cli-agent-commands.ts`, `src/acp/acpCli.ts`, `src/acp/acpStdioMain.ts`, `src/agent/agentSession.ts`, and the strict default-compaction shape in `src/a4/adaptMemoryPolicy.ts`.

Tests: `tests/compactionDefaults.test.ts`, `tests/autoCompaction.test.ts`, `tests/agentPresets.test.ts`. Root owns the package changeset and combined validation.

## RED and GREEN evidence

- Root ran the initial three-file RED before compaction implementation: 14 failed and 46 passed, 60 tests. Root artifact: `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-red.log`.
- First source run: 60 passed and 1 failed. The sole failure was the existing nested cold CLI verification using stale dist. No build was run by this lane. Root must rerun the complete files after its combined build.
- HMR RED: 1 failed and 34 skipped; expected one compaction, observed none after registry replacement. `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-hmr-red.log`.
- HMR GREEN after binding the captured pin to requests: 1 passed and 34 skipped. `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-hmr-green.log`.
- Pure defaults plus signed presets GREEN before final additional edge cases: 34 passed. `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-pure-green.log`.
- Undefined inheritance RED: 1 failed and 18 skipped. Context became null and the inherited reserve became null. Fixed by filtering undefined independently at each merge layer. `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-undefined-red.log`.
- Small-window RED: 5 failed and 19 passed. `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-small-window-red.log`. Small-window GREEN: all tests passed after default/explicit reserve bounds.
- Final restored source pure suite: 26/26 passed. `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-restored-green.log`.
- One HMR invocation accidentally used the shell default Node 25 and failed with native module ABI 141 versus 127. It was rerun under Node 22 for the real behavioral RED. No native dependency was rebuilt or changed.

All qualified runs used Node 22 and `npx vitest run <files> --maxWorkers=2 --configLoader runner --no-cache`. The final expected combined files total 78 tests: compactionDefaults 26, autoCompaction 35, agentPresets 17.

## Mutation evidence

24/24 mutations were killed by test failures. Each source file was restored in a finally block, and the final pure suite passed after restoration. No compaction mutation or test process remains running.

Machine-readable results: `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-results.json`, `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-small-mutation-results.json`, and `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-cli-mutation-results.json`.

| Mutation | Result | Log |
| --- | --- | --- |
| metadata-provider | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-metadata-provider.log` |
| metadata-model | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-metadata-model.log` |
| override-provider | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-override-provider.log` |
| override-model | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-override-model.log` |
| reserve-integer | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-reserve-integer.log` |
| reserve-nonnegative | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-reserve-nonnegative.log` |
| override-provider-nonempty | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-override-provider-nonempty.log` |
| override-model-nonempty | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-override-model-nonempty.log` |
| strict-fields | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-strict-fields.log` |
| duplicate-overrides | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-duplicate-overrides.log` |
| undefined-base | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-undefined-base.log` |
| undefined-override | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-undefined-override.log` |
| explicit-threshold | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-explicit-threshold.log` |
| cli-threshold | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-cli-threshold.log` |
| receipt-reserve-bounds | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-receipt-reserve-bounds.log` |
| replay-reserve-boundary | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-replay-reserve-boundary.log` |
| compaction-reserve-boundary | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-compaction-reserve-boundary.log` |
| selected-pin-retention | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-selected-pin-retention.log` |
| small-window-default | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-small-window-default.log` |
| effective-window-default | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-effective-window-default.log` |
| reserve-fits-window | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-reserve-fits-window.log` |
| override-reserve-fits-window | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-override-reserve-fits-window.log` |
| receipt-reserve-fits-window | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-receipt-reserve-fits-window.log` |
| cli-partial-fields | killed, exit 1 | `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-cli-partial.log` |

## Remaining validation and limits

Root must run the combined build, typecheck, typecheck:tests, lint, complete affected test files, and repository verification. This lane ran no builds or full repository checks. `git diff --check` passed. Root coordinates cross-lane validation and the final package evidence; source presence and synthetic mechanism tests do not establish live provider qualification.

Source is stable and restored. The final window-only CLI adjustment returns validated partial explicit fields, so the selected reviewed catalog reserve can inherit independently. Its regression failed before the change; the focused new and existing CLI tests then passed (2/2), and the final complete pure defaults suite passed (26/26). Restoring eager full defaults was mutation-killed. Logs: `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-cli-partial-red.log`, `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-cli-partial-green.log`, and `~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp28c-compaction-mutation-cli-partial.log`. The existing exact-default assertion was updated because eager default filling encoded the inheritance defect.

All referenced compaction RED/GREEN logs, mutation logs, machine-readable results, and mutation scripts were copied into this codex-runs directory. Source files were not changed during artifact collection.


## codex-runs/wp34b-verification-report.md

# WP34 part B report

**Verification completed: the required command exited 1, not 0.** Build and every listed check except dead-code passed. The new dead-code finding needs ownership-coordinated baseline acceptance; source and generated changes remain uncommitted. The completed result is preserved in `wp34b-verify-final.log` and `wp34b-verify-final.exit`.

## Tip and deliverables

- Worktree: `~/AgentMaturityCompass-worktrees/s442cd919/work/amc-gap-wp34b`
- Branch: `rtd/gap-wp34b`
- Tip/base: `da6fb143a2e32d320f881eeb2f867963b37fe9dd`
- Source and generated changes remain uncommitted. No push or merge occurred.
- Commit message: `wp34b-commit-message.txt`, ending with the requested Codex trailer.
- Changeset: `.changeset/gap-wp34b-edit-shell-parity.md`.
- No package/lockfile, research file, other worktree, or ownership-sensitive composition file was edited. Generated documentation/site changes from the verifier are retained.

## Per-row status

| Row | Status | Result |
| --- | --- | --- |
| DXB-15 | Already fixed on base | Regular-file admission and streamed presentation retained; bounds tests pass. |
| DXC-01 | Fixed arguments/execution; deferred presentation | Added contained workdir, description bounded to 200 characters, and explicit background rejection. Receipt/question description propagation requires the owner follow-up below. |
| DXC-07 | Already fixed on base | Numbered offset/limit reads and whole-file observations retained. |
| DXC-09 | Already fixed on base | Literal replaceAll and replacement counts retained. |
| DXC-10 | Already fixed on base (intentional) | Mapping calls for one native editing dialect, not a second editor tool. |
| DXC-11 | Fixed | Scoped glob/grep paths, workspace-relative output, ancestor ignore inheritance. Case-insensitivity was already present. |
| DXC-12 | Already fixed on base | Worker regex deadlines and cancellation retained. |
| DXC-28 | Fixed | ToolHub pipeline fs.read/fs.write delegate to native fsTools with one composition observation ledger. No tracked files deleted. |
| PXA-03 | Already fixed on base | Command output head/tail retention retained. |
| PXA-04 | Already fixed on base | Signed, session-scoped spill retrieval retained. |
| PXA-05 | Already fixed on base | UTF-8-safe numbered line ranges retained. |
| PXA-06 | Already fixed on base | Multi-edit, all-or-nothing planning, and returned diffs retained. |
| PXA-08 | Already fixed on base | Bounded regex worker execution retained. |
| PXA-09 | Already fixed on base; scoped behavior preserved | Root/nested ignore rules and includeIgnored retained; scoped searches inherit ancestors. |

Additional dossier work binds file-write authorization to the exact planning snapshot, checks observations after staging and before every rename attempt, and uses destination `wx` for new files. A competing creation is preserved. Failed exclusive creation removes only the inode opened by this call. Changed tool results set `ok` explicitly.

## Tests

**249 unique passing cases across 16 attempted files; 17 unresolved host-dependent cases.** The full suite was not run. Thirty-eight cases were added across seven test files: write races 9, atomic writes 3, bash 13, native binding 3, search 7, delegation 2, schema pin 1.

| Files | Result | Log |
| --- | --- | --- |
| fsToolsLiteralEdit, fsToolsParity, fsToolsReadBeforeEdit, fsToolsFreeze, fsToolsWriteRaces, atomicWrite, nativePinnedToolSchemas | 101 passed | `wp34b-file-schema-green.log` |
| bashTool, nativeSandboxPolicyBinding | 49 passed | `wp34b-bash-final-green.log` |
| studioNativeTaskPolicyPin, nativeValidation, wp36SecretsOutOfChildren, toolhubPipelineTools excluding already-attempted HTTP groups | 42 passed; 8 filtered after their full-file permission failures | `wp34b-integration-green.log` |
| searchTools | 40 passed before and after mutations | `wp34b-search-green-before-mutations.log`, `wp34b-search-green-after-mutations.log` |
| fsToolsBounds | 17 passed | `wp34b-bounds-containment.log` |
| containment/escapeSuite | 9 failed at Seatbelt launch or loopback listener permissions | `wp34b-bounds-containment.log` |

The eight HTTP fixtures timed out at 30,000 ms in the initial full-file attempt, which also recorded eight `listen EPERM: operation not permitted 127.0.0.1` errors. Their later skips are not passes. The real containment failures do not qualify OS enforcement; their owned fixtures remain at the paths recorded in the log.

## Red/green and mutations

The initial six-file red run recorded 29 expected regression failures plus eight HTTP fixture failures. A direct worker-root test later failed against the base dist. See `wp34b-red.log` and `wp34b-walker-red.log`.

All **20 guard mutants** were caught by intended assertion failures and restored: file writes 8, bash/native 7, search 5. Search mutants changed compiled JS only; declarations/source were unchanged and compiled bytes were restored. Evidence: `wp34b-write-mutations.json`, `wp34b-bash-mutation-*.log`, `wp34b-search-mutation-summary.json`.

Schema review used the pinned test's sorted canonical-schema SHA-256 process. Existing fs/spill pins remain unchanged. The new bash/search pin is `f82eccbf1763c16bcf3652d24f7950cddef0043fa66ab9ea395903104784168c`. Evidence: `wp34b-schema-review-red.log` and the passing pinned-schema suite.

## Checks

The initial build passed under Node `v22.23.3`. `git diff --check` passed. The interrupted verifier rebuilt source and passed main typechecking before the session failure; it has no final exit result and is not counted as a completed verifier run.

The fresh required command is:

```sh
bash ~/AgentMaturityCompass-worktrees/s442cd919/work/verify-wt.sh ~/AgentMaturityCompass-worktrees/s442cd919/work/amc-gap-wp34b da6fb143a
```

Final exit: **1 (not 0)**. Build, typecheck, typecheck:tests, lint, counts, docs drift, citations, architecture boundaries, threat model, API reference, schemas, gates, duplicates and freeze passed. Dead-code alone failed.

Exact tail of the completed command:

```text
check:gates ok
check:dead-code FAILED
{"scan":"dead-code","baseline":2566,"current":2622,"new":1,"stale":0,"accepted":55}
new dead-code finding da227b0d1a0da452f592968de413b9a9f0e0297fe9a4dacfe228d6f6ec7aaf9a: src/toolhub/toolhubValidators.ts exports {"name":"resolveToolPath","namespace":"tools"}
Fix each new finding, or accept one: npm run quality:baseline -- dead-code --accept <id> --reason "<why, 20+ characters>"
No source-quality baseline at origin/main (merge-base 5ea5e866a42a): one-time bootstrap, base check skipped
check:duplicates ok
freeze ok
```

The new finding is `da227b0d1a0da452f592968de413b9a9f0e0297fe9a4dacfe228d6f6ec7aaf9a`: `src/toolhub/toolhubValidators.ts` exports `resolveToolPath` in namespace `tools`. Native fs delegation removed its last production caller. The compatibility export remains; no deletion was performed.

`codex-ownership.md` reserves `scripts/quality/source-quality-baseline.json` for the AXE-30 integration follow-up. The instruction says not to edit another lane's files and to describe a needed change in the report. No baseline acceptance was applied by this lane. After coordination, the integrator can review this acceptance command in the integration worktree:

```sh
npm run quality:baseline -- dead-code --accept da227b0d1a0da452f592968de413b9a9f0e0297fe9a4dacfe228d6f6ec7aaf9a --reason "Retain the legacy resolveToolPath compatibility export after native filesystem delegation; no tracked files removed."
```

The required verifier must be rerun after that owner action before claiming a passing package check. Git index writes were denied as expected; the staging/amend path produced no commit.

## Remaining work and deviations

- The dead-code baseline finding above remains unaccepted because of the AXE-30 ownership boundary. The required verifier is not green.

- DXC-01 description propagation is deferred: `src/agent/agentToolset.ts:375` and `:397` omit it from confinement receipts; `src/actions/authorize.ts:156` omits it from approval questions. Ownership-sensitive files remain untouched.
- Re-run the eight HTTP fixtures and nine real containment cases on an admitted host. No confinement guard or test assertion was weakened to manufacture a pass.
- Synchronous bodies serialize within one JavaScript thread. An uncooperative external writer can still race the final check and rename; this is not general digest-CAS. Moving a parent can strand a staged temp file.
- Vitest's default config bundler was refused when it tried writing through shared node_modules. Accepted runs used `--configLoader runner --maxWorkers=2`; dependencies were not installed or edited.
- A discarded shell mutation attempt used Node 25 after a nested login-shell PATH reset. It was rerun under Node `v22.23.3`; only Node 22 results are counted.
- No new CLI command, Studio route, or freeze exception was added. No existing behavior assertion was relaxed to hide a defect.
- No graph exists in the assigned worktree. Current source/callers were inspected directly; no graph refresh, watcher, or server was started.

Claude must review the uncommitted diff and final verifier evidence, coordinate baseline acceptance and the presentation follow-up, rerun the required verifier and host-dependent checks, and commit using the prepared message. This lane never commits, pushes, or merges.


## codex-runs/wp35d-report.md

**AXR-22 fixed in source; uncommitted handoff ready.**

- **Tip:** `1af19c87fa56eb77e269723e8f073cb05b6b9697`, branch `rtd/gap-wp35d`. No commit, push or merge.
- Extracted policy helpers first; `hookControl.ts` is now **785 lines**. Claude/Gemini asks use the native signed approval engine. Exact-call grants are consumed before allowing execution; refusal, expiry, replay and engine failure deny.
- **Tests:** 22 cases added. Final focused run: **47 passed, 2 excluded** across hookControl, governedCallParity, compound-command blast-radius and approvalConsumeRace tests. [Green log](/private/tmp/wp35d-final-targeted.log).
- Earlier [35-file run](/private/tmp/wp35d-test-files.txt): **256 passed, 107 failed, 60 skipped**. Failures comprised 50 loopback-related failures, 55 process-inspection failures and two expectations subsequently corrected and passing. Three suite setup errors also arose from sandbox restrictions. [Full log](/private/tmp/wp35d-existing-tests.log).
- **Red/green:** two initial regression failures; final focused run green. **18/18 mutations killed**, with source hashes unchanged.
- **Checks:** the required `verify-wt.sh` command against **`1af19c87f` exited 0**. Build, both typechecks, lint and every repository check passed. Git staging failed as expected under the metadata restriction. Output tail:

```text
check:architecture-boundaries ok
check:threat-model ok
check:api-ref ok
check:schemas ok
check:gates ok
check:dead-code ok
check:duplicates ok
freeze ok
```

- **Deviations/limits:** the hook test fixture stubs only its own PID’s process inspection; blocked integration suites still need an unsandboxed rerun. Generated docs and four generator-recorded quality exceptions are included. WP35c and research remain untouched.
- **Remaining:** Claude reviews, reruns blocked suites, commits and merges. [Commit message with required trailer](~/AgentMaturityCompass-worktrees/s442cd919/work/codex-runs/wp35d-commit-message.txt).



<!-- thread 01a18a53-869f-7c93-a16a-44cb3dbd30db, turn status completed -->


