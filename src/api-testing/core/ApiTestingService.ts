import { randomUUID } from 'node:crypto';
import type { Database } from '../../database/Database';
import { SecretManager, type SecretStorageInterface } from '../security/SecretManager';
import { VariableResolver, type ResolutionContext } from './VariableResolver';
import { RequestExecutor } from './RequestExecutor';
import { CancellationManager } from './CancellationManager';
import { CollectionRunner } from '../runner/CollectionRunner';
import { PostmanAdapter } from '../import-export/PostmanAdapter';
import { OpenApiAdapter } from '../import-export/OpenApiAdapter';
import { CurlAdapter } from '../import-export/CurlAdapter';
import type {
  ApiTestWorkspaceState,
  ApiTestCollectionItem,
  ApiTestFolderItem,
  ApiTestRequestPayload,
  ApiTestVariablePayload,
  ApiTestExecutionPayload,
  ApiTestExecutionResult,
  ApiTestCollectionRunConfig,
  ApiTestRunSummary,
  ApiTestRunProgress,
  ApiTestHistoryItem,
  DevPulseSettings
} from '../../shared/types';

export class ApiTestingService {
  readonly secretManager: SecretManager;
  readonly variableResolver: VariableResolver;
  readonly requestExecutor: RequestExecutor;
  readonly cancellationManager = new CancellationManager();
  readonly collectionRunner: CollectionRunner;

  constructor(
    private readonly database: Database,
    secretStorage: SecretStorageInterface,
    onTelemetryEvent?: (event: any) => void
  ) {
    this.secretManager = new SecretManager(secretStorage);
    this.variableResolver = new VariableResolver(this.secretManager);
    this.requestExecutor = new RequestExecutor(this.variableResolver, this.secretManager, onTelemetryEvent);
    this.collectionRunner = new CollectionRunner(this.requestExecutor, this.database.testing);
  }

  // ---------------------------------------------------------------------------
  // Workspace State
  // ---------------------------------------------------------------------------

  async getWorkspaceState(): Promise<ApiTestWorkspaceState> {
    const rawCollections = this.database.testing.getCollections();
    const rawFolders = this.database.testing.getFolders();
    const rawRequests = this.database.testing.getRequests();
    const rawEnvironments = this.database.testing.getEnvironments();
    const rawHistory = this.database.testing.getHistory(50);
    const activeEnv = this.database.testing.getActiveEnvironment();

    // Map Collections with nested folders and requests
    const collections: ApiTestCollectionItem[] = rawCollections.map(col => {
      const colFolders: ApiTestFolderItem[] = rawFolders
        .filter(f => f.collectionId === col.id)
        .map(f => ({
          id: f.id,
          collectionId: f.collectionId,
          parentFolderId: f.parentFolderId,
          name: f.name,
          description: f.description,
          auth: f.authConfigJson ? JSON.parse(f.authConfigJson) : { type: f.authType as any },
          sortOrder: f.sortOrder
        }));

      const colRequests: ApiTestRequestPayload[] = rawRequests
        .filter(r => r.collectionId === col.id)
        .map(r => ({
          id: r.id,
          collectionId: r.collectionId,
          folderId: r.folderId,
          name: r.name,
          method: r.method,
          url: r.url,
          params: JSON.parse(r.paramsJson || '[]'),
          headers: JSON.parse(r.headersJson || '[]'),
          bodyType: r.bodyType as any,
          bodyContent: r.bodyContent,
          auth: r.authConfigJson ? JSON.parse(r.authConfigJson) : { type: r.authType as any },
          preRequestScript: r.preRequestScript,
          testScript: r.testScript,
          settings: r.settingsJson ? JSON.parse(r.settingsJson) : undefined,
          sortOrder: r.sortOrder
        }));

      return {
        id: col.id,
        name: col.name,
        description: col.description,
        auth: col.authConfigJson ? JSON.parse(col.authConfigJson) : { type: col.authType as any },
        sortOrder: col.sortOrder,
        folders: colFolders,
        requests: colRequests
      };
    });

    // Map Environments with masked secrets
    const environments = rawEnvironments.map(env => {
      const vars = this.database.testing.getVariables(env.id);
      const variables: ApiTestVariablePayload[] = vars.map(v => ({
        id: v.id,
        key: v.key,
        initialValue: v.isSecret ? '' : v.initialValue,
        currentValue: v.isSecret ? '' : v.currentValue,
        isSecret: v.isSecret,
        hasValue: v.isSecret ? !!v.secretRef : undefined,
        description: v.description,
        enabled: v.enabled
      }));

      return {
        id: env.id,
        name: env.name,
        isActive: env.isActive,
        variables
      };
    });

    const history: ApiTestHistoryItem[] = rawHistory.map(h => ({
      id: h.id,
      requestId: h.requestId,
      method: h.method,
      url: h.url,
      statusCode: h.statusCode,
      statusText: h.statusText,
      durationMs: h.durationMs,
      responseSizeBytes: h.responseSizeBytes,
      environmentName: h.environmentName,
      collectionId: h.collectionId,
      executedAt: h.executedAt
    }));

    return {
      collections,
      environments,
      activeEnvironmentId: activeEnv ? activeEnv.id : null,
      history
    };
  }

