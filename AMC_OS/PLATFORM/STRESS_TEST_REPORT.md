# AMC Expert Stress Test Report
**Generated:** 2026-02-18 21:47:14 UTC
**Elapsed:** 7.9s

## Summary
| Metric | Value |
|--------|-------|
| Total | 62 |
| ✅ Passed | 48 |
| ❌ Failed | 13 |
| ⚠️ Warnings | 1 |
| Verdict | 🔴 NOT READY — 13 failures to fix first |

## Results
| # | Name | Status | Detail |
|---|------|--------|--------|
| 1 | happy_score_full_journey | ❌ FAIL | TypeError: 'list' object is not callable |
| 2 | happy_shield_scan_clean_code | ✅ PASS | findings=0, critical=0 |
| 3 | happy_shield_injection_blocked | ✅ PASS | action=DetectorAction.BLOCK, risk=RiskLevel.HIGH |
| 4 | happy_enforce_policy_allow | ❌ FAIL | AttributeError: 'PolicyResult' object has no attribute 'allowed' |
| 5 | happy_vault_dlp_pii_detected | ✅ PASS | findings=2, types=['SecretType.SSN', 'SecretType.CREDIT_CARD'] |
| 6 | happy_watch_receipt_chain_verified | ❌ FAIL | AttributeError: 'coroutine' object has no attribute 'receipt_hash' |
| 7 | happy_autonomy_ask_mode_blocks | ✅ PASS | should_ask=True |
| 8 | happy_vault_fraud_high_risk_flagged | ✅ PASS | score=40.00, risk=RiskLevel.MEDIUM |
| 9 | error_score_empty_answers_l1 | ✅ PASS | score=0, level=MaturityLevel.L1 |
| 10 | error_shield_empty_content_safe | ✅ PASS | findings=0 |
| 11 | error_enforce_policy_deny_exec | ❌ FAIL | AttributeError: 'PolicyResult' object has no attribute 'allowed' |
| 12 | error_stepup_risk_level_coercion | ❌ FAIL | ValueError: 'HIGH' is not a valid RiskLevel |
| 13 | error_consensus_no_quorum_graceful | ✅ PASS | result=round_id='1b134f24-a2dc-4956-9dec-0ed4c99e372d' final_verdict='denied' ag |
| 14 | error_dlp_handles_large_content | ✅ PASS | content_size=102000B, findings=0 |
| 15 | error_score_unknown_qids_graceful | ✅ PASS | score=0, no crash |
| 16 | error_tool_reliability_cold_start | ✅ PASS | failure_prob=0.10, confidence=low |
| 17 | security_injections_blocked | ⚠️ WARN | blocked=4/8: clear_jailbreak=B, role_play=B, multi_agent_takeover=B, llama_templ |
| 18 | security_injections_blocked | ✅ PASS |  |
| 19 | security_dlp_api_keys_detected | ✅ PASS | findings=2, types=['SecretType.API_KEY', 'SecretType.API_KEY'] |
| 20 | security_dlp_redact_pii | ✅ PASS | redacted_count=2, sample=SSN [REDACTED:ssn] card [REDACTED:credit_card] |
| 21 | security_policy_blocks_network_untrusted | ❌ FAIL | AttributeError: 'PolicyResult' object has no attribute 'allowed' |
| 22 | security_sbom_cve_detected | ✅ PASS | components=3, cve_alerts=2 |
| 23 | security_no_false_positives_on_benign | ✅ PASS | 0/4 false positives |
| 24 | concurrency_dlp_20_threads | ✅ PASS | completed=20/20, avg_findings=2.0 |
| 25 | concurrency_consensus_5_rounds | ✅ PASS | 5/5 rounds resolved concurrently |
| 26 | concurrency_scoring_10_parallel | ✅ PASS | 10/10 completed, range=59–62 |
| 27 | concurrency_autonomy_10_concurrent | ✅ PASS | 10/10 all should_ask=True |
| 28 | edge_score_gibberish_answers_l1 | ✅ PASS | level=MaturityLevel.L1, score=1 |
| 29 | edge_score_partial_answers | ✅ PASS | answered=22/44, score=50 |
| 30 | edge_autonomy_mode_switching | ✅ PASS | ASK→True, ACT→False, CONDITIONAL→False |
| 31 | edge_error_translator_unknown_graceful | ✅ PASS | result=ErrorTranslationResult(error_string='ZXY_COMPLETELY_UNKNOWN_ERROR_999: so |
| 32 | edge_memory_consolidation_dedup | ✅ PASS | items=3, consolidation_result=ConsolidationResult(consolidation_id='b2abffc3-c7b |
| 33 | edge_scratchpad_ttl_expiry | ✅ PASS | purged=1, get_after_expire=None ✓ |
| 34 | integration_shield_to_enforce_pipeline | ❌ FAIL | AttributeError: 'PolicyResult' object has no attribute 'allowed' |
| 35 | integration_shield_blocks_before_enforce | ✅ PASS | blocked at shield layer, policy never reached |
| 36 | integration_score_to_stepup_pipeline | ✅ PASS | score=0→risk=RiskLevel.HIGH→stepup_id=04dc3a03 |
| 37 | integration_dlp_to_receipt_pipeline | ❌ FAIL | TypeError: cannot unpack non-iterable coroutine object |
| 38 | api_health | ✅ PASS | 200 OK, keys=['status', 'service'] |
| 39 | api_openapi_schema | ✅ PASS | paths=417 |
| 40 | api_shield_injection_blocked | ✅ PASS | action=block |
| 41 | api_shield_safe_passes | ✅ PASS | action=safe |
| 42 | api_shield_skill_scan | ✅ PASS | code=200 |
| 43 | api_shield_status | ✅ PASS | keys=['analyzer_available', 'detector_available', 'version'] |
| 44 | api_enforce_status | ✅ PASS | firewall_loaded=True |
| 45 | api_score_session_create | ✅ PASS | session_id=ad49a507-8a5 |
| 46 | api_score_get_question | ❌ FAIL | got 404: {'detail': 'Not Found'} |
| 47 | api_vault_status | ✅ PASS | keys=['dlp_available', 'vault_ready'] |
| 48 | api_watch_receipts | ✅ PASS | count=0 |
| 49 | api_watch_assurance_status | ✅ PASS | keys=['drift_findings', 'owasp_pass', 'owasp_score'] |
| 50 | api_enforce_evaluate | ✅ PASS | allowed=None |
| 51 | api_bad_input_422 | ✅ PASS | 422 correctly returned for missing content |
| 52 | recovery_double_init_consistent | ✅ PASS | two DB instances: consistent |
| 53 | recovery_tool_reliability_learns | ✅ PASS | cold=0.10→learned=0.95 |
| 54 | recovery_two_sessions_independent | ✅ PASS | s1=4296d11d, s2=8d03f84e, independent |
| 55 | recovery_version_control_rollback | ❌ FAIL | TypeError: VersionControlStore.__init__() got an unexpected keyword argument 'db |
| 56 | e2e_invoicebot_l5_score | ✅ PASS | overall=L5, dims={'governance': 'L5', 'security': 'L5', 'reliability': 'L5', 'ev |
| 57 | e2e_invoicebot_fraud_to_stepup | ✅ PASS | legit=0.00→RiskLevel.SAFE, fraud=40.00→RiskLevel.MEDIUM |
| 58 | e2e_invoicebot_autonomy_gate | ✅ PASS | should_ask=True |
| 59 | audit_receipt_chain_integrity | ❌ FAIL | TypeError: cannot unpack non-iterable coroutine object |
| 60 | audit_determinism_same_inputs | ✅ PASS | same_text_same_hash=True, diff_text_diff_hash=True, hash=e4264e985555d5bf |
| 61 | audit_version_control_diff | ❌ FAIL | TypeError: VersionControlStore.__init__() got an unexpected keyword argument 'db |
| 62 | audit_5_receipt_chain_valid | ❌ FAIL | TypeError: cannot unpack non-iterable coroutine object |