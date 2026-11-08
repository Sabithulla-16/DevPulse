import type { Database as SqlDatabase } from 'sql.js';
import { randomUUID } from 'node:crypto';
import type {
  ApiServiceItem,
  ApiEndpointItem,
  ApiRequestEventItem,
  ApiIntelligenceSummary,
  ApiEndpointDetailsData
} from '../../shared/types';

export class ApiIntelligenceRepository {
  constructor(private readonly getDb: () => SqlDatabase) {}

  saveService(service: ApiServiceItem, secretHash: string): void {
    try {
      const db = this.getDb();
      db.run(
        `INSERT OR REPLACE INTO api_services (
          id, name, integration_type, environment, monitoring_enabled,
          secret_hash, total_requests, last_event_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          service.id,
          service.name,
          service.integrationType || 'express',
          service.environment || 'development',
          service.monitoringEnabled ? 1 : 0,
          secretHash,
          service.totalRequests || 0,
          service.lastEventAt ?? null,
          service.createdAt || Date.now(),
          Date.now()
        ]
      );
    } catch (err) {
      console.warn('[DevPulse ApiRepository] Failed to save service:', err);
    }
  }

  getServices(): ApiServiceItem[] {
    const list: ApiServiceItem[] = [];
    try {
      const db = this.getDb();
      const stmt = db.prepare(
        `SELECT id, name, integration_type, environment, monitoring_enabled,
                total_requests, last_event_at, created_at
         FROM api_services
         ORDER BY name ASC`
      );
      while (stmt.step()) {
        const row = stmt.getAsObject();
        list.push({
          id: String(row.id),
          name: String(row.name),
          integrationType: String(row.integration_type || 'express'),
          environment: String(row.environment || 'development'),
          monitoringEnabled: Number(row.monitoring_enabled) === 1,
          totalRequests: Number(row.total_requests || 0),
          lastEventAt: row.last_event_at ? Number(row.last_event_at) : undefined,
          createdAt: Number(row.created_at || 0)
        });
      }
      stmt.free();
    } catch (err) {
      console.warn('[DevPulse ApiRepository] Failed to get services:', err);
    }
    return list;
  }

  getService(id: string): ApiServiceItem | null {
    try {
      const db = this.getDb();
      const stmt = db.prepare(
        `SELECT id, name, integration_type, environment, monitoring_enabled,
                total_requests, last_event_at, created_at
         FROM api_services WHERE id = ?`
      );
      stmt.bind([id]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return {
          id: String(row.id),
          name: String(row.name),
          integrationType: String(row.integration_type || 'express'),
          environment: String(row.environment || 'development'),
          monitoringEnabled: Number(row.monitoring_enabled) === 1,
          totalRequests: Number(row.total_requests || 0),
          lastEventAt: row.last_event_at ? Number(row.last_event_at) : undefined,
          createdAt: Number(row.created_at || 0)
        };
      }
      stmt.free();
    } catch (err) {
      console.warn('[DevPulse ApiRepository] Failed to get service by id:', err);
    }
    return null;
  }

  getServiceBySecretHash(secretHash: string): ApiServiceItem | null {
    try {
      const db = this.getDb();
      const stmt = db.prepare(
        `SELECT id, name, integration_type, environment, monitoring_enabled,
                total_requests, last_event_at, created_at
         FROM api_services WHERE secret_hash = ?`
      );
      stmt.bind([secretHash]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return {
          id: String(row.id),
          name: String(row.name),
          integrationType: String(row.integration_type || 'express'),
          environment: String(row.environment || 'development'),
          monitoringEnabled: Number(row.monitoring_enabled) === 1,
          totalRequests: Number(row.total_requests || 0),
          lastEventAt: row.last_event_at ? Number(row.last_event_at) : undefined,
          createdAt: Number(row.created_at || 0)
        };
      }
      stmt.free();
    } catch (err) {
      console.warn('[DevPulse ApiRepository] Failed to find service by secret hash:', err);
    }
    return null;
  }

  getAllServiceSecretHashes(): Map<string, string> {
    const map = new Map<string, string>(); // secretHash -> serviceId
    try {
      const db = this.getDb();
      const stmt = db.prepare(`SELECT id, secret_hash FROM api_services WHERE monitoring_enabled = 1`);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        if (row.secret_hash && row.id) {
          map.set(String(row.secret_hash), String(row.id));
        }
      }
      stmt.free();
    } catch (err) {
      console.warn('[DevPulse ApiRepository] Failed to load secret hashes:', err);
    }
    return map;
  }

  updateServiceMonitoring(id: string, enabled: boolean): void {
    try {
      const db = this.getDb();
      db.run(`UPDATE api_services SET monitoring_enabled = ?, updated_at = ? WHERE id = ?`, [
        enabled ? 1 : 0,
        Date.now(),
        id
      ]);
    } catch (err) {
      console.warn('[DevPulse ApiRepository] Failed to update service monitoring:', err);
    }
  }

  updateServiceSecret(id: string, secretHash: string): void {
    try {
      const db = this.getDb();
      db.run(`UPDATE api_services SET secret_hash = ?, updated_at = ? WHERE id = ?`, [
        secretHash,
        Date.now(),
        id
      ]);
    } catch (err) {
      console.warn('[DevPulse ApiRepository] Failed to update service secret:', err);
    }
  }

  deleteService(id: string): void {
    try {
      const db = this.getDb();
      db.run(`DELETE FROM api_services WHERE id = ?`, [id]);
      db.run(`DELETE FROM api_endpoints WHERE service_id = ?`, [id]);
      db.run(`DELETE FROM api_request_events WHERE service_id = ?`, [id]);
    } catch (err) {
      console.warn('[DevPulse ApiRepository] Failed to delete service:', err);
    }
  }

  recordBatchEvents(events: ApiRequestEventItem[]): void {
    if (events.length === 0) return;
    try {
      const db = this.getDb();
      db.run('BEGIN TRANSACTION;');

      for (const ev of events) {
        // 1. Insert or update endpoint directory
        const endpointId = `${ev.serviceId}:${ev.method}:${ev.routeTemplate}`;
        const isError = ev.outcome === 'failure' || ev.statusCode >= 400 ? 1 : 0;

        db.run(
          `INSERT INTO api_endpoints (
            id, service_id, route_template, method, total_requests, total_errors,
            avg_latency_ms, p95_latency_ms, last_requested_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(service_id, route_template, method) DO UPDATE SET
            total_requests = total_requests + 1,
            total_errors = total_errors + ?,
            avg_latency_ms = (avg_latency_ms * total_requests + ?) / (total_requests + 1),
            last_requested_at = ?,
            updated_at = ?`,
          [
            endpointId,
            ev.serviceId,
            ev.routeTemplate,
            ev.method,
            isError,
            ev.durationMs,
            ev.durationMs,
            ev.completedAt,
            ev.startedAt || ev.completedAt,
            ev.completedAt,
            isError,
            ev.durationMs,
            ev.completedAt,
            ev.completedAt
          ]
        );

        // 2. Insert raw event into circular ring buffer
        db.run(
          `INSERT INTO api_request_events (
            id, service_id, endpoint_id, route_template, method, status_code,
            duration_ms, started_at, completed_at, outcome, error_category,
            environment, request_size_bytes, response_size_bytes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ev.id || randomUUID(),
            ev.serviceId,
            endpointId,
            ev.routeTemplate,
            ev.method,
            ev.statusCode,
            ev.durationMs,
            ev.startedAt || ev.completedAt,
            ev.completedAt,
            ev.outcome,
            ev.errorCategory ?? null,
            ev.environment || 'development',
            ev.requestSizeBytes ?? null,
            ev.responseSizeBytes ?? null
          ]
        );

        // 3. Update service summary
        db.run(
          `UPDATE api_services
           SET total_requests = total_requests + 1,
               last_event_at = ?,
               updated_at = ?
           WHERE id = ?`,
          [ev.completedAt, ev.completedAt, ev.serviceId]
        );
      }

      db.run('COMMIT;');
    } catch (err) {
      try {
        this.getDb().run('ROLLBACK;');
      } catch {}
      console.warn('[DevPulse ApiRepository] Failed to record batch events:', err);
    }
  }

