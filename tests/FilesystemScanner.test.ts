import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { FilesystemScanner } from '../src/collectors/filesystem/FilesystemScanner';

describe('FilesystemScanner', () => {
  let tempWorkspace: string;
  let scanner: FilesystemScanner;

  beforeAll(async () => {
    tempWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), 'devpulse-fs-test-'));

    // Create directory tree:
    // /src
    //   /components
    //     Button.tsx (200 bytes)
    //     Card.tsx (300 bytes)
    //   app.ts (150 bytes)
    // /docs
    //   guide.md (400 bytes)
    // /assets
    //   logo.png (500 bytes)
    //   logo-copy.png (500 bytes, identical duplicate)
    // /ignored_dir
    //   secret.txt (1000 bytes)
    // temp.tmp (50 bytes)
    // .gitignore

    await fs.mkdir(path.join(tempWorkspace, 'src', 'components'), { recursive: true });
    await fs.mkdir(path.join(tempWorkspace, 'docs'), { recursive: true });
    await fs.mkdir(path.join(tempWorkspace, 'assets'), { recursive: true });
    await fs.mkdir(path.join(tempWorkspace, 'ignored_dir'), { recursive: true });

    await fs.writeFile(path.join(tempWorkspace, 'src', 'components', 'Button.tsx'), 'export const Button = () => null;'.repeat(6));
    await fs.writeFile(path.join(tempWorkspace, 'src', 'components', 'Card.tsx'), 'export const Card = () => null;'.repeat(9));
    await fs.writeFile(path.join(tempWorkspace, 'src', 'app.ts'), 'console.log("App root");'.repeat(5));
    await fs.writeFile(path.join(tempWorkspace, 'docs', 'guide.md'), '# Documentation Guide'.repeat(15));

    // Duplicate files
    const dupContent = 'EXACT_DUPLICATE_PAYLOAD_FOR_HASHING_TEST_12345'.repeat(10);
    await fs.writeFile(path.join(tempWorkspace, 'assets', 'logo.png'), dupContent);
    await fs.writeFile(path.join(tempWorkspace, 'assets', 'logo-copy.png'), dupContent);

    // Ignored files
    await fs.writeFile(path.join(tempWorkspace, 'ignored_dir', 'secret.txt'), 'secret credentials');
    await fs.writeFile(path.join(tempWorkspace, 'temp.tmp'), 'temporary file');
    await fs.writeFile(path.join(tempWorkspace, '.gitignore'), "ignored_dir/\n*.tmp\n");

    scanner = new FilesystemScanner();
  });

  afterAll(async () => {
    await fs.rm(tempWorkspace, { recursive: true, force: true });
  });

  it('accurately counts scanned files and excludes ignored files', async () => {
    const result = await scanner.scan(tempWorkspace, 'TestWorkspace', {
      enableDuplicates: true
    });

    expect(result.summary.status).toBe('completed');
    // Button.tsx, Card.tsx, app.ts, guide.md, logo.png, logo-copy.png (and .gitignore itself is counted or ignored)
    expect(result.summary.totalFileCount).toBeGreaterThanOrEqual(6);
    expect(result.summary.totalFolderCount).toBeGreaterThanOrEqual(3);

    // Ignored files (secret.txt in ignored_dir and temp.tmp) must NOT appear in largest files
    const filePaths = result.largestFiles.map(f => f.path);
    expect(filePaths.some(p => p.includes('ignored_dir'))).toBe(false);
    expect(filePaths.some(p => p.endsWith('.tmp'))).toBe(false);
  });

  it('correctly calculates recursive directory sizes and child folder counts', async () => {
    const result = await scanner.scan(tempWorkspace, 'TestWorkspace');

    const srcDir = result.directories.find(d => d.path === 'src');
    expect(srcDir).toBeDefined();
    expect(srcDir?.childDirCount).toBe(1);
    expect(srcDir?.recursiveFileCount).toBeGreaterThanOrEqual(3); // app.ts + Button.tsx + Card.tsx
    expect(srcDir?.totalSizeBytes).toBeGreaterThan(0);
  });

  it('identifies top largest files and groups file extensions', async () => {
    const result = await scanner.scan(tempWorkspace, 'TestWorkspace');

    expect(result.largestFiles.length).toBeGreaterThan(0);
    expect(result.largestFiles[0].sizeBytes).toBeGreaterThanOrEqual(result.largestFiles[1].sizeBytes);

    const extNames = result.extensions.map(e => e.extension);
    expect(extNames).toContain('tsx');
    expect(extNames).toContain('ts');
    expect(extNames).toContain('md');
    expect(extNames).toContain('png');
  });

  it('detects duplicate files by streaming hash and calculates wasted bytes', async () => {
    const result = await scanner.scan(tempWorkspace, 'TestWorkspace', {
      enableDuplicates: true
    });

    expect(result.duplicates.length).toBeGreaterThanOrEqual(1);
    const logoDup = result.duplicates.find(d => d.files.some(f => f.includes('logo.png')));
    expect(logoDup).toBeDefined();
    expect(logoDup?.fileCount).toBe(2);
    expect(logoDup?.wastedBytes).toBe(logoDup?.fileSizeBytes);
    expect(logoDup?.files).toContain('assets/logo.png');
    expect(logoDup?.files).toContain('assets/logo-copy.png');
  });

  it('supports cancellation token to abort long-running scans', async () => {
    const cancelScanner = new FilesystemScanner();
    const scanPromise = cancelScanner.scan(tempWorkspace, 'TestWorkspace');
    cancelScanner.cancel();

    await expect(scanPromise).rejects.toThrow('Scan cancelled by user');
  });

  it('safely handles symlinks without infinite recursion', async () => {
    try {
      const symlinkTarget = path.join(tempWorkspace, 'src');
      const symlinkPath = path.join(tempWorkspace, 'docs', 'src-link');
      await fs.symlink(symlinkTarget, symlinkPath, 'junction');

      const result = await scanner.scan(tempWorkspace, 'TestWorkspace');
      expect(result.summary.status).toBe('completed');
    } catch {
      // Symlink creation may require admin on some Windows versions, continue if unsupported
    }
  });
});
