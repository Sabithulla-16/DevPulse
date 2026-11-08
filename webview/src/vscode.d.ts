interface VsCodeApi { postMessage(message: unknown): void; getState<T>(): T | undefined; setState<T>(state: T): void; }
declare function acquireVsCodeApi(): VsCodeApi;