  getEndpoints(serviceId?: string): ApiEndpointItem[] {
    const list: ApiEndpointItem[] = [];
    try {
      const db = this.getDb();
      let sql = `SELECT id, service_id, route_template, method, total_requests,
                        total_errors, avg_latency_ms, p95_latency_ms, last_requested_at
                 FROM api_endpoints`;
      const params: string[] = [];
      if (serviceId) {
        sql += ` WHERE service_id = ?`;
        params.push(serviceId);
      }
      sql += ` ORDER BY total_requests DESC`;

      const stmt = db.prepare(sql);
      stmt.bind(params);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const reqs = Number(row.total_requests || 0);
        const errs = Number(row.total_errors || 0);
        list.push({
          id: String(row.id),
          serviceId: String(row.service_id),
          routeTemplate: String(row.route_template),
          method: String(row.method),
          totalRequests: reqs,
          totalErrors: errs,
          errorRate: reqs > 0 ? Math.round((errs / reqs) * 1000) / 10 : 0,
          avgLatencyMs: Math.round(Number(row.avg_latency_ms || 0) * 10) / 10,
          p95LatencyMs: Math.round(Number(row.p95_latency_ms || 0) * 10) / 10,
          lastRequestedAt: Number(row.last_requested_at || 0)
        });
      }
      stmt.free();

      // Recalculate exact P95 latency per endpoint from raw events if available
      for (const ep of list) {
        const p95 = this.calculateEndpointP95(ep.id);
        if (p95 !== null) {
          ep.p95LatencyMs = p95;
        }
      }
    } catch (err) {
      console.warn('[DevPulse ApiRepository] Failed to get endpoints:', err);
    }
    return list;
  }

  private calculateEndpointP95(endpointId: string): number | null {
    try {
      const db = this.getDb();
      const stmt = db.prepare(
        `SELECT duration_ms FROM api_request_events
         WHERE endpoint_id = ?
         ORDER BY duration_ms ASC LIMIT 500`
      );
      stmt.bind([endpointId]);
      const durations: number[] = [];
      while (stmt.step()) {
        durations.push(Number(stmt.getAsObject().duration_ms));
      }
      stmt.free();
      if (durations.length === 0) return null;
      const idx = Math.min(durations.length - 1, Math.floor(durations.length * 0.95));
      return Math.round(durations[idx] * 10) / 10;
    } catch {
      return null;
    }
  }

  getEndpointDetails(endpointId: string, limit = 50): ApiEndpointDetailsData | null {
    try {
      const db = this.getDb();
      // 1. Get endpoint
      const epStmt = db.prepare(
        `SELECT id, service_id, route_template, method, total_requests,
                total_errors, avg_latency_ms, p95_latency_ms, last_requested_at
         FROM api_endpoints WHERE id = ?`
      );
      epStmt.bind([endpointId]);
      let endpoint: ApiEndpointItem | null = null;
      if (epStmt.step()) {
        const row = epStmt.getAsObject();
        const reqs = Number(row.total_requests || 0);
        const errs = Number(row.total_errors || 0);
        endpoint = {
          id: String(row.id),
          serviceId: String(row.service_id),
          routeTemplate: String(row.route_template),
          method: String(row.method),
          totalRequests: reqs,
          totalErrors: errs,
          errorRate: reqs > 0 ? Math.round((errs / reqs) * 1000) / 10 : 0,
          avgLatencyMs: Math.round(Number(row.avg_latency_ms || 0) * 10) / 10,
          p95LatencyMs: Math.round(Number(row.p95_latency_ms || 0) * 10) / 10,
          lastRequestedAt: Number(row.last_requested_at || 0)
        };
      }
      epStmt.free();
      if (!endpoint) return null;

      // 2. Recent Events
      const evStmt = db.prepare(
        `SELECT id, service_id, endpoint_id, route_template, method,
                status_code, duration_ms, started_at, completed_at, outcome, error_category
         FROM api_request_events
         WHERE endpoint_id = ?
         ORDER BY completed_at DESC LIMIT ?`
      );
      evStmt.bind([endpointId, limit]);
      const recentEvents: ApiRequestEventItem[] = [];
      const durations: number[] = [];
      const codeMap = new Map<number, number>();

      while (evStmt.step()) {
        const row = evStmt.getAsObject();
        const code = Number(row.status_code);
        const dur = Number(row.duration_ms);
        durations.push(dur);
        codeMap.set(code, (codeMap.get(code) || 0) + 1);

        recentEvents.push({
          id: String(row.id),
          serviceId: String(row.service_id),
          endpointId: String(row.endpoint_id),
          routeTemplate: String(row.route_template),
          method: String(row.method),
          statusCode: code,
          durationMs: dur,
          startedAt: Number(row.started_at || row.completed_at),
          completedAt: Number(row.completed_at),
          outcome: (row.outcome as any) || 'success',
          errorCategory: row.error_category ? String(row.error_category) : undefined
        });
      }
      evStmt.free();

      // 3. Latency Histogram Bins: <10ms, 10-50ms, 50-100ms, 100-250ms, 250-500ms, 500-1000ms, >1s
      const bins = [
        { bin: '< 10ms', count: 0 },
        { bin: '10-50ms', count: 0 },
        { bin: '50-100ms', count: 0 },
        { bin: '100-250ms', count: 0 },
        { bin: '250-500ms', count: 0 },
        { bin: '500-1000ms', count: 0 },
        { bin: '> 1000ms', count: 0 }
      ];

      for (const d of durations) {
        if (d < 10) bins[0].count++;
        else if (d < 50) bins[1].count++;
        else if (d < 100) bins[2].count++;
        else if (d < 250) bins[3].count++;
        else if (d < 500) bins[4].count++;
        else if (d < 1000) bins[5].count++;
        else bins[6].count++;
      }

      const statusCodes = Array.from(codeMap.entries())
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count);

      return {
        endpoint,
        recentEvents,
        latencyHistogram: bins,
        statusCodes
      };
    } catch (err) {
      console.warn('[DevPulse ApiRepository] Failed to get endpoint details:', err);
      return null;
    }
  }

  getSummary(since?: number, serviceId?: string): ApiIntelligenceSummary {
    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    let durationSum = 0;
    const durations: number[] = [];

    try {
      const db = this.getDb();
      let sql = `SELECT duration_ms, outcome, status_code FROM api_request_events WHERE 1=1`;
      const params: (string | number)[] = [];
      if (since) {
        sql += ` AND completed_at >= ?`;
        params.push(since);
      }
      if (serviceId) {
        sql += ` AND service_id = ?`;
        params.push(serviceId);
      }
      sql += ` ORDER BY duration_ms ASC`;

      const stmt = db.prepare(sql);
      stmt.bind(params);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        totalRequests++;
        const dur = Number(row.duration_ms || 0);
        durations.push(dur);
        durationSum += dur;

        const isError = row.outcome === 'failure' || Number(row.status_code) >= 400;
        if (isError) failedRequests++;
        else successfulRequests++;
      }
      stmt.free();

      let p95 = 0;
      let p99 = 0;
      if (durations.length > 0) {
        const idx95 = Math.min(durations.length - 1, Math.floor(durations.length * 0.95));
        const idx99 = Math.min(durations.length - 1, Math.floor(durations.length * 0.99));
        p95 = Math.round(durations[idx95] * 10) / 10;
        p99 = Math.round(durations[idx99] * 10) / 10;
      }

      const services = this.getServices();
      const activeServicesCount = services.filter(s => s.monitoringEnabled).length;

      return {
        totalRequests,
        successRate: totalRequests > 0 ? Math.round((successfulRequests / totalRequests) * 1000) / 10 : 100,
        errorRate: totalRequests > 0 ? Math.round((failedRequests / totalRequests) * 1000) / 10 : 0,
        avgLatencyMs: totalRequests > 0 ? Math.round((durationSum / totalRequests) * 10) / 10 : 0,
        p95LatencyMs: p95,
        p99LatencyMs: p99,
        activeServicesCount
      };
    } catch (err) {
      console.warn('[DevPulse ApiRepository] Failed to get summary:', err);
      return {
        totalRequests: 0,
        successRate: 100,
        errorRate: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        activeServicesCount: 0
      };
    }
  }

  getTimeSeries(since?: number, serviceId?: string): { time: string; timestamp: number; successCount: number; errorCount: number; avgLatencyMs: number }[] {
    const buckets = new Map<number, { successCount: number; errorCount: number; durationSum: number; count: number }>();
    const now = Date.now();
    const effectiveSince = since || (now - 24 * 3600 * 1000);
    const bucketIntervalMs = (now - effectiveSince > 3 * 86400 * 1000) ? 3600 * 1000 : 300 * 1000; // 1h or 5m

    try {
      const db = this.getDb();
      let sql = `SELECT completed_at, duration_ms, outcome, status_code
                 FROM api_request_events WHERE completed_at >= ?`;
      const params: (string | number)[] = [effectiveSince];
      if (serviceId) {
        sql += ` AND service_id = ?`;
        params.push(serviceId);
      }
      sql += ` ORDER BY completed_at ASC`;

      const stmt = db.prepare(sql);
      stmt.bind(params);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const time = Number(row.completed_at);
        const bucketKey = Math.floor(time / bucketIntervalMs) * bucketIntervalMs;
        const dur = Number(row.duration_ms || 0);
        const isError = row.outcome === 'failure' || Number(row.status_code) >= 400;

        const entry = buckets.get(bucketKey) || { successCount: 0, errorCount: 0, durationSum: 0, count: 0 };
        entry.count++;
        entry.durationSum += dur;
        if (isError) entry.errorCount++;
        else entry.successCount++;
        buckets.set(bucketKey, entry);
      }
      stmt.free();
    } catch (err) {
      console.warn('[DevPulse ApiRepository] Failed to get time series:', err);
    }

    return Array.from(buckets.entries())
      .map(([ts, val]) => {
        const d = new Date(ts);
        const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        return {
          time: timeStr,
          timestamp: ts,
          successCount: val.successCount,
          errorCount: val.errorCount,
          avgLatencyMs: val.count > 0 ? Math.round((val.durationSum / val.count) * 10) / 10 : 0
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  getStatusCodeDistribution(since?: number, serviceId?: string): { codeCategory: string; count: number; percentage: number }[] {
    const cats: Record<string, number> = {
      '2xx Success': 0,
      '3xx Redirect': 0,
      '4xx Client Error': 0,
      '5xx Server Error': 0
    };
    let total = 0;

    try {
      const db = this.getDb();
      let sql = `SELECT status_code FROM api_request_events WHERE 1=1`;
      const params: (string | number)[] = [];
      if (since) {
        sql += ` AND completed_at >= ?`;
        params.push(since);
      }
      if (serviceId) {
        sql += ` AND service_id = ?`;
        params.push(serviceId);
      }

      const stmt = db.prepare(sql);
      stmt.bind(params);
      while (stmt.step()) {
        const code = Number(stmt.getAsObject().status_code);
        total++;
        if (code >= 200 && code < 300) cats['2xx Success']++;
        else if (code >= 300 && code < 400) cats['3xx Redirect']++;
        else if (code >= 400 && code < 500) cats['4xx Client Error']++;
        else if (code >= 500) cats['5xx Server Error']++;
      }
      stmt.free();
    } catch (err) {
      console.warn('[DevPulse ApiRepository] Failed to get status code distribution:', err);
    }

    return Object.entries(cats).map(([codeCategory, count]) => ({
      codeCategory,
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0
    }));
  }

  getMethodDistribution(since?: number, serviceId?: string): { method: string; count: number; percentage: number }[] {
    const methodCounts = new Map<string, number>();
    let total = 0;

    try {
      const db = this.getDb();
      let sql = `SELECT method FROM api_request_events WHERE 1=1`;
      const params: (string | number)[] = [];
      if (since) {
        sql += ` AND completed_at >= ?`;
        params.push(since);
      }
      if (serviceId) {
        sql += ` AND service_id = ?`;
        params.push(serviceId);
      }

      const stmt = db.prepare(sql);
      stmt.bind(params);
      while (stmt.step()) {
        const m = String(stmt.getAsObject().method || 'GET').toUpperCase();
        total++;
        methodCounts.set(m, (methodCounts.get(m) || 0) + 1);
      }
      stmt.free();
    } catch (err) {
      console.warn('[DevPulse ApiRepository] Failed to get method distribution:', err);
    }

    return Array.from(methodCounts.entries())
      .map(([method, count]) => ({
        method,
        count,
        percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.count - a.count);
  }

  getRecentErrors(limit = 20, serviceId?: string): ApiRequestEventItem[] {
    const errors: ApiRequestEventItem[] = [];
    try {
      const db = this.getDb();
      let sql = `SELECT id, service_id, endpoint_id, route_template, method,
                        status_code, duration_ms, started_at, completed_at, outcome, error_category
                 FROM api_request_events
                 WHERE outcome = 'failure' OR status_code >= 400`;
      const params: (string | number)[] = [];
      if (serviceId) {
        sql += ` AND service_id = ?`;
        params.push(serviceId);
      }
      sql += ` ORDER BY completed_at DESC LIMIT ?`;
      params.push(limit);

      const stmt = db.prepare(sql);
      stmt.bind(params);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        errors.push({
          id: String(row.id),
          serviceId: String(row.service_id),
          endpointId: String(row.endpoint_id),
          routeTemplate: String(row.route_template),
          method: String(row.method),
          statusCode: Number(row.status_code),
          durationMs: Number(row.duration_ms),
          startedAt: Number(row.started_at || row.completed_at),
          completedAt: Number(row.completed_at),
          outcome: 'failure',
          errorCategory: row.error_category ? String(row.error_category) : undefined
        });
      }
      stmt.free();
    } catch (err) {
      console.warn('[DevPulse ApiRepository] Failed to get recent errors:', err);
    }
    return errors;
  }

  prune(maxRawEvents = 10000, retentionDays = 7): void {
    try {
      const db = this.getDb();
      // 1. Time-based cutoff
      const cutoff = Date.now() - retentionDays * 86400 * 1000;
      db.run(`DELETE FROM api_request_events WHERE completed_at < ?`, [cutoff]);

      // 2. Count-based circular ring buffer cutoff
      db.run(`
        DELETE FROM api_request_events
        WHERE id IN (
          SELECT id FROM api_request_events
          ORDER BY completed_at DESC
          LIMIT -1 OFFSET ?
        )
      `, [maxRawEvents]);
    } catch (err) {
      console.warn('[DevPulse ApiRepository] Failed to prune raw events:', err);
    }
  }

  clear(serviceId?: string): void {
    try {
      const db = this.getDb();
      if (serviceId) {
        db.run(`DELETE FROM api_request_events WHERE service_id = ?`, [serviceId]);
        db.run(`DELETE FROM api_endpoints WHERE service_id = ?`, [serviceId]);
        db.run(`UPDATE api_services SET total_requests = 0 WHERE id = ?`, [serviceId]);
      } else {
        db.run(`DELETE FROM api_request_events`);
        db.run(`DELETE FROM api_endpoints`);
        db.run(`UPDATE api_services SET total_requests = 0`);
      }
    } catch (err) {
      console.warn('[DevPulse ApiRepository] Failed to clear API data:', err);
    }
  }
}
