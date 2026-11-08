import { describe, it, expect } from 'vitest';
import { PostmanAdapter } from '../src/api-testing/import-export/PostmanAdapter';
import { OpenApiAdapter } from '../src/api-testing/import-export/OpenApiAdapter';
import { CurlAdapter } from '../src/api-testing/import-export/CurlAdapter';

describe('Phase 5: API Testing Studio - Import & Export Suite', () => {
  describe('1. Postman Collection v2.1', () => {
    const postmanFixture = JSON.stringify({
      info: {
        name: 'Demo API Suite',
        description: 'Postman collection for automated testing',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      item: [
        {
          name: 'Users Folder',
          item: [
            {
              name: 'Get User List',
              request: {
                method: 'GET',
                header: [
                  { key: 'Accept', value: 'application/json' }
                ],
                url: {
                  raw: 'https://api.example.com/users?page=1&limit=20',
                  query: [
                    { key: 'page', value: '1' },
                    { key: 'limit', value: '20' }
                  ]
                }
              },
              event: [
                {
                  listen: 'test',
                  script: {
                    type: 'text/javascript',
                    exec: ['pm.test("Status is 200", () => { pm.response.to.have.status(200); });']
                  }
                }
              ]
            }
          ]
        },
        {
          name: 'Create User',
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' }
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify({ name: 'John Doe', email: 'john@example.com' }),
              options: { raw: { language: 'json' } }
            },
            url: {
              raw: 'https://api.example.com/users'
            }
          }
        }
      ]
    });

    it('imports Postman v2.1 collection with folders, requests, headers, and test scripts', () => {
      const { collection } = PostmanAdapter.import(postmanFixture);
      expect(collection.name).toBe('Demo API Suite');
      expect(collection.folders.length).toBe(1);
      expect(collection.folders[0].name).toBe('Users Folder');

      expect(collection.requests.length).toBe(2);
      const getReq = collection.requests.find(r => r.name === 'Get User List');
      expect(getReq).toBeDefined();
      expect(getReq?.method).toBe('GET');
      expect(getReq?.params.length).toBe(2);
      expect(getReq?.testScript).toContain('Status is 200');

      const postReq = collection.requests.find(r => r.name === 'Create User');
      expect(postReq).toBeDefined();
      expect(postReq?.method).toBe('POST');
      expect(postReq?.bodyType).toBe('json');
    });

    it('exports collection back to Postman Collection v2.1 JSON', () => {
      const { collection } = PostmanAdapter.import(postmanFixture);
      const exportedJson = PostmanAdapter.export(collection);

      const parsed = JSON.parse(exportedJson);
      expect(parsed.info.name).toBe('Demo API Suite');
      expect(parsed.info.schema).toBe('https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
      expect(parsed.item.length).toBe(2);
    });
  });

  describe('2. OpenAPI 3.0 / 3.1 Import', () => {
    const openApiFixture = JSON.stringify({
      openapi: '3.0.0',
      info: {
        title: 'Petstore Sample API',
        version: '1.0.0',
        description: 'Sample petstore server'
      },
      servers: [
        { url: 'https://petstore.example.com/v1' }
      ],
      paths: {
        '/pets': {
          get: {
            summary: 'List all pets',
            operationId: 'listPets',
            parameters: [
              { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, required: true }
            ]
          },
          post: {
            summary: 'Create a pet',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', example: 'Fido' },
                      tag: { type: 'string', example: 'dog' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    it('converts OpenAPI specification into ready-to-test collection requests', () => {
      const { collection } = OpenApiAdapter.import(openApiFixture);
      expect(collection.name).toBe('Petstore Sample API');
      expect(collection.requests.length).toBe(2);

      const listReq = collection.requests.find(r => r.name === 'List all pets');
      expect(listReq).toBeDefined();
      expect(listReq?.method).toBe('GET');
      expect(listReq?.url).toBe('https://petstore.example.com/v1/pets');
      expect(listReq?.params[0].key).toBe('limit');

      const createReq = collection.requests.find(r => r.name === 'Create a pet');
      expect(createReq).toBeDefined();
      expect(createReq?.method).toBe('POST');
      expect(createReq?.bodyType).toBe('json');
      expect(createReq?.bodyContent).toContain('"Fido"');
    });
  });

  describe('3. cURL Command Import and Export', () => {
    const curlCommand = `curl -X POST 'https://api.example.com/login?remember=true' \\
      -H 'Content-Type: application/json' \\
      -H 'Authorization: Bearer secret-token-abc' \\
      -d '{"user":"developer","pass":"secret123"}'`;

    it('parses cURL command into an ApiTestRequestPayload', () => {
      const request = CurlAdapter.import(curlCommand);
      expect(request.method).toBe('POST');
      expect(request.url).toBe('https://api.example.com/login');
      expect(request.params.find(p => p.key === 'remember')?.value).toBe('true');
      expect(request.headers.find(h => h.key === 'Content-Type')?.value).toBe('application/json');
      expect(request.auth.type).toBe('bearer');
      expect(request.auth.bearer?.token).toBe('secret-token-abc');
      expect(request.bodyType).toBe('json');
    });

    it('exports request to reproducible cURL command', () => {
      const request = CurlAdapter.import(curlCommand);
      const exportedCurl = CurlAdapter.export(request, false);
      expect(exportedCurl).toContain('-X POST');
      expect(exportedCurl).toContain('https://api.example.com/login?remember=true');
      expect(exportedCurl).toContain("Authorization: Bearer secret-token-abc");
    });
  });
});
