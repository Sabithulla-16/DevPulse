import type { Collector } from '../../core/Collector';
import type { CollectorStatus, MetricEvent } from '../../shared/types';
import type { GitIntelligenceRepository } from '../../database/repositories/GitIntelligenceRepository';
import { GitService } from '../../services/git/GitService';
import { GitRepositoryDetector } from '../../services/git/GitRepositoryDetector';
import { GitCli } from '../../services/git/GitCli';

export class GitCollector implements Collector {
  readonly id = 'git';
  readonly name = 'Git Intelligence';
  readonly description = 'Monitors branch switches, commit frequency, uncommitted changes, and repo stats.';
  readonly category = 'git' as const;
  readonly implemented = true;

  private state: CollectorStatus['state'] = 'idle';
  private gitService: GitService;
  private detector: GitRepositoryDetector;
  private gitCli: GitCli;
  private lastError?: string;

  constructor(
    private readonly repo?: GitIntelligenceRepository,
    private readonly getWorkspaceFolders: () => string[] = () => []
  ) {
    this.gitCli = new GitCli();
    this.gitService = new GitService(repo, this.gitCli);
    this.detector = new GitRepositoryDetector(this.gitCli);
  }

  async initialize(): Promise<void> {
    const isGit = await this.gitCli.isGitAvailable();
    if (!isGit) {
      this.lastError = 'Git executable not found in PATH';
      this.state = 'error';
    } else {
      this.state = 'idle';
    }
  }

  async start(): Promise<void> {
    this.state = 'running';
  }

  async stop(): Promise<void> {
    this.state = 'idle';
  }

  getService(): GitService {
    return this.gitService;
  }

  async collect(maxCommits: number = 100): Promise<MetricEvent[]> {
    const events: MetricEvent[] = [];
    this.state = 'running';

    try {
      const isGit = await this.gitCli.isGitAvailable();
      if (!isGit) {
        this.lastError = 'Git CLI not available';
        return [];
      }

      const wsFolders = this.getWorkspaceFolders();
      if (wsFolders.length === 0) {
        return [];
      }

      const repos = await this.detector.detectRepositories(wsFolders);

      for (const r of repos) {
        const syncResult = await this.gitService.syncRepository(r.rootPath, r.workspacePath, maxCommits);

        events.push({
          id: `git-event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          collectorId: this.id,
          type: 'git.activity',
          timestamp: Date.now(),
          payload: {
            repoName: r.name,
            rootPath: r.rootPath,
            currentBranch: syncResult.repo.currentBranch,
            headCommitHash: syncResult.repo.headCommitHash,
            uncommittedFilesCount: syncResult.workingTree.length,
            isClean: syncResult.repo.isClean
          }
        });
      }

      this.lastError = undefined;
    } catch (err: unknown) {
      this.state = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
    }

    return events;
  }

  getStatus(): CollectorStatus {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      enabled: true,
      state: this.state,
      implemented: true,
      error: this.lastError
    };
  }
}
