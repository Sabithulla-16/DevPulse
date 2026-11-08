import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as net from 'node:net';
import si from 'systeminformation';

const execAsync = promisify(exec);

// Protected critical system processes that must never be terminated
const PROTECTED_SYSTEM_PROCESSES = new Set([
  'system idle process',
  'system',
  'registry',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'services.exe',
  'lsass.exe',
  'svchost.exe',
  'winlogon.exe',
  'explorer.exe',
  'dwm.exe',
  'fontdrvhost.exe',
  'sihost.exe',
  'taskhostw.exe',
  'ctfmon.exe',
  'launchd',
  'init',
  'systemd',
  'kthreadd'
]);

export interface TerminationResult {
  success: boolean;
  pid: number;
  processName: string;
  message: string;
  requiresForce?: boolean;
}

export interface FreePortResult {
  success: boolean;
  port: number;
  pid?: number;
  processName?: string;
  message: string;
  requiresForce?: boolean;
}

export class ProcessManager {
  /**
   * Checks if a process is protected (system-critical or host process).
   */
  public static isProtected(pid: number, name: string): boolean {
    if (pid <= 4) return true;
    if (pid === process.pid || pid === process.ppid) return true;

    const lowerName = name.toLowerCase().trim();
    if (PROTECTED_SYSTEM_PROCESSES.has(lowerName)) return true;

    // Check if filename without .exe is protected
    const baseName = lowerName.endsWith('.exe') ? lowerName.slice(0, -4) : lowerName;
    if (PROTECTED_SYSTEM_PROCESSES.has(baseName)) return true;

    return false;
  }

  /**
   * Terminates a process safely with pre-validation and graceful-then-force workflow.
   */
  public static async stopProcess(
    pid: number,
    expectedName: string,
    force = false
  ): Promise<TerminationResult> {
    if (!Number.isInteger(pid) || pid <= 0) {
      return {
        success: false,
        pid,
        processName: expectedName,
        message: `Invalid process ID: ${pid}`
      };
    }

    // 1. Guard against terminating system-critical processes
    if (this.isProtected(pid, expectedName)) {
      return {
        success: false,
        pid,
        processName: expectedName,
        message: `Security restriction: Cannot terminate system-critical or VS Code host process (${expectedName}, PID ${pid}).`
      };
    }

    // 2. Revalidate process identity and status to prevent PID reuse
    const currentName = await this.getCurrentProcessName(pid);
    if (!currentName) {
      return {
        success: true,
        pid,
        processName: expectedName,
        message: `Process ${expectedName} (PID ${pid}) has already exited.`
      };
    }

    const normExpected = expectedName.toLowerCase().replace(/\.exe$/, '');
    const normCurrent = currentName.toLowerCase().replace(/\.exe$/, '');
    if (normExpected !== normCurrent && !normCurrent.includes(normExpected) && !normExpected.includes(normCurrent)) {
      return {
        success: false,
        pid,
        processName: currentName,
        message: `Process identity mismatch: PID ${pid} is now occupied by "${currentName}" (expected "${expectedName}"). Aborted to prevent unintended termination.`
      };
    }

    // 3. Perform termination
    try {
      if (process.platform === 'win32') {
        if (force) {
          // Force termination using taskkill /F
          await execAsync(`taskkill /F /PID ${pid}`);
        } else {
          // Attempt graceful termination without /F
          try {
            await execAsync(`taskkill /PID ${pid}`);
          } catch {
            // Taskkill without /F might fail if process has no window; try Node's process.kill
            try {
              process.kill(pid, 'SIGTERM');
            } catch {}
          }
        }
      } else {
        // POSIX systems
        process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
      }

      // Wait 600ms to allow exit
      await new Promise(resolve => setTimeout(resolve, 600));

      // Verify if process exited
      const stillAlive = await this.isProcessAlive(pid);
      if (!stillAlive) {
        return {
          success: true,
          pid,
          processName: expectedName,
          message: `Process ${expectedName} (PID ${pid}) was successfully stopped.`
        };
      }

      if (!force) {
        return {
          success: false,
          pid,
          processName: expectedName,
          requiresForce: true,
          message: `Process ${expectedName} (PID ${pid}) did not exit gracefully. Force stop is required.`
        };
      } else {
        return {
          success: false,
          pid,
          processName: expectedName,
          message: `Failed to force-stop process ${expectedName} (PID ${pid}). Access may be denied.`
        };
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? 'Termination failed';
      if (msg.includes('Access is denied') || msg.includes('EPERM')) {
        return {
          success: false,
          pid,
          processName: expectedName,
          message: `Permission denied: Terminating ${expectedName} (PID ${pid}) requires elevated administrator privileges.`
        };
      }
      return {
        success: false,
        pid,
        processName: expectedName,
        message: `Error stopping process: ${msg}`
      };
    }
  }

  /**
   * Frees a listening port by identifying its current owning process,
   * confirming its identity, and terminating it safely.
   */
  public static async freePort(
    port: number,
    protocol: 'TCP' | 'UDP' = 'TCP',
    expectedPid?: number,
    expectedProcessName?: string,
    force = false
  ): Promise<FreePortResult> {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return {
        success: false,
        port,
        message: `Invalid port number: ${port}`
      };
    }

    // 1. Re-discover the current owning PID for this port immediately
    const currentOwner = await this.findPortOwner(port, protocol);
    const pid = currentOwner?.pid ?? expectedPid;
    const processName = currentOwner?.processName ?? expectedProcessName;

    if (!pid) {
      return {
        success: true,
        port,
        message: `Port ${port} (${protocol}) is already free. No process is listening.`
      };
    }

    // If expected PID was specified and current owner was found with a DIFFERENT pid, verify
    if (currentOwner && expectedPid && expectedPid !== currentOwner.pid) {
      return {
        success: false,
        port,
        pid: currentOwner.pid,
        processName: currentOwner.processName,
        message: `Port ownership changed: Port ${port} is now occupied by PID ${currentOwner.pid} (${currentOwner.processName ?? 'unknown'}), not PID ${expectedPid}. Please confirm with current process.`
      };
    }

    // 2. Guard against system-critical processes
    if (this.isProtected(pid, processName ?? '')) {
      return {
        success: false,
        port,
        pid,
        processName,
        message: `Cannot free port ${port}: occupied by protected system process "${processName}" (PID ${pid}).`
      };
    }

    // 3. Stop the owning process
    const termResult = await this.stopProcess(pid, processName ?? 'process', force);
    if (!termResult.success) {
      return {
        success: false,
        port,
        pid,
        processName,
        requiresForce: termResult.requiresForce,
        message: termResult.message
      };
    }

    // 4. Verify that the port is actually free
    await new Promise(resolve => setTimeout(resolve, 500));
    const stillOccupied = await this.isPortOccupied(port);

    if (stillOccupied) {
      const remainingOwner = await this.findPortOwner(port, protocol);
      if (remainingOwner && remainingOwner.pid !== pid) {
        return {
          success: false,
          port,
          pid: remainingOwner.pid,
          processName: remainingOwner.processName,
          message: `Process (PID ${pid}) was stopped, but port ${port} is still occupied by "${remainingOwner.processName}" (PID ${remainingOwner.pid}).`
        };
      }
      return {
        success: false,
        port,
        pid,
        processName,
        message: `Process (PID ${pid}) was stopped, but port ${port} has not been released yet.`
      };
    }

    return {
      success: true,
      port,
      pid,
      processName,
      message: `Port ${port} has been freed successfully (Process ${processName ?? ''} PID ${pid} terminated).`
    };
  }

