import * as path from 'path';
import { GitCli } from './GitCli';
import type { GitIntelligenceRepository } from '../../database/repositories/GitIntelligenceRepository';
import type {
  GitRepositoryInfo,
  GitCommitInfo,
  GitBranchInfo,
  GitWorkingTreeFile,
  GitHealthInsight
} from '../../shared/types';

export class GitService {
  private gitCli: GitCli;

  constructor(
    private readonly repo?: GitIntelligenceRepository,
    gitCli?: GitCli
  ) {
    this.gitCli = gitCli || new GitCli();
  }

  public async getBranches(repoRoot: string): Promise<GitBranchInfo[]> {
    const res = await this.gitCli.exec(['branch', '-a', '-vv', '--no-color'], { cwd: repoRoot });
    if (res.exitCode !== 0) return [];

    const lines = res.stdout.split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean);
    const branches: GitBranchInfo[] = [];

    for (const line of lines) {
      const isCurrent = line.startsWith('*');
      const stripped = line.replace(/^[\*\s]+/, '').trim();
      if (!stripped) continue;

      // Format: <branch-name> <commit-hash> [<upstream>: ahead X, behind Y] <subject>
      const match = stripped.match(/^(\S+)\s+([0-9a-fA-F]+)(?:\s+\[([^\]]+)\])?(?:\s+(.*))?$/);
      if (!match) continue;

      const rawName = match[1];
      const lastCommitHash = match[2];
      const tracking = match[3] || '';
      const isRemote = rawName.startsWith('remotes/');
      const name = isRemote ? rawName.replace(/^remotes\//, '') : rawName;

      let upstream: string | undefined;
      let aheadCount: number | undefined;
      let behindCount: number | undefined;

      if (tracking) {
        aheadCount = 0;
        behindCount = 0;
        const trackParts = tracking.split(':');
        upstream = trackParts[0]?.trim();
        if (trackParts[1]) {
          const aheadMatch = trackParts[1].match(/ahead\s+(\d+)/);
          const behindMatch = trackParts[1].match(/behind\s+(\d+)/);
          if (aheadMatch) aheadCount = parseInt(aheadMatch[1], 10);
          if (behindMatch) behindCount = parseInt(behindMatch[1], 10);
        }
      }

      branches.push({
        name,
        isCurrent,
        isRemote,
        upstream,
        aheadCount,
        behindCount,
        lastCommitHash
      });
    }

