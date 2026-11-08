import type { Database as SqlDatabase } from 'sql.js';

export interface Migration {
  version: number;
  name: string;
  up(db: SqlDatabase): void;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up(db: SqlDatabase) {
      // 1. metric_events
      db.run(`
        CREATE TABLE IF NOT EXISTS metric_events (
          id TEXT PRIMARY KEY,
          collector_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          payload_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_metric_events_timestamp ON metric_events(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_metric_events_collector ON metric_events(collector_id, timestamp DESC);
      `);

      // 2. system_metrics
      db.run(`
        CREATE TABLE IF NOT EXISTS system_metrics (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          cpu_percent REAL NOT NULL,
          memory_total_bytes INTEGER NOT NULL,
          memory_used_bytes INTEGER NOT NULL,
          memory_free_bytes INTEGER NOT NULL,
          memory_used_percent REAL NOT NULL,
          uptime_seconds REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp DESC);
      `);

      // 3. ai_usage
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_usage (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          prompt_tokens INTEGER NOT NULL,
          completion_tokens INTEGER NOT NULL,
          total_tokens INTEGER NOT NULL,
          estimated_cost REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ai_usage_timestamp ON ai_usage(timestamp DESC);
      `);

      // 4. workspace_snapshots
      db.run(`
        CREATE TABLE IF NOT EXISTS workspace_snapshots (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          workspace_name TEXT NOT NULL,
          file_count INTEGER NOT NULL,
          total_size_bytes INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_workspace_snapshots_timestamp ON workspace_snapshots(timestamp DESC);
      `);

      // 5. git_activity
      db.run(`
        CREATE TABLE IF NOT EXISTS git_activity (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          branch TEXT NOT NULL,
          commit_hash TEXT NOT NULL,
          author TEXT NOT NULL,
          message TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_git_activity_timestamp ON git_activity(timestamp DESC);
      `);

      // 6. coding_sessions
      db.run(`
        CREATE TABLE IF NOT EXISTS coding_sessions (
          id TEXT PRIMARY KEY,
          session_start INTEGER NOT NULL,
          session_end INTEGER NOT NULL,
          language_id TEXT NOT NULL,
          active_seconds INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_coding_sessions_start ON coding_sessions(session_start DESC);
      `);

      // 7. api_requests
      db.run(`
        CREATE TABLE IF NOT EXISTS api_requests (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          endpoint TEXT NOT NULL,
          method TEXT NOT NULL,
          status_code INTEGER NOT NULL,
          latency_ms REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_api_requests_timestamp ON api_requests(timestamp DESC);
      `);

      // 8. alerts
      db.run(`
        CREATE TABLE IF NOT EXISTS alerts (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          severity TEXT NOT NULL,
          collector_id TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          acknowledged INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged, timestamp DESC);
      `);

      // 9. budgets
      db.run(`
        CREATE TABLE IF NOT EXISTS budgets (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          limit_amount REAL NOT NULL,
          current_amount REAL NOT NULL,
          period TEXT NOT NULL
        );
      `);

      // 10. settings
      db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    }
  },
  {
    version: 2,
    name: 'phase2_workspace_and_advanced_system',
    up(db: SqlDatabase) {
      // 1. file_scans
      db.run(`
        CREATE TABLE IF NOT EXISTS file_scans (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          workspace_path TEXT NOT NULL,
          workspace_name TEXT NOT NULL,
          total_size_bytes INTEGER NOT NULL,
          total_files INTEGER NOT NULL,
          total_folders INTEGER NOT NULL,
          scanned_files INTEGER NOT NULL,
          excluded_files INTEGER NOT NULL,
          excluded_folders INTEGER NOT NULL,
          duration_ms INTEGER NOT NULL,
          status TEXT NOT NULL,
          error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_file_scans_timestamp ON file_scans(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_file_scans_workspace ON file_scans(workspace_path, timestamp DESC);
      `);

      // 2. file_entries
      db.run(`
        CREATE TABLE IF NOT EXISTS file_entries (
          id TEXT PRIMARY KEY,
          scan_id TEXT NOT NULL,
          path TEXT NOT NULL,
          name TEXT NOT NULL,
          extension TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          last_modified INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_file_entries_scan ON file_entries(scan_id);
        CREATE INDEX IF NOT EXISTS idx_file_entries_size ON file_entries(scan_id, size_bytes DESC);
        CREATE INDEX IF NOT EXISTS idx_file_entries_ext ON file_entries(scan_id, extension);
      `);

      // 3. folder_stats
      db.run(`
        CREATE TABLE IF NOT EXISTS folder_stats (
          id TEXT PRIMARY KEY,
          scan_id TEXT NOT NULL,
          path TEXT NOT NULL,
          name TEXT NOT NULL,
          direct_files INTEGER NOT NULL,
          recursive_files INTEGER NOT NULL,
          total_size_bytes INTEGER NOT NULL,
          child_dirs INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_folder_stats_scan ON folder_stats(scan_id);
        CREATE INDEX IF NOT EXISTS idx_folder_stats_size ON folder_stats(scan_id, total_size_bytes DESC);
      `);

      // 4. duplicate_groups
      db.run(`
        CREATE TABLE IF NOT EXISTS duplicate_groups (
          id TEXT PRIMARY KEY,
          scan_id TEXT NOT NULL,
          hash TEXT NOT NULL,
          file_size_bytes INTEGER NOT NULL,
          file_count INTEGER NOT NULL,
          files_json TEXT NOT NULL,
          wasted_bytes INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_duplicate_groups_scan ON duplicate_groups(scan_id);
        CREATE INDEX IF NOT EXISTS idx_duplicate_groups_wasted ON duplicate_groups(scan_id, wasted_bytes DESC);
      `);

      // 5. disk_metrics
      db.run(`
        CREATE TABLE IF NOT EXISTS disk_metrics (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          fs TEXT NOT NULL,
          mount TEXT NOT NULL,
          total_bytes INTEGER NOT NULL,
          used_bytes INTEGER NOT NULL,
          free_bytes INTEGER NOT NULL,
          used_percent REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_disk_metrics_timestamp ON disk_metrics(timestamp DESC);
      `);

      // 6. process_metrics
      db.run(`
        CREATE TABLE IF NOT EXISTS process_metrics (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          pid INTEGER NOT NULL,
          name TEXT NOT NULL,
          cpu_percent REAL NOT NULL,
          memory_bytes INTEGER NOT NULL,
          memory_percent REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_process_metrics_timestamp ON process_metrics(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_process_metrics_cpu ON process_metrics(timestamp DESC, cpu_percent DESC);
      `);

      // 7. port_metrics
      db.run(`
        CREATE TABLE IF NOT EXISTS port_metrics (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          port INTEGER NOT NULL,
          state TEXT NOT NULL,
          pid INTEGER,
          process_name TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_port_metrics_timestamp ON port_metrics(timestamp DESC);
      `);
    }
  },
  {
    version: 3,
    name: 'phase3_ai_and_git_intelligence',
    up(db: SqlDatabase) {
      // 1. ai_providers
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_providers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          status TEXT NOT NULL,
          endpoint TEXT,
          is_local INTEGER NOT NULL DEFAULT 0,
          models_json TEXT,
          last_synced_at INTEGER,
          created_at INTEGER NOT NULL
        );
      `);

      // 2. ai_models
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_models (
          id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          name TEXT NOT NULL,
          display_name TEXT,
          context_window INTEGER,
          is_local INTEGER NOT NULL DEFAULT 0,
          last_used_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_ai_models_provider ON ai_models(provider_id);
      `);

      // 3. ai_usage_records
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_usage_records (
          id TEXT PRIMARY KEY,
          workspace_id TEXT,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          total_tokens INTEGER NOT NULL DEFAULT 0,
          request_count INTEGER NOT NULL DEFAULT 1,
          duration_ms INTEGER,
          estimated_cost REAL NOT NULL DEFAULT 0,
          currency TEXT NOT NULL DEFAULT 'USD',
          source TEXT NOT NULL,
          request_type TEXT,
          pricing_snapshot_json TEXT,
          timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ai_usage_records_time ON ai_usage_records(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_records_provider ON ai_usage_records(provider, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_records_model ON ai_usage_records(model, timestamp DESC);
      `);

      // 4. ai_pricing
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_pricing (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          model_pattern TEXT NOT NULL,
          input_cost_per_million REAL NOT NULL,
          output_cost_per_million REAL NOT NULL,
          is_custom INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );
      `);

      // 5. ai_budgets
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_budgets (
          id TEXT PRIMARY KEY,
          period_type TEXT NOT NULL,
          limit_amount REAL NOT NULL,
          threshold_percent REAL NOT NULL DEFAULT 85,
          provider TEXT,
          model TEXT,
          created_at INTEGER NOT NULL
        );
      `);

      // 6. git_repositories
      db.run(`
        CREATE TABLE IF NOT EXISTS git_repositories (
          id TEXT PRIMARY KEY,
          workspace_path TEXT NOT NULL,
          name TEXT NOT NULL,
          root_path TEXT NOT NULL,
          current_branch TEXT,
          head_commit_hash TEXT,
          remotes_json TEXT,
          is_clean INTEGER NOT NULL DEFAULT 1,
          last_polled_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_git_repos_path ON git_repositories(root_path);
      `);

      // 7. git_commits
      db.run(`
        CREATE TABLE IF NOT EXISTS git_commits (
          id TEXT PRIMARY KEY,
          repo_id TEXT NOT NULL,
          commit_hash TEXT NOT NULL,
          short_hash TEXT NOT NULL,
          author_name TEXT NOT NULL,
          author_email TEXT,
          message TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          branch TEXT,
          files_changed INTEGER NOT NULL DEFAULT 0,
          insertions INTEGER NOT NULL DEFAULT 0,
          deletions INTEGER NOT NULL DEFAULT 0
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_git_commits_repo_hash ON git_commits(repo_id, commit_hash);
        CREATE INDEX IF NOT EXISTS idx_git_commits_time ON git_commits(repo_id, timestamp DESC);
      `);

      // 8. git_branches
      db.run(`
        CREATE TABLE IF NOT EXISTS git_branches (
          id TEXT PRIMARY KEY,
          repo_id TEXT NOT NULL,
          name TEXT NOT NULL,
          is_current INTEGER NOT NULL DEFAULT 0,
          is_remote INTEGER NOT NULL DEFAULT 0,
          upstream TEXT,
          ahead_count INTEGER,
          behind_count INTEGER,
          last_commit_hash TEXT,
          last_commit_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_git_branches_repo ON git_branches(repo_id);
      `);

      // 9. git_working_tree
      db.run(`
        CREATE TABLE IF NOT EXISTS git_working_tree (
          id TEXT PRIMARY KEY,
          repo_id TEXT NOT NULL,
          file_path TEXT NOT NULL,
          status TEXT NOT NULL,
          is_staged INTEGER NOT NULL DEFAULT 0,
          old_path TEXT,
          timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_git_working_tree_repo ON git_working_tree(repo_id);
      `);
    }
  },
  {
    version: 4,
    name: 'phase3_stabilization_and_dedupe',
    up(db: SqlDatabase) {
      // 1. Add idempotency_key to ai_usage_records
      try {
        db.run(`ALTER TABLE ai_usage_records ADD COLUMN idempotency_key TEXT;`);
        db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_usage_records_idempotency ON ai_usage_records(idempotency_key);`);
      } catch {}

      // 2. Add decoupled status columns to ai_providers
      try {
        db.run(`ALTER TABLE ai_providers ADD COLUMN connection_status TEXT;`);
        db.run(`ALTER TABLE ai_providers ADD COLUMN usage_tracking_status TEXT;`);
        db.run(`ALTER TABLE ai_providers ADD COLUMN model_catalog_status TEXT;`);
      } catch {}

      // 3. Add total_commits to git_repositories
      try {
        db.run(`ALTER TABLE git_repositories ADD COLUMN total_commits INTEGER DEFAULT 0;`);
      } catch {}
    }
  },
  {
    version: 5,
    name: 'phase4_coding_and_api_intelligence',
    up(db: SqlDatabase) {
      // 1. Clean up legacy Migration 1 stubs if empty/present
      try {
        db.run(`DROP TABLE IF EXISTS coding_sessions;`);
      } catch {}
      try {
        db.run(`DROP TABLE IF EXISTS api_requests;`);
      } catch {}

      // 2. Durable Coding Sessions
      db.run(`
        CREATE TABLE IF NOT EXISTS coding_sessions (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          workspace_name TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          ended_at INTEGER,
          last_activity_at INTEGER NOT NULL,
          active_duration_seconds INTEGER NOT NULL DEFAULT 0,
          idle_duration_seconds INTEGER NOT NULL DEFAULT 0,
          paused_duration_seconds INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active',
          primary_language TEXT NOT NULL,
          languages_json TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_coding_sessions_ws_start ON coding_sessions(workspace_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_coding_sessions_status ON coding_sessions(status);
        CREATE INDEX IF NOT EXISTS idx_coding_sessions_start ON coding_sessions(started_at DESC);
      `);

      // 3. API Monitored Services
      db.run(`
        CREATE TABLE IF NOT EXISTS api_services (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          integration_type TEXT NOT NULL DEFAULT 'express',
          environment TEXT NOT NULL DEFAULT 'development',
          monitoring_enabled INTEGER NOT NULL DEFAULT 1,
          secret_hash TEXT NOT NULL,
          total_requests INTEGER NOT NULL DEFAULT 0,
          last_event_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_api_services_name ON api_services(name);
      `);

      // 4. Normalized Endpoints Directory
      db.run(`
        CREATE TABLE IF NOT EXISTS api_endpoints (
          id TEXT PRIMARY KEY,
          service_id TEXT NOT NULL,
          route_template TEXT NOT NULL,
          method TEXT NOT NULL,
          total_requests INTEGER NOT NULL DEFAULT 0,
          total_errors INTEGER NOT NULL DEFAULT 0,
          avg_latency_ms REAL NOT NULL DEFAULT 0,
          p95_latency_ms REAL NOT NULL DEFAULT 0,
          last_requested_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(service_id, route_template, method)
        );
        CREATE INDEX IF NOT EXISTS idx_api_endpoints_service ON api_endpoints(service_id, last_requested_at DESC);
      `);

      // 5. Bounded API Request Events (Circular ring buffer capped at 10,000 rows max)
      db.run(`
        CREATE TABLE IF NOT EXISTS api_request_events (
          id TEXT PRIMARY KEY,
          service_id TEXT NOT NULL,
          endpoint_id TEXT NOT NULL,
          route_template TEXT NOT NULL,
          method TEXT NOT NULL,
          status_code INTEGER NOT NULL,
          duration_ms REAL NOT NULL,
          started_at INTEGER NOT NULL,
          completed_at INTEGER NOT NULL,
          outcome TEXT NOT NULL,
          error_category TEXT,
          environment TEXT NOT NULL,
          request_size_bytes INTEGER,
          response_size_bytes INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_api_events_service_endpoint ON api_request_events(service_id, endpoint_id, completed_at DESC);
        CREATE INDEX IF NOT EXISTS idx_api_events_time ON api_request_events(completed_at DESC);
      `);
    }
  },
  {
    version: 6,
    name: 'api_testing_studio_schema',
    up(db: SqlDatabase) {
      db.run('PRAGMA foreign_keys = ON;');

      // 1. Collections
      db.run(`
        CREATE TABLE IF NOT EXISTS api_test_collections (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          auth_type TEXT NOT NULL DEFAULT 'inherit',
          auth_config_json TEXT,
          variables_json TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_test_col_order ON api_test_collections(sort_order ASC, name ASC);
      `);

      // 2. Folders (with cascading deletes)
      db.run(`
        CREATE TABLE IF NOT EXISTS api_test_folders (
          id TEXT PRIMARY KEY,
          collection_id TEXT NOT NULL,
          parent_folder_id TEXT,
          name TEXT NOT NULL,
          description TEXT,
          auth_type TEXT NOT NULL DEFAULT 'inherit',
          auth_config_json TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(collection_id) REFERENCES api_test_collections(id) ON DELETE CASCADE,
          FOREIGN KEY(parent_folder_id) REFERENCES api_test_folders(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_test_fold_col ON api_test_folders(collection_id, parent_folder_id);
      `);

      // 3. Saved Requests
      db.run(`
        CREATE TABLE IF NOT EXISTS api_test_requests (
          id TEXT PRIMARY KEY,
          collection_id TEXT,
          folder_id TEXT,
          name TEXT NOT NULL,
          method TEXT NOT NULL,
          url TEXT NOT NULL,
          params_json TEXT NOT NULL DEFAULT '[]',
          headers_json TEXT NOT NULL DEFAULT '[]',
          body_type TEXT NOT NULL DEFAULT 'none',
          body_content TEXT,
          auth_type TEXT NOT NULL DEFAULT 'inherit',
          auth_config_json TEXT,
          pre_request_script TEXT,
          test_script TEXT,
          settings_json TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(collection_id) REFERENCES api_test_collections(id) ON DELETE CASCADE,
          FOREIGN KEY(folder_id) REFERENCES api_test_folders(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_test_req_col_folder ON api_test_requests(collection_id, folder_id, sort_order ASC);
      `);

      // 4. Environments
      db.run(`
        CREATE TABLE IF NOT EXISTS api_test_environments (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      // 5. Variables
      db.run(`
        CREATE TABLE IF NOT EXISTS api_test_variables (
          id TEXT PRIMARY KEY,
          environment_id TEXT,
          collection_id TEXT,
          key TEXT NOT NULL,
          initial_value TEXT NOT NULL,
          current_value TEXT NOT NULL,
          is_secret INTEGER NOT NULL DEFAULT 0,
          secret_ref TEXT,
          description TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(environment_id) REFERENCES api_test_environments(id) ON DELETE CASCADE,
          FOREIGN KEY(collection_id) REFERENCES api_test_collections(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_test_var_env ON api_test_variables(environment_id, enabled);
        CREATE INDEX IF NOT EXISTS idx_test_var_col ON api_test_variables(collection_id, enabled);
      `);

      // 6. Request History & 500-row prune trigger
      db.run(`
        CREATE TABLE IF NOT EXISTS api_test_history (
          id TEXT PRIMARY KEY,
          request_id TEXT,
          method TEXT NOT NULL,
          url TEXT NOT NULL,
          status_code INTEGER NOT NULL,
          status_text TEXT NOT NULL,
          duration_ms REAL NOT NULL,
          response_size_bytes INTEGER NOT NULL,
          environment_name TEXT,
          collection_id TEXT,
          request_summary_json TEXT,
          response_summary_json TEXT,
          executed_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_test_hist_time ON api_test_history(executed_at DESC);

        CREATE TRIGGER IF NOT EXISTS trg_prune_api_test_history
        AFTER INSERT ON api_test_history
        BEGIN
          DELETE FROM api_test_history
          WHERE id NOT IN (
            SELECT id FROM api_test_history ORDER BY executed_at DESC LIMIT 500
          );
        END;
      `);

      // 7. Test Runs
      db.run(`
        CREATE TABLE IF NOT EXISTS api_test_runs (
          id TEXT PRIMARY KEY,
          collection_id TEXT NOT NULL,
          environment_id TEXT,
          iteration_count INTEGER NOT NULL,
          total_requests INTEGER NOT NULL,
          passed_assertions INTEGER NOT NULL,
          failed_assertions INTEGER NOT NULL,
          duration_ms REAL NOT NULL,
          status TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          completed_at INTEGER NOT NULL,
          FOREIGN KEY(collection_id) REFERENCES api_test_collections(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_test_runs_time ON api_test_runs(started_at DESC);
      `);

      // 8. Test Run Request Results
      db.run(`
        CREATE TABLE IF NOT EXISTS api_test_run_results (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          iteration INTEGER NOT NULL,
          request_id TEXT NOT NULL,
          request_name TEXT NOT NULL,
          method TEXT NOT NULL,
          url TEXT NOT NULL,
          status_code INTEGER,
          duration_ms REAL NOT NULL,
          assertions_json TEXT NOT NULL,
          error_message TEXT,
          executed_at INTEGER NOT NULL,
          FOREIGN KEY(run_id) REFERENCES api_test_runs(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_test_run_items ON api_test_run_results(run_id, iteration);
      `);
    }
  },
  {
    version: 7,
    name: 'phase7_ai_playground_and_pulse_insights',
    up(db: SqlDatabase) {
      db.run('PRAGMA foreign_keys = ON;');

      // 1. AI Playground Conversations
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_conversations (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          model_id TEXT NOT NULL,
          system_prompt TEXT,
          generation_settings_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          archived_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated ON ai_conversations(updated_at DESC);
      `);

      // 2. AI Playground Messages
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'completed',
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          duration_ms INTEGER,
          error_message TEXT,
          context_attachments_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON ai_messages(conversation_id, created_at ASC);
      `);

      // 3. Prompt Templates & Versions
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_prompt_templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          category TEXT NOT NULL DEFAULT 'General',
          system_prompt TEXT,
          user_prompt TEXT NOT NULL,
          variables_json TEXT,
          is_favorite INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ai_templates_cat ON ai_prompt_templates(category, name ASC);

        CREATE TABLE IF NOT EXISTS ai_prompt_versions (
          id TEXT PRIMARY KEY,
          template_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          system_prompt TEXT,
          user_prompt TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY(template_id) REFERENCES ai_prompt_templates(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_tmpl ON ai_prompt_versions(template_id, version DESC);
      `);

      // 4. Generation Presets with Built-in Seeds
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_generation_presets (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          settings_json TEXT NOT NULL,
          is_builtin INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        INSERT OR IGNORE INTO ai_generation_presets (id, name, description, settings_json, is_builtin, created_at, updated_at) VALUES
        ('preset_balanced', 'Balanced', 'Well-rounded creative output and precision.', '{"temperature":0.7,"topP":0.9,"maxTokens":2048}', 1, 1700000000000, 1700000000000),
        ('preset_creative', 'Creative', 'High randomness for brainstorming and open ideation.', '{"temperature":1.0,"topP":0.95,"maxTokens":4096}', 1, 1700000000000, 1700000000000),
        ('preset_precise', 'Precise', 'Strict deterministic output with low variance.', '{"temperature":0.2,"topP":0.8,"maxTokens":2048}', 1, 1700000000000, 1700000000000),
        ('preset_coding', 'Coding', 'Optimized for syntax correctness and minimal hallucinations.', '{"temperature":0.1,"topP":0.95,"maxTokens":4096}', 1, 1700000000000, 1700000000000),
        ('preset_reasoning', 'Reasoning', 'Step-by-step analytical derivation.', '{"temperature":0.3,"topP":0.9,"maxTokens":4096}', 1, 1700000000000, 1700000000000),
        ('preset_summarization', 'Summarization', 'Concise factual distillation.', '{"temperature":0.4,"topP":0.85,"maxTokens":1024}', 1, 1700000000000, 1700000000000);
      `);

      // 5. Custom AI Providers
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_custom_providers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          base_url TEXT NOT NULL,
          model_ids_json TEXT NOT NULL DEFAULT '[]',
          headers_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      // 6. Pulse Insights Persistent Store (Bounded at 1,000 items)
      db.run(`
        CREATE TABLE IF NOT EXISTS pulse_insights (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          severity TEXT NOT NULL DEFAULT 'info',
          confidence REAL NOT NULL DEFAULT 1.0,
          evidence_json TEXT NOT NULL,
          recommendation TEXT,
          time_range_start INTEGER NOT NULL,
          time_range_end INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'new',
          dedupe_hash TEXT NOT NULL UNIQUE,
          generated_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_pulse_insights_cat_time ON pulse_insights(category, generated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_pulse_insights_status ON pulse_insights(status);

        CREATE TRIGGER IF NOT EXISTS trg_prune_pulse_insights
        AFTER INSERT ON pulse_insights
        BEGIN
          DELETE FROM pulse_insights
          WHERE id NOT IN (
            SELECT id FROM pulse_insights ORDER BY generated_at DESC LIMIT 1000
          );
        END;
      `);

      // 7. Pulse Insight Rule Engine State
      db.run(`
        CREATE TABLE IF NOT EXISTS pulse_insight_rules_state (
          rule_id TEXT PRIMARY KEY,
          last_run_at INTEGER NOT NULL,
          last_processed_timestamp INTEGER NOT NULL
        );
      `);
    }
  },
  {
    version: 8,
    name: 'v1_production_hardening_and_indexes',
    up(db: SqlDatabase) {
      db.run('PRAGMA foreign_keys = ON;');

      // 1. Ring buffer for API Request Events capped at 10,000 rows
      db.run(`
        CREATE TRIGGER IF NOT EXISTS trg_prune_api_request_events
        AFTER INSERT ON api_request_events
        BEGIN
          DELETE FROM api_request_events
          WHERE id NOT IN (
            SELECT id FROM api_request_events ORDER BY completed_at DESC LIMIT 10000
          );
        END;
      `);

      // 2. Production indexes for workspace isolation & high-volume telemetry
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_ai_usage_ws_time ON ai_usage_records(workspace_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_coding_sessions_ws_time ON coding_sessions(workspace_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_file_scans_ws_time ON file_scans(workspace_path, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_git_repos_ws ON git_repositories(workspace_path);
      `);
    }
  }
];

export function runMigrations(db: SqlDatabase): void {
  db.run('PRAGMA foreign_keys = ON;');
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedVersions = new Set<number>();
  try {
    const res = db.exec('SELECT version FROM schema_migrations');
    if (res.length > 0) {
      for (const row of res[0].values) {
        appliedVersions.add(Number(row[0]));
      }
    }
  } catch {
    // If table newly created, set is empty
  }

  for (const migration of MIGRATIONS) {
    if (!appliedVersions.has(migration.version)) {
      db.run('BEGIN TRANSACTION;');
      try {
        migration.up(db);
        db.run(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
          [migration.version, migration.name, Date.now()]
        );
        db.run('COMMIT;');
      } catch (err) {
        try {
          db.run('ROLLBACK;');
        } catch {
          // Ignore rollback failure if transaction wasn't active
        }
        throw err;
      }
    }
  }
}
