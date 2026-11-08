import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitExecOptions {
  cwd?: string;
  timeoutMs?: number;
  maxBuffer?: number;
}

export interface GitExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class GitCli {
  private static sanitizeUrl(url: string): string {
    // Strips out credentials from URLs like https://user:pass@host/repo.git
    return url.replace(/https?:\/\/[^@\s]+@/g, (match) => {
      const proto = match.startsWith('https') ? 'https://' : 'http://';
      return proto;
    });
  }

  public static sanitizeOutput(output: string): string {
    return this.sanitizeUrl(output);
  }

  /**
   * Executes a git command safely using execFile with argument array
   */
  public async exec(args: string[], options: GitExecOptions = {}): Promise<GitExecResult> {
    const cwd = options.cwd || process.cwd();
    const timeout = options.timeoutMs ?? 10000;
    const maxBuffer = options.maxBuffer ?? 10 * 1024 * 1024; // 10MB

    try {
      const { stdout, stderr } = await execFileAsync('git', args, {
        cwd,
        timeout,
        maxBuffer,
        windowsHide: true,
        env: {
          ...process.env,
          // Force standard formats and avoid pager or terminal color codes
          GIT_TERMINAL_PROMPT: '0',
          GIT_PAGER: 'cat'
        }
      });

      return {
        stdout: GitCli.sanitizeOutput(stdout.toString()),
        stderr: GitCli.sanitizeOutput(stderr.toString()),
        exitCode: 0
      };
    } catch (err: unknown) {
      const execErr = err as { stdout?: string | Buffer; stderr?: string | Buffer; code?: number; message?: string };
      const stdout = execErr.stdout ? GitCli.sanitizeOutput(execErr.stdout.toString()) : '';
      const stderr = execErr.stderr ? GitCli.sanitizeOutput(execErr.stderr.toString()) : (execErr.message || String(err));
      const exitCode = typeof execErr.code === 'number' ? execErr.code : 1;

      return {
        stdout,
        stderr,
        exitCode
      };
    }
  }

  public async isGitAvailable(): Promise<boolean> {
    try {
      const res = await this.exec(['--version'], { timeoutMs: 3000 });
      return res.exitCode === 0 && res.stdout.includes('git version');
    } catch {
      return false;
    }
  }

  public async isRepository(dirPath: string): Promise<boolean> {
    const res = await this.exec(['rev-parse', '--is-inside-work-tree'], { cwd: dirPath, timeoutMs: 3000 });
    return res.exitCode === 0 && res.stdout.trim() === 'true';
  }

  public async getRepoRoot(dirPath: string): Promise<string | null> {
    const res = await this.exec(['rev-parse', '--show-toplevel'], { cwd: dirPath, timeoutMs: 3000 });
    if (res.exitCode === 0 && res.stdout.trim()) {
      return res.stdout.trim().replace(/\//g, '\\');
    }
    return null;
  }
}
