import type { Database as SqlDatabase } from 'sql.js';

export class SettingsRepository {
  constructor(private readonly getDb: () => SqlDatabase) {}

  get<T>(key: string, defaultValue: T): T {
    try {
      const db = this.getDb();
      const stmt = db.prepare('SELECT value_json FROM settings WHERE key = ?');
      stmt.bind([key]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        try {
          return JSON.parse(String(row.value_json)) as T;
        } catch {
          return defaultValue;
        }
      }
      stmt.free();
      return defaultValue;
    } catch {
      return defaultValue;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      const db = this.getDb();
      db.run(
        'INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at',
        [key, JSON.stringify(value), Date.now()]
      );
    } catch (err) {
      console.warn('[DevPulse SettingsRepository] Unable to set setting key:', key, err);
    }
  }

  getAll(): Record<string, unknown> {
    try {
      const db = this.getDb();
      const stmt = db.prepare('SELECT key, value_json FROM settings');
      const result: Record<string, unknown> = {};
      while (stmt.step()) {
        const row = stmt.getAsObject();
        try {
          result[String(row.key)] = JSON.parse(String(row.value_json));
        } catch {
          result[String(row.key)] = null;
        }
      }
      stmt.free();
      return result;
    } catch {
      return {};
    }
  }

  clear(): void {
    try {
      const db = this.getDb();
      db.run('DELETE FROM settings');
    } catch (err) {
      console.warn('[DevPulse SettingsRepository] Unable to clear settings:', err);
    }
  }
}