    return branches;
  }

  public async getWorkingTree(repoRoot: string): Promise<GitWorkingTreeFile[]> {
    const res = await this.gitCli.exec(['status', '--porcelain=v1', '-uall'], { cwd: repoRoot });
    if (res.exitCode !== 0) return [];

    const lines = res.stdout.split(/\r?\n/).filter(Boolean);
    const files: GitWorkingTreeFile[] = [];

    for (const line of lines) {
      if (line.length < 3) continue;
      const indexStatus = line[0];
      const workTreeStatus = line[1];
      const filePathRaw = line.substring(3).trim();

      let oldPath: string | undefined;
      let currentPath = filePathRaw;

      if (filePathRaw.includes(' -> ')) {
        const parts = filePathRaw.split(' -> ');
        oldPath = parts[0];
        currentPath = parts[1];
      }

      const isStaged = indexStatus !== ' ' && indexStatus !== '?';

      let status: GitWorkingTreeFile['status'] = 'modified';
      const eff = isStaged ? indexStatus : workTreeStatus;

      if (eff === '?' || eff === 'A') {
        status = 'untracked';
      } else if (eff === 'M') {
        status = 'modified';
      } else if (eff === 'D') {
        status = 'deleted';
      } else if (eff === 'R') {
        status = 'R';
      } else if (eff === 'U') {
        status = 'U';
      }

      files.push({
        path: currentPath,
        status,
        isStaged,
        oldPath
      });
    }

    return files;
  }

  public async getCommits(repoRoot: string, repoId: string, maxCommits = 100): Promise<GitCommitInfo[]> {
    const separator = '---DEV_PULSE_COMMIT---';
    const format = `${separator}%n%H%n%h%n%an%n%ae%n%at%n%s`;

    const res = await this.gitCli.exec(
      ['log', `-n${maxCommits}`, `--format=${format}`, '--numstat'],
      { cwd: repoRoot }
    );

    if (res.exitCode !== 0) return [];

    const blocks = res.stdout.split(separator).filter(b => b.trim().length > 0);
    const commits: GitCommitInfo[] = [];

    for (const block of blocks) {
      const lines = block.split(/\r?\n/).filter(l => l.length > 0);
      if (lines.length < 6) continue;

      const commitHash = lines[0].trim();
      const shortHash = lines[1].trim();
      const authorName = lines[2].trim();
      const authorEmail = lines[3].trim();
      const timestampSec = parseInt(lines[4].trim(), 10);
      const message = lines[5].trim();

      let filesChanged = 0;
      let insertions = 0;
      let deletions = 0;

      for (let i = 6; i < lines.length; i++) {
        const statLine = lines[i].trim();
        const statParts = statLine.split(/\s+/);
        if (statParts.length >= 3) {
          filesChanged++;
          const ins = parseInt(statParts[0], 10);
          const del = parseInt(statParts[1], 10);
          if (!isNaN(ins)) insertions += ins;
          if (!isNaN(del)) deletions += del;
        }
      }

      commits.push({
        id: commitHash,
        repoId,
        commitHash,
        shortHash,
        authorName,
        authorEmail: authorEmail || undefined,
        timestamp: isNaN(timestampSec) ? Date.now() : timestampSec * 1000,
        message,
        filesChanged,
        insertions,
        deletions
      });
    }

    return commits;
  }

  public async getTotalCommitCount(repoRoot: string): Promise<number> {
    const res = await this.gitCli.exec(['rev-list', '--count', 'HEAD'], { cwd: repoRoot });
    if (res.exitCode !== 0) return 0;
    const count = parseInt(res.stdout.trim(), 10);
    return isNaN(count) ? 0 : count;
  }

  public async getRemotes(repoRoot: string): Promise<Array<{ name: string; url: string }>> {
    const res = await this.gitCli.exec(['remote', '-v'], { cwd: repoRoot });
    if (res.exitCode !== 0) return [];

    const remotesMap = new Map<string, string>();
    const lines = res.stdout.split(/\r?\n/).filter(Boolean);

    for (const line of lines) {
      const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
      if (match) {
        remotesMap.set(match[1], match[2]);
      }
    }

    return Array.from(remotesMap.entries()).map(([name, url]) => ({ name, url }));
  }

  public analyzeRepoHealth(
    workingTree: GitWorkingTreeFile[],
    branches: GitBranchInfo[],
    commits: GitCommitInfo[]
  ): GitHealthInsight[] {
    const insights: GitHealthInsight[] = [];

    // 1. Uncommitted file count alert
    if (workingTree.length > 30) {
      insights.push({
        type: 'warning',
        title: 'Large Working Tree Backlog',
        message: `There are ${workingTree.length} uncommitted changes in your repository. Consider breaking them into granular commits.`
      });
    }

    // 2. High churn commits
    const massiveCommit = commits.find(c => (c.insertions + c.deletions) > 2000);
    if (massiveCommit) {
      insights.push({
        type: 'info',
        title: 'Large Refactor Detected',
        message: `Commit ${massiveCommit.shortHash} by ${massiveCommit.authorName} changed ${massiveCommit.filesChanged} files with +${massiveCommit.insertions}/-${massiveCommit.deletions} lines.`
      });
    }

    // 3. Ahead/behind tracking check
    const currentBranch = branches.find(b => b.isCurrent);
    if (currentBranch) {
      if (currentBranch.aheadCount !== undefined && currentBranch.aheadCount > 5) {
        insights.push({
          type: 'warning',
          title: 'Local Branch Ahead of Remote',
          message: `Current branch '${currentBranch.name}' is ${currentBranch.aheadCount} commits ahead of upstream '${currentBranch.upstream || 'remote'}'. Push changes to keep team synchronized.`
        });
      }
      if (currentBranch.behindCount !== undefined && currentBranch.behindCount > 0) {
        insights.push({
          type: 'info',
          title: 'Upstream Updates Available',
          message: `Current branch is ${currentBranch.behindCount} commits behind upstream. Consider pulling before starting new work.`
        });
      }
    }

    // 4. Clean repo state
    if (workingTree.length === 0 && insights.length === 0) {
      insights.push({
        type: 'info',
        title: 'Working Tree Clean',
        message: 'All local changes are committed and working tree is in sync.'
      });
    }

    return insights;
  }

  public async syncRepository(
    repoRoot: string,
    workspacePath: string,
    maxCommits = 100
  ): Promise<{
    repo: GitRepositoryInfo;
    commits: GitCommitInfo[];
    branches: GitBranchInfo[];
    workingTree: GitWorkingTreeFile[];
    insights: GitHealthInsight[];
  }> {
    const repoName = path.basename(repoRoot);
    const repoId = `repo-${Buffer.from(repoRoot).toString('base64').replace(/[/+=]/g, '_')}`;

    const [branches, workingTree, commits, remotes, totalInRepo] = await Promise.all([
      this.getBranches(repoRoot),
      this.getWorkingTree(repoRoot),
      this.getCommits(repoRoot, repoId, maxCommits),
      this.getRemotes(repoRoot),
      this.getTotalCommitCount(repoRoot)
    ]);

    const currentBranch = branches.find(b => b.isCurrent)?.name || 'main';
    const headCommitHash = commits[0]?.commitHash;
    const isClean = workingTree.length === 0;

    const repoInfo: GitRepositoryInfo = {
      id: repoId,
      workspacePath,
      name: repoName,
      rootPath: repoRoot,
      currentBranch,
      headCommitHash,
      remotes,
      isClean,
      lastPolledAt: Date.now(),
      totalCommits: totalInRepo || commits.length
    };

    const insights = this.analyzeRepoHealth(workingTree, branches, commits);

    if (this.repo) {
      this.repo.saveRepository(repoInfo);
      this.repo.saveCommits(repoId, commits);
      this.repo.saveBranches(repoId, branches);
      this.repo.saveWorkingTree(repoId, workingTree);
    }

    return {
      repo: repoInfo,
      commits,
      branches,
      workingTree,
      insights
    };
  }
}
