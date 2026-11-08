import type { Database as SqlDatabase } from 'sql.js';
import { randomUUID } from 'node:crypto';
import type {
  AiProviderInfo,
  AiModelUsage,
  AiUsageRecord,
  AiPricingModel,
  AiBudgetConfig,
  AiOverviewSummary,
  AiTimeSeriesPoint
} from '../../shared/types';

export class AiIntelligenceRepository {
  constructor(private readonly getDb: () => SqlDatabase) {}

  saveUsageRecord(record: Omit<AiUsageRecord, 'id'>): AiUsageRecord {
    const id = randomUUID();
    const fullRecord: AiUsageRecord = { ...record, id };

    try {
      const db = this.getDb();
      db.run(
        `INSERT OR IGNORE INTO ai_usage_records (
          id, workspace_id, provider, model, input_tokens, output_tokens,
          total_tokens, request_count, duration_ms, estimated_cost, currency,
          source, request_type, pricing_snapshot_json, timestamp, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          record.workspaceId ?? null,
          record.provider,
          record.model,
          record.inputTokens ?? 0,
          record.outputTokens ?? 0,
          record.totalTokens ?? 0,
          record.requestCount ?? 1,
          record.durationMs ?? null,
          record.estimatedCost ?? 0,
          record.currency ?? 'USD',
          record.source,
          record.requestType ?? 'chat',
          record.pricingSnapshotJson ?? null,
          record.timestamp,
          record.idempotencyKey ?? null
        ]
      );
    } catch (err) {
      console.warn('[DevPulse AiIntelligenceRepository] Failed to insert usage record:', err);
    }

    return fullRecord;
  }

  hasRecordByIdempotencyKey(key: string): boolean {
    try {
      const db = this.getDb();
      const stmt = db.prepare('SELECT 1 FROM ai_usage_records WHERE idempotency_key = ? LIMIT 1');
      stmt.bind([key]);
      const exists = stmt.step();
      stmt.free();
      return exists;
    } catch {
      return false;
    }
  }

  hasRecordWithSourceAndTimestamp(source: string, timestamp: number): boolean {
    try {
      const db = this.getDb();
      const stmt = db.prepare('SELECT 1 FROM ai_usage_records WHERE source = ? AND timestamp = ? LIMIT 1');
      stmt.bind([source, timestamp]);
      const exists = stmt.step();
      stmt.free();
      return exists;
    } catch {
      return false;
    }
  }

  getUsageRecords(options?: {
    provider?: string;
    model?: string;
    since?: number;
    limit?: number;
    offset?: number;
    workspaceId?: string;
  }): AiUsageRecord[] {
    try {
      const db = this.getDb();
      let query = `
        SELECT 
          id, workspace_id, provider, model, input_tokens, output_tokens,
          total_tokens, request_count, duration_ms, estimated_cost, currency,
          source, request_type, pricing_snapshot_json, timestamp
        FROM ai_usage_records
        WHERE 1=1
      `;
      const params: (string | number)[] = [];

      if (options?.workspaceId) {
        query += ' AND (workspace_id = ? OR workspace_id IS NULL)';
        params.push(options.workspaceId);
      }
      if (options?.provider) {
        query += ' AND LOWER(provider) = ?';
        params.push(options.provider.toLowerCase());
      }
      if (options?.model) {
        query += ' AND LOWER(model) = ?';
        params.push(options.model.toLowerCase());
      }
      if (options?.since) {
        query += ' AND timestamp >= ?';
        params.push(options.since);
      }

      query += ' ORDER BY timestamp DESC';

      if (options?.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
        if (options?.offset) {
          query += ' OFFSET ?';
          params.push(options.offset);
        }
      }

      const stmt = db.prepare(query);
      stmt.bind(params);
      const records: AiUsageRecord[] = [];

      while (stmt.step()) {
        const row = stmt.getAsObject();
        records.push({
          id: String(row.id),
          workspaceId: row.workspace_id ? String(row.workspace_id) : undefined,
          provider: String(row.provider),
          model: String(row.model),
          inputTokens: Number(row.input_tokens) || 0,
          outputTokens: Number(row.output_tokens) || 0,
          totalTokens: Number(row.total_tokens) || 0,
          requestCount: Number(row.request_count) || 1,
          durationMs: row.duration_ms ? Number(row.duration_ms) : undefined,
          estimatedCost: Number(row.estimated_cost) || 0,
          currency: String(row.currency || 'USD'),
          source: String(row.source),
          requestType: row.request_type ? String(row.request_type) : undefined,
          pricingSnapshotJson: row.pricing_snapshot_json ? String(row.pricing_snapshot_json) : undefined,
          timestamp: Number(row.timestamp)
        });
      }
      stmt.free();
      return records;
    } catch {
      return [];
    }
  }

  getSummary(since?: number, workspaceId?: string): AiOverviewSummary {
    try {
      const db = this.getDb();
      let query = `
        SELECT 
          COUNT(*) as total_rows,
          COALESCE(SUM(request_count), 0) as total_requests,
          COALESCE(SUM(input_tokens), 0) as total_input_tokens,
          COALESCE(SUM(output_tokens), 0) as total_output_tokens,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COALESCE(SUM(estimated_cost), 0) as total_cost,
          COUNT(DISTINCT provider) as active_providers,
          COUNT(DISTINCT model) as models_used
        FROM ai_usage_records
        WHERE 1=1
      `;
      const params: (string | number)[] = [];
      if (workspaceId) {
        query += ' AND (workspace_id = ? OR workspace_id IS NULL)';
        params.push(workspaceId);
      }
      if (since) {
        query += ' AND timestamp >= ?';
        params.push(since);
      }

      const stmt = db.prepare(query);
      stmt.bind(params);
      let summary: AiOverviewSummary = {
        totalRequests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        activeProvidersCount: 0,
        modelsCount: 0,
        todayCost: 0,
        todayTokens: 0,
        todayRequests: 0
      };

      if (stmt.step()) {
        const row = stmt.getAsObject();
        summary = {
          totalRequests: Number(row.total_requests) || 0,
          inputTokens: Number(row.total_input_tokens) || 0,
          outputTokens: Number(row.total_output_tokens) || 0,
          totalTokens: Number(row.total_tokens) || 0,
          estimatedCost: Math.round((Number(row.total_cost) || 0) * 10000) / 10000,
          activeProvidersCount: Number(row.active_providers) || 0,
          modelsCount: Number(row.models_used) || 0,
          todayCost: 0,
          todayTokens: 0,
          todayRequests: 0
        };
      }
      stmt.free();

      // Calculate today metrics (midnight start of current day)
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      let todayQuery = `
        SELECT 
          COALESCE(SUM(request_count), 0) as today_requests,
          COALESCE(SUM(total_tokens), 0) as today_tokens,
          COALESCE(SUM(estimated_cost), 0) as today_cost
        FROM ai_usage_records
        WHERE timestamp >= ?
      `;
      const todayParams: (string | number)[] = [startOfDay.getTime()];
      if (workspaceId) {
        todayQuery += ' AND (workspace_id = ? OR workspace_id IS NULL)';
        todayParams.push(workspaceId);
      }
      const todayStmt = db.prepare(todayQuery);
      todayStmt.bind(todayParams);
      if (todayStmt.step()) {
        const todayRow = todayStmt.getAsObject();
        summary.todayRequests = Number(todayRow.today_requests) || 0;
        summary.todayTokens = Number(todayRow.today_tokens) || 0;
        summary.todayCost = Math.round((Number(todayRow.today_cost) || 0) * 10000) / 10000;
      }
      todayStmt.free();

      return summary;
    } catch {
      return {
        totalRequests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        activeProvidersCount: 0,
        modelsCount: 0,
        todayCost: 0,
        todayTokens: 0,
        todayRequests: 0
      };
    }
  }

  getModelStats(since?: number): AiModelUsage[] {
    try {
      const db = this.getDb();
      let query = `
        SELECT 
          model,
          provider,
          COALESCE(SUM(request_count), 0) as request_count,
          COALESCE(SUM(input_tokens), 0) as input_tokens,
          COALESCE(SUM(output_tokens), 0) as output_tokens,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COALESCE(SUM(estimated_cost), 0) as total_cost,
          MAX(timestamp) as last_used_at
        FROM ai_usage_records
        WHERE 1=1
      `;
      const params: (string | number)[] = [];
      if (since) {
        query += ' AND timestamp >= ?';
        params.push(since);
      }
      query += ' GROUP BY model, provider ORDER BY total_tokens DESC';

      const stmt = db.prepare(query);
      stmt.bind(params);
      const models: AiModelUsage[] = [];

      while (stmt.step()) {
        const row = stmt.getAsObject();
        const reqCount = Number(row.request_count) || 1;
        const totalTok = Number(row.total_tokens) || 0;
        models.push({
          model: String(row.model),
          provider: String(row.provider),
          requestCount: reqCount,
          inputTokens: Number(row.input_tokens) || 0,
          outputTokens: Number(row.output_tokens) || 0,
          totalTokens: totalTok,
          avgTokensPerRequest: reqCount > 0 ? Math.round(totalTok / reqCount) : 0,
          estimatedCost: Math.round((Number(row.total_cost) || 0) * 10000) / 10000,
          lastUsedAt: Number(row.last_used_at) || 0
        });
      }
      stmt.free();
      return models;
    } catch {
      return [];
    }
  }

  getTimeSeries(since?: number): AiTimeSeriesPoint[] {
    try {
      const db = this.getDb();
      let query = `
        SELECT 
          timestamp,
          input_tokens,
          output_tokens,
          total_tokens,
          estimated_cost,
          request_count,
          provider,
          model
        FROM ai_usage_records
        WHERE 1=1
      `;
      const params: (string | number)[] = [];
      if (since) {
        query += ' AND timestamp >= ?';
        params.push(since);
      }
      query += ' ORDER BY timestamp ASC';

      const stmt = db.prepare(query);
      stmt.bind(params);
      const points: AiTimeSeriesPoint[] = [];

      while (stmt.step()) {
        const row = stmt.getAsObject();
        points.push({
          timestamp: Number(row.timestamp),
          inputTokens: Number(row.input_tokens) || 0,
          outputTokens: Number(row.output_tokens) || 0,
          totalTokens: Number(row.total_tokens) || 0,
          estimatedCost: Number(row.estimated_cost) || 0,
          requestCount: Number(row.request_count) || 1,
          provider: String(row.provider),
          model: String(row.model)
        });
      }
      stmt.free();
      return points;
    } catch {
      return [];
    }
  }

  saveProvider(provider: AiProviderInfo): void {
    try {
      const db = this.getDb();
      db.run(
        `INSERT OR REPLACE INTO ai_providers (
          id, name, status, endpoint, is_local, models_json, last_synced_at, created_at,
          connection_status, usage_tracking_status, model_catalog_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          provider.id,
          provider.name,
          provider.status,
          provider.endpoint ?? null,
          provider.isLocal ? 1 : 0,
          JSON.stringify(provider.availableModels ?? []),
          provider.lastSyncedAt ?? Date.now(),
          provider.createdAt ?? Date.now(),
          provider.connectionStatus ?? (provider.status === 'connected' ? 'connected' : 'disconnected'),
          provider.usageTrackingStatus ?? (provider.isLocal ? 'usage_tracking_active' : 'usage_tracking_inactive'),
          provider.modelCatalogStatus ?? (provider.availableModels && provider.availableModels.length > 0 ? 'model_catalog_available' : 'model_catalog_unavailable')
        ]
      );
    } catch (err) {
      console.warn('[DevPulse AiIntelligenceRepository] Failed to save provider:', err);
    }
  }

