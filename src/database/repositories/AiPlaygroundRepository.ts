import type { Database as SqlDatabase } from 'sql.js';
import { randomUUID } from 'node:crypto';
import type {
  AiConversation,
  AiMessage,
  AiPromptTemplate,
  AiPromptVersion,
  AiGenerationPreset,
  AiCustomProvider,
  PromptTemplateInput,
  GenerationPresetInput
} from '../../shared/types';

export class AiPlaygroundRepository {
  constructor(
    private readonly getDb: () => SqlDatabase,
    private readonly schedulePersist?: () => void
  ) {}

  // -------------------------------------------------------------------------
  // Conversations
  // -------------------------------------------------------------------------

  createConversation(data: {
    title: string;
    providerId: string;
    modelId: string;
    systemPrompt?: string;
    generationSettings?: Record<string, unknown>;
  }): AiConversation {
    const db = this.getDb();
    const id = randomUUID();
    const now = Date.now();
    const settingsJson = data.generationSettings ? JSON.stringify(data.generationSettings) : null;

    db.run(
      `INSERT INTO ai_conversations (
        id, title, provider_id, model_id, system_prompt, generation_settings_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.title,
        data.providerId,
        data.modelId,
        data.systemPrompt ?? null,
        settingsJson,
        now,
        now
      ]
    );

    this.schedulePersist?.();
    return {
      id,
      title: data.title,
      providerId: data.providerId,
      modelId: data.modelId,
      systemPrompt: data.systemPrompt,
      generationSettings: data.generationSettings,
      createdAt: now,
      updatedAt: now
    };
  }

  getConversations(): AiConversation[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(
        'SELECT id, title, provider_id, model_id, system_prompt, generation_settings_json, created_at, updated_at, archived_at FROM ai_conversations ORDER BY updated_at DESC'
      );
      const list: AiConversation[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        list.push({
          id: String(row.id),
          title: String(row.title),
          providerId: String(row.provider_id),
          modelId: String(row.model_id),
          systemPrompt: row.system_prompt ? String(row.system_prompt) : undefined,
          generationSettings: row.generation_settings_json ? JSON.parse(String(row.generation_settings_json)) : undefined,
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at),
          archivedAt: row.archived_at ? Number(row.archived_at) : undefined
        });
      }
      stmt.free();
      return list;
    } catch {
      return [];
    }
  }

  getConversation(id: string): AiConversation | undefined {
    try {
      const db = this.getDb();
      const stmt = db.prepare('SELECT * FROM ai_conversations WHERE id = ? LIMIT 1');
      stmt.bind([id]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return {
          id: String(row.id),
          title: String(row.title),
          providerId: String(row.provider_id),
          modelId: String(row.model_id),
          systemPrompt: row.system_prompt ? String(row.system_prompt) : undefined,
          generationSettings: row.generation_settings_json ? JSON.parse(String(row.generation_settings_json)) : undefined,
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at),
          archivedAt: row.archived_at ? Number(row.archived_at) : undefined
        };
      }
      stmt.free();
    } catch {}
    return undefined;
  }

  renameConversation(id: string, title: string): boolean {
    try {
      const db = this.getDb();
      db.run('UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ?', [title, Date.now(), id]);
      this.schedulePersist?.();
      return true;
    } catch {
      return false;
    }
  }

  updateConversationSettings(id: string, providerId: string, modelId: string, settings?: Record<string, unknown>, systemPrompt?: string): boolean {
    try {
      const db = this.getDb();
      db.run(
        `UPDATE ai_conversations SET 
          provider_id = ?, model_id = ?, generation_settings_json = ?, system_prompt = ?, updated_at = ? 
        WHERE id = ?`,
        [providerId, modelId, settings ? JSON.stringify(settings) : null, systemPrompt ?? null, Date.now(), id]
      );
      this.schedulePersist?.();
      return true;
    } catch {
      return false;
    }
  }

  deleteConversation(id: string): boolean {
    try {
      const db = this.getDb();
      db.run('DELETE FROM ai_conversations WHERE id = ?', [id]);
      this.schedulePersist?.();
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  addMessage(msg: {
    conversationId: string;
    role: 'system' | 'user' | 'assistant';
    content: string;
    status?: 'streaming' | 'completed' | 'error' | 'stopped';
    inputTokens?: number;
    outputTokens?: number;
    durationMs?: number;
    errorMessage?: string;
    attachments?: unknown[];
  }): AiMessage {
    const db = this.getDb();
    const id = randomUUID();
    const now = Date.now();
    const status = msg.status ?? 'completed';

    db.run(
      `INSERT INTO ai_messages (
        id, conversation_id, role, content, status, input_tokens, output_tokens,
        duration_ms, error_message, context_attachments_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        msg.conversationId,
        msg.role,
        msg.content,
        status,
        msg.inputTokens ?? 0,
        msg.outputTokens ?? 0,
        msg.durationMs ?? null,
        msg.errorMessage ?? null,
        msg.attachments ? JSON.stringify(msg.attachments) : null,
        now,
        now
      ]
    );

    // Update conversation updated_at
    db.run('UPDATE ai_conversations SET updated_at = ? WHERE id = ?', [now, msg.conversationId]);
    this.schedulePersist?.();

    return {
      id,
      conversationId: msg.conversationId,
      role: msg.role,
      content: msg.content,
      status,
      inputTokens: msg.inputTokens ?? 0,
      outputTokens: msg.outputTokens ?? 0,
      durationMs: msg.durationMs,
      errorMessage: msg.errorMessage,
      attachments: msg.attachments as any,
      createdAt: now,
      updatedAt: now
    };
  }

