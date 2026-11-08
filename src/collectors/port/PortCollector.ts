import * as net from 'node:net';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import si from 'systeminformation';
import type { Collector } from '../../core/Collector';
import type { CollectorStatus, MetricEvent, PortInfo } from '../../shared/types';
import type { Database } from '../../database/Database';
import { ProcessManager } from '../../services/ProcessManager';

const execAsync = promisify(exec);

export const DEFAULT_DEV_PORTS = [3000, 3001, 4173, 5173, 8000, 8080, 9000, 11434];

export class PortCollector implements Collector {
  readonly id = 'port';
  readonly name = 'Port Intelligence';
  readonly description = 'Dynamically discovers listening network ports, owning processes, and protocol states.';
  readonly category = 'system' as const;
  readonly implemented = true;

  private state: CollectorStatus['state'] = 'idle';
  private lastCollectedAt?: number;
  private sampleCount = 0;
  private latestPorts: PortInfo[] = [];
  private pidToPorts = new Map<number, number[]>();

  constructor(
    private readonly database?: Database,
    private readonly defaultDevPorts = DEFAULT_DEV_PORTS
  ) {}

  async initialize(): Promise<void> {
    this.state = 'idle';
    if (this.database) {
      this.latestPorts = this.database.portMetrics.getLatest();
    }
  }

  async start(): Promise<void> {
    this.state = 'running';
  }

  async stop(): Promise<void> {
    this.state = 'paused';
  }

