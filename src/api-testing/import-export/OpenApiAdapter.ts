import { randomUUID } from 'node:crypto';
import type {
  ApiTestCollectionItem,
  ApiTestRequestPayload,
  ApiTestKeyValuePair
} from '../../shared/types';

export class OpenApiAdapter {
  static import(content: string): {
    collection: ApiTestCollectionItem;
    unsupportedFeatures: string[];
  } {
    const raw = JSON.parse(content);
    const unsupportedFeatures: string[] = [];

    const collectionId = randomUUID();
    const info = raw.info || {};
    const title = info.title || 'Imported OpenAPI Spec';
    const description = info.description;

    let baseUrl = 'http://localhost:3000';
    if (Array.isArray(raw.servers) && raw.servers.length > 0) {
      baseUrl = raw.servers[0].url || baseUrl;
    }

    const requests: ApiTestRequestPayload[] = [];
    const paths = raw.paths || {};

    const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];

    for (const [pathStr, pathItem] of Object.entries(paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;

      for (const method of httpMethods) {
        const op = (pathItem as any)[method];
        if (!op) continue;

        const name = op.summary || op.operationId || `${method.toUpperCase()} ${pathStr}`;
        const params: ApiTestKeyValuePair[] = [];
        const headers: ApiTestKeyValuePair[] = [];

        // Parse Parameters
        const combinedParams = [
          ...((pathItem as any).parameters || []),
          ...(op.parameters || [])
        ];

        for (const p of combinedParams) {
          const item: ApiTestKeyValuePair = {
            id: randomUUID(),
            key: p.name || '',
            value: p.example !== undefined ? String(p.example) : (p.schema?.default !== undefined ? String(p.schema.default) : ''),
            description: p.description,
            enabled: p.required === true
          };

          if (p.in === 'query') {
            params.push(item);
          } else if (p.in === 'header') {
            headers.push(item);
          }
        }

        // Parse Request Body
        let bodyType: ApiTestRequestPayload['bodyType'] = 'none';
        let bodyContent: string | undefined;

        if (op.requestBody?.content) {
          const contentTypes = Object.keys(op.requestBody.content);
          if (contentTypes.includes('application/json')) {
            bodyType = 'json';
            const schema = op.requestBody.content['application/json']?.schema;
            if (op.requestBody.content['application/json']?.example) {
              bodyContent = JSON.stringify(op.requestBody.content['application/json'].example, null, 2);
            } else if (schema) {
              bodyContent = JSON.stringify(this.generateExampleFromSchema(schema), null, 2);
            }
          }
        }

        const fullUrl = baseUrl.endsWith('/') && pathStr.startsWith('/')
          ? `${baseUrl}${pathStr.slice(1)}`
          : `${baseUrl}${pathStr}`;

        requests.push({
          id: randomUUID(),
          collectionId,
          name,
          method: method.toUpperCase(),
          url: fullUrl,
          params,
          headers,
          bodyType,
          bodyContent,
          auth: { type: 'inherit' },
          sortOrder: requests.length + 1
        });
      }
    }

    return {
      collection: {
        id: collectionId,
        name: title,
        description,
        auth: { type: 'none' },
        sortOrder: 0,
        folders: [],
        requests
      },
      unsupportedFeatures
    };
  }

  private static generateExampleFromSchema(schema: any): any {
    if (!schema) return {};
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;

    if (schema.type === 'object' && schema.properties) {
      const obj: Record<string, any> = {};
      for (const [key, prop] of Object.entries(schema.properties)) {
        obj[key] = this.generateExampleFromSchema(prop);
      }
      return obj;
    }

    if (schema.type === 'array' && schema.items) {
      return [this.generateExampleFromSchema(schema.items)];
    }

    if (schema.type === 'string') return 'string';
    if (schema.type === 'number' || schema.type === 'integer') return 0;
    if (schema.type === 'boolean') return true;

    return {};
  }
}
