import type { Database as SqlDatabase } from 'sql.js';
import type {
  ApiTestCollectionRecord,
  ApiTestFolderRecord,
  ApiTestRequestRecord,
  ApiTestEnvironmentRecord,
  ApiTestVariableRecord,
  ApiTestHistoryRecord,
  ApiTestRunRecord,
  ApiTestRunResultRecord
} from '../../shared/types';

export class ApiTestingRepository {
  constructor(
    private readonly getDb: () => SqlDatabase,
    private readonly schedulePersist?: () => void
  ) {}

  // ---------------------------------------------------------------------------
  // Collections
  // ---------------------------------------------------------------------------

  getCollections(): ApiTestCollectionRecord[] {
    const db = this.getDb();
    const stmt = db.prepare(
      'SELECT id, name, description, auth_type, auth_config_json, variables_json, sort_order, created_at, updated_at FROM api_test_collections ORDER BY sort_order ASC, name ASC'
    );
    const collections: ApiTestCollectionRecord[] = [];
    try {
      while (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;
        collections.push({
          id: String(row.id),
          name: String(row.name),
          description: row.description ? String(row.description) : undefined,
          authType: String(row.auth_type),
          authConfigJson: row.auth_config_json ? String(row.auth_config_json) : undefined,
          variablesJson: row.variables_json ? String(row.variables_json) : undefined,
          sortOrder: Number(row.sort_order || 0),
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at)
        });
      }
    } finally {
      stmt.free();
    }
    return collections;
  }

  getCollection(id: string): ApiTestCollectionRecord | null {
    const db = this.getDb();
    const stmt = db.prepare(
      'SELECT id, name, description, auth_type, auth_config_json, variables_json, sort_order, created_at, updated_at FROM api_test_collections WHERE id = ?'
    );
    try {
      stmt.bind([id]);
      if (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;
        return {
          id: String(row.id),
          name: String(row.name),
          description: row.description ? String(row.description) : undefined,
          authType: String(row.auth_type),
          authConfigJson: row.auth_config_json ? String(row.auth_config_json) : undefined,
          variablesJson: row.variables_json ? String(row.variables_json) : undefined,
          sortOrder: Number(row.sort_order || 0),
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at)
        };
      }
      return null;
    } finally {
      stmt.free();
    }
  }

  createCollection(collection: ApiTestCollectionRecord): void {
    const db = this.getDb();
    db.run(
      `INSERT INTO api_test_collections (id, name, description, auth_type, auth_config_json, variables_json, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        collection.id,
        collection.name,
        collection.description ?? null,
        collection.authType,
        collection.authConfigJson ?? null,
        collection.variablesJson ?? null,
        collection.sortOrder ?? 0,
        collection.createdAt,
        collection.updatedAt
      ]
    );
    this.schedulePersist?.();
  }

  updateCollection(id: string, updates: Partial<ApiTestCollectionRecord>): void {
    const db = this.getDb();
    const current = this.getCollection(id);
    if (!current) return;

    const merged = { ...current, ...updates, updatedAt: Date.now() };
    db.run(
      `UPDATE api_test_collections
       SET name = ?, description = ?, auth_type = ?, auth_config_json = ?, variables_json = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
      [
        merged.name,
        merged.description ?? null,
        merged.authType,
        merged.authConfigJson ?? null,
        merged.variablesJson ?? null,
        merged.sortOrder,
        merged.updatedAt,
        id
      ]
    );
    this.schedulePersist?.();
  }

  deleteCollection(id: string): void {
    const db = this.getDb();
    db.run('DELETE FROM api_test_collections WHERE id = ?', [id]);
    this.schedulePersist?.();
  }

  reorderCollections(items: { id: string; sortOrder: number }[]): void {
    const db = this.getDb();
    for (const item of items) {
      db.run('UPDATE api_test_collections SET sort_order = ? WHERE id = ?', [item.sortOrder, item.id]);
    }
    this.schedulePersist?.();
  }

  // ---------------------------------------------------------------------------
  // Folders
  // ---------------------------------------------------------------------------

  getFolders(collectionId?: string): ApiTestFolderRecord[] {
    const db = this.getDb();
    const sql = collectionId
      ? 'SELECT id, collection_id, parent_folder_id, name, description, auth_type, auth_config_json, sort_order, created_at, updated_at FROM api_test_folders WHERE collection_id = ? ORDER BY sort_order ASC, name ASC'
      : 'SELECT id, collection_id, parent_folder_id, name, description, auth_type, auth_config_json, sort_order, created_at, updated_at FROM api_test_folders ORDER BY sort_order ASC, name ASC';
    const stmt = db.prepare(sql);
    const folders: ApiTestFolderRecord[] = [];
    try {
      if (collectionId) {
        stmt.bind([collectionId]);
      }
      while (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;
        folders.push({
          id: String(row.id),
          collectionId: String(row.collection_id),
          parentFolderId: row.parent_folder_id ? String(row.parent_folder_id) : undefined,
          name: String(row.name),
          description: row.description ? String(row.description) : undefined,
          authType: String(row.auth_type),
          authConfigJson: row.auth_config_json ? String(row.auth_config_json) : undefined,
          sortOrder: Number(row.sort_order || 0),
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at)
        });
      }
    } finally {
      stmt.free();
    }
    return folders;
  }

  getFolder(id: string): ApiTestFolderRecord | null {
    const db = this.getDb();
    const stmt = db.prepare(
      'SELECT id, collection_id, parent_folder_id, name, description, auth_type, auth_config_json, sort_order, created_at, updated_at FROM api_test_folders WHERE id = ?'
    );
    try {
      stmt.bind([id]);
      if (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;
        return {
          id: String(row.id),
          collectionId: String(row.collection_id),
          parentFolderId: row.parent_folder_id ? String(row.parent_folder_id) : undefined,
          name: String(row.name),
          description: row.description ? String(row.description) : undefined,
          authType: String(row.auth_type),
          authConfigJson: row.auth_config_json ? String(row.auth_config_json) : undefined,
          sortOrder: Number(row.sort_order || 0),
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at)
        };
      }
      return null;
    } finally {
      stmt.free();
    }
  }

  createFolder(folder: ApiTestFolderRecord): void {
    const db = this.getDb();
    db.run(
      `INSERT INTO api_test_folders (id, collection_id, parent_folder_id, name, description, auth_type, auth_config_json, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        folder.id,
        folder.collectionId,
        folder.parentFolderId ?? null,
        folder.name,
        folder.description ?? null,
        folder.authType,
        folder.authConfigJson ?? null,
        folder.sortOrder ?? 0,
        folder.createdAt,
        folder.updatedAt
      ]
    );
    this.schedulePersist?.();
  }

  updateFolder(id: string, updates: Partial<ApiTestFolderRecord>): void {
    const db = this.getDb();
    const current = this.getFolder(id);
    if (!current) return;

    const merged = { ...current, ...updates, updatedAt: Date.now() };
    db.run(
      `UPDATE api_test_folders
       SET name = ?, description = ?, parent_folder_id = ?, auth_type = ?, auth_config_json = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
      [
        merged.name,
        merged.description ?? null,
        merged.parentFolderId ?? null,
        merged.authType,
        merged.authConfigJson ?? null,
        merged.sortOrder,
        merged.updatedAt,
        id
      ]
    );
    this.schedulePersist?.();
  }

  deleteFolder(id: string): void {
    const db = this.getDb();
    db.run('DELETE FROM api_test_folders WHERE id = ?', [id]);
    this.schedulePersist?.();
  }

  reorderFolders(items: { id: string; sortOrder: number }[]): void {
    const db = this.getDb();
    for (const item of items) {
      db.run('UPDATE api_test_folders SET sort_order = ? WHERE id = ?', [item.sortOrder, item.id]);
    }
    this.schedulePersist?.();
  }

  // ---------------------------------------------------------------------------
  // Requests
  // ---------------------------------------------------------------------------

  getRequests(collectionId?: string, folderId?: string): ApiTestRequestRecord[] {
    const db = this.getDb();
    let sql = 'SELECT id, collection_id, folder_id, name, method, url, params_json, headers_json, body_type, body_content, auth_type, auth_config_json, pre_request_script, test_script, settings_json, sort_order, created_at, updated_at FROM api_test_requests';
    const params: (string | number | null)[] = [];

    if (collectionId && folderId !== undefined) {
      sql += ' WHERE collection_id = ? AND folder_id = ?';
      params.push(collectionId, folderId);
    } else if (collectionId) {
      sql += ' WHERE collection_id = ?';
      params.push(collectionId);
    }
    sql += ' ORDER BY sort_order ASC, name ASC';

    const stmt = db.prepare(sql);
    const requests: ApiTestRequestRecord[] = [];
    try {
      if (params.length > 0) {
        stmt.bind(params);
      }
      while (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;
        requests.push({
          id: String(row.id),
          collectionId: row.collection_id ? String(row.collection_id) : undefined,
          folderId: row.folder_id ? String(row.folder_id) : undefined,
          name: String(row.name),
          method: String(row.method),
          url: String(row.url),
          paramsJson: String(row.params_json || '[]'),
          headersJson: String(row.headers_json || '[]'),
          bodyType: String(row.body_type || 'none'),
          bodyContent: row.body_content ? String(row.body_content) : undefined,
          authType: String(row.auth_type || 'inherit'),
          authConfigJson: row.auth_config_json ? String(row.auth_config_json) : undefined,
          preRequestScript: row.pre_request_script ? String(row.pre_request_script) : undefined,
          testScript: row.test_script ? String(row.test_script) : undefined,
          settingsJson: row.settings_json ? String(row.settings_json) : undefined,
          sortOrder: Number(row.sort_order || 0),
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at)
        });
      }
    } finally {
      stmt.free();
    }
    return requests;
  }

  getRequest(id: string): ApiTestRequestRecord | null {
    const db = this.getDb();
    const stmt = db.prepare(
      'SELECT id, collection_id, folder_id, name, method, url, params_json, headers_json, body_type, body_content, auth_type, auth_config_json, pre_request_script, test_script, settings_json, sort_order, created_at, updated_at FROM api_test_requests WHERE id = ?'
    );
    try {
      stmt.bind([id]);
      if (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;
        return {
          id: String(row.id),
          collectionId: row.collection_id ? String(row.collection_id) : undefined,
          folderId: row.folder_id ? String(row.folder_id) : undefined,
          name: String(row.name),
          method: String(row.method),
          url: String(row.url),
          paramsJson: String(row.params_json || '[]'),
          headersJson: String(row.headers_json || '[]'),
          bodyType: String(row.body_type || 'none'),
          bodyContent: row.body_content ? String(row.body_content) : undefined,
          authType: String(row.auth_type || 'inherit'),
          authConfigJson: row.auth_config_json ? String(row.auth_config_json) : undefined,
          preRequestScript: row.pre_request_script ? String(row.pre_request_script) : undefined,
          testScript: row.test_script ? String(row.test_script) : undefined,
          settingsJson: row.settings_json ? String(row.settings_json) : undefined,
          sortOrder: Number(row.sort_order || 0),
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at)
        };
      }
      return null;
    } finally {
      stmt.free();
    }
  }

  saveRequest(req: ApiTestRequestRecord): void {
    const db = this.getDb();
    const exists = this.getRequest(req.id);
    if (exists) {
      db.run(
        `UPDATE api_test_requests
         SET collection_id = ?, folder_id = ?, name = ?, method = ?, url = ?, params_json = ?, headers_json = ?, body_type = ?, body_content = ?, auth_type = ?, auth_config_json = ?, pre_request_script = ?, test_script = ?, settings_json = ?, sort_order = ?, updated_at = ?
         WHERE id = ?`,
        [
          req.collectionId ?? null,
          req.folderId ?? null,
          req.name,
          req.method,
          req.url,
          req.paramsJson,
          req.headersJson,
          req.bodyType,
          req.bodyContent ?? null,
          req.authType,
          req.authConfigJson ?? null,
          req.preRequestScript ?? null,
          req.testScript ?? null,
          req.settingsJson ?? null,
          req.sortOrder ?? 0,
          req.updatedAt,
          req.id
        ]
      );
    } else {
      db.run(
        `INSERT INTO api_test_requests (id, collection_id, folder_id, name, method, url, params_json, headers_json, body_type, body_content, auth_type, auth_config_json, pre_request_script, test_script, settings_json, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.id,
          req.collectionId ?? null,
          req.folderId ?? null,
          req.name,
          req.method,
          req.url,
          req.paramsJson,
          req.headersJson,
          req.bodyType,
          req.bodyContent ?? null,
          req.authType,
          req.authConfigJson ?? null,
          req.preRequestScript ?? null,
          req.testScript ?? null,
          req.settingsJson ?? null,
          req.sortOrder ?? 0,
          req.createdAt,
          req.updatedAt
        ]
      );
    }
    this.schedulePersist?.();
  }

  deleteRequest(id: string): void {
    const db = this.getDb();
    db.run('DELETE FROM api_test_requests WHERE id = ?', [id]);
    this.schedulePersist?.();
  }

  reorderRequests(items: { id: string; sortOrder: number }[]): void {
    const db = this.getDb();
    for (const item of items) {
      db.run('UPDATE api_test_requests SET sort_order = ? WHERE id = ?', [item.sortOrder, item.id]);
    }
    this.schedulePersist?.();
  }

  // ---------------------------------------------------------------------------
  // Environments & Variables
  // ---------------------------------------------------------------------------

  getEnvironments(): ApiTestEnvironmentRecord[] {
    const db = this.getDb();
    const stmt = db.prepare('SELECT id, name, is_active, created_at, updated_at FROM api_test_environments ORDER BY name ASC');
    const environments: ApiTestEnvironmentRecord[] = [];
    try {
      while (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;
        environments.push({
          id: String(row.id),
          name: String(row.name),
          isActive: Number(row.is_active) === 1,
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at)
        });
      }
    } finally {
      stmt.free();
    }
    return environments;
  }

  getEnvironment(id: string): ApiTestEnvironmentRecord | null {
    const db = this.getDb();
    const stmt = db.prepare('SELECT id, name, is_active, created_at, updated_at FROM api_test_environments WHERE id = ?');
    try {
      stmt.bind([id]);
      if (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;
        return {
          id: String(row.id),
          name: String(row.name),
          isActive: Number(row.is_active) === 1,
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at)
        };
      }
      return null;
    } finally {
      stmt.free();
    }
  }

  saveEnvironment(env: ApiTestEnvironmentRecord): void {
    const db = this.getDb();
    const exists = this.getEnvironment(env.id);
    if (exists) {
      db.run(
        'UPDATE api_test_environments SET name = ?, is_active = ?, updated_at = ? WHERE id = ?',
        [env.name, env.isActive ? 1 : 0, env.updatedAt, env.id]
      );
    } else {
      db.run(
        'INSERT INTO api_test_environments (id, name, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [env.id, env.name, env.isActive ? 1 : 0, env.createdAt, env.updatedAt]
      );
    }
    this.schedulePersist?.();
  }

  deleteEnvironment(id: string): void {
    const db = this.getDb();
    db.run('DELETE FROM api_test_environments WHERE id = ?', [id]);
    this.schedulePersist?.();
  }

  setActiveEnvironment(id: string | null): void {
    const db = this.getDb();
    db.run('UPDATE api_test_environments SET is_active = 0');
    if (id) {
      db.run('UPDATE api_test_environments SET is_active = 1 WHERE id = ?', [id]);
    }
    this.schedulePersist?.();
  }

  getActiveEnvironment(): ApiTestEnvironmentRecord | null {
    const db = this.getDb();
    const stmt = db.prepare('SELECT id, name, is_active, created_at, updated_at FROM api_test_environments WHERE is_active = 1 LIMIT 1');
    try {
      if (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;
        return {
          id: String(row.id),
          name: String(row.name),
          isActive: true,
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at)
        };
      }
      return null;
    } finally {
      stmt.free();
    }
  }

  getVariables(environmentId?: string | null, collectionId?: string | null): ApiTestVariableRecord[] {
    const db = this.getDb();
    let sql = 'SELECT id, environment_id, collection_id, key, initial_value, current_value, is_secret, secret_ref, description, enabled, updated_at FROM api_test_variables';
    const params: (string | number | null)[] = [];

    if (environmentId !== undefined && collectionId !== undefined) {
      sql += ' WHERE environment_id = ? AND collection_id = ?';
      params.push(environmentId, collectionId);
    } else if (environmentId !== undefined) {
      sql += environmentId === null ? ' WHERE environment_id IS NULL' : ' WHERE environment_id = ?';
      if (environmentId !== null) params.push(environmentId);
    } else if (collectionId !== undefined) {
      sql += collectionId === null ? ' WHERE collection_id IS NULL' : ' WHERE collection_id = ?';
      if (collectionId !== null) params.push(collectionId);
    }
    sql += ' ORDER BY key ASC';

    const stmt = db.prepare(sql);
    const variables: ApiTestVariableRecord[] = [];
    try {
      if (params.length > 0) stmt.bind(params);
      while (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;
        variables.push({
          id: String(row.id),
          environmentId: row.environment_id ? String(row.environment_id) : undefined,
          collectionId: row.collection_id ? String(row.collection_id) : undefined,
          key: String(row.key),
          initialValue: String(row.initial_value || ''),
          currentValue: String(row.current_value || ''),
          isSecret: Number(row.is_secret) === 1,
          secretRef: row.secret_ref ? String(row.secret_ref) : undefined,
          description: row.description ? String(row.description) : undefined,
          enabled: Number(row.enabled) === 1,
          updatedAt: Number(row.updated_at)
        });
      }
    } finally {
      stmt.free();
    }
    return variables;
  }

  saveVariable(v: ApiTestVariableRecord): void {
    const db = this.getDb();
    db.run(
      `INSERT INTO api_test_variables (id, environment_id, collection_id, key, initial_value, current_value, is_secret, secret_ref, description, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         environment_id = excluded.environment_id,
         collection_id = excluded.collection_id,
         key = excluded.key,
         initial_value = excluded.initial_value,
         current_value = excluded.current_value,
         is_secret = excluded.is_secret,
         secret_ref = excluded.secret_ref,
         description = excluded.description,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
      [
        v.id,
        v.environmentId ?? null,
        v.collectionId ?? null,
        v.key,
        v.initialValue,
        v.currentValue,
        v.isSecret ? 1 : 0,
        v.secretRef ?? null,
        v.description ?? null,
        v.enabled ? 1 : 0,
        v.updatedAt
      ]
    );
    this.schedulePersist?.();
  }

  deleteVariable(id: string): void {
    const db = this.getDb();
    db.run('DELETE FROM api_test_variables WHERE id = ?', [id]);
    this.schedulePersist?.();
  }

  replaceEnvironmentVariables(environmentId: string, variables: ApiTestVariableRecord[]): void {
    const db = this.getDb();
    db.run('DELETE FROM api_test_variables WHERE environment_id = ?', [environmentId]);
    for (const v of variables) {
      this.saveVariable(v);
    }
    this.schedulePersist?.();
  }

  // ---------------------------------------------------------------------------
  // History & Runs
  // ---------------------------------------------------------------------------

  getHistory(limit = 100, search?: string): ApiTestHistoryRecord[] {
    const db = this.getDb();
    let sql = 'SELECT id, request_id, method, url, status_code, status_text, duration_ms, response_size_bytes, environment_name, collection_id, request_summary_json, response_summary_json, executed_at FROM api_test_history';
    const params: (string | number | null)[] = [];

    if (search) {
      sql += ' WHERE url LIKE ? OR method LIKE ?';
      const term = `%${search}%`;
      params.push(term, term);
    }
    sql += ' ORDER BY executed_at DESC LIMIT ?';
    params.push(limit);

    const stmt = db.prepare(sql);
    const history: ApiTestHistoryRecord[] = [];
    try {
      stmt.bind(params);
      while (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;
        history.push({
          id: String(row.id),
          requestId: row.request_id ? String(row.request_id) : undefined,
          method: String(row.method),
          url: String(row.url),
          statusCode: Number(row.status_code),
          statusText: String(row.status_text),
          durationMs: Number(row.duration_ms),
          responseSizeBytes: Number(row.response_size_bytes),
          environmentName: row.environment_name ? String(row.environment_name) : undefined,
          collectionId: row.collection_id ? String(row.collection_id) : undefined,
          requestSummaryJson: row.request_summary_json ? String(row.request_summary_json) : undefined,
          responseSummaryJson: row.response_summary_json ? String(row.response_summary_json) : undefined,
          executedAt: Number(row.executed_at)
        });
      }
    } finally {
      stmt.free();
    }
    return history;
  }

  addHistory(item: ApiTestHistoryRecord): void {
    const db = this.getDb();
    db.run(
      `INSERT INTO api_test_history (id, request_id, method, url, status_code, status_text, duration_ms, response_size_bytes, environment_name, collection_id, request_summary_json, response_summary_json, executed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.requestId ?? null,
        item.method,
        item.url,
        item.statusCode,
        item.statusText,
        item.durationMs,
        item.responseSizeBytes,
        item.environmentName ?? null,
        item.collectionId ?? null,
        item.requestSummaryJson ?? null,
        item.responseSummaryJson ?? null,
        item.executedAt
      ]
    );
    this.schedulePersist?.();
  }

  clearHistory(): void {
    const db = this.getDb();
    db.run('DELETE FROM api_test_history');
    this.schedulePersist?.();
  }

  createRun(run: ApiTestRunRecord): void {
    const db = this.getDb();
    db.run(
      `INSERT INTO api_test_runs (id, collection_id, environment_id, iteration_count, total_requests, passed_assertions, failed_assertions, duration_ms, status, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        run.id,
        run.collectionId,
        run.environmentId ?? null,
        run.iterationCount,
        run.totalRequests,
        run.passedAssertions,
        run.failedAssertions,
        run.durationMs,
        run.status,
        run.startedAt,
        run.completedAt
      ]
    );
    this.schedulePersist?.();
  }

  updateRun(id: string, updates: Partial<ApiTestRunRecord>): void {
    const db = this.getDb();
    const current = this.getRun(id);
    if (!current) return;

    const merged = { ...current, ...updates };
    db.run(
      `UPDATE api_test_runs
       SET total_requests = ?, passed_assertions = ?, failed_assertions = ?, duration_ms = ?, status = ?, completed_at = ?
       WHERE id = ?`,
      [
        merged.totalRequests,
        merged.passedAssertions,
        merged.failedAssertions,
        merged.durationMs,
        merged.status,
        merged.completedAt,
        id
      ]
    );
    this.schedulePersist?.();
  }

  addRunResult(result: ApiTestRunResultRecord): void {
    const db = this.getDb();
    db.run(
      `INSERT INTO api_test_run_results (id, run_id, iteration, request_id, request_name, method, url, status_code, duration_ms, assertions_json, error_message, executed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.id,
        result.runId,
        result.iteration,
        result.requestId,
        result.requestName,
        result.method,
        result.url,
        result.statusCode ?? null,
        result.durationMs,
        result.assertionsJson,
        result.errorMessage ?? null,
        result.executedAt
      ]
    );
    this.schedulePersist?.();
  }

  getRun(id: string): ApiTestRunRecord | null {
    const db = this.getDb();
    const stmt = db.prepare(
      'SELECT id, collection_id, environment_id, iteration_count, total_requests, passed_assertions, failed_assertions, duration_ms, status, started_at, completed_at FROM api_test_runs WHERE id = ?'
    );
    try {
      stmt.bind([id]);
      if (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;
        return {
          id: String(row.id),
          collectionId: String(row.collection_id),
          environmentId: row.environment_id ? String(row.environment_id) : undefined,
          iterationCount: Number(row.iteration_count),
          totalRequests: Number(row.total_requests),
          passedAssertions: Number(row.passed_assertions),
          failedAssertions: Number(row.failed_assertions),
          durationMs: Number(row.duration_ms),
          status: String(row.status) as 'completed' | 'failed' | 'cancelled',
          startedAt: Number(row.started_at),
          completedAt: Number(row.completed_at)
        };
      }
      return null;
    } finally {
      stmt.free();
    }
  }

  getRunResults(runId: string): ApiTestRunResultRecord[] {
    const db = this.getDb();
    const stmt = db.prepare(
      'SELECT id, run_id, iteration, request_id, request_name, method, url, status_code, duration_ms, assertions_json, error_message, executed_at FROM api_test_run_results WHERE run_id = ? ORDER BY iteration ASC, executed_at ASC'
    );
    const results: ApiTestRunResultRecord[] = [];
    try {
      stmt.bind([runId]);
      while (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;
        results.push({
          id: String(row.id),
          runId: String(row.run_id),
          iteration: Number(row.iteration),
          requestId: String(row.request_id),
          requestName: String(row.request_name),
          method: String(row.method),
          url: String(row.url),
          statusCode: row.status_code !== null ? Number(row.status_code) : undefined,
          durationMs: Number(row.duration_ms),
          assertionsJson: String(row.assertions_json),
          errorMessage: row.error_message ? String(row.error_message) : undefined,
          executedAt: Number(row.executed_at)
        });
      }
    } finally {
      stmt.free();
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle Segregation
  // ---------------------------------------------------------------------------

  clearTransientHistory(): void {
    const db = this.getDb();
    db.run('DELETE FROM api_test_history');
    db.run('DELETE FROM api_test_run_results');
    db.run('DELETE FROM api_test_runs');
    this.schedulePersist?.();
  }
}