  // ---------------------------------------------------------------------------
  // Collections & Folders Management
  // ---------------------------------------------------------------------------

  createCollection(name: string, description?: string): string {
    const id = randomUUID();
    const now = Date.now();
    this.database.testing.createCollection({
      id,
      name,
      description,
      authType: 'inherit',
      sortOrder: this.database.testing.getCollections().length + 1,
      createdAt: now,
      updatedAt: now
    });
    return id;
  }

  updateCollection(id: string, updates: { name?: string; description?: string; authConfig?: any }): void {
    const patch: any = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.authConfig !== undefined) {
      patch.authType = updates.authConfig.type || 'inherit';
      patch.authConfigJson = JSON.stringify(updates.authConfig);
    }
    this.database.testing.updateCollection(id, patch);
  }

  deleteCollection(id: string): void {
    // Delete collection cascading in DB
    this.database.testing.deleteCollection(id);
  }

  createFolder(collectionId: string, name: string, parentFolderId?: string): string {
    const id = randomUUID();
    const now = Date.now();
    this.database.testing.createFolder({
      id,
      collectionId,
      parentFolderId,
      name,
      authType: 'inherit',
      sortOrder: this.database.testing.getFolders(collectionId).length + 1,
      createdAt: now,
      updatedAt: now
    });
    return id;
  }

  updateFolder(id: string, updates: { name?: string; parentFolderId?: string }): void {
    this.database.testing.updateFolder(id, updates);
  }

  deleteFolder(id: string): void {
    this.database.testing.deleteFolder(id);
  }

  // ---------------------------------------------------------------------------
  // Request Management & Execution
  // ---------------------------------------------------------------------------

  async saveRequest(payload: ApiTestRequestPayload): Promise<string> {
    const id = payload.id || randomUUID();
    const now = Date.now();

    // SEC-03: Process all sensitive credentials inside auth config and offload to SecretManager
    let authConfig = payload.auth;
    if (authConfig) {
      if (authConfig.bearer?.token && !authConfig.bearer.secretRef) {
        const ref = await this.secretManager.storeSecret(authConfig.bearer.token);
        authConfig = {
          ...authConfig,
          bearer: { secretRef: ref }
        };
      }
      if (authConfig.basic?.password && !authConfig.basic.secretRef) {
        const ref = await this.secretManager.storeSecret(authConfig.basic.password);
        authConfig = {
          ...authConfig,
          basic: { ...authConfig.basic, password: '', secretRef: ref }
        };
      }
      if (authConfig.apiKey?.value && !authConfig.apiKey.secretRef) {
        const ref = await this.secretManager.storeSecret(authConfig.apiKey.value);
        authConfig = {
          ...authConfig,
          apiKey: { ...authConfig.apiKey, value: '', secretRef: ref }
        };
      }
      if (authConfig.oauth2?.accessToken && !authConfig.oauth2.accessTokenRef) {
        const ref = await this.secretManager.storeSecret(authConfig.oauth2.accessToken);
        authConfig = {
          ...authConfig,
          oauth2: { ...authConfig.oauth2, accessToken: '', accessTokenRef: ref }
        };
      }
    }

    this.database.testing.saveRequest({
      id,
      collectionId: payload.collectionId,
      folderId: payload.folderId,
      name: payload.name,
      method: payload.method,
      url: payload.url,
      paramsJson: JSON.stringify(payload.params || []),
      headersJson: JSON.stringify(payload.headers || []),
      bodyType: payload.bodyType || 'none',
      bodyContent: payload.bodyContent,
      authType: authConfig.type || 'inherit',
      authConfigJson: JSON.stringify(authConfig),
      preRequestScript: payload.preRequestScript,
      testScript: payload.testScript,
      settingsJson: payload.settings ? JSON.stringify(payload.settings) : undefined,
      sortOrder: payload.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now
    });

    return id;
  }

  deleteRequest(id: string): void {
    this.database.testing.deleteRequest(id);
  }

  async executeRequest(
    payload: ApiTestExecutionPayload,
    settings: DevPulseSettings
  ): Promise<ApiTestExecutionResult> {
    const abortSignal = this.cancellationManager.register(payload.executionId);

    try {
      const activeEnvId = payload.environmentId ?? this.database.testing.getActiveEnvironment()?.id;
      const envVars = activeEnvId ? this.database.testing.getVariables(activeEnvId) : [];
      const colVars = payload.request.collectionId
        ? this.database.testing.getVariables(null, payload.request.collectionId)
        : [];
      const globalVars = this.database.testing.getVariables(null, null);

      const resolutionContext: ResolutionContext = {
        environmentVariables: envVars,
        collectionVariables: colVars,
        globalVariables: globalVars
      };

      const result = await this.requestExecutor.execute(payload, resolutionContext, settings, abortSignal);

      // Record to Request History
      const envName = activeEnvId ? this.database.testing.getEnvironment(activeEnvId)?.name : undefined;
      this.database.testing.addHistory({
        id: randomUUID(),
        requestId: payload.request.id,
        method: payload.request.method,
        url: payload.request.url,
        statusCode: result.statusCode,
        statusText: result.statusText,
        durationMs: result.durationMs,
        responseSizeBytes: result.responseSizeBytes,
        environmentName: envName,
        collectionId: payload.request.collectionId,
        executedAt: result.executedAt
      });

      return result;
    } finally {
      this.cancellationManager.unregister(payload.executionId);
    }
  }

  cancelRequest(executionId: string): boolean {
    return this.cancellationManager.cancel(executionId);
  }

  // ---------------------------------------------------------------------------
  // Environments & Variables
  // ---------------------------------------------------------------------------

  async saveEnvironment(payload: { id?: string; name: string; variables: ApiTestVariablePayload[] }): Promise<string> {
    const envId = payload.id || randomUUID();
    const now = Date.now();

    this.database.testing.saveEnvironment({
      id: envId,
      name: payload.name,
      isActive: false,
      createdAt: now,
      updatedAt: now
    });

    const varsToSave = [];
    for (const v of payload.variables) {
      const varId = v.id || randomUUID();
      let secretRef: string | undefined;

      if (v.isSecret) {
        if (v.currentValue && v.currentValue !== '••••••••') {
          secretRef = await this.secretManager.storeSecret(v.currentValue);
        } else {
          // Keep existing secret reference if already set
          const existing = this.database.testing.getVariables(envId).find(x => x.id === varId);
          secretRef = existing?.secretRef;
        }
      }

      varsToSave.push({
        id: varId,
        environmentId: envId,
        key: v.key,
        initialValue: v.isSecret ? '' : v.initialValue,
        currentValue: v.isSecret ? '' : v.currentValue,
        isSecret: v.isSecret,
        secretRef,
        description: v.description,
        enabled: v.enabled,
        updatedAt: now
      });
    }

    this.database.testing.replaceEnvironmentVariables(envId, varsToSave);
    return envId;
  }

  deleteEnvironment(id: string): void {
    this.database.testing.deleteEnvironment(id);
  }

  setActiveEnvironment(id: string | null): void {
    this.database.testing.setActiveEnvironment(id);
  }

  async revealSecret(variableId: string): Promise<string | undefined> {
    const vars = this.database.testing.getVariables();
    const target = vars.find(v => v.id === variableId);
    if (target?.secretRef) {
      return this.secretManager.getSecret(target.secretRef);
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  getHistory(limit = 100, search?: string): ApiTestHistoryItem[] {
    const raw = this.database.testing.getHistory(limit, search);
    return raw.map(h => ({
      id: h.id,
      requestId: h.requestId,
      method: h.method,
      url: h.url,
      statusCode: h.statusCode,
      statusText: h.statusText,
      durationMs: h.durationMs,
      responseSizeBytes: h.responseSizeBytes,
      environmentName: h.environmentName,
      collectionId: h.collectionId,
      executedAt: h.executedAt
    }));
  }

  clearHistory(): void {
    this.database.testing.clearHistory();
  }

  // ---------------------------------------------------------------------------
  // Collection Runner
  // ---------------------------------------------------------------------------

  async runCollection(
    config: ApiTestCollectionRunConfig,
    settings: DevPulseSettings,
    onProgress?: (p: ApiTestRunProgress) => void
  ): Promise<ApiTestRunSummary> {
    const abortSignal = this.cancellationManager.register(config.runId);

    try {
      const rawRequests = this.database.testing.getRequests(config.collectionId, config.folderId);
      const requests: ApiTestRequestPayload[] = rawRequests.map(r => ({
        id: r.id,
        collectionId: r.collectionId,
        folderId: r.folderId,
        name: r.name,
        method: r.method,
        url: r.url,
        params: JSON.parse(r.paramsJson || '[]'),
        headers: JSON.parse(r.headersJson || '[]'),
        bodyType: r.bodyType as any,
        bodyContent: r.bodyContent,
        auth: r.authConfigJson ? JSON.parse(r.authConfigJson) : { type: r.authType as any },
        preRequestScript: r.preRequestScript,
        testScript: r.testScript,
        settings: r.settingsJson ? JSON.parse(r.settingsJson) : undefined,
        sortOrder: r.sortOrder
      }));

      const envId = config.environmentId ?? this.database.testing.getActiveEnvironment()?.id;
      const envVars = envId ? this.database.testing.getVariables(envId) : [];
      const colVars = this.database.testing.getVariables(null, config.collectionId);
      const globalVars = this.database.testing.getVariables(null, null);

      const baseContext: ResolutionContext = {
        environmentVariables: envVars,
        collectionVariables: colVars,
        globalVariables: globalVars
      };

      return await this.collectionRunner.run(config, requests, baseContext, settings, abortSignal, onProgress);
    } finally {
      this.cancellationManager.unregister(config.runId);
    }
  }

  cancelRun(runId: string): boolean {
    return this.cancellationManager.cancel(runId);
  }

  // ---------------------------------------------------------------------------
  // Import & Export
  // ---------------------------------------------------------------------------

  async importData(format: 'postman' | 'openapi' | 'curl', content: string): Promise<string> {
    if (format === 'postman') {
      const result = PostmanAdapter.import(content);
      this.database.testing.createCollection({
        id: result.collection.id,
        name: result.collection.name,
        description: result.collection.description,
        authType: result.collection.auth.type,
        authConfigJson: JSON.stringify(result.collection.auth),
        sortOrder: this.database.testing.getCollections().length + 1,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      for (const folder of result.collection.folders) {
        this.database.testing.createFolder({
          id: folder.id,
          collectionId: result.collection.id,
          parentFolderId: folder.parentFolderId,
          name: folder.name,
          description: folder.description,
          authType: folder.auth.type,
          sortOrder: folder.sortOrder,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }

      for (const req of result.collection.requests) {
        await this.saveRequest(req);
      }

      return result.collection.id;
    } else if (format === 'openapi') {
      const result = OpenApiAdapter.import(content);
      this.database.testing.createCollection({
        id: result.collection.id,
        name: result.collection.name,
        description: result.collection.description,
        authType: result.collection.auth.type,
        sortOrder: this.database.testing.getCollections().length + 1,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      for (const req of result.collection.requests) {
        await this.saveRequest(req);
      }

      return result.collection.id;
    } else if (format === 'curl') {
      const parsedReq = CurlAdapter.import(content);
      const colId = this.createCollection('cURL Imports');
      parsedReq.collectionId = colId;
      await this.saveRequest(parsedReq);
      return colId;
    }

    throw new Error(`Unsupported import format: ${format}`);
  }

  exportData(format: 'postman', collectionId: string): string {
    const rawCol = this.database.testing.getCollection(collectionId);
    if (!rawCol) throw new Error(`Collection not found: ${collectionId}`);

    const rawFolders = this.database.testing.getFolders(collectionId);
    const rawRequests = this.database.testing.getRequests(collectionId);

    const collectionItem: ApiTestCollectionItem = {
      id: rawCol.id,
      name: rawCol.name,
      description: rawCol.description,
      auth: rawCol.authConfigJson ? JSON.parse(rawCol.authConfigJson) : { type: rawCol.authType as any },
      sortOrder: rawCol.sortOrder,
      folders: rawFolders.map(f => ({
        id: f.id,
        collectionId: f.collectionId,
        parentFolderId: f.parentFolderId,
        name: f.name,
        description: f.description,
        auth: f.authConfigJson ? JSON.parse(f.authConfigJson) : { type: f.authType as any },
        sortOrder: f.sortOrder
      })),
      requests: rawRequests.map(r => ({
        id: r.id,
        collectionId: r.collectionId,
        folderId: r.folderId,
        name: r.name,
        method: r.method,
        url: r.url,
        params: JSON.parse(r.paramsJson || '[]'),
        headers: JSON.parse(r.headersJson || '[]'),
        bodyType: r.bodyType as any,
        bodyContent: r.bodyContent,
        auth: r.authConfigJson ? JSON.parse(r.authConfigJson) : { type: r.authType as any },
        preRequestScript: r.preRequestScript,
        testScript: r.testScript,
        settings: r.settingsJson ? JSON.parse(r.settingsJson) : undefined,
        sortOrder: r.sortOrder
      }))
    };

    return PostmanAdapter.export(collectionItem);
  }

  reorderItems(itemType: 'collection' | 'folder' | 'request', items: { id: string; sortOrder: number }[]): void {
    if (itemType === 'collection') {
      this.database.testing.reorderCollections(items);
    } else if (itemType === 'folder') {
      this.database.testing.reorderFolders(items);
    } else if (itemType === 'request') {
      this.database.testing.reorderRequests(items);
    }
  }
}
