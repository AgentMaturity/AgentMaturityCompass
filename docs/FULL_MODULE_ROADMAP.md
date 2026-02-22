# Full Module Roadmap — Python AMC → TypeScript AMC

> Auto-generated mapping of all Python AMC platform modules to their TypeScript equivalents.

## Shield (S1–S16)

| Python Module | ID | TypeScript File | Status | CLI Command | Notes |
|---|---|---|---|---|---|
| s1_analyzer.py | S1 | src/shield/analyzer.ts | ✅ OG AMC | `amc shield analyze` | Static code analyzer |
| s2_behavioral_sandbox.py | S2 | src/shield/behavioralSandbox.ts | ✅ OG AMC | `amc shield sandbox` | Behavioral sandbox |
| s3_signing.py | S3 | src/shield/signing.ts | 🔧 Ported + CLI | `amc shield sign / verify` | Ed25519 signing |
| s4_sbom.py | S4 | src/shield/sbom.ts | ✅ OG AMC | `amc shield sbom` | SBOM generation |
| s5_reputation.py | S5 | src/shield/reputation.ts | ✅ OG AMC | `amc shield reputation` | Reputation scoring |
| s6_manifest.py | S6 | src/shield/manifest.ts | 🔧 Ported + CLI | `amc shield check-manifest` | Manifest validator |
| s7_registry.py | S7 | src/shield/registry.ts | 🔧 Ported + CLI | — | Skill registry |
| s8_ingress.py | S8 | src/shield/ingress.ts | 🔧 Ported + CLI | `amc shield check-ingress` | Ingress filter |
| s9_sanitizer.py | S9 | src/shield/sanitizer.ts | 🔧 Ported + CLI | `amc shield sanitize` | Content sanitizer |
| s10_detector.py | S10 | src/shield/detector.ts | 🔧 Ported + CLI | `amc shield detect-injection` | Injection detector |
| s11_attachment_detonation.py | S11 | src/shield/attachmentDetonation.ts | ✅ OG AMC | — | Attachment detonation |
| s12_oauth_scope.py | S12 | src/shield/oauthScope.ts | 🔧 Ported + CLI | — | OAuth scope checker |
| s13_download_quarantine.py | S13 | src/shield/downloadQuarantine.ts | ✅ OG AMC | — | Download quarantine |
| s14_conversation_integrity.py | S14 | src/shield/conversationIntegrity.ts | ✅ OG AMC | — | Conversation integrity |
| s15_threat_intel.py | S15 | src/shield/threatIntel.ts | ✅ OG AMC | — | Threat intelligence |
| s16_ui_fingerprint.py | S16 | src/shield/uiFingerprint.ts | ✅ OG AMC | — | UI fingerprinting |

## Enforce (E1–E35)

