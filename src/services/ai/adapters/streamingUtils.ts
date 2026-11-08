/**
 * Utility helpers for Server-Sent Events (SSE) and JSON line stream consumption.
 */

export async function parseSseStream(
  response: Response,
  onData: (data: string) => void
): Promise<void> {
  if (!response.body) {
    throw new Error('Response body is null or not readable');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let currentEventLines: string[] = [];

  const flushEvent = () => {
    if (currentEventLines.length > 0) {
      const fullEventData = currentEventLines.join('\n').trim();
      currentEventLines = [];
      if (fullEventData === '[DONE]') {
        return;
      }
      if (fullEventData) {
        onData(fullEventData);
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      // Keep the last partial line in buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '') {
          // Empty line marks an event boundary in SSE
          flushEvent();
          continue;
        }
        if (trimmed.startsWith(':')) {
          // Skip comments / heartbeats
          continue;
        }

        if (line.startsWith('data:')) {
          currentEventLines.push(line.slice(5).trimStart());
        } else if (line.startsWith('data ')) {
          currentEventLines.push(line.slice(5));
        }
      }
    }

    if (buffer.trim()) {
      if (buffer.startsWith('data:')) {
        currentEventLines.push(buffer.slice(5).trimStart());
      }
    }
    flushEvent();
  } finally {
    reader.releaseLock();
  }
}

export async function parseNdjsonStream(
  response: Response,
  onJson: (json: any) => void
): Promise<void> {
  if (!response.body) {
    throw new Error('Response body is null or not readable');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          onJson(parsed);
        } catch {
          // ignore partial parse error
        }
      }
    }

    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim());
        onJson(parsed);
      } catch {}
    }
  } finally {
    reader.releaseLock();
  }
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
