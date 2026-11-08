import type { Database as SqlDatabase } from 'sql.js';
import { randomUUID } from 'node:crypto';
import type {
  GitRepositoryInfo,
  GitCommitInfo,
  GitBranchInfo,
  GitWorkingTreeFile,
  GitContributionStats,
  GitCodeChangeStats,
  GitOverviewSummary
} from '../../shared/types';

export class GitIntelligenceRepository {
  constructor(private readonly getDb: () => SqlDatabase) {}

  saveRepository(repo: GitRepositoryInfo): void {
    try {
      const db = this.getDb();
      db.run(
        `INSERT OR REPLACE INTO git_repositories (
          id, workspace_path, name, root_path, current_branch,
          head_commit_hash, remotes_json, is_clean, last_polled_at, total_commits
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          repo.id,
          repo.workspacePath,
          repo.name,
          repo.rootPath,
          repo.currentBranch ?? null,
          repo.headCommitHash ?? null,
          JSON.stringify(repo.remotes ?? []),
          repo.isClean ? 1 : 0,
          repo.lastPolledAt ?? Date.now(),
          repo.totalCommits ?? 0
        ]
      );
    } catch (err) {
      console.warn('[DevPulse GitIntelligenceRepository] Save repo failed:', err);
    }
  }

  getRepositories(): GitRepositoryInfo[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(`
        SELECT id, workspace_path, name, root_path, current_branch,
               head_commit_hash, remotes_json, is_clean, last_polled_at, total_commits
        FROM git_repositories
        ORDER BY name ASC
      `);
      const repos: GitRepositoryInfo[] = [];

      while (stmt.step()) {
        const row = stmt.getAsObject();
        let remotes: { name: string; url: string }[] = [];
        try {
          if (row.remotes_json) remotes = JSON.parse(String(row.remotes_json));
        } catch {}

        repos.push({
          id: String(row.id),
          workspacePath: String(row.workspace_path),
          name: String(row.name),
          rootPath: String(row.root_path),
          currentBranch: row.current_branch ? String(row.current_branch) : undefined,
          headCommitHash: row.head_commit_hash ? String(row.head_commit_hash) : undefined,
          remotes,
          isClean: Boolean(row.is_clean),
          lastPolledAt: Number(row.last_polled_at),
          totalCommits: row.total_commits !== null && row.total_commits !== undefined ? Number(row.total_commits) : undefined
        });
      }
      stmt.free();
      return repos;
    } catch {
      return [];
    }
  }

  saveCommits(repoId: string, commits: GitCommitInfo[]): void {
    try {
      const db = this.getDb();
      db.run('BEGIN TRANSACTION');
      try {
        const stmt = db.prepare(
          `INSERT OR REPLACE INTO git_commits (
            id, repo_id, commit_hash, short_hash, author_name,
            author_email, message, timestamp, branch, files_changed,
            insertions, deletions
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        for (const c of commits) {
          stmt.run([
            c.id || randomUUID(),
            repoId,
            c.commitHash,
            c.shortHash,
            c.authorName,
            c.authorEmail ?? null,
            c.message,
            c.timestamp,
            c.branch ?? null,
            c.filesChanged ?? 0,
            c.insertions ?? 0,
            c.deletions ?? 0
          ]);
        }
        stmt.free();
        db.run('COMMIT');
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }
    } catch (err) {
      console.warn('[DevPulse GitIntelligenceRepository] Save commits failed:', err);
    }
  }

  getCommits(
    repoId: string,
    options?: {
      search?: string;
      author?: string;
      branch?: string;
      limit?: number;
      offset?: number;
    }
  ): GitCommitInfo[] {
    try {
      const db = this.getDb();
      let query = `
        SELECT id, repo_id, commit_hash, short_hash, author_name,
               author_email, message, timestamp, branch, files_changed,
               insertions, deletions
        FROM git_commits
        WHERE repo_id = ?
      `;
      const params: (string | number)[] = [repoId];

      if (options?.author) {
        query += ' AND LOWER(author_name) LIKE ?';
        params.push(`%${options.author.toLowerCase()}%`);
      }
      if (options?.branch) {
        query += ' AND branch = ?';
        params.push(options.branch);
      }
      if (options?.search) {
        query += ' AND (LOWER(message) LIKE ? OR LOWER(short_hash) LIKE ?)';
        const term = `%${options.search.toLowerCase()}%`;
        params.push(term, term);
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
      const commits: GitCommitInfo[] = [];

      while (stmt.step()) {
        const row = stmt.getAsObject();
        commits.push({
          id: String(row.id),
          repoId: String(row.repo_id),
          commitHash: String(row.commit_hash),
          shortHash: String(row.short_hash),
          authorName: String(row.author_name),
          authorEmail: row.author_email ? String(row.author_email) : undefined,
          message: String(row.message),
          timestamp: Number(row.timestamp),
          branch: row.branch ? String(row.branch) : undefined,
          filesChanged: Number(row.files_changed) || 0,
          insertions: Number(row.insertions) || 0,
          deletions: Number(row.deletions) || 0
        });
      }
      stmt.free();
      return commits;
    } catch {
      return [];
    }
  }

  saveBranches(repoId: string, branches: GitBranchInfo[]): void {
    try {
      const db = this.getDb();
      db.run('DELETE FROM git_branches WHERE repo_id = ?', [repoId]);
      db.run('BEGIN TRANSACTION');
      try {
        const stmt = db.prepare(
          `INSERT INTO git_branches (
            id, repo_id, name, is_current, is_remote, upstream,
            ahead_count, behind_count, last_commit_hash, last_commit_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        for (const b of branches) {
          stmt.run([
            randomUUID(),
            repoId,
            b.name,
            b.isCurrent ? 1 : 0,
            b.isRemote ? 1 : 0,
            b.upstream ?? null,
            b.aheadCount !== undefined && b.aheadCount !== null ? b.aheadCount : null,
            b.behindCount !== undefined && b.behindCount !== null ? b.behindCount : null,
            b.lastCommitHash ?? null,
            b.lastCommitAt ?? null
          ]);
        }
        stmt.free();
        db.run('COMMIT');
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }
    } catch (err) {
      console.warn('[DevPulse GitIntelligenceRepository] Save branches failed:', err);
    }
  }

  getBranches(repoId: string): GitBranchInfo[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(`
        SELECT name, is_current, is_remote, upstream, ahead_count,
               behind_count, last_commit_hash, last_commit_at
        FROM git_branches
        WHERE repo_id = ?
        ORDER BY is_current DESC, is_remote ASC, name ASC
      `);
      stmt.bind([repoId]);
      const branches: GitBranchInfo[] = [];

      while (stmt.step()) {
        const row = stmt.getAsObject();
        branches.push({
          name: String(row.name),
          isCurrent: Boolean(row.is_current),
          isRemote: Boolean(row.is_remote),
          upstream: row.upstream ? String(row.upstream) : undefined,
          aheadCount: row.ahead_count !== null && row.ahead_count !== undefined ? Number(row.ahead_count) : undefined,
          behindCount: row.behind_count !== null && row.behind_count !== undefined ? Number(row.behind_count) : undefined,
          lastCommitHash: row.last_commit_hash ? String(row.last_commit_hash) : undefined,
          lastCommitAt: row.last_commit_at ? Number(row.last_commit_at) : undefined
        });
      }
      stmt.free();
      return branches;
    } catch {
      return [];
    }
  }

  saveWorkingTree(repoId: string, files: GitWorkingTreeFile[]): void {
    try {
      const db = this.getDb();
      db.run('DELETE FROM git_working_tree WHERE repo_id = ?', [repoId]);
      db.run('BEGIN TRANSACTION');
      try {
        const stmt = db.prepare(
          `INSERT INTO git_working_tree (
            id, repo_id, file_path, status, is_staged, old_path, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        );

        const now = Date.now();
        for (const f of files) {
          stmt.run([
            randomUUID(),
            repoId,
            f.path,
            f.status,
            f.isStaged ? 1 : 0,
            f.oldPath ?? null,
            now
          ]);
        }
        stmt.free();
        db.run('COMMIT');
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }
    } catch (err) {
      console.warn('[DevPulse GitIntelligenceRepository] Save working tree failed:', err);
    }
  }

  getWorkingTree(repoId: string): GitWorkingTreeFile[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(`
        SELECT file_path, status, is_staged, old_path
        FROM git_working_tree
        WHERE repo_id = ?
        ORDER BY is_staged DESC, file_path ASC
      `);
      stmt.bind([repoId]);
      const files: GitWorkingTreeFile[] = [];

      while (stmt.step()) {
        const row = stmt.getAsObject();
        files.push({
          path: String(row.file_path),
          status: String(row.status) as GitWorkingTreeFile['status'],
          isStaged: Boolean(row.is_staged),
          oldPath: row.old_path ? String(row.old_path) : undefined
        });
      }
      stmt.free();
      return files;
    } catch {
      return [];
    }
  }

  getSummary(repoId?: string): GitOverviewSummary {
    try {
      const db = this.getDb();
      const repos = this.getRepositories();
      const activeRepo = repoId ? repos.find(r => r.id === repoId) : repos[0];

      if (!activeRepo) {
        return {
          totalRepositories: repos.length,
          currentBranch: 'None',
          totalCommits: 0,
          commitsToday: 0,
          commitsThisWeek: 0,
          uncommittedChangesCount: 0,
          modifiedFilesCount: 0,
          addedFilesCount: 0,
          deletedFilesCount: 0,
          activeContributorsCount: 0
        };
      }

      // Commit stats
      const totalCommitsStmt = db.prepare(
        'SELECT COUNT(*) as count, COUNT(DISTINCT author_name) as authors FROM git_commits WHERE repo_id = ?'
      );
      totalCommitsStmt.bind([activeRepo.id]);
      let totalCommits = 0;
      let contributorsCount = 0;
      if (totalCommitsStmt.step()) {
        const row = totalCommitsStmt.getAsObject();
        totalCommits = Number(row.count) || 0;
        contributorsCount = Number(row.authors) || 0;
      }
      totalCommitsStmt.free();

      // Commits today
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const todayStmt = db.prepare(
        'SELECT COUNT(*) as count FROM git_commits WHERE repo_id = ? AND timestamp >= ?'
      );
      todayStmt.bind([activeRepo.id, startOfDay.getTime()]);
      let commitsToday = 0;
      if (todayStmt.step()) {
        commitsToday = Number(todayStmt.getAsObject().count) || 0;
      }
      todayStmt.free();

      // Commits this week (last 7 days)
      const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
      const weekStmt = db.prepare(
        'SELECT COUNT(*) as count FROM git_commits WHERE repo_id = ? AND timestamp >= ?'
      );
      weekStmt.bind([activeRepo.id, sevenDaysAgo]);
      let commitsThisWeek = 0;
      if (weekStmt.step()) {
        commitsThisWeek = Number(weekStmt.getAsObject().count) || 0;
      }
      weekStmt.free();

      // Working tree changes
      const wtStmt = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status IN ('M', 'modified') THEN 1 ELSE 0 END) as modified_cnt,
          SUM(CASE WHEN status IN ('A', 'added', '?', 'untracked') THEN 1 ELSE 0 END) as added_cnt,
          SUM(CASE WHEN status IN ('D', 'deleted') THEN 1 ELSE 0 END) as deleted_cnt
        FROM git_working_tree
        WHERE repo_id = ?
      `);
      wtStmt.bind([activeRepo.id]);
      let uncommittedCount = 0;
      let modCount = 0;
      let addCount = 0;
      let delCount = 0;
      if (wtStmt.step()) {
        const row = wtStmt.getAsObject();
        uncommittedCount = Number(row.total) || 0;
        modCount = Number(row.modified_cnt) || 0;
        addCount = Number(row.added_cnt) || 0;
        delCount = Number(row.deleted_cnt) || 0;
      }
      wtStmt.free();

      return {
        totalRepositories: repos.length,
        currentBranch: activeRepo.currentBranch || 'HEAD',
        totalCommits,
        commitsToday,
        commitsThisWeek,
        uncommittedChangesCount: uncommittedCount,
        modifiedFilesCount: modCount,
        addedFilesCount: addCount,
        deletedFilesCount: delCount,
        activeContributorsCount: contributorsCount
      };
    } catch {
      return {
        totalRepositories: 0,
        currentBranch: 'None',
        totalCommits: 0,
        commitsToday: 0,
        commitsThisWeek: 0,
        uncommittedChangesCount: 0,
        modifiedFilesCount: 0,
        addedFilesCount: 0,
        deletedFilesCount: 0,
        activeContributorsCount: 0
      };
    }
  }

  getContributionStats(repoId: string): GitContributionStats {
    try {
      const db = this.getDb();
      // Group by author
      const authorStmt = db.prepare(`
        SELECT 
          author_name,
          COUNT(*) as commit_count,
          SUM(insertions) as total_insertions,
          SUM(deletions) as total_deletions,
          MAX(timestamp) as last_commit_at
        FROM git_commits
        WHERE repo_id = ?
        GROUP BY author_name
        ORDER BY commit_count DESC
      `);
      authorStmt.bind([repoId]);
      const authors: GitContributionStats['authors'] = [];
      while (authorStmt.step()) {
        const row = authorStmt.getAsObject();
        authors.push({
          name: String(row.author_name),
          commitCount: Number(row.commit_count),
          insertions: Number(row.total_insertions) || 0,
          deletions: Number(row.total_deletions) || 0,
          lastCommitAt: Number(row.last_commit_at)
        });
      }
      authorStmt.free();

      // Activity by day (last 30 days)
      const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
      const daysStmt = db.prepare(`
        SELECT 
          strftime('%Y-%m-%d', datetime(timestamp / 1000, 'unixepoch')) as day,
          COUNT(*) as commit_count,
          SUM(insertions) as total_insertions,
          SUM(deletions) as total_deletions
        FROM git_commits
        WHERE repo_id = ? AND timestamp >= ?
        GROUP BY day
        ORDER BY day ASC
      `);
      daysStmt.bind([repoId, thirtyDaysAgo]);
      const dailyActivity: GitContributionStats['dailyActivity'] = [];
      while (daysStmt.step()) {
        const row = daysStmt.getAsObject();
        dailyActivity.push({
          date: String(row.day),
          commits: Number(row.commit_count),
          insertions: Number(row.total_insertions) || 0,
          deletions: Number(row.total_deletions) || 0
        });
      }
      daysStmt.free();

      return {
        authors,
        dailyActivity
      };
    } catch {
      return { authors: [], dailyActivity: [] };
    }
  }
}
