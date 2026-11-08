import type { Database as SqlDatabase } from 'sql.js';
import { randomUUID } from 'node:crypto';
import type { PulseInsight, InsightEvidence } from '../../shared/types';

export class PulseInsightsRepository {
  constructor(
    private readonly getDb: () => SqlDatabase,
    private readonly schedulePersist?: () => void
  ) {}

  saveInsight(insight: Omit<PulseInsight, 'id'> & { id?: string }): PulseInsight {
    const db = this.getDb();
    const id = insight.id || randomUUID();
    const now = Date.now();
    const evidenceJson = JSON.stringify(insight.evidence || []);

    // Check existing by dedupe_hash
    const checkStmt = db.prepare('SELECT id, status FROM pulse_insights WHERE dedupe_hash = ?');
    checkStmt.bind([insight.dedupeHash]);
    let existingId: string | undefined;
    let existingStatus = insight.status || 'new';

    if (checkStmt.step()) {
      const row = checkStmt.getAsObject();
      existingId = String(row.id);
      // Preserve dismissed status if previously dismissed by user
      if (row.status === 'dismissed' && insight.status !== 'dismissed') {
        existingStatus = 'dismissed';
      }
    }
    checkStmt.free();

    if (existingId) {
      db.run(
        `UPDATE pulse_insights SET 
          title = ?, description = ?, severity = ?, confidence = ?, evidence_json = ?,
          recommendation = ?, time_range_start = ?, time_range_end = ?, status = ?, updated_at = ?
        WHERE id = ?`,
        [
          insight.title,
          insight.description,
          insight.severity,
          insight.confidence,
          evidenceJson,
          insight.recommendation ?? null,
          insight.timeRangeStart,
          insight.timeRangeEnd,
          existingStatus,
          now,
          existingId
        ]
      );
      this.schedulePersist?.();
      return {
        ...insight,
        id: existingId,
        status: existingStatus,
        updatedAt: now
      };
    } else {
      db.run(
        `INSERT INTO pulse_insights (
          id, category, title, description, severity, confidence, evidence_json,
          recommendation, time_range_start, time_range_end, status, dedupe_hash, generated_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          insight.category,
          insight.title,
          insight.description,
          insight.severity,
          insight.confidence,
          evidenceJson,
          insight.recommendation ?? null,
          insight.timeRangeStart,
          insight.timeRangeEnd,
          insight.status || 'new',
          insight.dedupeHash,
          insight.generatedAt || now,
          now
        ]
      );
      this.schedulePersist?.();
      return {
        ...insight,
        id,
        status: insight.status || 'new',
        generatedAt: insight.generatedAt || now,
        updatedAt: now
      };
    }
  }

  getInsights(options?: {
    since?: number;
    category?: string;
    status?: string;
    limit?: number;
  }): PulseInsight[] {
    try {
      const db = this.getDb();
      let query = 'SELECT * FROM pulse_insights WHERE 1=1';
      const params: (string | number)[] = [];

      if (options?.since) {
        query += ' AND generated_at >= ?';
        params.push(options.since);
      }
      if (options?.category && options.category !== 'all') {
        query += ' AND category = ?';
        params.push(options.category);
      }
      if (options?.status) {
        query += ' AND status = ?';
        params.push(options.status);
      } else {
        // By default exclude dismissed insights from main active feeds
        query += " AND status != 'dismissed'";
      }

      query += ' ORDER BY generated_at DESC';
      if (options?.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }

      const stmt = db.prepare(query);
      stmt.bind(params);
      const list: PulseInsight[] = [];

      while (stmt.step()) {
        const row = stmt.getAsObject();
        let evidence: InsightEvidence[] = [];
        try {
          evidence = row.evidence_json ? JSON.parse(String(row.evidence_json)) : [];
        } catch {}

        list.push({
          id: String(row.id),
          category: row.category as any,
          title: String(row.title),
          description: String(row.description),
          severity: row.severity as any,
          confidence: Number(row.confidence) || 1.0,
          evidence,
          recommendation: row.recommendation ? String(row.recommendation) : undefined,
          timeRangeStart: Number(row.time_range_start),
          timeRangeEnd: Number(row.time_range_end),
          status: row.status as any,
          dedupeHash: String(row.dedupe_hash),
          generatedAt: Number(row.generated_at),
          updatedAt: Number(row.updated_at)
        });
      }
      stmt.free();
      return list;
    } catch {
      return [];
    }
  }

  getInsightById(id: string): PulseInsight | undefined {
    try {
      const db = this.getDb();
      const stmt = db.prepare('SELECT * FROM pulse_insights WHERE id = ? LIMIT 1');
      stmt.bind([id]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        let evidence: InsightEvidence[] = [];
        try {
          evidence = row.evidence_json ? JSON.parse(String(row.evidence_json)) : [];
        } catch {}
        return {
          id: String(row.id),
          category: row.category as any,
          title: String(row.title),
          description: String(row.description),
          severity: row.severity as any,
          confidence: Number(row.confidence) || 1.0,
          evidence,
          recommendation: row.recommendation ? String(row.recommendation) : undefined,
          timeRangeStart: Number(row.time_range_start),
          timeRangeEnd: Number(row.time_range_end),
          status: row.status as any,
          dedupeHash: String(row.dedupe_hash),
          generatedAt: Number(row.generated_at),
          updatedAt: Number(row.updated_at)
        };
      }
      stmt.free();
    } catch {}
    return undefined;
  }

  updateStatus(id: string, status: 'viewed' | 'dismissed' | 'resolved'): boolean {
    try {
      const db = this.getDb();
      db.run('UPDATE pulse_insights SET status = ?, updated_at = ? WHERE id = ?', [status, Date.now(), id]);
      this.schedulePersist?.();
      return true;
    } catch {
      return false;
    }
  }

  getRuleState(ruleId: string): { lastRunAt: number; lastProcessedTimestamp: number } | undefined {
    try {
      const db = this.getDb();
      const stmt = db.prepare('SELECT last_run_at, last_processed_timestamp FROM pulse_insight_rules_state WHERE rule_id = ?');
      stmt.bind([ruleId]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return {
          lastRunAt: Number(row.last_run_at),
          lastProcessedTimestamp: Number(row.last_processed_timestamp)
        };
      }
      stmt.free();
    } catch {}
    return undefined;
  }

  saveRuleState(ruleId: string, lastRunAt: number, lastProcessedTimestamp: number): void {
    try {
      const db = this.getDb();
      db.run(
        `INSERT INTO pulse_insight_rules_state (rule_id, last_run_at, last_processed_timestamp)
         VALUES (?, ?, ?)
         ON CONFLICT(rule_id) DO UPDATE SET last_run_at = excluded.last_run_at, last_processed_timestamp = excluded.last_processed_timestamp`,
        [ruleId, lastRunAt, lastProcessedTimestamp]
      );
      this.schedulePersist?.();
    } catch {}
  }

  clearInsights(): void {
    try {
      const db = this.getDb();
      db.run('DELETE FROM pulse_insights');
      this.schedulePersist?.();
    } catch {}
  }
}