  updateMessage(id: string, updates: {
    content?: string;
    status?: 'streaming' | 'completed' | 'error' | 'stopped';
    inputTokens?: number;
    outputTokens?: number;
    durationMs?: number;
    errorMessage?: string;
  }): boolean {
    try {
      const db = this.getDb();
      const currentStmt = db.prepare('SELECT conversation_id, content, status, input_tokens, output_tokens, duration_ms, error_message FROM ai_messages WHERE id = ?');
      currentStmt.bind([id]);
      if (!currentStmt.step()) {
        currentStmt.free();
        return false;
      }
      const cur = currentStmt.getAsObject();
      currentStmt.free();

      const newContent = updates.content !== undefined ? updates.content : String(cur.content);
      const newStatus = updates.status !== undefined ? updates.status : String(cur.status);
      const newInTok = updates.inputTokens !== undefined ? updates.inputTokens : Number(cur.input_tokens);
      const newOutTok = updates.outputTokens !== undefined ? updates.outputTokens : Number(cur.output_tokens);
      const newDur = updates.durationMs !== undefined ? updates.durationMs : (cur.duration_ms ? Number(cur.duration_ms) : null);
      const newErr = updates.errorMessage !== undefined ? updates.errorMessage : (cur.error_message ? String(cur.error_message) : null);
      const now = Date.now();

      db.run(
        `UPDATE ai_messages SET 
          content = ?, status = ?, input_tokens = ?, output_tokens = ?, duration_ms = ?, error_message = ?, updated_at = ?
        WHERE id = ?`,
        [newContent, newStatus, newInTok, newOutTok, newDur, newErr, now, id]
      );

      if (cur.conversation_id) {
        db.run('UPDATE ai_conversations SET updated_at = ? WHERE id = ?', [now, String(cur.conversation_id)]);
      }

      this.schedulePersist?.();
      return true;
    } catch {
      return false;
    }
  }

