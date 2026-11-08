import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs, { type Database as SqlDatabase } from 'sql.js';
import { runMigrations } from '../src/database/migrations';
import { ApiTestingRepository } from '../src/database/repositories/ApiTestingRepository';
import { SecretManager } from '../src/api-testing/security/SecretManager';

describe('Phase 5: API Testing Studio - Database & Storage Suite', () => {
  let db: SqlDatabase;
  let repo: ApiTestingRepository;

  beforeEach(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();
    runMigrations(db);
    repo = new ApiTestingRepository(() => db);
  });

  it('executes Migration 6 and enables foreign key cascades', () => {
    // 1. Create a collection
    repo.createCollection({
      id: 'col-1',
      name: 'Auth Collection',
      authType: 'inherit',
      sortOrder: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // 2. Create child folder
    repo.createFolder({
      id: 'fold-1',
      collectionId: 'col-1',
      name: 'Users Folder',
      authType: 'inherit',
      sortOrder: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // 3. Create child request
    repo.saveRequest({
      id: 'req-1',
      collectionId: 'col-1',
      folderId: 'fold-1',
      name: 'Get User',
      method: 'GET',
      url: 'https://api.example.com/user',
      paramsJson: '[]',
      headersJson: '[]',
      bodyType: 'none',
      authType: 'inherit',
      sortOrder: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    expect(repo.getCollections().length).toBe(1);
    expect(repo.getFolders('col-1').length).toBe(1);
    expect(repo.getRequests('col-1').length).toBe(1);

    // 4. Delete collection -> must cascade and delete folders and requests
    repo.deleteCollection('col-1');

    expect(repo.getCollections().length).toBe(0);
    expect(repo.getFolders('col-1').length).toBe(0);
    expect(repo.getRequests('col-1').length).toBe(0);
  });

  it('cascades environment deletion to variables', () => {
    repo.saveEnvironment({
      id: 'env-1',
      name: 'Staging',
      isActive: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    repo.saveVariable({
      id: 'var-1',
      environmentId: 'env-1',
      key: 'baseUrl',
      initialValue: 'https://staging.api.com',
      currentValue: 'https://staging.api.com',
      isSecret: false,
      enabled: true,
      updatedAt: Date.now()
    });

    expect(repo.getVariables('env-1').length).toBe(1);

    // Delete environment -> cascades to variables
    repo.deleteEnvironment('env-1');
    expect(repo.getVariables('env-1').length).toBe(0);
  });

  it('enforces 500-row ring buffer on request history via SQLite trigger', () => {
    // Insert 505 history records
    for (let i = 1; i <= 505; i++) {
      repo.addHistory({
        id: `hist-${i}`,
        method: 'GET',
        url: `https://api.example.com/item/${i}`,
        statusCode: 200,
        statusText: 'OK',
        durationMs: 50,
        responseSizeBytes: 100,
        executedAt: i // timestamp ordered
      });
    }

    const history = repo.getHistory(1000);
    expect(history.length).toBe(500);
    // Oldest items (1 through 5) were pruned
    expect(history.some(h => h.id === 'hist-1')).toBe(false);
    expect(history.some(h => h.id === 'hist-5')).toBe(false);
    expect(history.some(h => h.id === 'hist-505')).toBe(true);
  });

  it('manages secret references safely without plaintext exposure in SQLite', async () => {
    const memorySecrets = new Map<string, string>();
    const secretManager = new SecretManager({
      get: async k => memorySecrets.get(k),
      store: async (k, v) => {
        memorySecrets.set(k, v);
      },
      delete: async k => {
        memorySecrets.delete(k);
      }
    });

    const secretRef = await secretManager.storeSecret('my-super-secret-token');
    expect(secretRef).toContain('devpulse.api_testing.secret.');

    // Save variable pointing to secretRef with empty/masked values in SQLite
    repo.saveVariable({
      id: 'var-secret',
      key: 'apiSecret',
      initialValue: '',
      currentValue: '',
      isSecret: true,
      secretRef,
      enabled: true,
      updatedAt: Date.now()
    });

    const stored = repo.getVariables().find(v => v.id === 'var-secret');
    expect(stored?.initialValue).toBe('');
    expect(stored?.currentValue).toBe('');
    expect(stored?.secretRef).toBe(secretRef);

    // SecretManager retrieves real decrypted secret
    const decrypted = await secretManager.getSecret(stored!.secretRef!);
    expect(decrypted).toBe('my-super-secret-token');
  });

  it('clears transient test history while strictly preserving authored collections and requests', () => {
    // 1. Authored collection and request
    repo.createCollection({
      id: 'user-col',
      name: 'My API Suite',
      authType: 'inherit',
      sortOrder: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    repo.saveRequest({
      id: 'user-req',
      collectionId: 'user-col',
      name: 'Auth Request',
      method: 'POST',
      url: 'https://api.example.com/login',
      paramsJson: '[]',
      headersJson: '[]',
      bodyType: 'none',
      authType: 'inherit',
      sortOrder: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // 2. Transient history
    repo.addHistory({
      id: 'transient-hist',
      method: 'POST',
      url: 'https://api.example.com/login',
      statusCode: 200,
      statusText: 'OK',
      durationMs: 120,
      responseSizeBytes: 250,
      executedAt: Date.now()
    });

    // Run clearTransientHistory()
    repo.clearTransientHistory();

    // History is erased
    expect(repo.getHistory().length).toBe(0);

    // Authored assets are PRESERVED
    expect(repo.getCollections().length).toBe(1);
    expect(repo.getRequests('user-col').length).toBe(1);
  });
});