  async collect(): Promise<MetricEvent<PortInfo[]>[]> {
    if (this.state !== 'running') {
      return [];
    }

    const discoveredPorts = new Map<string, PortInfo>();
    this.pidToPorts.clear();

    // 1. Dynamic Discovery via systeminformation.networkConnections()
    try {
      const connections = await si.networkConnections();
      for (const conn of connections) {
        const portNum = parseInt(String(conn.localPort), 10);
        if (isNaN(portNum) || portNum <= 0 || portNum > 65535) continue;

        const isTcpListen = conn.protocol.toLowerCase().includes('tcp') && conn.state === 'LISTEN';
        const isUdp = conn.protocol.toLowerCase().includes('udp');

        if (isTcpListen || isUdp) {
          const proto = isUdp ? 'UDP' : 'TCP';
          const key = `${proto}:${portNum}`;
          const pid = conn.pid && conn.pid > 0 ? conn.pid : undefined;

          discoveredPorts.set(key, {
            port: portNum,
            protocol: proto,
            state: isUdp ? 'BOUND' : 'LISTENING',
            pid,
            processName: conn.process || undefined,
            localAddress: conn.localAddress || undefined
          });

          if (pid) {
            const list = this.pidToPorts.get(pid) ?? [];
            if (!list.includes(portNum)) {
              list.push(portNum);
            }
            this.pidToPorts.set(pid, list);
          }
        }
      }
    } catch {
      // SI network connections failed, fallback to netstat below
    }

    // 2. Windows Dynamic Discovery via netstat -ano
    if (process.platform === 'win32') {
      try {
        const { stdout } = await execAsync('netstat -ano');
        const lines = stdout.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('TCP') && !trimmed.startsWith('UDP')) continue;
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 4) {
            const proto = parts[0].toUpperCase() as 'TCP' | 'UDP';
            const isListening = proto === 'TCP' ? trimmed.includes('LISTENING') : true;
            if (!isListening) continue;

            const localAddr = parts[1];
            const portMatch = localAddr.match(/:(\d+)$/);
            if (!portMatch) continue;
            const portNum = parseInt(portMatch[1], 10);
            const pid = parseInt(parts[parts.length - 1], 10);

            if (!isNaN(portNum) && portNum > 0 && portNum <= 65535) {
              const key = `${proto}:${portNum}`;
              const existing = discoveredPorts.get(key);
              const validPid = !isNaN(pid) && pid > 0 ? pid : existing?.pid;

              discoveredPorts.set(key, {
                port: portNum,
                protocol: proto,
                state: proto === 'TCP' ? 'LISTENING' : 'BOUND',
                pid: validPid,
                processName: existing?.processName,
                localAddress: localAddr
              });

              if (validPid && proto === 'TCP') {
                const list = this.pidToPorts.get(validPid) ?? [];
                if (!list.includes(portNum)) {
                  list.push(portNum);
                }
                this.pidToPorts.set(validPid, list);
              }
            }
          }
        }
      } catch {
        // netstat failed
      }

      // Windows modern TCP listening table via Get-NetTCPConnection
      try {
        const { stdout } = await execAsync(
          'powershell -NoProfile -Command "Get-NetTCPConnection | Where-Object { $_.RemotePort -eq 0 } | Select-Object -Property LocalAddress,LocalPort,OwningProcess | ConvertTo-Csv -NoTypeInformation"'
        );
        const lines = stdout.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim().replace(/"/g, '');
          if (!trimmed || trimmed.startsWith('LocalAddress')) continue;
          const [localAddress, portStr, pidStr] = trimmed.split(',');
          const portNum = parseInt(portStr, 10);
          const pid = parseInt(pidStr, 10);
          if (!isNaN(portNum) && portNum > 0 && portNum <= 65535) {
            const key = `TCP:${portNum}`;
            const existing = discoveredPorts.get(key);
            const validPid = !isNaN(pid) && pid > 0 ? pid : existing?.pid;

            discoveredPorts.set(key, {
              port: portNum,
              protocol: 'TCP',
              state: 'LISTENING',
              pid: validPid,
              processName: existing?.processName,
              localAddress: localAddress || existing?.localAddress
            });

            if (validPid) {
              const list = this.pidToPorts.get(validPid) ?? [];
              if (!list.includes(portNum)) {
                list.push(portNum);
              }
              this.pidToPorts.set(validPid, list);
            }
          }
        }
      } catch {
        // PowerShell command failed or not available
      }
    }

    // 3. Resolve process names for discovered PIDs in a single fast batch
    try {
      const procData = await si.processes();
      const pidNameMap = new Map<number, string>();
      for (const pr of procData.list) {
        pidNameMap.set(pr.pid, pr.name);
      }
      for (const [key, p] of discoveredPorts.entries()) {
        if (p.pid && (!p.processName || p.processName === '')) {
          const resolvedName = pidNameMap.get(p.pid);
          if (resolvedName) {
            p.processName = resolvedName;
            discoveredPorts.set(key, p);
          }
        }
      }
    } catch {
      // SI failed, continue
    }

    // 4. Ensure standard common development ports are tracked (even if closed)
    for (const devPort of this.defaultDevPorts) {
      const tcpKey = `TCP:${devPort}`;
      if (!discoveredPorts.has(tcpKey)) {
        // Verify via quick socket probe if it's open
        const socketCheck = await this.checkPortSocket(devPort);
        if (socketCheck.isOpen) {
          discoveredPorts.set(tcpKey, {
            port: devPort,
            protocol: 'TCP',
            state: 'LISTENING'
          });
        } else {
          discoveredPorts.set(tcpKey, {
            port: devPort,
            protocol: 'TCP',
            state: 'CLOSED'
          });
        }
      }
    }

    // 5. Sort ports: active listening ports first, prioritized by dev port ranges, then port number
    const portsList: PortInfo[] = Array.from(discoveredPorts.values()).sort((a, b) => {
      // Active first
      if (a.state === 'LISTENING' && b.state !== 'LISTENING') return -1;
      if (b.state === 'LISTENING' && a.state !== 'LISTENING') return 1;

      // Common dev ports first
      const isDevA = this.defaultDevPorts.includes(a.port) || (a.port >= 3000 && a.port <= 9999);
      const isDevB = this.defaultDevPorts.includes(b.port) || (b.port >= 3000 && b.port <= 9999);
      if (isDevA && !isDevB) return -1;
      if (!isDevA && isDevB) return 1;

      return a.port - b.port;
    });

    this.latestPorts = portsList;
    const now = Date.now();
    this.lastCollectedAt = now;
    this.sampleCount++;

    if (this.database && portsList.length > 0) {
      this.database.portMetrics.insertBatch(portsList, now);
    }

    return [
      {
        id: randomUUID(),
        collectorId: this.id,
        type: 'port.snapshot',
        timestamp: now,
        payload: portsList
      }
    ];
  }

  getStatus(): CollectorStatus {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      enabled: true,
      state: this.state,
      implemented: this.implemented,
      lastCollectedAt: this.lastCollectedAt,
      sampleCount: this.sampleCount
    };
  }

  getLatestPorts(): PortInfo[] {
    return this.latestPorts;
  }

  getPortsForPid(pid: number): number[] {
    return this.pidToPorts.get(pid) ?? [];
  }

  private checkPortSocket(port: number): Promise<{ port: number; isOpen: boolean }> {
    return new Promise(resolve => {
      const socket = new net.Socket();
      socket.setTimeout(250);

      socket.on('connect', () => {
        socket.destroy();
        resolve({ port, isOpen: true });
      });

      socket.on('error', () => {
        socket.destroy();
        resolve({ port, isOpen: false });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ port, isOpen: false });
      });

      socket.connect(port, '127.0.0.1');
    });
  }
}
