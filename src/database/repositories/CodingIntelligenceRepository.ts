import type { Database as SqlDatabase } from 'sql.js';
import type {
  CodingSessionItem,
  CodingLanguageStat,
  CodingProjectStat,
  CodingTimelineHour,
  CodingIntelligenceSummary
} from '../../shared/types';

export class CodingIntelligenceRepository {
  constructor(private readonly getDb: () => SqlDatabase) {}

  saveSession(session: CodingSessionItem): void {
    try {
      const db = this.getDb();
      db.run(
        `INSERT OR REPLACE INTO coding_sessions (
          id, workspace_id, workspace_name, started_at, ended_at,
          last_activity_at, active_duration_seconds, idle_duration_seconds,
          paused_duration_seconds, status, primary_language, languages_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.id,
          session.workspaceId,
          session.workspaceName,
          session.startedAt,
          session.endedAt ?? null,
          session.lastActivityAt,
          session.activeDurationSeconds,
          session.idleDurationSeconds,
          session.pausedDurationSeconds,
          session.status,
          session.primaryLanguage,
          JSON.stringify(session.languages || {}),
          session.startedAt,
          Date.now()
        ]
      );
    } catch (err) {
      console.warn('[DevPulse CodingRepository] Failed to save session:', err);
    }
  }

  getSession(id: string): CodingSessionItem | null {
    try {
      const db = this.getDb();
      const stmt = db.prepare(
        `SELECT id, workspace_id, workspace_name, started_at, ended_at,
                last_activity_at, active_duration_seconds, idle_duration_seconds,
                paused_duration_seconds, status, primary_language, languages_json
         FROM coding_sessions WHERE id = ?`
      );
      stmt.bind([id]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return this.mapRowToSession(row);
      }
      stmt.free();
    } catch (err) {
      console.warn('[DevPulse CodingRepository] Failed to get session:', err);
    }
    return null;
  }

  getActiveSession(workspaceId?: string): CodingSessionItem | null {
    try {
      const db = this.getDb();
      const query = workspaceId
        ? `SELECT id, workspace_id, workspace_name, started_at, ended_at,
                  last_activity_at, active_duration_seconds, idle_duration_seconds,
                  paused_duration_seconds, status, primary_language, languages_json
           FROM coding_sessions
           WHERE status IN ('active', 'idle', 'paused') AND workspace_id = ?
           ORDER BY last_activity_at DESC LIMIT 1`
        : `SELECT id, workspace_id, workspace_name, started_at, ended_at,
                  last_activity_at, active_duration_seconds, idle_duration_seconds,
                  paused_duration_seconds, status, primary_language, languages_json
           FROM coding_sessions
           WHERE status IN ('active', 'idle', 'paused')
           ORDER BY last_activity_at DESC LIMIT 1`;

      const stmt = db.prepare(query);
      if (workspaceId) {
        stmt.bind([workspaceId]);
      }
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return this.mapRowToSession(row);
      }
      stmt.free();
    } catch (err) {
      console.warn('[DevPulse CodingRepository] Failed to get active session:', err);
    }
    return null;
  }

  getRecentSessions(options?: { workspaceId?: string; limit?: number; since?: number }): CodingSessionItem[] {
    const sessions: CodingSessionItem[] = [];
    try {
      const db = this.getDb();
      const limit = options?.limit || 50;
      let sql = `SELECT id, workspace_id, workspace_name, started_at, ended_at,
                        last_activity_at, active_duration_seconds, idle_duration_seconds,
                        paused_duration_seconds, status, primary_language, languages_json
                 FROM coding_sessions WHERE 1=1`;
      const params: (string | number)[] = [];

      if (options?.workspaceId) {
        sql += ` AND workspace_id = ?`;
        params.push(options.workspaceId);
      }
      if (options?.since) {
        sql += ` AND started_at >= ?`;
        params.push(options.since);
      }
      sql += ` ORDER BY started_at DESC LIMIT ?`;
      params.push(limit);

      const stmt = db.prepare(sql);
      stmt.bind(params);
      while (stmt.step()) {
        sessions.push(this.mapRowToSession(stmt.getAsObject()));
      }
      stmt.free();
    } catch (err) {
      console.warn('[DevPulse CodingRepository] Failed to get recent sessions:', err);
    }
    return sessions;
  }

  getSummary(since?: number, workspaceId?: string): CodingIntelligenceSummary {
    let totalActive = 0;
    let totalIdle = 0;
    let totalSessions = 0;
    let totalDuration = 0;
    const projectSet = new Set<string>();
    const langSet = new Set<string>();

    try {
      const db = this.getDb();
      let sql = `SELECT workspace_id, active_duration_seconds, idle_duration_seconds,
                        primary_language, languages_json, started_at
                 FROM coding_sessions WHERE 1=1`;
      const params: (string | number)[] = [];
      if (since) {
        sql += ` AND started_at >= ?`;
        params.push(since);
      }
      if (workspaceId) {
        sql += ` AND workspace_id = ?`;
        params.push(workspaceId);
      }

      const stmt = db.prepare(sql);
      stmt.bind(params);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        totalSessions++;
        const active = Number(row.active_duration_seconds || 0);
        const idle = Number(row.idle_duration_seconds || 0);
        totalActive += active;
        totalIdle += idle;
        totalDuration += (active + idle);
        if (row.workspace_id) projectSet.add(String(row.workspace_id));
        if (row.primary_language) langSet.add(String(row.primary_language));
        try {
          const langs = JSON.parse(String(row.languages_json || '{}'));
          Object.keys(langs).forEach(l => langSet.add(l));
        } catch {}
      }
      stmt.free();

      // Also compute weekly active seconds (last 7 days)
      const weekSince = Date.now() - 7 * 86400 * 1000;
      let weeklyActiveSeconds = 0;
      const weekStmt = db.prepare(
        `SELECT SUM(active_duration_seconds) as total
         FROM coding_sessions
         WHERE started_at >= ?` + (workspaceId ? ` AND workspace_id = ?` : '')
      );
      weekStmt.bind(workspaceId ? [weekSince, workspaceId] : [weekSince]);
      if (weekStmt.step()) {
        weeklyActiveSeconds = Number(weekStmt.getAsObject().total || 0);
      }
      weekStmt.free();

      return {
        totalActiveSeconds: totalActive,
        totalIdleSeconds: totalIdle,
        totalSessions,
        avgSessionSeconds: totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0,
        activeProjectsCount: projectSet.size,
        languagesCount: langSet.size,
        weeklyActiveSeconds
      };
    } catch (err) {
      console.warn('[DevPulse CodingRepository] Failed to get summary:', err);
      return {
        totalActiveSeconds: 0,
        totalIdleSeconds: 0,
        totalSessions: 0,
        avgSessionSeconds: 0,
        activeProjectsCount: 0,
        languagesCount: 0,
        weeklyActiveSeconds: 0
      };
    }
  }

  getHourlyActivity(since?: number, workspaceId?: string): CodingTimelineHour[] {
    const hours: CodingTimelineHour[] = Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, '0')}:00`,
      activeSeconds: 0,
      idleSeconds: 0
    }));