  /**
   * Discovers the current PID and process name owning a specific port.
   */
  public static async findPortOwner(
    port: number,
    protocol: 'TCP' | 'UDP' = 'TCP'
  ): Promise<{ pid: number; processName?: string } | null> {
    // Attempt netstat on Windows
    if (process.platform === 'win32') {
      try {
        const { stdout } = await execAsync('netstat -ano');
        const lines = stdout.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('TCP') && !trimmed.startsWith('UDP')) continue;
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 4) {
            const proto = parts[0].toUpperCase();
            if (protocol === 'TCP' && !trimmed.includes('LISTENING')) continue;
            if (proto !== protocol.toUpperCase()) continue;

            const localAddr = parts[1];
            const portMatch = localAddr.match(/:(\d+)$/);
            const portNum = portMatch ? parseInt(portMatch[1], 10) : NaN;
            if (portNum === port) {
              const pid = parseInt(parts[parts.length - 1], 10);
              if (!isNaN(pid) && pid > 0) {
                const processName = await this.getCurrentProcessName(pid);
                return { pid, processName };
              }
            }
          }
        }
      } catch {
        // Fallback to si.networkConnections()
      }
    }

    // Cross-platform fallback via systeminformation
    try {
      const conns = await si.networkConnections();
      const match = conns.find(c => {
        const pNum = parseInt(String(c.localPort), 10);
        const isListen = c.state === 'LISTEN' || c.protocol.toLowerCase() === 'udp';
        return pNum === port && isListen && c.pid && c.pid > 0;
      });

      if (match && match.pid) {
        const processName = match.process || (await this.getCurrentProcessName(match.pid));
        return { pid: match.pid, processName };
      }
    } catch {}

    // Windows PowerShell fallback for newly bound sockets
    if (process.platform === 'win32') {
      try {
        const { stdout } = await execAsync(
          `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess"`
        );
        const parsedPid = parseInt(stdout.trim(), 10);
        if (!isNaN(parsedPid) && parsedPid > 0) {
          const processName = await this.getCurrentProcessName(parsedPid);
          return { pid: parsedPid, processName };
        }
      } catch {}
    }

    return null;
  }

  /**
   * Tests if a port is currently accepting connections.
   */
  public static isPortOccupied(port: number): Promise<boolean> {
    return new Promise(resolve => {
      const socket = new net.Socket();
      socket.setTimeout(400);

      socket.once('connect', () => {
        socket.destroy();
        resolve(true); // Connected: port is occupied
      });

      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.once('error', () => {
        resolve(false); // Refused: port is likely free
      });

      socket.connect(port, '127.0.0.1');
    });
  }

  /**
   * Tests if a process PID is currently alive.
   */
  public static isProcessAlive(pid: number): Promise<boolean> {
    try {
      // Sending signal 0 checks for process existence without killing it
      process.kill(pid, 0);
      return Promise.resolve(true);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      // EPERM means the process exists but we lack permission to send signals
      return Promise.resolve(code === 'EPERM');
    }
  }

  /**
   * Looks up the current process executable name for a given PID.
   */
  public static async getCurrentProcessName(pid: number): Promise<string | undefined> {
    if (process.platform === 'win32') {
      try {
        const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
        const firstLine = stdout.trim().split(/\r?\n/)[0];
        if (firstLine && !firstLine.includes('No tasks')) {
          const parts = firstLine.split('","');
          if (parts[0]) {
            return parts[0].replace(/^"/, '').trim();
          }
        }
      } catch {}
    }

    try {
      const procs = await si.processes();
      const match = procs.list.find(p => p.pid === pid);
      if (match) {
        return match.name;
      }
    } catch {}

    return undefined;
  }
}