  getProviders(): AiProviderInfo[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(`
        SELECT p.id, p.name, p.status, p.endpoint, p.is_local, p.models_json, p.last_synced_at, p.created_at,
               p.connection_status, p.usage_tracking_status, p.model_catalog_status,
               COALESCE(u.cnt, 0) as request_count
        FROM ai_providers p
        LEFT JOIN (
          SELECT provider, COUNT(*) as cnt
          FROM ai_usage_records
          GROUP BY provider
        ) u ON lower(u.provider) = lower(p.id)
        ORDER BY p.is_local DESC, p.name ASC
      `);
      const providers: AiProviderInfo[] = [];

      while (stmt.step()) {
        const row = stmt.getAsObject();
        let models: string[] = [];
        try {
          if (row.models_json) models = JSON.parse(String(row.models_json));
        } catch {}

        providers.push({
          id: String(row.id),
          name: String(row.name),
          status: String(row.status) as AiProviderInfo['status'],
          endpoint: row.endpoint ? String(row.endpoint) : undefined,
          isLocal: Boolean(row.is_local),
          availableModels: models,
          lastSyncedAt: row.last_synced_at ? Number(row.last_synced_at) : undefined,
          createdAt: Number(row.created_at) || Date.now(),
          connectionStatus: row.connection_status ? String(row.connection_status) as any : undefined,
          usageTrackingStatus: row.usage_tracking_status ? String(row.usage_tracking_status) as any : undefined,
          modelCatalogStatus: row.model_catalog_status ? String(row.model_catalog_status) as any : undefined,
          requestCount: Number(row.request_count) || 0
        });
      }
      stmt.free();
      return providers;
    } catch {
      return [];
    }
  }

  getPricing(): AiPricingModel[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(`
        SELECT id, provider, model_pattern, input_cost_per_million, output_cost_per_million, is_custom, updated_at
        FROM ai_pricing
        ORDER BY provider ASC, model_pattern ASC
      `);
      const list: AiPricingModel[] = [];

      while (stmt.step()) {
        const row = stmt.getAsObject();
        list.push({
          id: String(row.id),
          provider: String(row.provider),
          modelPattern: String(row.model_pattern),
          inputCostPerMillion: Number(row.input_cost_per_million),
          outputCostPerMillion: Number(row.output_cost_per_million),
          isCustom: Boolean(row.is_custom),
          updatedAt: Number(row.updated_at)
        });
      }
      stmt.free();
      return list;
    } catch {
      return [];
    }
  }

  deletePricing(id: string): void {
    try {
      const db = this.getDb();
      db.run('DELETE FROM ai_pricing WHERE id = ?', [id]);
    } catch (err) {
      console.warn('[DevPulse AiIntelligenceRepository] Failed to delete pricing:', err);
    }
  }

  savePricing(pricing: Omit<AiPricingModel, 'id'> & { id?: string }): void {
    try {
      const db = this.getDb();
      const id = pricing.id ?? randomUUID();
      db.run(
        `INSERT OR REPLACE INTO ai_pricing (
          id, provider, model_pattern, input_cost_per_million, output_cost_per_million, is_custom, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          pricing.provider,
          pricing.modelPattern,
          pricing.inputCostPerMillion,
          pricing.outputCostPerMillion,
          pricing.isCustom ? 1 : 0,
          Date.now()
        ]
      );
    } catch (err) {
      console.warn('[DevPulse AiIntelligenceRepository] Failed to save pricing:', err);
    }
  }

  getBudgets(): AiBudgetConfig[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(`
        SELECT id, period_type, limit_amount, threshold_percent, provider, model, created_at
        FROM ai_budgets
      `);
      const budgets: AiBudgetConfig[] = [];

      while (stmt.step()) {
        const row = stmt.getAsObject();
        budgets.push({
          id: String(row.id),
          periodType: String(row.period_type) as 'daily' | 'monthly',
          limitAmount: Number(row.limit_amount),
          thresholdPercent: Number(row.threshold_percent),
          provider: row.provider ? String(row.provider) : undefined,
          model: row.model ? String(row.model) : undefined,
          createdAt: Number(row.created_at)
        });
      }
      stmt.free();
      return budgets;
    } catch {
      return [];
    }
  }

  saveBudget(budget: Omit<AiBudgetConfig, 'id'> & { id?: string }): void {
    try {
      const db = this.getDb();
      let id = budget.id;
      if (!id) {
        const stmt = db.prepare(`
          SELECT id FROM ai_budgets 
          WHERE period_type = ? 
            AND (provider IS ? OR provider = ?)
            AND (model IS ? OR model = ?)
          LIMIT 1
        `);
        stmt.bind([
          budget.periodType,
          budget.provider ?? null, budget.provider ?? null,
          budget.model ?? null, budget.model ?? null
        ]);
        if (stmt.step()) {
          id = String(stmt.getAsObject().id);
        }
        stmt.free();
      }
      id = id ?? randomUUID();
      db.run(
        `INSERT OR REPLACE INTO ai_budgets (
          id, period_type, limit_amount, threshold_percent, provider, model, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          budget.periodType,
          budget.limitAmount,
          budget.thresholdPercent ?? 85,
          budget.provider ?? null,
          budget.model ?? null,
          Date.now()
        ]
      );
    } catch (err) {
      console.warn('[DevPulse AiIntelligenceRepository] Failed to save budget:', err);
    }
  }

  clearData(): void {
    try {
      const db = this.getDb();
      db.run('DELETE FROM ai_usage_records');
    } catch (err) {
      console.warn('[DevPulse AiIntelligenceRepository] Clear failed:', err);
    }
  }
}
