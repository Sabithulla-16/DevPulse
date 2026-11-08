export class Scheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private ticking = false;

  constructor(
    private intervalMs: number,
    private readonly onTick: () => Promise<void>
  ) {}

  setInterval(intervalMs: number): void {
    this.intervalMs = Math.max(1000, intervalMs);
    if (this.running) {
      this.stop();
      this.start();
    }
  }

  getInterval(): number {
    return this.intervalMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  async trigger(): Promise<void> {
    await this.executeTick();
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      await this.executeTick();
      if (this.running) {
        this.scheduleNext();
      }
    }, this.intervalMs);
  }

  private async executeTick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.onTick();
    } catch (error) {
      console.error('[DevPulse Scheduler] Tick execution failed:', error);
    } finally {
      this.ticking = false;
    }
  }
}

