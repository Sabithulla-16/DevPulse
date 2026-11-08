import { randomUUID } from 'node:crypto';
import type { SecretManager } from '../security/SecretManager';
import type { ApiTestVariableRecord, ApiTestKeyValuePair } from '../../shared/types';

export interface ResolutionContext {
  iterationData?: Record<string, string>;
  localVariables?: Record<string, string>;
  environmentVariables?: ApiTestVariableRecord[];
  collectionVariables?: ApiTestVariableRecord[];
  globalVariables?: ApiTestVariableRecord[];
}

export class VariableResolver {
  constructor(private readonly secretManager?: SecretManager) {}

  async buildVariableMap(context: ResolutionContext, maskSecrets = false): Promise<Map<string, string>> {
    const map = new Map<string, string>();

    // 1. Global variables
    if (context.globalVariables) {
      await this.applyVariables(map, context.globalVariables, maskSecrets);
    }

    // 2. Collection variables
    if (context.collectionVariables) {
      await this.applyVariables(map, context.collectionVariables, maskSecrets);
    }

    // 3. Environment variables
    if (context.environmentVariables) {
      await this.applyVariables(map, context.environmentVariables, maskSecrets);
    }

    // 4. Local / Script-set variables
    if (context.localVariables) {
      for (const [k, v] of Object.entries(context.localVariables)) {
        map.set(k, String(v));
      }
    }

    // 5. Iteration data (CSV/JSON row)
    if (context.iterationData) {
      for (const [k, v] of Object.entries(context.iterationData)) {
        map.set(k, String(v));
      }
    }

    return map;
  }

  private async applyVariables(
    target: Map<string, string>,
    variables: ApiTestVariableRecord[],
    maskSecrets: boolean
  ): Promise<void> {
    for (const v of variables) {
      if (!v.enabled) continue;

      if (v.isSecret) {
        if (maskSecrets) {
          target.set(v.key, '••••••••');
        } else if (v.secretRef && this.secretManager) {
          const secret = await this.secretManager.getSecret(v.secretRef);
          target.set(v.key, secret || v.currentValue || '');
        } else {
          target.set(v.key, v.currentValue || '');
        }
      } else {
        target.set(v.key, v.currentValue || v.initialValue || '');
      }
    }
  }

  interpolate(template: string, variableMap: Map<string, string>): string {
    if (!template || typeof template !== 'string') return template;

    return template.replace(/\{\{([^}]+)\}\}/g, (match, rawKey) => {
      const key = rawKey.trim();

      // Dynamic generator variables
      if (key === '$guid') {
        return randomUUID();
      }
      if (key === '$timestamp') {
        return Math.floor(Date.now() / 1000).toString();
      }
      if (key === '$isoTimestamp') {
        return new Date().toISOString();
      }
      if (key === '$randomInt') {
        return Math.floor(Math.random() * 1000 + 1).toString();
      }

      if (variableMap.has(key)) {
        return variableMap.get(key)!;
      }

      return match;
    });
  }

  interpolateHeaders(headers: ApiTestKeyValuePair[], variableMap: Map<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const h of headers) {
      if (!h.enabled || !h.key.trim()) continue;
      const key = this.interpolate(h.key.trim(), variableMap);
      const val = this.interpolate(h.value, variableMap);
      result[key] = val;
    }
    return result;
  }

  interpolateParams(params: ApiTestKeyValuePair[], variableMap: Map<string, string>): [string, string][] {
    const result: [string, string][] = [];
    for (const p of params) {
      if (!p.enabled || !p.key.trim()) continue;
      const key = this.interpolate(p.key.trim(), variableMap);
      const val = this.interpolate(p.value, variableMap);
      result.push([key, val]);
    }
    return result;
  }
}
