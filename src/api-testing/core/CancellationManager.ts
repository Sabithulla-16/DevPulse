export class CancellationManager {
  private controllers = new Map<string, AbortController>();

  register(executionId: string): AbortSignal {
    const controller = new AbortController();
    this.controllers.set(executionId, controller);
    return controller.signal;
  }

  cancel(executionId: string): boolean {
    const controller = this.controllers.get(executionId);
    if (controller) {
      controller.abort();
      this.controllers.delete(executionId);
      return true;
    }
    return false;
  }

  unregister(executionId: string): void {
    this.controllers.delete(executionId);
  }

  isCancelled(executionId: string): boolean {
    const controller = this.controllers.get(executionId);
    return controller ? controller.signal.aborted : false;
  }
}
