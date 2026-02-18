# AMC Expert Stress Test Report
**Generated:** 2026-02-18 21:58:02 UTC  |  **Elapsed:** 6.6s

## Verdict: 🟢 DEPLOY READY
Total: 61 | ✅ 60 | ❌ 0 | ⚠️ 1

## Results
| # | Name | Status | Detail |
|---|------|--------|--------|
| 1 | happy_score_full_journey | ✅ PASS | questions=30, level=MaturityLevel.L4, score=93 |
| 2 | happy_shield_scan_clean_code | ✅ PASS | findings=0, critical=0 |
| 3 | happy_shield_injection_blocked | ✅ PASS | action=DetectorAction.BLOCK, risk=RiskLevel.HIGH |
| 4 | happy_enforce_policy_allow | ✅ PASS | decision=allow, reasons=[] |
| 5 | happy_vault_dlp_pii_detected | ✅ PASS | findings=2, types=['SecretType.SSN', 'SecretType.CREDIT_CARD'] |
| 6 | happy_watch_receipt_chain_verified | ✅ PASS | hash=53b7930ea42f3de6, chain_ok=True |
| 7 | happy_autonomy_ask_mode_blocks | ✅ PASS | should_ask=True |
| 8 | happy_vault_fraud_high_risk_flagged | ✅ PASS | score=40.00, risk=RiskLevel.MEDIUM |
| 9 | error_score_empty_answers_l1 | ✅ PASS | score=0, level=MaturityLevel.L1 |
| 10 | error_shield_empty_content_safe | ✅ PASS | findings=0 |
| 11 | error_enforce_policy_deny_exec | ✅ PASS | decision=deny |
| 12 | error_stepup_risk_level_coercion | ✅ PASS | all 4 HIGH coercions OK |
| 13 | error_consensus_no_quorum_graceful | ✅ PASS | result=round_id='6b84e434-d33f-441c-84ea-6c3ad69ec22b' final_verdict='denied' agreement |
| 14 | error_dlp_handles_large_content | ✅ PASS | content_size=102000B, findings=0 |
| 15 | error_score_unknown_qids_graceful | ✅ PASS | score=0, no crash |
| 16 | error_tool_reliability_cold_start | ✅ PASS | failure_prob=0.10, confidence=low |
| 17 | security_injections_blocked | ⚠️ WARN | blocked=4/8: clear_jailbreak=B, role_play=B, multi_agent_takeover=B, llama_template=B, html_comment= |
| 18 | security_dlp_api_keys_detected | ✅ PASS | findings=2, types=['SecretType.API_KEY', 'SecretType.API_KEY'] |
| 19 | security_dlp_redact_pii | ✅ PASS | redacted_count=2, sample=SSN [REDACTED:ssn] card [REDACTED:credit_card] |
| 20 | security_policy_blocks_network_untrusted | ✅ PASS | decision=deny |
| 21 | security_sbom_cve_detected | ✅ PASS | components=3, cve_alerts=2 |
| 22 | security_no_false_positives_on_benign | ✅ PASS | 0/4 false positives |
| 23 | concurrency_dlp_20_threads | ✅ PASS | completed=20/20, avg_findings=1.0 |
| 24 | concurrency_consensus_5_rounds | ✅ PASS | 5/5 rounds resolved concurrently |
| 25 | concurrency_scoring_10_parallel | ✅ PASS | 10/10 completed, range=59–62 |
| 26 | concurrency_autonomy_10_concurrent | ✅ PASS | 10/10 all should_ask=True |
| 27 | edge_score_gibberish_answers_l1 | ✅ PASS | level=MaturityLevel.L1, score=1 |
| 28 | edge_score_partial_answers | ✅ PASS | answered=22/44, score=50 |
| 29 | edge_autonomy_mode_switching | ✅ PASS | ASK→True, ACT→False, CONDITIONAL→False |
| 30 | edge_error_translator_unknown_graceful | ✅ PASS | result=ErrorTranslationResult(error_string='ZXY_COMPLETELY_UNKNOWN_ERROR_999: something |
| 31 | edge_memory_consolidation_dedup | ✅ PASS | consolidation_result=ConsolidationResult(consolidation_id='b04bb224-6769-5839-9ddc-06c6f55e8a43', se |
| 32 | edge_scratchpad_ttl_expiry | ✅ PASS | purge_expired + get_after_expire=None ✓ |
| 33 | integration_shield_to_enforce_pipeline | ✅ PASS | injection=SAFE → policy=ALLOW |
| 34 | integration_shield_blocks_before_enforce | ✅ PASS | blocked at shield layer, policy never reached |
| 35 | integration_score_to_stepup_pipeline | ✅ PASS | score=0→risk=RiskLevel.HIGH→stepup_id=8c4a23f2 |
| 36 | integration_dlp_to_receipt_pipeline | ✅ PASS | dlp_redactions=2, hash=4b8fbbfeac2e, chain_ok=True |
| 37 | api_health | ✅ PASS | 200 OK |
| 38 | api_openapi_schema | ✅ PASS | paths=417 |
| 39 | api_shield_injection_blocked | ✅ PASS | action=block |
| 40 | api_shield_safe_passes | ✅ PASS | action=safe |
| 41 | api_shield_status | ✅ PASS | keys=['analyzer_available', 'detector_available', 'version'] |
| 42 | api_enforce_status | ✅ PASS | firewall_loaded=True |
| 43 | api_score_session_create | ✅ PASS | session_id=be9b595b-0b6 |
| 44 | api_score_get_question | ✅ PASS | qid=gov_1 |
| 45 | api_score_answer_question | ✅ PASS | completed=False |
| 46 | api_vault_status | ✅ PASS |  |
| 47 | api_watch_receipts | ✅ PASS | count=0 |
| 48 | api_watch_assurance_status | ✅ PASS |  |
| 49 | api_enforce_evaluate | ✅ PASS | allowed=True, decision=allow |
| 50 | api_bad_input_422 | ✅ PASS | 422 for missing content |
| 51 | recovery_double_init_consistent | ✅ PASS | two DB instances: consistent |
| 52 | recovery_tool_reliability_learns | ✅ PASS | cold=0.10→learned=0.95 |
| 53 | recovery_two_sessions_independent | ✅ PASS | s1=1946de3e, s2=d376efea, independent |
| 54 | recovery_version_control_rollback | ✅ PASS | v1=1, v2=2, rollback→v1 OK |
| 55 | e2e_invoicebot_l5_score | ✅ PASS | overall=L5, score=100 |
| 56 | e2e_invoicebot_fraud_to_stepup | ✅ PASS | legit=0.00→RiskLevel.SAFE, fraud=40.00→RiskLevel.MEDIUM |
| 57 | e2e_invoicebot_autonomy_gate | ✅ PASS | should_ask=True |
| 58 | audit_receipt_chain_integrity | ✅ PASS | chain_ok=True, hash=663a2bd7696ea5da |
| 59 | audit_determinism_same_inputs | ✅ PASS | same_text_same_hash=True, diff_text_diff_hash=True, hash=e4264e985555d5bf |
| 60 | audit_version_control_diff | ✅ PASS | diff between v1→v2: artifact_type='prompt' artifact_id='prompt_001' from_version=1 to_version=2 chan |
| 61 | audit_5_receipt_chain_valid | ✅ PASS | 5-receipt chain verified: Chain OK — 5 receipts verified |