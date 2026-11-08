import React, { useState } from 'react';
import {
  Folder,
  FolderPlus,
  FolderOpen,
  Plus,
  Trash2,
  Search,
  Layers,
  History,
  FileCode,
  ChevronRight,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import type {
  ApiTestCollectionItem,
  ApiTestFolderItem,
  ApiTestRequestPayload,
  ApiTestEnvironmentItem,
  ApiTestHistoryItem
} from '../../types';

interface StudioSidebarProps {
  collections: ApiTestCollectionItem[];
  environments: ApiTestEnvironmentItem[];
  history: ApiTestHistoryItem[];
  activeEnvironmentId: string | null;
  activeRequestId?: string;
  onSelectRequest: (req: ApiTestRequestPayload) => void;
  onCreateCollection: () => void;
  onDeleteCollection: (id: string) => void;
  onCreateFolder: (collectionId: string) => void;
  onDeleteFolder: (id: string) => void;
  onCreateRequest: (collectionId: string, folderId?: string) => void;
  onDeleteRequest: (id: string) => void;
  onSelectEnvironment: (id: string | null) => void;
  onOpenEnvironmentModal: () => void;
  onClearHistory: () => void;
  onOpenImportModal: () => void;
}

export const StudioSidebar: React.FC<StudioSidebarProps> = ({
  collections,
  environments,
  history,
  activeEnvironmentId,
  activeRequestId,
  onSelectRequest,
  onCreateCollection,
  onDeleteCollection,
  onCreateFolder,
  onDeleteFolder,
  onCreateRequest,
  onDeleteRequest,
  onSelectEnvironment,
  onOpenEnvironmentModal,
  onClearHistory,
  onOpenImportModal
}) => {
  const [activeTab, setActiveTab] = useState<'collections' | 'environments' | 'history'>('collections');
  const [search, setSearch] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const getMethodBadgeClass = (method: string) => {
    const m = method.toUpperCase();
    switch (m) {
      case 'GET': return 'badge-get';
      case 'POST': return 'badge-post';
      case 'PUT': return 'badge-put';
      case 'DELETE': return 'badge-delete';
      case 'PATCH': return 'badge-patch';
      default: return 'badge-other';
    }
  };

  const filteredCollections = collections.map(col => {
    if (!search) return col;
    const term = search.toLowerCase();
    const matchedRequests = col.requests.filter(
      r => r.name.toLowerCase().includes(term) || r.url.toLowerCase().includes(term)
    );
    return { ...col, requests: matchedRequests };
  });

  return (
    <div className="studio-sidebar">
      {/* Sidebar Top Nav Tabs */}
      <div className="studio-sidebar-tabs">
        <button
          type="button"
          className={`sidebar-tab-btn ${activeTab === 'collections' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('collections')}
        >
          <Folder size={14} />
          <span>Collections</span>
        </button>
        <button
          type="button"
          className={`sidebar-tab-btn ${activeTab === 'environments' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('environments')}
        >
          <Layers size={14} />
          <span>Environments</span>
        </button>
        <button
          type="button"
          className={`sidebar-tab-btn ${activeTab === 'history' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <History size={14} />
          <span>History</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="studio-search-wrap">
        <Search size={14} className="studio-search-icon" />
        <input
          type="text"
          className="studio-search-input"
          placeholder="Filter requests..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Collections Tab Content */}
      {activeTab === 'collections' && (
        <div className="studio-tree-view">
          <div className="studio-tree-header">
            <span className="studio-tree-title">API COLLECTIONS</span>
            <button
              type="button"
              className="studio-tree-action-btn"
              onClick={onCreateCollection}
              title="Create Collection"
            >
              <Plus size={14} />
              <span>Collection</span>
            </button>
          </div>

          {filteredCollections.length === 0 ? (
            <div className="studio-empty-state">
              <Folder size={32} className="empty-icon" />
              <div className="empty-title">No Collections Yet</div>
              <div className="empty-desc">Create your first collection or import an existing Postman / OpenAPI file.</div>
              <div className="empty-actions">
                <button type="button" className="studio-btn studio-btn-primary" onClick={onCreateCollection}>
                  <Plus size={14} />
                  <span>Create Collection</span>
                </button>
                <button type="button" className="studio-btn studio-btn-ghost" onClick={onOpenImportModal}>
                  <Sparkles size={14} />
                  <span>Import Spec</span>
                </button>
              </div>
            </div>
          ) : (
            filteredCollections.map(col => (
              <div key={col.id} className="studio-collection-node">
                <div className="collection-header">
                  <div className="collection-title-wrap">
                    <FolderOpen size={15} className="col-icon" />
                    <span className="col-name">{col.name}</span>
                  </div>
                  <div className="collection-actions">
                    <button
                      type="button"
                      className="node-action-btn"
                      onClick={() => onCreateFolder(col.id)}
                      title="New Folder in Collection"
                    >
                      <FolderPlus size={13} />
                    </button>
                    <button
                      type="button"
                      className="node-action-btn"
                      onClick={() => onCreateRequest(col.id)}
                      title="New Request in Collection"
                    >
                      <Plus size={13} />
                    </button>
                    <button
                      type="button"
                      className="node-action-btn is-danger"
                      onClick={() => onDeleteCollection(col.id)}
                      title="Delete Collection"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Nested Folders */}
                {col.folders.map(folder => {
                  const isCollapsed = collapsedFolders[folder.id];
                  const folderRequests = col.requests.filter(r => r.folderId === folder.id);
                  return (
                    <div key={folder.id} className="studio-folder-node">
                      <div className="folder-header">
                        <button
                          type="button"
                          className="folder-toggle-btn"
                          onClick={() => toggleFolder(folder.id)}
                        >
                          {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          <Folder size={14} />
                          <span className="folder-name">{folder.name}</span>
                        </button>
                        <div className="folder-actions">
                          <button
                            type="button"
                            className="node-action-btn"
                            onClick={() => onCreateRequest(col.id, folder.id)}
                            title="New Request in Folder"
                          >
                            <Plus size={12} />
                          </button>
                          <button
                            type="button"
                            className="node-action-btn is-danger"
                            onClick={() => onDeleteFolder(folder.id)}
                            title="Delete Folder"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {!isCollapsed && (
                        <div className="folder-items">
                          {folderRequests.map(req => (
                            <div
                              key={req.id}
                              role="button"
                              tabIndex={0}
                              className={`request-item ${activeRequestId === req.id ? 'is-active' : ''}`}
                              onClick={() => onSelectRequest(req)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  onSelectRequest(req);
                                }
                              }}
                            >
                              <span className={`method-badge ${getMethodBadgeClass(req.method)}`}>
                                {req.method}
                              </span>
                              <span className="request-name">{req.name}</span>
                              <button
                                type="button"
                                className="item-delete-btn"
                                onClick={e => {
                                  e.stopPropagation();
                                  if (req.id) onDeleteRequest(req.id);
                                }}
                                title="Delete Request"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Root Collection Requests */}
                <div className="collection-items">
                  {col.requests
                    .filter(r => !r.folderId)
                    .map(req => (
                      <div
                        key={req.id}
                        role="button"
                        tabIndex={0}
                        className={`request-item ${activeRequestId === req.id ? 'is-active' : ''}`}
                        onClick={() => onSelectRequest(req)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            onSelectRequest(req);
                          }
                        }}
                      >
                        <span className={`method-badge ${getMethodBadgeClass(req.method)}`}>
                          {req.method}
                        </span>
                        <span className="request-name">{req.name}</span>
                        <button
                          type="button"
                          className="item-delete-btn"
                          onClick={e => {
                            e.stopPropagation();
                            if (req.id) onDeleteRequest(req.id);
                          }}
                          title="Delete Request"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Environments Tab Content */}
      {activeTab === 'environments' && (
        <div className="studio-environments-view">
          <div className="studio-tree-header">
            <span className="studio-tree-title">ENVIRONMENTS</span>
            <button
              type="button"
              className="studio-tree-action-btn"
              onClick={onOpenEnvironmentModal}
              title="Manage Environments"
            >
              <Plus size={14} />
              <span>Manage</span>
            </button>
          </div>

          <div className="env-list">
            <button
              type="button"
              className={`env-card ${activeEnvironmentId === null ? 'is-active' : ''}`}
              onClick={() => onSelectEnvironment(null)}
            >
              <div className="env-card-info">
                <span className="env-name">Globals / No Environment</span>
                <span className="env-meta">Universal variables only</span>
              </div>
            </button>

            {environments.map(env => (
              <button
                key={env.id}
                type="button"
                className={`env-card ${activeEnvironmentId === env.id ? 'is-active' : ''}`}
                onClick={() => onSelectEnvironment(env.id)}
              >
                <div className="env-card-info">
                  <span className="env-name">{env.name}</span>
                  <span className="env-meta">{env.variables.length} variables configured</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* History Tab Content */}
      {activeTab === 'history' && (
        <div className="studio-history-view">
          <div className="studio-tree-header">
            <span className="studio-tree-title">RECENT REQUESTS</span>
            {history.length > 0 && (
              <button
                type="button"
                className="studio-tree-action-btn is-danger"
                onClick={onClearHistory}
                title="Clear Execution History"
              >
                <Trash2 size={13} />
                <span>Clear</span>
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="studio-empty-state">
              <History size={28} className="empty-icon" />
              <div className="empty-title">History Empty</div>
              <div className="empty-desc">Executed requests will appear here for fast re-execution.</div>
            </div>
          ) : (
            <div className="history-list">
              {history.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="history-item"
                  onClick={() =>
                    onSelectRequest({
                      id: item.requestId,
                      name: item.url,
                      method: item.method,
                      url: item.url,
                      params: [],
                      headers: [],
                      bodyType: 'none',
                      auth: { type: 'inherit' }
                    })
                  }
                >
                  <div className="history-top">
                    <span className={`method-badge ${getMethodBadgeClass(item.method)}`}>
                      {item.method}
                    </span>
                    <span className={`history-status ${item.statusCode >= 200 && item.statusCode < 300 ? 'status-ok' : 'status-err'}`}>
                      {item.statusCode || 'ERR'}
                    </span>
                    <span className="history-duration">{Math.round(item.durationMs)}ms</span>
                  </div>
                  <div className="history-url" title={item.url}>{item.url}</div>
                  <div className="history-time">{new Date(item.executedAt).toLocaleTimeString()}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
