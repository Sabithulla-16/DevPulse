import React, { useState } from 'react';
import {
  Plus,
  Search,
  Star,
  FileCode,
  Clock,
  Trash2,
  Edit2,
  Copy,
  Check,
  Play,
  X
} from 'lucide-react';
import type { AiPromptTemplate, PromptTemplateInput } from '../../types';

interface PromptStudioViewProps {
  templates: AiPromptTemplate[];
  onSaveTemplate: (input: PromptTemplateInput) => void;
  onDeleteTemplate: (id: string) => void;
  onUseInChat: (userPrompt: string, systemPrompt?: string) => void;
}

const CATEGORIES = ['All', 'Coding', 'Architecture', 'Review', 'Refactoring', 'General'];

export const PromptStudioView: React.FC<PromptStudioViewProps> = ({
  templates,
  onSaveTemplate,
  onDeleteTemplate,
  onUseInChat
}) => {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AiPromptTemplate | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('Coding');
  const [formSystemPrompt, setFormSystemPrompt] = useState('');
  const [formUserPrompt, setFormUserPrompt] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = templates.filter(t => {
    const matchCategory = selectedCategory === 'All' || t.category === selectedCategory;
    const matchSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(search.toLowerCase()) ||
      t.userPrompt.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setFormName('');
    setFormDescription('');
    setFormCategory('Coding');
    setFormSystemPrompt('');
    setFormUserPrompt('');
    setModalOpen(true);
  };

  const handleOpenEdit = (t: AiPromptTemplate) => {
    setEditingTemplate(t);
    setFormName(t.name);
    setFormDescription(t.description || '');
    setFormCategory(t.category);
    setFormSystemPrompt(t.systemPrompt || '');
    setFormUserPrompt(t.userPrompt);
    setModalOpen(true);
  };

  const extractVariables = (text: string): string[] => {
    const regex = /\{\{([^}]+)\}\}/g;
    const vars: string[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      const v = match[1].trim();
      if (!vars.includes(v)) vars.push(v);
    }
    return vars;
  };

  const handleSave = () => {
    if (!formName.trim() || !formUserPrompt.trim()) return;

    const variables = extractVariables(`${formSystemPrompt} ${formUserPrompt}`);

    onSaveTemplate({
      id: editingTemplate?.id,
      name: formName.trim(),
      description: formDescription.trim() || undefined,
      category: formCategory,
      systemPrompt: formSystemPrompt.trim() || undefined,
      userPrompt: formUserPrompt.trim(),
      variables
    });

    setModalOpen(false);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="playground-shell flex-1 flex flex-col h-full overflow-hidden p-6 select-none custom-scrollbar">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FileCode size={18} className="text-indigo-400" />
            <span>Prompt Studio</span>
          </h2>
          <p className="text-xs opacity-70">
            Create, version, and execute modular prompt templates with dynamic variables.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="btn-theme-primary flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shadow transition cursor-pointer"
        >
          <Plus size={14} />
          <span>New Prompt Template</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        {/* Category Tabs */}
        <div className="playground-nav-pill flex items-center gap-1 p-1 rounded-lg">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`playground-nav-btn px-3 py-1 rounded text-xs font-medium transition cursor-pointer ${
                selectedCategory === cat ? 'tab-active-neutral' : ''
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search size={13} className="absolute left-2.5 top-2.5 opacity-50" />
          <input
            type="text"
            placeholder="Search prompt templates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="playground-input w-full rounded-md py-1.5 pl-8 pr-2 text-xs focus:outline-none"
          />
        </div>
      </div>

      {/* Grid of Templates */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="playground-card border-dashed flex flex-col items-center justify-center h-64 rounded-xl opacity-60">
            <FileCode size={36} className="mb-2 opacity-40" />
            <p className="text-sm font-medium">No prompt templates found</p>
            <p className="text-xs opacity-70 mt-1">
              Create reusable templates with variables like {'{{code}}'} or {'{{language}}'}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
            {filtered.map(tmpl => (
              <div
                key={tmpl.id}
                className="playground-card rounded-xl p-4 flex flex-col justify-between group transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded playground-card opacity-80">
                        {tmpl.category}
                      </span>
                      {tmpl.isFavorite && <Star size={12} className="text-amber-400 fill-current" />}
                    </div>

                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition">
                      <button
                        onClick={() => handleCopy(tmpl.userPrompt, tmpl.id)}
                        className="p-1 hover:opacity-100 opacity-60 transition cursor-pointer"
                        title="Copy Prompt"
                      >
                        {copiedId === tmpl.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      </button>
                      <button
                        onClick={() => handleOpenEdit(tmpl)}
                        className="p-1 hover:opacity-100 opacity-60 transition cursor-pointer"
                        title="Edit Template"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => onDeleteTemplate(tmpl.id)}
                        className="p-1 hover:text-rose-400 opacity-60 transition cursor-pointer"
                        title="Delete Template"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold mb-1 truncate">{tmpl.name}</h3>
                  {tmpl.description && (
                    <p className="text-xs opacity-60 line-clamp-2 mb-3">{tmpl.description}</p>
                  )}

                  {/* Variables Badges */}
                  {tmpl.variables && tmpl.variables.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {tmpl.variables.map(v => (
                        <span
                          key={v}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded opacity-75 playground-card"
                        >
                          {`{{${v}}}`}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Prompt Preview Snippet */}
                  <div className="p-2.5 rounded text-[11px] font-mono line-clamp-3 playground-input opacity-90 mb-3 select-text">
                    {tmpl.userPrompt}
                  </div>
                </div>

                <div className="pt-3 border-t border-black/10 dark:border-white/10 flex items-center justify-between text-[11px] opacity-70">
                  <span className="flex items-center gap-1 opacity-60">
                    <Clock size={11} />
                    <span>{new Date(tmpl.updatedAt).toLocaleDateString()}</span>
                  </span>

                  <button
                    onClick={() => onUseInChat(tmpl.userPrompt, tmpl.systemPrompt)}
                    className="btn-theme-primary flex items-center gap-1 px-2.5 py-1 rounded font-medium text-xs shadow-xs transition cursor-pointer"
                  >
                    <Play size={10} className="fill-current" />
                    <span>Use in Chat</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="playground-card rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <FileCode size={16} className="text-indigo-400" />
                <span>{editingTemplate ? 'Edit Prompt Template' : 'Create Prompt Template'}</span>
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="opacity-60 hover:opacity-100 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto custom-scrollbar space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium opacity-80 block mb-1">Template Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Code Review Assistant"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="playground-input w-full rounded p-2 focus:outline-none"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="font-medium opacity-80 block mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    className="playground-select w-full rounded p-2 focus:outline-none"
                  >
                    {CATEGORIES.filter(c => c !== 'All').map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-medium opacity-80 block mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Brief summary of template purpose..."
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="playground-input w-full rounded p-2 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-medium opacity-80 block mb-1">
                  System Instructions (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="System-level instructions defining behavior or persona..."
                  value={formSystemPrompt}
                  onChange={e => setFormSystemPrompt(e.target.value)}
                  className="playground-input w-full rounded p-2 font-mono text-xs resize-none focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium opacity-80">User Prompt Template *</label>
                  <span className="text-[10px] opacity-60">Use {'{{variable}}'} for dynamic fields</span>
                </div>
                <textarea
                  rows={6}
                  placeholder="Please review the following code for security issues:\n\nLanguage: {{language}}\nCode:\n{{code}}"
                  value={formUserPrompt}
                  onChange={e => setFormUserPrompt(e.target.value)}
                  className="playground-input w-full rounded p-2 font-mono text-xs resize-none focus:outline-none"
                />
              </div>

              {/* Detected Variables Preview */}
              {extractVariables(`${formSystemPrompt} ${formUserPrompt}`).length > 0 && (
                <div>
                  <label className="text-[11px] opacity-60 block mb-1">Detected Variables:</label>
                  <div className="flex flex-wrap gap-1">
                    {extractVariables(`${formSystemPrompt} ${formUserPrompt}`).map(v => (
                      <span
                        key={v}
                        className="text-[10px] font-mono px-2 py-0.5 rounded playground-card"
                      >
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t playground-header flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-3 py-1.5 rounded text-xs opacity-70 hover:opacity-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!formName.trim() || !formUserPrompt.trim()}
                onClick={handleSave}
                className="btn-theme-primary px-4 py-1.5 rounded text-xs font-medium disabled:opacity-40 transition cursor-pointer"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