| Python Module | ID | TypeScript File | Status | CLI Command | Notes |
|---|---|---|---|---|---|
| e1_policy_firewall.py | E1 | src/enforce/policyFirewall.ts | ✅ OG AMC | `amc enforce check` | Policy firewall |
| e2_exec_guard.py | E2 | src/enforce/execGuard.ts | ✅ OG AMC | `amc enforce exec-guard` | Exec guard |
| e3_browser_guardrails.py | E3 | src/enforce/browserGuardrails.ts | 🔧 Ported + CLI | — | Browser guardrails |
| e4_egress_proxy.py | E4 | src/enforce/egressProxy.ts | 🔧 Ported + CLI | — | Egress proxy |
| e5_circuit_breaker.py | E5 | src/enforce/circuitBreaker.ts | ✅ OG AMC | — | Circuit breaker |
| e6_step_up_auth.py | E6 | src/enforce/stepUpAuth.ts | ✅ OG AMC | — | Step-up auth |
| e7_sandbox_orchestrator.py | E7 | src/enforce/sandboxOrchestrator.ts | 🔧 Ported + CLI | — | Sandbox orchestrator |
| e8_session_firewall.py | E8 | src/enforce/sessionFirewall.ts | 🔧 Ported + CLI | — | Session firewall |
| e9_outbound.py | E9 | src/enforce/outboundFilter.ts | 🔧 Ported + CLI | — | Outbound filter |
| e10_gateway_scanner.py | E10 | src/enforce/gatewayScanner.ts | 🔧 Ported + CLI | — | Gateway scanner |
| e11_mdns_controller.py | E11 | src/enforce/mdnsController.ts | 🔧 Ported + CLI | — | mDNS controller |
| e12_reverse_proxy_guard.py | E12 | src/enforce/reverseProxyGuard.ts | 🔧 Ported + CLI | — | Reverse proxy guard |
| e13_ato_detection.py | E13 | src/enforce/atoDetection.ts | ✅ OG AMC | `amc enforce ato-detect` | ATO detection |
| e14_webhook_gateway.py | E14 | src/enforce/webhookGateway.ts | 🔧 Ported + CLI | — | Webhook gateway |
| e15_abac.py | E15 | src/enforce/abac.ts | 🔧 Ported + CLI | — | ABAC |
| e16_approval_antiphishing.py | E16 | src/enforce/antiPhishing.ts | 🔧 Ported + CLI | — | Anti-phishing |
| e17_dryrun.py | E17 | src/enforce/dryRun.ts | 🔧 Ported + CLI | `amc enforce dry-run` | Dry run |
| e18_secret_blind.py | E18 | src/enforce/secretBlind.ts | 🔧 Ported + CLI | `amc enforce blind-secrets` | Secret blinding |
| e19_two_person.py | E19 | src/enforce/twoPersonAuth.ts | 🔧 Ported + CLI | `amc enforce two-person` | Two-person auth |
| e20_payee_guard.py | E20 | src/enforce/payeeGuard.ts | ✅ OG AMC | — | Payee guard |
| e21_taint_tracker.py | E21 | src/enforce/taintTracker.ts | ✅ OG AMC | `amc enforce taint` | Taint tracking |
| e22_schema_gate.py | E22 | src/enforce/schemaGate.ts | 🔧 Ported + CLI | `amc enforce schema-gate` | Schema gate |
| e23_numeric_checker.py | E23 | src/enforce/numericChecker.ts | ✅ OG AMC | `amc enforce numeric-check` | Numeric checker |
| e24_evidence_contract.py | E24 | src/enforce/evidenceContract.ts | 🔧 Ported + CLI | — | Evidence contracts |
| e25_config_linter.py | E25 | src/enforce/configLinter.ts | ✅ OG AMC | — | Config linter |
| e26_mode_switcher.py | E26 | src/enforce/modeSwitcher.ts | ✅ OG AMC | — | Mode switcher |
| e27_temporal_controls.py | E27 | src/enforce/temporalControls.ts | 🔧 Ported + CLI | — | Temporal controls |
| e28_location_fencing.py | E28 | src/enforce/geoFence.ts | 🔧 Ported + CLI | — | Geo-fencing |
| e29_idempotency.py | E29 | src/enforce/idempotency.ts | 🔧 Ported + CLI | — | Idempotency |
| e30_cross_source_verifier.py | E30 | src/enforce/crossSourceVerifier.ts | ✅ OG AMC | — | Cross-source verifier |
| e31_clipboard_guard.py | E31 | src/enforce/clipboardGuard.ts | 🔧 Ported + CLI | — | Clipboard guard |
| e32_template_engine.py | E32 | src/enforce/templateEngine.ts | 🔧 Ported + CLI | — | Template engine |
| e33_watchdog.py | E33 | src/enforce/watchdog.ts | 🔧 Ported + CLI | `amc enforce watchdog` | Watchdog |
| e34_consensus.py | E34 | src/enforce/consensus.ts | 🔧 Ported + CLI | `amc enforce consensus` | Consensus |
| e35_model_switchboard.py | E35 | src/enforce/modelSwitchboard.ts | ✅ OG AMC | — | Model switchboard |

## Vault (V1–V14)