  getMessages(conversationId: string): AiMessage[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare(
        'SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC'
      );
      stmt.bind([conversationId]);
      const list: AiMessage[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        list.push({
          id: String(row.id),
          conversationId: String(row.conversation_id),
          role: row.role as any,
          content: String(row.content),
          status: row.status as any,
          inputTokens: Number(row.input_tokens) || 0,
          outputTokens: Number(row.output_tokens) || 0,
          durationMs: row.duration_ms ? Number(row.duration_ms) : undefined,
          errorMessage: row.error_message ? String(row.error_message) : undefined,
          attachments: row.context_attachments_json ? JSON.parse(String(row.context_attachments_json)) : undefined,
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at)
        });
      }
      stmt.free();
      return list;
    } catch {
      return [];
    }
  }

  deleteMessage(id: string): boolean {
    try {
      const db = this.getDb();
      db.run('DELETE FROM ai_messages WHERE id = ?', [id]);
      this.schedulePersist?.();
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Prompt Templates & Versions
  // -------------------------------------------------------------------------

  getTemplates(category?: string): AiPromptTemplate[] {
    try {
      const db = this.getDb();
      let query = 'SELECT * FROM ai_prompt_templates';
      const params: (string | number)[] = [];
      if (category && category !== 'All') {
        query += ' WHERE category = ?';
        params.push(category);
      }
      query += ' ORDER BY is_favorite DESC, name ASC';

      const stmt = db.prepare(query);
      stmt.bind(params);
      const list: AiPromptTemplate[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        list.push({
          id: String(row.id),
          name: String(row.name),
          description: row.description ? String(row.description) : undefined,
          category: String(row.category || 'General'),
          systemPrompt: row.system_prompt ? String(row.system_prompt) : undefined,
          userPrompt: String(row.user_prompt),
          variables: row.variables_json ? JSON.parse(String(row.variables_json)) : [],
          isFavorite: Boolean(row.is_favorite),
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at)
        });
      }
      stmt.free();
      return list;
    } catch {
      return [];
    }
  }

  saveTemplate(input: PromptTemplateInput): AiPromptTemplate {
    const db = this.getDb();
    const id = input.id || randomUUID();
    const now = Date.now();
    const varsJson = JSON.stringify(input.variables || []);
    const fav = input.isFavorite ? 1 : 0;

    // Check if updating
    const checkStmt = db.prepare('SELECT id FROM ai_prompt_templates WHERE id = ?');
    checkStmt.bind([id]);
    const exists = checkStmt.step();
    checkStmt.free();

    if (exists) {
      db.run(
        `UPDATE ai_prompt_templates SET
          name = ?, description = ?, category = ?, system_prompt = ?, user_prompt = ?, variables_json = ?, is_favorite = ?, updated_at = ?
        WHERE id = ?`,
        [input.name, input.description ?? null, input.category || 'General', input.systemPrompt ?? null, input.userPrompt, varsJson, fav, now, id]
      );

      // Record a new version
      const verStmt = db.prepare('SELECT COALESCE(MAX(version), 0) as max_v FROM ai_prompt_versions WHERE template_id = ?');
      verStmt.bind([id]);
      let nextVer = 1;
      if (verStmt.step()) {
        nextVer = Number(verStmt.getAsObject().max_v) + 1;
      }
      verStmt.free();

      db.run(
        `INSERT INTO ai_prompt_versions (id, template_id, version, system_prompt, user_prompt, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), id, nextVer, input.systemPrompt ?? null, input.userPrompt, now]
      );
    } else {
      db.run(
        `INSERT INTO ai_prompt_templates (
          id, name, description, category, system_prompt, user_prompt, variables_json, is_favorite, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.name, input.description ?? null, input.category || 'General', input.systemPrompt ?? null, input.userPrompt, varsJson, fav, now, now]
      );

      // Initial version 1
      db.run(
        `INSERT INTO ai_prompt_versions (id, template_id, version, system_prompt, user_prompt, created_at)
         VALUES (?, ?, 1, ?, ?, ?)`,
        [randomUUID(), id, input.systemPrompt ?? null, input.userPrompt, now]
      );
    }

    this.schedulePersist?.();
    return {
      id,
      name: input.name,
      description: input.description,
      category: input.category || 'General',
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      variables: input.variables || [],
      isFavorite: Boolean(input.isFavorite),
      createdAt: now,
      updatedAt: now
    };
  }

  getPromptVersions(templateId: string): AiPromptVersion[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare('SELECT * FROM ai_prompt_versions WHERE template_id = ? ORDER BY version DESC');
      stmt.bind([templateId]);
      const list: AiPromptVersion[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        list.push({
          id: String(row.id),
          templateId: String(row.template_id),
          version: Number(row.version),
          systemPrompt: row.system_prompt ? String(row.system_prompt) : undefined,
          userPrompt: String(row.user_prompt),
          createdAt: Number(row.created_at)
        });
      }
      stmt.free();
      return list;
    } catch {
      return [];
    }
  }

  deleteTemplate(id: string): boolean {
    try {
      const db = this.getDb();
      db.run('DELETE FROM ai_prompt_templates WHERE id = ?', [id]);
      this.schedulePersist?.();
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Generation Presets
  // -------------------------------------------------------------------------

  getPresets(): AiGenerationPreset[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare('SELECT * FROM ai_generation_presets ORDER BY is_builtin DESC, name ASC');
      const list: AiGenerationPreset[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        list.push({
          id: String(row.id),
          name: String(row.name),
          description: row.description ? String(row.description) : undefined,
          settings: row.settings_json ? JSON.parse(String(row.settings_json)) : {},
          isBuiltin: Boolean(row.is_builtin),
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at)
        });
      }
      stmt.free();
      return list;
    } catch {
      return [];
    }
  }

  savePreset(input: GenerationPresetInput): AiGenerationPreset {
    const db = this.getDb();
    const id = input.id || randomUUID();
    const now = Date.now();
    const settingsJson = JSON.stringify(input.settings || {});

    const checkStmt = db.prepare('SELECT id FROM ai_generation_presets WHERE id = ?');
    checkStmt.bind([id]);
    const exists = checkStmt.step();
    checkStmt.free();

    if (exists) {
      db.run(
        'UPDATE ai_generation_presets SET name = ?, description = ?, settings_json = ?, updated_at = ? WHERE id = ?',
        [input.name, input.description ?? null, settingsJson, now, id]
      );
    } else {
      db.run(
        'INSERT INTO ai_generation_presets (id, name, description, settings_json, is_builtin, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
        [id, input.name, input.description ?? null, settingsJson, now, now]
      );
    }

    this.schedulePersist?.();
    return {
      id,
      name: input.name,
      description: input.description,
      settings: input.settings,
      isBuiltin: false,
      createdAt: now,
      updatedAt: now
    };
  }

  deletePreset(id: string): boolean {
    try {
      const db = this.getDb();
      db.run('DELETE FROM ai_generation_presets WHERE id = ? AND is_builtin = 0', [id]);
      this.schedulePersist?.();
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Custom AI Providers
  // -------------------------------------------------------------------------

  getCustomProviders(): AiCustomProvider[] {
    try {
      const db = this.getDb();
      const stmt = db.prepare('SELECT * FROM ai_custom_providers ORDER BY name ASC');
      const list: AiCustomProvider[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        list.push({
          id: String(row.id),
          name: String(row.name),
          baseUrl: String(row.base_url),
          modelIds: row.model_ids_json ? JSON.parse(String(row.model_ids_json)) : [],
          headers: row.headers_json ? JSON.parse(String(row.headers_json)) : undefined,
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at)
        });
      }
      stmt.free();
      return list;
    } catch {
      return [];
    }
  }

  saveCustomProvider(p: { id?: string; name: string; baseUrl: string; modelIds: string[]; headers?: Record<string, string> }): AiCustomProvider {
    const db = this.getDb();
    const id = p.id || randomUUID();
    const now = Date.now();
    const modelsJson = JSON.stringify(p.modelIds || []);
    const headersJson = p.headers ? JSON.stringify(p.headers) : null;

    const checkStmt = db.prepare('SELECT id FROM ai_custom_providers WHERE id = ?');
    checkStmt.bind([id]);
    const exists = checkStmt.step();
    checkStmt.free();

    if (exists) {
      db.run(
        'UPDATE ai_custom_providers SET name = ?, base_url = ?, model_ids_json = ?, headers_json = ?, updated_at = ? WHERE id = ?',
        [p.name, p.baseUrl, modelsJson, headersJson, now, id]
      );
    } else {
      db.run(
        'INSERT INTO ai_custom_providers (id, name, base_url, model_ids_json, headers_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, p.name, p.baseUrl, modelsJson, headersJson, now, now]
      );
    }

    this.schedulePersist?.();
    return {
      id,
      name: p.name,
      baseUrl: p.baseUrl,
      modelIds: p.modelIds,
      headers: p.headers,
      createdAt: now,
      updatedAt: now
    };
  }

  deleteCustomProvider(id: string): boolean {
    try {
      const db = this.getDb();
      db.run('DELETE FROM ai_custom_providers WHERE id = ?', [id]);
      this.schedulePersist?.();
      return true;
    } catch {
      return false;
    }
  }
}
