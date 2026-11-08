import * as fs from 'fs';
import * as path from 'path';
import { GitCli } from './GitCli';

export interface DiscoveredGitRepo {
  name: string;
  rootPath: string;
  workspacePath: string;
}

export class GitRepositoryDetector {
  private gitCli: GitCli;

  constructor(gitCli?: GitCli) {
    this.gitCli = gitCli || new GitCli();
  }

  public async detectRepositories(workspaceFolders: string[]): Promise<DiscoveredGitRepo[]> {
    const discovered = new Map<string, DiscoveredGitRepo>();

    for (const wsPath of workspaceFolders) {
      if (!fs.existsSync(wsPath)) continue;

      // 1. Check if workspace path itself is a Git repository
      const isDirectRepo = await this.gitCli.isRepository(wsPath);
      if (isDirectRepo) {
        const root = await this.gitCli.getRepoRoot(wsPath);
        const resolvedRoot = root || path.resolve(wsPath);
        const repoName = path.basename(resolvedRoot);
        discovered.set(resolvedRoot.toLowerCase(), {
          name: repoName,
          rootPath: resolvedRoot,
          workspacePath: wsPath
        });
      } else {
        // 2. Scan immediate subdirectories (depth 1 and 2) for monorepo roots
        await this.scanSubdirectories(wsPath, wsPath, 1, 2, discovered);
      }
    }

    return Array.from(discovered.values());
  }

  private async scanSubdirectories(
    currentDir: string,
    workspacePath: string,
    currentDepth: number,
    maxDepth: number,
    discovered: Map<string, DiscoveredGitRepo>
  ): Promise<void> {
    if (currentDepth > maxDepth) return;

    try {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dirName = entry.name;

        // Skip ignored directories
        if (
          dirName === '.git' ||
          dirName === 'node_modules' ||
          dirName === '.vscode' ||
          dirName === 'dist' ||
          dirName === 'out' ||
          dirName === 'build' ||
          dirName.startsWith('.')
        ) {
          continue;
        }

        const subDirPath = path.join(currentDir, dirName);
        const hasDotGit = fs.existsSync(path.join(subDirPath, '.git'));

        if (hasDotGit) {
          const isRepo = await this.gitCli.isRepository(subDirPath);
          if (isRepo) {
            const root = (await this.gitCli.getRepoRoot(subDirPath)) || path.resolve(subDirPath);
            if (!discovered.has(root.toLowerCase())) {
              discovered.set(root.toLowerCase(), {
                name: path.basename(root),
                rootPath: root,
                workspacePath
              });
            }
            continue; // don't recurse deeper into this repo
          }
        }

        if (currentDepth < maxDepth) {
          await this.scanSubdirectories(subDirPath, workspacePath, currentDepth + 1, maxDepth, discovered);
        }
      }
    } catch {
      // Ignore read errors
    }
  }
}