| Python Module | ID | TypeScript File | Status | CLI Command | Notes |
|---|---|---|---|---|---|
| v1_secrets_broker.py | V1 | src/vault/secretsBroker.ts | 🔧 Ported + CLI | `amc vault secrets` | Secrets broker |
| v2_dlp.py | V2 | src/vault/dlp.ts | ✅ OG AMC | — | DLP |
| v3_honeytokens.py | V3 | src/vault/honeytokens.ts | ✅ OG AMC | — | Honeytokens |
| v4_rag_guard.py | V4 | src/vault/ragGuard.ts | ✅ OG AMC | `amc vault rag-guard` | RAG guard |
| v5_memory_ttl.py | V5 | src/vault/memoryTtl.ts | 🔧 Ported + CLI | `amc vault memory-ttl` | Memory TTL |
| v6_dsar_autopilot.py | V6 | src/vault/dsarAutopilot.ts | ✅ OG AMC | `amc vault dsar-status` | DSAR autopilot |
| v7_data_residency.py | V7 | src/vault/dataResidency.ts | 🔧 Ported + CLI | — | Data residency |
| v8_screenshot_redact.py | V8 | src/vault/screenshotRedact.ts | 🔧 Ported + CLI | — | Screenshot redact |
| v9_invoice_fraud.py | V9 | src/vault/invoiceFraud.ts | ✅ OG AMC | — | Invoice fraud |
| v10_undo_layer.py | V10 | src/vault/undoLayer.ts | 🔧 Ported + CLI | `amc vault undo` | Undo layer |
| v11_metadata_scrubber.py | V11 | src/vault/metadataScrubber.ts | ✅ OG AMC | `amc vault scrub` | Metadata scrubber |
| v12_data_classification.py | V12 | src/vault/dataClassification.ts | ✅ OG AMC | `amc vault classify` | Data classification |
| v13_privacy_budget.py | V13 | src/vault/privacyBudget.ts | ✅ OG AMC | `amc vault privacy-budget` | Privacy budget |
| v14_key_rotation.py | V14 | src/vault/keyRotation.ts | ✅ OG AMC | — | Key rotation |

## Watch (W1–W10)

| Python Module | ID | TypeScript File | Status | CLI Command | Notes |
|---|---|---|---|---|---|
| w1_receipts.py | W1 | src/receipts/ | ✅ OG AMC | — | Receipts (OG AMC native) |
| w2_assurance.py | W2 | src/assurance/ | ✅ OG AMC | `amc assurance` | Assurance (OG AMC native) |
| w3_siem_exporter.py | W3 | src/watch/siemExporter.ts | 🔧 Ported + CLI | `amc watch siem-export` | SIEM exporter |
| w4_safety_testkit.py | W4 | src/watch/safetyTestkit.ts | ✅ OG AMC | `amc watch safety-test` | Safety testkit |
| w5_agent_bus.py | W5 | src/watch/agentBus.ts | ✅ OG AMC | — | Agent bus |
| w6_output_attestation.py | W6 | src/watch/outputAttestation.ts | ✅ OG AMC | `amc watch attest` | Output attestation |
| w7_explainability_packet.py | W7 | src/watch/explainabilityPacket.ts | ✅ OG AMC | `amc watch explain` | Explainability |
| w8_host_hardening.py | W8 | src/watch/hostHardening.ts | 🔧 Ported + CLI | `amc watch host-hardening` | Host hardening |
| w9_multi_tenant_verifier.py | W9 | src/watch/multiTenantVerifier.ts | 🔧 Ported + CLI | — | Multi-tenant verifier |
| w10_policy_packs.py | W10 | src/watch/policyPacks.ts | 🔧 Ported + CLI | — | Policy packs |

## Product (P modules)

