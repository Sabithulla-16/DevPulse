import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import initSqlJs, { type Database as SqlDatabase } from 'sql.js';
import { runMigrations } from '../src/database/migrations';
import { GitIntelligenceRepository } from '../src/database/repositories/GitIntelligenceRepository';
import { GitCli } from '../src/services/git/GitCli';
import { GitService } from '../src/services/git/GitService';

describe('Phase 3: Git Intelligence Suite', () => {
  let db: SqlDatabase;
  let gitRepo: GitIntelligenceRepository;

  beforeEach(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();
    runMigrations(db);
    gitRepo = new GitIntelligenceRepository(() => db);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {}
  });

  describe('1. GitCli & Sanitization', () => {
    it('sanitizes embedded authentication tokens from remote URLs', () => {
      const sensitive = 'https://user:ghp_1234567890abcdef@github.com/valtry-labs/devpulse.git';
      const sanitized = GitCli.sanitizeOutput(sensitive);
      expect(sanitized).toBe('https://github.com/valtry-labs/devpulse.git');
      expect(sanitized).not.toContain('ghp_');
      expect(sanitized).not.toContain('user:');
    });

    it('checks git availability safely', async () => {
      const cli = new GitCli();
      const available = await cli.isGitAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('2. GitService & Health Analysis', () => {
    it('flags large uncommitted backlogs as warnings', () => {
      const service = new GitService(gitRepo);
      const dummyFiles = Array.from({ length: 35 }, (_, idx) => ({
        path: `src/file_${idx}.ts`,
        status: 'modified' as const,
        isStaged: false
      }));

      const insights = service.analyzeRepoHealth(dummyFiles, [], []);
      expect(insights.some(i => i.type === 'warning' && i.title.includes('Working Tree'))).toBe(true);
    });

    it('reports clean working tree when no files are pending', () => {
      const service = new GitService(gitRepo);
      const insights = service.analyzeRepoHealth([], [], []);
      expect(insights.some(i => i.type === 'info' && i.title.includes('Clean'))).toBe(true);
    });

    it('identifies branches that are significantly ahead of upstream', () => {
      const service = new GitService(gitRepo);
      const branches = [
        {
          name: 'feature-branch',
          isCurrent: true,
          isRemote: false,
          upstream: 'origin/feature-branch',
          aheadCount: 8,
          behindCount: 0
        }
      ];

      const insights = service.analyzeRepoHealth([], branches, []);
      expect(insights.some(i => i.title.includes('Ahead of Remote'))).toBe(true);
    });
  });

  describe('3. GitIntelligenceRepository', () => {
    const repoId = 'repo-devpulse-1';

    beforeEach(() => {
      gitRepo.saveRepository({
        id: repoId,
        workspacePath: 'C:\\workspace\\devpulse',
        name: 'devpulse',
        rootPath: 'C:\\workspace\\devpulse',
        currentBranch: 'main',
        headCommitHash: 'a1b2c3d4e5f6',
        remotes: [{ name: 'origin', url: 'https://github.com/valtry-labs/devpulse.git' }],
        isClean: false,
        lastPolledAt: Date.now()
      });
    });

    it('retrieves saved repositories correctly', () => {
      const repos = gitRepo.getRepositories();
      expect(repos.length).toBe(1);
      expect(repos[0].name).toBe('devpulse');
      expect(repos[0].currentBranch).toBe('main');
    });

    it('saves commits and calculates summary statistics', () => {
      const now = Date.now();
      gitRepo.saveCommits(repoId, [
        {
          id: 'commit-1',
          repoId,
          commitHash: '1111111111111111',
          shortHash: '1111111',
          authorName: 'Senior Engineer',
          message: 'feat: add git intelligence collector',
          timestamp: now,
          branch: 'main',
          filesChanged: 3,
          insertions: 150,
          deletions: 20
        },
        {
          id: 'commit-2',
          repoId,
          commitHash: '2222222222222222',
          shortHash: '2222222',
          authorName: 'Core Contributor',
          message: 'fix: resolve edge case in port scanner',
          timestamp: now - 3600000,
          branch: 'main',
          filesChanged: 1,
          insertions: 10,
          deletions: 5
        }
      ]);

      gitRepo.saveWorkingTree(repoId, [
        { path: 'src/extension.ts', status: 'modified', isStaged: false },
        { path: 'README.md', status: 'untracked', isStaged: false }
      ]);

      const summary = gitRepo.getSummary(repoId);
      expect(summary.totalCommits).toBe(2);
      expect(summary.commitsToday).toBe(2);
      expect(summary.uncommittedChangesCount).toBe(2);
      expect(summary.modifiedFilesCount).toBe(1);
      expect(summary.addedFilesCount).toBe(1);
      expect(summary.activeContributorsCount).toBe(2);

      const commits = gitRepo.getCommits(repoId);
      expect(commits.length).toBe(2);

      const workingTree = gitRepo.getWorkingTree(repoId);
      expect(workingTree.length).toBe(2);
    });

    it('aggregates author contributions and daily commit activity', () => {
      const now = Date.now();
      gitRepo.saveCommits(repoId, [
        {
          id: 'c-1',
          repoId,
          commitHash: 'abc1234',
          shortHash: 'abc1234',
          authorName: 'Lead Dev',
          message: 'first commit',
          timestamp: now,
          filesChanged: 5,
          insertions: 200,
          deletions: 10
        },
        {
          id: 'c-2',
          repoId,
          commitHash: 'def5678',
          shortHash: 'def5678',
          authorName: 'Lead Dev',
          message: 'second commit',
          timestamp: now,
          filesChanged: 2,
          insertions: 50,
          deletions: 5
        }
      ]);

      const contribs = gitRepo.getContributionStats(repoId);
      expect(contribs.authors.length).toBe(1);
      expect(contribs.authors[0].name).toBe('Lead Dev');
      expect(contribs.authors[0].commitCount).toBe(2);
      expect(contribs.authors[0].insertions).toBe(250);
      expect(contribs.authors[0].deletions).toBe(15);
    });

    it('saves and filters repository branches', () => {
      gitRepo.saveBranches(repoId, [
        {
          name: 'main',
          isCurrent: true,
          isRemote: false,
          upstream: 'origin/main',
          aheadCount: 0,
          behindCount: 0
        },
        {
          name: 'feature/phase-3',
          isCurrent: false,
          isRemote: false,
          upstream: 'origin/feature/phase-3',
          aheadCount: 3,
          behindCount: 0
        }
      ]);

      const branches = gitRepo.getBranches(repoId);
      expect(branches.length).toBe(2);
      expect(branches[0].name).toBe('main');
      expect(branches[0].isCurrent).toBe(true);
      expect(branches[1].aheadCount).toBe(3);
    });

    it('correctly handles branches without upstream tracking (undefined ahead/behind)', () => {
      gitRepo.saveBranches(repoId, [
        {
          name: 'local-only-branch',
          isCurrent: true,
          isRemote: false,
          upstream: undefined,
          aheadCount: undefined,
          behindCount: undefined
        }
      ]);

      const branches = gitRepo.getBranches(repoId);
      expect(branches.length).toBe(1);
      expect(branches[0].upstream).toBeUndefined();
      expect(branches[0].aheadCount).toBeUndefined();
      expect(branches[0].behindCount).toBeUndefined();
    });
  });
});