    try {
      const db = this.getDb();
      let sql = `SELECT started_at, active_duration_seconds, idle_duration_seconds
                 FROM coding_sessions WHERE 1=1`;
      const params: (string | number)[] = [];
      if (since) {
        sql += ` AND started_at >= ?`;
        params.push(since);
      }
      if (workspaceId) {
        sql += ` AND workspace_id = ?`;
        params.push(workspaceId);
      }

      const stmt = db.prepare(sql);
      stmt.bind(params);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const start = Number(row.started_at || 0);
        const active = Number(row.active_duration_seconds || 0);
        const idle = Number(row.idle_duration_seconds || 0);
        const date = new Date(start);
        const hour = date.getHours();
        if (hour >= 0 && hour < 24) {
          hours[hour].activeSeconds += active;
          hours[hour].idleSeconds += idle;
        }
      }
      stmt.free();
    } catch (err) {
      console.warn('[DevPulse CodingRepository] Failed to get hourly activity:', err);
    }
    return hours;
  }

  getDailyActivity(days = 14, workspaceId?: string): { date: string; activeSeconds: number; idleSeconds: number }[] {
    const dailyMap = new Map<string, { activeSeconds: number; idleSeconds: number }>();
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      dailyMap.set(dateStr, { activeSeconds: 0, idleSeconds: 0 });
    }

    try {
      const db = this.getDb();
      const cutoff = Date.now() - days * 86400 * 1000;
      let sql = `SELECT started_at, active_duration_seconds, idle_duration_seconds
                 FROM coding_sessions WHERE started_at >= ?`;
      const params: (string | number)[] = [cutoff];
      if (workspaceId) {
        sql += ` AND workspace_id = ?`;
        params.push(workspaceId);
      }

      const stmt = db.prepare(sql);
      stmt.bind(params);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const start = Number(row.started_at || 0);
        const active = Number(row.active_duration_seconds || 0);
        const idle = Number(row.idle_duration_seconds || 0);
        const dateStr = new Date(start).toISOString().slice(0, 10);
        const entry = dailyMap.get(dateStr);
        if (entry) {
          entry.activeSeconds += active;
          entry.idleSeconds += idle;
        }
      }
      stmt.free();
    } catch (err) {
      console.warn('[DevPulse CodingRepository] Failed to get daily activity:', err);
    }

    return Array.from(dailyMap.entries()).map(([date, val]) => ({
      date,
      activeSeconds: val.activeSeconds,
      idleSeconds: val.idleSeconds
    }));
  }

  getLanguageStats(since?: number, workspaceId?: string): CodingLanguageStat[] {
    const langTotals = new Map<string, { activeSeconds: number; sessionCount: number }>();

    try {
      const db = this.getDb();
      let sql = `SELECT primary_language, languages_json, active_duration_seconds
                 FROM coding_sessions WHERE 1=1`;
      const params: (string | number)[] = [];
      if (since) {
        sql += ` AND started_at >= ?`;
        params.push(since);
      }
      if (workspaceId) {
        sql += ` AND workspace_id = ?`;
        params.push(workspaceId);
      }

      const stmt = db.prepare(sql);
      stmt.bind(params);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        let parsedLangs: Record<string, number> = {};
        try {
          parsedLangs = JSON.parse(String(row.languages_json || '{}'));
        } catch {}

        if (Object.keys(parsedLangs).length > 0) {
          for (const [lang, sec] of Object.entries(parsedLangs)) {
            const entry = langTotals.get(lang) || { activeSeconds: 0, sessionCount: 0 };
            entry.activeSeconds += Number(sec || 0);
            entry.sessionCount++;
            langTotals.set(lang, entry);
          }
        } else if (row.primary_language) {
          const lang = String(row.primary_language);
          const entry = langTotals.get(lang) || { activeSeconds: 0, sessionCount: 0 };
          entry.activeSeconds += Number(row.active_duration_seconds || 0);
          entry.sessionCount++;
          langTotals.set(lang, entry);
        }
      }
      stmt.free();

      const totalActiveAll = Array.from(langTotals.values()).reduce((sum, item) => sum + item.activeSeconds, 0);

      return Array.from(langTotals.entries())
        .map(([lang, stat]) => ({
          languageId: lang,
          displayName: this.formatLanguageName(lang),
          activeSeconds: stat.activeSeconds,
          percentage: totalActiveAll > 0 ? Math.round((stat.activeSeconds / totalActiveAll) * 1000) / 10 : 0,
          sessionCount: stat.sessionCount
        }))
        .sort((a, b) => b.activeSeconds - a.activeSeconds);
    } catch (err) {
      console.warn('[DevPulse CodingRepository] Failed to get language stats:', err);
      return [];
    }
  }

  getProjectStats(since?: number): CodingProjectStat[] {
    const projectTotals = new Map<string, CodingProjectStat>();

    try {
      const db = this.getDb();
      let sql = `SELECT workspace_id, workspace_name, active_duration_seconds,
                        primary_language, started_at, last_activity_at
                 FROM coding_sessions WHERE 1=1`;
      const params: (string | number)[] = [];
      if (since) {
        sql += ` AND started_at >= ?`;
        params.push(since);
      }

      const stmt = db.prepare(sql);
      stmt.bind(params);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const wsId = String(row.workspace_id || 'default');
        const name = String(row.workspace_name || wsId);
        const active = Number(row.active_duration_seconds || 0);
        const lastActive = Number(row.last_activity_at || row.started_at || 0);
        const lang = String(row.primary_language || 'plaintext');

        const existing = projectTotals.get(wsId);
        if (!existing) {
          projectTotals.set(wsId, {
            workspaceId: wsId,
            workspaceName: name,
            activeSeconds: active,
            sessionCount: 1,
            lastActiveAt: lastActive,
            primaryLanguage: lang
          });
        } else {
          existing.activeSeconds += active;
          existing.sessionCount++;
          if (lastActive > existing.lastActiveAt) {
            existing.lastActiveAt = lastActive;
            existing.primaryLanguage = lang;
          }
        }
      }
      stmt.free();

      return Array.from(projectTotals.values()).sort((a, b) => b.activeSeconds - a.activeSeconds);
    } catch (err) {
      console.warn('[DevPulse CodingRepository] Failed to get project stats:', err);
      return [];
    }
  }

  reconcileOrphanedSessions(): void {
    try {
      const db = this.getDb();
      // Any session marked active, idle, or paused is sealed using its last_activity_at
      db.run(`
        UPDATE coding_sessions
        SET status = 'ended',
            ended_at = last_activity_at,
            updated_at = ?
        WHERE status IN ('active', 'idle', 'paused')
      `, [Date.now()]);
    } catch (err) {
      console.warn('[DevPulse CodingRepository] Failed to reconcile orphaned sessions:', err);
    }
  }

  prune(retentionDays = 30): void {
    try {
      const db = this.getDb();
      const cutoff = Date.now() - retentionDays * 86400 * 1000;
      db.run(`DELETE FROM coding_sessions WHERE started_at < ?`, [cutoff]);
    } catch (err) {
      console.warn('[DevPulse CodingRepository] Failed to prune sessions:', err);
    }
  }

  clear(): void {
    try {
      const db = this.getDb();
      db.run(`DELETE FROM coding_sessions`);
    } catch (err) {
      console.warn('[DevPulse CodingRepository] Failed to clear coding sessions:', err);
    }
  }

  private mapRowToSession(row: Record<string, unknown>): CodingSessionItem {
    let languages: Record<string, number> = {};
    try {
      languages = JSON.parse(String(row.languages_json || '{}'));
    } catch {}

    return {
      id: String(row.id),
      workspaceId: String(row.workspace_id || ''),
      workspaceName: String(row.workspace_name || ''),
      startedAt: Number(row.started_at || 0),
      endedAt: row.ended_at ? Number(row.ended_at) : undefined,
      lastActivityAt: Number(row.last_activity_at || 0),
      activeDurationSeconds: Number(row.active_duration_seconds || 0),
      idleDurationSeconds: Number(row.idle_duration_seconds || 0),
      pausedDurationSeconds: Number(row.paused_duration_seconds || 0),
      status: (row.status as any) || 'active',
      primaryLanguage: String(row.primary_language || 'plaintext'),
      languages
    };
  }

  private formatLanguageName(lang: string): string {
    const map: Record<string, string> = {
      typescript: 'TypeScript',
      typescriptreact: 'TypeScript React',
      javascript: 'JavaScript',
      javascriptreact: 'JavaScript React',
      python: 'Python',
      rust: 'Rust',
      go: 'Go',
      html: 'HTML',
      css: 'CSS',
      scss: 'SCSS',
      json: 'JSON',
      markdown: 'Markdown',
      sql: 'SQL',
      c: 'C',
      cpp: 'C++',
      csharp: 'C#',
      java: 'Java',
      php: 'PHP',
      shellscript: 'Bash / Shell',
      yaml: 'YAML'
    };
    return map[lang.toLowerCase()] || lang.charAt(0).toUpperCase() + lang.slice(1);
  }
}
