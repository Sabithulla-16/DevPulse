import { randomUUID } from 'node:crypto';
import type {
  ApiTestCollectionItem,
  ApiTestFolderItem,
  ApiTestRequestPayload,
  ApiTestKeyValuePair,
  ApiTestAuthConfig
} from '../../shared/types';

export class PostmanAdapter {
  static import(jsonContent: string): {
    collection: ApiTestCollectionItem;
    unsupportedFeatures: string[];
  } {
    const raw = JSON.parse(jsonContent);
    const unsupportedFeatures: string[] = [];

    const collectionId = randomUUID();
    const info = raw.info || {};
    const collectionName = info.name || 'Imported Postman Collection';
    const description = typeof info.description === 'string' ? info.description : info.description?.content;

    const folders: ApiTestFolderItem[] = [];
    const requests: ApiTestRequestPayload[] = [];

    const parseAuth = (rawAuth?: any): ApiTestAuthConfig => {
      if (!rawAuth) return { type: 'inherit' };
      const type = rawAuth.type;
      if (type === 'bearer') {
        const tokenObj = rawAuth.bearer?.find((p: any) => p.key === 'token') || rawAuth.bearer?.[0];
        return {
          type: 'bearer',
          bearer: { token: tokenObj?.value || '' }
        };
      } else if (type === 'basic') {
        const userObj = rawAuth.basic?.find((p: any) => p.key === 'username');
        const passObj = rawAuth.basic?.find((p: any) => p.key === 'password');
        return {
          type: 'basic',
          basic: { username: userObj?.value || '', password: passObj?.value || '' }
        };
      } else if (type === 'apikey') {
        const keyObj = rawAuth.apikey?.find((p: any) => p.key === 'key');
        const valObj = rawAuth.apikey?.find((p: any) => p.key === 'value');
        const inObj = rawAuth.apikey?.find((p: any) => p.key === 'in');
        return {
          type: 'apikey',
          apiKey: {
            key: keyObj?.value || '',
            value: valObj?.value || '',
            in: inObj?.value === 'query' ? 'query' : 'header'
          }
        };
      }
      return { type: 'none' };
    };

    const parseEvents = (events?: any[]): { preRequestScript?: string; testScript?: string } => {
      let preRequestScript: string | undefined;
      let testScript: string | undefined;

      if (Array.isArray(events)) {
        for (const ev of events) {
          const scriptLines = ev.script?.exec;
          const scriptContent = Array.isArray(scriptLines) ? scriptLines.join('\n') : String(scriptLines || '');
          if (ev.listen === 'prerequest') {
            preRequestScript = scriptContent;
          } else if (ev.listen === 'test') {
            testScript = scriptContent;
          }
        }
      }
      return { preRequestScript, testScript };
    };

    const parseRequestItem = (item: any, folderId?: string, sortOrder = 0): ApiTestRequestPayload => {
      const rawReq = item.request || {};
      const name = item.name || 'Untitled Request';
      const method = typeof rawReq.method === 'string' ? rawReq.method.toUpperCase() : 'GET';

      // Parse URL
      let url = '';
      const params: ApiTestKeyValuePair[] = [];

      if (typeof rawReq.url === 'string') {
        url = rawReq.url;
      } else if (rawReq.url && typeof rawReq.url === 'object') {
        url = rawReq.url.raw || '';
        if (Array.isArray(rawReq.url.query)) {
          for (const q of rawReq.url.query) {
            params.push({
              id: randomUUID(),
              key: q.key || '',
              value: q.value || '',
              description: q.description,
              enabled: q.disabled !== true
            });
          }
        }
      }

      // Parse Headers
      const headers: ApiTestKeyValuePair[] = [];
      if (Array.isArray(rawReq.header)) {
        for (const h of rawReq.header) {
          headers.push({
            id: randomUUID(),
            key: h.key || '',
            value: h.value || '',
            description: h.description,
            enabled: h.disabled !== true
          });
        }
      }

      // Parse Body
      let bodyType: ApiTestRequestPayload['bodyType'] = 'none';
      let bodyContent: string | undefined;

      if (rawReq.body) {
        const mode = rawReq.body.mode;
        if (mode === 'raw') {
          bodyType = 'raw';
          bodyContent = rawReq.body.raw;
          if (rawReq.body.options?.raw?.language === 'json') {
            bodyType = 'json';
          }
        } else if (mode === 'urlencoded') {
          bodyType = 'urlencoded';
          if (Array.isArray(rawReq.body.urlencoded)) {
            bodyContent = rawReq.body.urlencoded
              .filter((f: any) => !f.disabled)
              .map((f: any) => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`)
              .join('&');
          }
        } else if (mode === 'formdata') {
          bodyType = 'formdata';
          bodyContent = JSON.stringify(rawReq.body.formdata);
        }
      }

      const { preRequestScript, testScript } = parseEvents(item.event);

      return {
        id: randomUUID(),
        collectionId,
        folderId,
        name,
        method,
        url,
        params,
        headers,
        bodyType,
        bodyContent,
        auth: parseAuth(rawReq.auth),
        preRequestScript,
        testScript,
        sortOrder
      };
    };

    const processItems = (items: any[], parentFolderId?: string) => {
      let order = 0;
      for (const item of items) {
        order++;
        if (Array.isArray(item.item)) {
          // It's a folder
          const folderId = randomUUID();
          folders.push({
            id: folderId,
            collectionId,
            parentFolderId,
            name: item.name || 'New Folder',
            description: item.description,
            auth: parseAuth(item.auth),
            sortOrder: order
          });
          processItems(item.item, folderId);
        } else if (item.request) {
          // It's a request
          requests.push(parseRequestItem(item, parentFolderId, order));
        }
      }
    };

    if (Array.isArray(raw.item)) {
      processItems(raw.item);
    }

    return {
      collection: {
        id: collectionId,
        name: collectionName,
        description,
        auth: parseAuth(raw.auth),
        sortOrder: 0,
        folders,
        requests
      },
      unsupportedFeatures
    };
  }

  static export(collection: ApiTestCollectionItem): string {
    const buildItemHierarchy = (parentFolderId?: string): any[] => {
      const items: any[] = [];

      // Child Folders
      const childFolders = collection.folders.filter(f => f.parentFolderId === parentFolderId);
      for (const folder of childFolders) {
        items.push({
          name: folder.name,
          description: folder.description,
          item: buildItemHierarchy(folder.id)
        });
      }

      // Child Requests
      const childRequests = collection.requests.filter(r => r.folderId === parentFolderId);
      for (const req of childRequests) {
        const item: any = {
          name: req.name,
          request: {
            method: req.method,
            header: req.headers.map(h => ({
              key: h.key,
              value: h.value,
              disabled: !h.enabled,
              description: h.description
            })),
            url: {
              raw: req.url,
              query: req.params.map(p => ({
                key: p.key,
                value: p.value,
                disabled: !p.enabled,
                description: p.description
              }))
            }
          }
        };

        if (req.bodyType === 'json' && req.bodyContent) {
          item.request.body = {
            mode: 'raw',
            raw: req.bodyContent,
            options: { raw: { language: 'json' } }
          };
        } else if (req.bodyType === 'raw' && req.bodyContent) {
          item.request.body = {
            mode: 'raw',
            raw: req.bodyContent
          };
        }

        const events: any[] = [];
        if (req.preRequestScript) {
          events.push({
            listen: 'prerequest',
            script: { type: 'text/javascript', exec: req.preRequestScript.split('\n') }
          });
        }
        if (req.testScript) {
          events.push({
            listen: 'test',
            script: { type: 'text/javascript', exec: req.testScript.split('\n') }
          });
        }
        if (events.length > 0) {
          item.event = events;
        }

        items.push(item);
      }

      return items;
    };

    const postmanJson = {
      info: {
        name: collection.name,
        description: collection.description,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      item: buildItemHierarchy(undefined)
    };

    return JSON.stringify(postmanJson, null, 2);
  }
}