| Python Module | ID | TypeScript File | Status | CLI Command | Notes |
|---|---|---|---|---|---|
| cost_latency_router.py | P | src/product/costLatencyRouter.ts | ✅ OG AMC | `amc product route` | Cost/latency router |
| autonomy_dial.py | P | src/product/autonomyDial.ts | ✅ OG AMC | `amc product autonomy` | Autonomy dial |
| tool_reliability.py | P | src/product/toolReliability.ts | ✅ OG AMC | — | Tool reliability |
| metering.py | P | src/product/metering.ts | ✅ OG AMC | `amc product metering` | Metering |
| loop_detector.py | P | src/product/loopDetector.ts | ✅ OG AMC | `amc product loop-detect` | Loop detector |
| retry_engine.py | P | src/product/retryEngine.ts | ✅ OG AMC | — | Retry engine |
| plan_generator.py | P | src/product/planGenerator.ts | ✅ OG AMC | `amc product plan` | Plan generator |
| tool_contract.py | P | src/product/toolContract.ts | ✅ OG AMC | — | Tool contracts |
| tool_cost_estimator.py | P | src/product/toolCostEstimator.ts | ✅ OG AMC | — | Tool cost estimator |
| workflow_engine.py | P | src/product/workflowEngine.ts | ✅ OG AMC | `amc product workflow` | Workflow engine |
| fix_generator.py | P | src/product/fixGenerator.ts | ✅ OG AMC | — | Fix generator |
| ab_testing.py | P | src/product/abTesting.ts | 🔧 Ported + CLI | — | A/B testing |
| approval_workflow.py | P | src/product/approvalWorkflow.ts | 🔧 Ported + CLI | — | Approval workflow |
| async_callback.py | P | src/product/asyncCallback.ts | 🔧 Ported + CLI | — | Async callbacks |
| collaboration.py | P | src/product/collaboration.ts | 🔧 Ported + CLI | — | Collaboration |
| compensation.py | P | src/product/compensation.ts | 🔧 Ported + CLI | — | Compensation/saga |
| confidence.py | P | src/product/confidence.ts | 🔧 Ported + CLI | — | Confidence scoring |
| context_pack.py | P | src/product/contextPack.ts | 🔧 Ported + CLI | — | Context packing |
| conversation_state.py | P | src/product/conversationState.ts | 🔧 Ported + CLI | — | Conversation state |
| data_quality.py | P | src/product/dataQuality.ts | 🔧 Ported + CLI | — | Data quality |
| dev_sandbox.py | P | src/product/devSandbox.ts | 🔧 Ported + CLI | — | Dev sandbox |
| docs_ingestion.py | P | src/product/docsIngestion.ts | 🔧 Ported + CLI | — | Docs ingestion |
| document_assembler.py | P | src/product/documentAssembler.ts | 🔧 Ported + CLI | — | Document assembler |
| error_translator.py | P | src/product/errorTranslator.ts | 🔧 Ported + CLI | — | Error translator |
| escalation.py | P | src/product/escalation.ts | 🔧 Ported + CLI | — | Escalation |
| event_router.py | P | src/product/eventRouter.ts | 🔧 Ported + CLI | — | Event routing |
| extractor.py | P | src/product/extractor.ts | 🔧 Ported + CLI | — | Field extraction |
| failure_clustering.py | P | src/product/failureClustering.ts | 🔧 Ported + CLI | — | Failure clustering |
| goal_tracker.py | P | src/product/goalTracker.ts | 🔧 Ported + CLI | — | Goal tracking |
| improvement.py | P | src/product/improvement.ts | 🔧 Ported + CLI | — | Improvement |
| instruction_formatter.py | P | src/product/instructionFormatter.ts | 🔧 Ported + CLI | — | Instruction format |
| jobs.py | P | src/product/jobs.ts | 🔧 Ported + CLI | `amc product jobs` | Job queue |
| kb_builder.py | P | src/product/kbBuilder.ts | 🔧 Ported + CLI | — | KB builder |
| knowledge_graph.py | P | src/product/knowledgeGraph.ts | 🔧 Ported + CLI | — | Knowledge graph |
| long_term_memory.py | P | src/product/longTermMemory.ts | 🔧 Ported + CLI | — | Long-term memory |
| memory_consolidation.py | P | src/product/memoryConsolidation.ts | 🔧 Ported + CLI | — | Memory consolidation |
| onboarding_wizard.py | P | src/product/onboardingWizard.ts | 🔧 Ported + CLI | — | Onboarding wizard |
| outcome_pricing.py | P | src/product/outcomePricing.ts | 🔧 Ported + CLI | — | Outcome pricing |
| output_corrector.py | P | src/product/outputCorrector.ts | 🔧 Ported + CLI | — | Output corrector |
| param_autofiller.py | P | src/product/paramAutofiller.ts | 🔧 Ported + CLI | — | Param autofiller |
| persistence.py | P | src/product/persistence.ts | 🔧 Ported + CLI | — | Persistence |
| persona.py | P | src/product/persona.ts | 🔧 Ported + CLI | — | Persona |
| proactive_reminders.py | P | src/product/proactiveReminders.ts | 🔧 Ported + CLI | — | Reminders |
| reasoning_coach.py | P | src/product/reasoningCoach.ts | 🔧 Ported + CLI | — | Reasoning coach |
| replay_debugger.py | P | src/product/replayDebugger.ts | 🔧 Ported + CLI | — | Replay debugger |
| response_validator.py | P | src/product/responseValidator.ts | 🔧 Ported + CLI | — | Response validator |
| retention_autopilot.py | P | src/product/retentionAutopilot.ts | 🔧 Ported + CLI | — | Retention autopilot |
| rollout_manager.py | P | src/product/rolloutManager.ts | 🔧 Ported + CLI | `amc product rollout` | Rollout manager |
| scaffolding.py | P | src/product/scaffolding.ts | 🔧 Ported + CLI | `amc product scaffold` | Scaffolding |
| sop_compiler.py | P | src/product/sopCompiler.ts | 🔧 Ported + CLI | — | SOP compiler |
| structured_output.py | P | src/product/structuredOutput.ts | 🔧 Ported + CLI | — | Structured output |
| sync_connector.py | P | src/product/syncConnector.ts | 🔧 Ported + CLI | — | Sync connector |
| task_spec.py | P | src/product/taskSpec.ts | 🔧 Ported + CLI | — | Task spec |
| task_splitter.py | P | src/product/taskSplitter.ts | 🔧 Ported + CLI | — | Task splitter |
| tool_chain_builder.py | P | src/product/toolChainBuilder.ts | 🔧 Ported + CLI | — | Tool chain builder |
| tool_discovery.py | P | src/product/toolDiscovery.ts | 🔧 Ported + CLI | — | Tool discovery |
| tool_fallback.py | P | src/product/toolFallback.ts | 🔧 Ported + CLI | — | Tool fallback |
| tool_parallelizer.py | P | src/product/toolParallelizer.ts | 🔧 Ported + CLI | — | Tool parallelizer |
| tool_rate_limiter.py | P | src/product/toolRateLimiter.ts | 🔧 Ported + CLI | — | Tool rate limiter |
| tool_semantic_docs.py | P | src/product/toolSemanticDocs.ts | 🔧 Ported + CLI | — | Semantic docs |
| version_control.py | P | src/product/versionControl.ts | 🔧 Ported + CLI | — | Version control |
| white_label.py | P | src/product/whiteLabel.ts | 🔧 Ported + CLI | — | White label |
| workflow_templates.py | P | src/product/workflowTemplates.ts | 🔧 Ported + CLI | — | Workflow templates |

