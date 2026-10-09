/**
 * Ledger migration 13: the A4 Forge project record (P1-56; design §4.2).
 *
 * `a4_transitions` is the chain every other row derives from: each transition names the signed A4 audit row
 * written in the same transaction and, in its body, every side row it inserted with that row's sha256, so the chain
 * is the completeness root. `a4_projects` is the mutable head index (its protect trigger lists the only columns that
 * may change); `a4_requests` is idempotency bookkeeping and `a4_effects` a liveness index; every other table is
 * append-only. `a4_transitions.kind` and `a4_decisions.identity_check` carry no CHECK: their closed sets live in
 * src/a4/a4Schema.ts, so a later kind needs no rebuild of an append-only table (SQLite cannot alter a CHECK).
 */
const appendOnly = (table: string): string => `
      CREATE TRIGGER IF NOT EXISTS ${table}_append_only BEFORE UPDATE ON ${table}
      BEGIN SELECT RAISE(ABORT, '${table} is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table}
      BEGIN SELECT RAISE(ABORT, '${table} is append-only'); END;`;

const STAGE_CHECK = "('aspire','assemble','adapt','activate','retired')";
const TARGET_CHECK = "('compose','helm')";

export const A4_MIGRATION_SQL = `
      CREATE TABLE IF NOT EXISTS a4_projects (
        project_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, agent_id TEXT NOT NULL, name TEXT NOT NULL,
        stage TEXT NOT NULL CHECK (stage IN ${STAGE_CHECK}),
        step TEXT NOT NULL CHECK (step IN ('asked','understood','explained','proposed','direction_approved','built','reviewed','completion_approved')),
        hold INTEGER NOT NULL DEFAULT 0 CHECK (hold IN (0, 1)), hold_reason TEXT,
        revision_no INTEGER NOT NULL, head_seq INTEGER NOT NULL, head_digest TEXT NOT NULL,
        deployed_release_id TEXT, base_release_id TEXT, verified_seq INTEGER, verified_digest TEXT,
        created_by_key TEXT NOT NULL, created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_a4_active_agent ON a4_projects(workspace_id, agent_id) WHERE stage <> 'retired';
      CREATE TRIGGER IF NOT EXISTS protect_a4_projects_head BEFORE UPDATE ON a4_projects
      WHEN NEW.project_id IS NOT OLD.project_id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.agent_id IS NOT OLD.agent_id
        OR NEW.name IS NOT OLD.name OR NEW.created_by_key IS NOT OLD.created_by_key OR NEW.created_ts IS NOT OLD.created_ts
      BEGIN SELECT RAISE(ABORT, 'a4_projects: only head columns may change'); END;
      CREATE TRIGGER IF NOT EXISTS a4_projects_no_delete BEFORE DELETE ON a4_projects
      BEGIN SELECT RAISE(ABORT, 'a4_projects rows are never deleted; RETIRE frees the agent'); END;

      CREATE TABLE IF NOT EXISTS a4_transitions (
        project_id TEXT NOT NULL REFERENCES a4_projects(project_id), seq INTEGER NOT NULL, kind TEXT NOT NULL,
        stage TEXT, revision_no INTEGER NOT NULL, actor_key TEXT NOT NULL, actor_username TEXT NOT NULL,
        body_json TEXT NOT NULL, body_digest TEXT NOT NULL, prev_digest TEXT NOT NULL, readiness_sha256 TEXT,
        envelope_json TEXT, evidence_event_id TEXT NOT NULL, ts INTEGER NOT NULL,
        PRIMARY KEY (project_id, seq)
      );${appendOnly("a4_transitions")}

      CREATE TABLE IF NOT EXISTS a4_revisions (
        project_id TEXT NOT NULL, revision_no INTEGER NOT NULL, stage TEXT NOT NULL CHECK (stage IN ${STAGE_CHECK}),
        parent_revision_no INTEGER, spec_json TEXT NOT NULL, spec_digest TEXT NOT NULL,
        resource_digests_json TEXT NOT NULL, resource_digests_sha256 TEXT NOT NULL, operating_scope_json TEXT,
        created_by_key TEXT NOT NULL, evidence_event_id TEXT NOT NULL, ts INTEGER NOT NULL,
        PRIMARY KEY (project_id, revision_no)
      );${appendOnly("a4_revisions")}

      CREATE TABLE IF NOT EXISTS a4_gates (
        gate_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision_no INTEGER NOT NULL,
        stage TEXT NOT NULL CHECK (stage IN ${STAGE_CHECK}), gate TEXT NOT NULL CHECK (gate IN ('direction','completion','policy')),
        request_json TEXT NOT NULL, binding_digest TEXT NOT NULL, intent_json TEXT NOT NULL, readiness_sha256 TEXT NOT NULL,
        bound_items_json TEXT NOT NULL, gate_policy_digest TEXT NOT NULL, requested_by_key TEXT NOT NULL,
        excluded_keys_json TEXT NOT NULL, expires_ts INTEGER NOT NULL, envelope_json TEXT,
        evidence_event_id TEXT NOT NULL, ts INTEGER NOT NULL
      );${appendOnly("a4_gates")}

      CREATE TABLE IF NOT EXISTS a4_decisions (
        decision_id TEXT PRIMARY KEY, gate_id TEXT NOT NULL REFERENCES a4_gates(gate_id), project_id TEXT NOT NULL,
        decision_json TEXT NOT NULL, request_digest TEXT NOT NULL, approver_key TEXT NOT NULL, auth_source TEXT NOT NULL,
        admission TEXT NOT NULL CHECK (admission IN ('browser_csrf','native_login_token')),
        identity_check TEXT NOT NULL, identity_provenance_json TEXT NOT NULL,
        self_approved INTEGER NOT NULL CHECK (self_approved IN (0, 1)), self_approval_facts_json TEXT NOT NULL,
        evaluated_items_json TEXT NOT NULL, envelope_json TEXT, evidence_event_id TEXT NOT NULL, ts INTEGER NOT NULL,
        UNIQUE (gate_id, approver_key)
      );${appendOnly("a4_decisions")}

      CREATE TABLE IF NOT EXISTS a4_members (
        project_id TEXT NOT NULL, seq INTEGER NOT NULL, event TEXT NOT NULL CHECK (event IN ('added','roles_changed','removed')),
        principal_key TEXT NOT NULL, auth_source TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT NOT NULL,
        roles_json TEXT NOT NULL, actor_key TEXT NOT NULL, evidence_event_id TEXT NOT NULL, ts INTEGER NOT NULL,
        PRIMARY KEY (project_id, seq)
      );${appendOnly("a4_members")}

      CREATE TABLE IF NOT EXISTS a4_comments (
        comment_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision_no INTEGER NOT NULL, stage TEXT, card_id TEXT NOT NULL,
        author_key TEXT NOT NULL, body_sha256 TEXT NOT NULL, blob_ref TEXT NOT NULL, in_reply_to TEXT,
        evidence_event_id TEXT NOT NULL, ts INTEGER NOT NULL
      );${appendOnly("a4_comments")}

      CREATE TABLE IF NOT EXISTS a4_evidence_refs (
        project_id TEXT NOT NULL, seq INTEGER NOT NULL, revision_no INTEGER NOT NULL, stage TEXT,
        lane TEXT NOT NULL CHECK (lane IN ('recommendation','implementation','observed','verified')),
        ref_kind TEXT NOT NULL CHECK (ref_kind IN ('stage_output','ledger_event','receipt','session','artifact','approval','manifest',
          'plan','control_result','package','deployment_receipt','verification','rollback_receipt','value_claim','outcome_report',
          'monitor','external')),
        ref_id TEXT NOT NULL, sha256 TEXT NOT NULL, claim_kind TEXT NOT NULL, trust_tier TEXT, method TEXT, label TEXT NOT NULL,
        actor_key TEXT NOT NULL, evidence_event_id TEXT NOT NULL, ts INTEGER NOT NULL,
        PRIMARY KEY (project_id, seq),
        -- NULL-safe: a CHECK whose expression is NULL passes, and x IN (...) is NULL for a NULL x.
        CHECK ((lane = 'observed' AND claim_kind = 'observed' AND trust_tier IS NOT NULL AND trust_tier IN ('OBSERVED','OBSERVED_HARDENED')
            AND method IS NOT NULL AND method IN ('runtime_observation','executed_test'))
          OR (lane = 'verified' AND claim_kind = 'independently_reviewed')
          OR (lane IN ('recommendation','implementation') AND claim_kind IN ('self_reported','synthetic_example')))
      );${appendOnly("a4_evidence_refs")}

      CREATE TABLE IF NOT EXISTS a4_releases (
        release_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision_no INTEGER NOT NULL, package_digest TEXT NOT NULL,
        package_path TEXT NOT NULL, signature_path TEXT NOT NULL, transparency_entry_id TEXT, previous_release_id TEXT,
        base_release_id TEXT, target TEXT NOT NULL CHECK (target IN ${TARGET_CHECK}), surfaces_json TEXT NOT NULL,
        envelope_json TEXT, actor_key TEXT NOT NULL, evidence_event_id TEXT NOT NULL, ts INTEGER NOT NULL
      );${appendOnly("a4_releases")}

      CREATE TABLE IF NOT EXISTS a4_deployments (
        deployment_id TEXT PRIMARY KEY, release_id TEXT NOT NULL REFERENCES a4_releases(release_id), project_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('deploy','verify','rollback','monitor')),
        environment TEXT NOT NULL CHECK (environment IN ('staging','production')), target TEXT NOT NULL CHECK (target IN ${TARGET_CHECK}),
        receipt_json TEXT NOT NULL, receipt_sha256 TEXT NOT NULL,
        recorded_status TEXT NOT NULL CHECK (recorded_status IN ('succeeded','failed','partial')),
        amc_check_status TEXT NOT NULL DEFAULT 'not_evaluated' CHECK (amc_check_status IN ('not_evaluated','reachable','passed','failed')),
        amc_check_json TEXT, recorded_by_key TEXT NOT NULL, envelope_json TEXT, evidence_event_id TEXT NOT NULL, ts INTEGER NOT NULL
      );${appendOnly("a4_deployments")}

      CREATE TABLE IF NOT EXISTS a4_requests (
        principal_key TEXT NOT NULL, client_request_id TEXT NOT NULL, body_hash TEXT NOT NULL, project_id TEXT,
        response_json TEXT NOT NULL, redacted INTEGER NOT NULL DEFAULT 0 CHECK (redacted IN (0, 1)), ts INTEGER NOT NULL,
        PRIMARY KEY (principal_key, client_request_id)
      );
      CREATE INDEX IF NOT EXISTS idx_a4_requests_ts ON a4_requests(ts);

      CREATE TABLE IF NOT EXISTS a4_effects (
        effect_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, gate_id TEXT NOT NULL, execution_id TEXT NOT NULL,
        approval_request_id TEXT, owner_pid INTEGER NOT NULL, owner_host TEXT NOT NULL, started_ts INTEGER NOT NULL,
        heartbeat_ts INTEGER NOT NULL, state TEXT NOT NULL CHECK (state IN ('running','finished','failed'))
      );
      CREATE TRIGGER IF NOT EXISTS protect_a4_effects BEFORE UPDATE ON a4_effects
      WHEN NEW.effect_id IS NOT OLD.effect_id OR NEW.project_id IS NOT OLD.project_id OR NEW.gate_id IS NOT OLD.gate_id
        OR NEW.execution_id IS NOT OLD.execution_id OR NEW.approval_request_id IS NOT OLD.approval_request_id
        OR NEW.owner_pid IS NOT OLD.owner_pid OR NEW.owner_host IS NOT OLD.owner_host OR NEW.started_ts IS NOT OLD.started_ts
      BEGIN SELECT RAISE(ABORT, 'a4_effects: only heartbeat_ts and state may change'); END;
`;
