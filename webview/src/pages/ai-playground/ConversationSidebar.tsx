import React, { useState } from 'react';
import { Plus, MessageSquare, Trash2, Edit2, Check, X, Search, PanelLeftClose } from 'lucide-react';
import type { AiConversation } from '../../types';

interface ConversationSidebarProps {
  conversations: AiConversation[];
  activeConversationId?: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onClose?: () => void;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  activeConversationId,
  onSelect,
  onNewChat,
  onDelete,
  onRename,
  onClose
}) => {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const filtered = conversations.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.modelId.toLowerCase().includes(search.toLowerCase())
  );

  const startRename = (conv: AiConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  };

  const confirmRename = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editingTitle.trim()) {
      onRename(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  const cancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(id);
  };

  return (
    <aside className="playground-sidebar flex flex-col h-full w-64 border-r p-3 select-none shrink-0">
      {/* New Chat & Close Sidebar Header */}
      <div className="flex items-center gap-1.5 mb-3">
        <button
          onClick={onNewChat}
          className="btn-theme-primary flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-medium text-xs shadow-sm transition cursor-pointer"
        >
          <Plus size={15} />
          <span>New Conversation</span>
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="playground-card p-2 rounded-lg text-xs opacity-75 hover:opacity-100 transition cursor-pointer flex items-center justify-center border"
            title="Collapse Sidebar"
          >
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>

      {/* Search Filter */}
      <div className="relative mb-3">
        <Search size={13} className="absolute left-2.5 top-2.5 opacity-50" />
        <input
          type="text"
          placeholder="Filter chats..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="playground-input w-full rounded-md py-1.5 pl-8 pr-2 text-xs transition"
        />
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="text-center py-8 opacity-60 text-xs">
            {search ? 'No matching chats' : 'No conversations yet'}
          </div>
        ) : (
          filtered.map(conv => {
            const isActive = conv.id === activeConversationId;
            const isEditing = conv.id === editingId;

            return (
              <div
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`group flex items-center justify-between p-2 rounded-md cursor-pointer transition text-xs ${
                  isActive
                    ? 'tab-active-neutral font-medium shadow-xs'
                    : 'opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                  <MessageSquare size={13} className={isActive ? 'opacity-100 shrink-0' : 'opacity-50 shrink-0'} />
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={e => setEditingTitle(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onKeyDown={e => {
                        if (e.key === 'Enter') confirmRename(conv.id, e as any);
                        if (e.key === 'Escape') cancelRename(e as any);
                      }}
                      className="playground-input rounded px-1.5 py-0.5 text-xs w-full"
                      autoFocus
                    />
                  ) : (
                    <div className="truncate flex-1">
                      <div className="truncate font-medium">{conv.title}</div>
                      <div className="text-[10px] opacity-60 font-mono truncate">{conv.modelId}</div>
                    </div>
                  )}
                </div>

                {/* Action buttons on hover */}
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 ml-1">
                  {isEditing ? (
                    <>
                      <button
                        onClick={e => confirmRename(conv.id, e)}
                        className="p-1 hover:text-emerald-400"
                        title="Save Title"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        onClick={cancelRename}
                        className="p-1 hover:text-rose-400"
                        title="Cancel"
                      >
                        <X size={12} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={e => startRename(conv, e)}
                        className="p-1 hover:opacity-100 opacity-60"
                        title="Rename"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={e => handleDelete(conv.id, e)}
                        className="p-1 hover:text-rose-400 opacity-60"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