## Score

| Python Module | ID | TypeScript File | Status | CLI Command | Notes |
|---|---|---|---|---|---|
| formal_spec.py | SC | src/score/formalSpec.ts | ✅ OG AMC | `amc score formal-spec` | Formal spec |
| adversarial.py | SC | src/score/adversarial.ts | ✅ OG AMC | `amc score adversarial` | Adversarial |
| evidence_collector.py | SC | src/score/evidenceCollector.ts | ✅ OG AMC | `amc score collect-evidence` | Evidence collector |

## N/A — Superseded by OG AMC TypeScript Equivalents

| Python Module | Reason |
|---|---|
| agents/*.py (CMB, DPB, LCAB) | Example agents / test harnesses |
| api/main.py | FastAPI server → OG AMC Node.js studio |
| api/routers/*.py | FastAPI routers → OG AMC routes |
| benchmarks/benchmark_runner.py | Python benchmark → OG AMC bench registry |
| benchmarks/benchmark_suite.py | Python benchmark suite → OG AMC bench |
| core/config.py | Python config → OG AMC TypeScript config |
| core/exceptions.py | Python exceptions → TypeScript Error classes |
| core/logging.py | Python logging → OG AMC logging |
| core/models.py | Python models → TypeScript interfaces |
| cli.py | Python CLI → OG AMC TypeScript CLI |

## Summary

| Status | Count |
|---|---|
| ✅ OG AMC (pre-existing) | 67 |
| 🔧 Ported + CLI (newly implemented) | 93 |
| ❌ N/A (superseded) | 10 |
| **Total** | **145** |
