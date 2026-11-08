import React, { useState, useEffect, useRef } from 'react';
import { Paperclip, X, FileText, Search, Cpu, Cloud, FileCode2, Image as ImageIcon, Upload } from 'lucide-react';
import { readWorkspaceFile } from '../../services/vscode';
import type { ContextAttachment } from '../../types';

interface ContextSelectorProps {
  attachments: ContextAttachment[];
  onAddAttachment: (attachment: ContextAttachment) => void;
  onRemoveAttachment: (index: number) => void;
  availableFiles?: Array<{ path: string; name: string; size: number }>;
  onRequestFiles: (query?: string) => void;
  isLocalModel: boolean;
  providerName: string;
}

const isImageFile = (name: string): boolean => {
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico|tiff?|avif)$/i.test(name);
};

const getImageMime = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    avif: 'image/avif'
  };
  return map[ext] || 'image/png';
};

export const ContextSelector: React.FC<ContextSelectorProps> = ({
  attachments,
  onAddAttachment,
  onRemoveAttachment,
  availableFiles = [],
  onRequestFiles,
  isLocalModel,
  providerName
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string; size: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalOpen) {
        setModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen]);

  useEffect(() => {
    const handleMsg = (event: MessageEvent) => {
      const msg = event.data;
      if (msg && msg.type === 'WORKSPACE_FILE_CONTENT' && msg.payload) {
        if (selectedFile && selectedFile.path === msg.payload.path) {
          setFileContent(msg.payload.content || '');
        }
      }
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, [selectedFile]);

  const handleOpenModal = () => {
    setModalOpen(true);
    onRequestFiles();
  };

  const handleSearch = (q: string) => {
    setQuery(q);
    onRequestFiles(q);
  };

  const handleLocalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (attachments.length + files.length > 5) {
      alert('Maximum of 5 attachments allowed per message.');
      return;
    }

    Array.from(files).forEach(file => {
      const isImg = isImageFile(file.name) || file.type.startsWith('image/');
      const reader = new FileReader();

      if (isImg) {
        reader.onload = () => {
          const base64Url = reader.result as string;
          onAddAttachment({
            name: file.name,
            path: file.name,
            size: file.size,
            content: base64Url,
            isImage: true,
            mimeType: file.type || getImageMime(file.name)
          });
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = () => {
          onAddAttachment({
            name: file.name,
            path: file.name,
            size: file.size,
            content: (reader.result as string) || '',
            isImage: false
          });
        };
        reader.readAsText(file);
      }
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setModalOpen(false);
  };

  const handleConfirmAdd = () => {
    if (selectedFile) {
      if (attachments.length >= 5) {
        alert('Maximum of 5 files can be attached per message.');
        return;
      }

      const isImg = isImageFile(selectedFile.name) || fileContent.startsWith('data:image/');

      onAddAttachment({
        name: selectedFile.name,
        path: selectedFile.path,
        size: selectedFile.size,
        content: fileContent.trim() || '',
        isImage: isImg,
        mimeType: isImg ? getImageMime(selectedFile.name) : undefined
      });

      setSelectedFile(null);
      setFileContent('');
      setModalOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 select-none">
      {/* Hidden local image upload input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleLocalImageUpload}
        accept="image/*,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.ico"
        multiple
        className="hidden"
      />

      {/* Attached Files Chips Bar */}
      <div className="flex items-center flex-wrap gap-1.5">
        <button
          type="button"
          onClick={handleOpenModal}
          disabled={attachments.length >= 5}
          className="playground-card flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition disabled:opacity-40 cursor-pointer"
        >
          <Paperclip size={12} className="opacity-70" />
          <span>Attach File / Image {attachments.length > 0 && `(${attachments.length}/5)`}</span>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={attachments.length >= 5}
          className="playground-card flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition disabled:opacity-40 cursor-pointer text-purple-400 hover:text-purple-300"
          title="Directly select or drag image from disk"
        >
          <ImageIcon size={12} />
          <span>Attach Image</span>
        </button>

        {attachments.map((att, idx) => {
          const isImg = att.isImage || isImageFile(att.name) || att.content?.startsWith('data:image/');
          return (
            <div
              key={idx}
              className="playground-card flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px]"
            >
              {isImg ? (
                <>
                  <ImageIcon size={11} className="text-purple-400 shrink-0" />
                  {att.content?.startsWith('data:image/') && (
                    <img
                      src={att.content}
                      alt={att.name}
                      className="w-4 h-4 rounded object-cover border border-white/20 shrink-0"
                    />
                  )}
                </>
              ) : (
                <FileText size={11} className="opacity-70 shrink-0" />
              )}
              <span className="max-w-[120px] truncate">{att.name}</span>
              <span className="text-[9px] opacity-60">({Math.round(att.size / 1024) || 1} KB)</span>
              <button
                onClick={() => onRemoveAttachment(idx)}
                className="p-0.5 hover:text-rose-400 opacity-60 hover:opacity-100 ml-0.5 cursor-pointer"
              >
                <X size={10} />
              </button>
            </div>
          );
        })}

        {/* Privacy Transparency Indicator */}
        <div className="ml-auto flex items-center gap-1 text-[10px] opacity-70">
          {isLocalModel ? (
            <span className="flex items-center gap-1 text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
              <Cpu size={11} />
              <span>100% Local Inference · Zero Network Upload</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-sky-400 bg-sky-950/40 px-2 py-0.5 rounded border border-sky-800/40">
              <Cloud size={11} />
              <span>Cloud: {providerName} (Only attached context sent)</span>
            </span>
          )}
        </div>
      </div>

      {/* Attach File Modal */}
      {modalOpen && (
        <div
          onClick={e => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <div className="playground-card rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh] overflow-hidden border">
            <div className="flex items-center justify-between p-3.5 border-b">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Paperclip size={14} className="opacity-70" />
                <span>Select Workspace File or Image</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="playground-card flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border hover:text-purple-400 cursor-pointer"
                  title="Upload from computer"
                >
                  <Upload size={11} />
                  <span>Browse Disk</span>
                </button>
                <button
                  onClick={() => setModalOpen(false)}
                  className="opacity-60 hover:opacity-100 cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="p-3 border-b playground-header">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 opacity-50" />
                <input
                  type="text"
                  placeholder="Filter files or images in workspace..."
                  value={query}
                  onChange={e => handleSearch(e.target.value)}
                  className="playground-input w-full rounded py-1.5 pl-8 pr-2 text-xs focus:outline-none"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1 max-h-60">
              {availableFiles.length === 0 ? (
                <div className="text-center py-8 opacity-60 text-xs">
                  No workspace files found matching criteria.
                </div>
              ) : (
                availableFiles.map(file => {
                  const isSelected = selectedFile?.path === file.path;
                  const isImg = isImageFile(file.name);
                  return (
                    <div
                      key={file.path}
                      onClick={() => {
                        setSelectedFile(file);
                        readWorkspaceFile(file.path);
                      }}
                      className={`flex items-center justify-between p-2 rounded cursor-pointer text-xs transition ${
                        isSelected
                          ? 'tab-active-neutral font-medium'
                          : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-80'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {isImg ? (
                          <ImageIcon size={13} className={isSelected ? 'text-purple-400' : 'text-purple-400/70'} />
                        ) : (
                          <FileText size={13} className={isSelected ? 'opacity-100' : 'opacity-50'} />
                        )}
                        <span className="truncate font-medium">{file.name}</span>
                        <span className="text-[10px] opacity-60 truncate">{file.path}</span>
                      </div>
                      <span className="text-[10px] opacity-60 font-mono shrink-0 ml-2">
                        {Math.round(file.size / 1024) || 1} KB
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {selectedFile && (
              <div className="p-3 border-t playground-header">
                {isImageFile(selectedFile.name) || fileContent.startsWith('data:image/') ? (
                  <div className="space-y-1.5">
                    <div className="text-[11px] opacity-80 font-medium flex items-center gap-1.5">
                      <ImageIcon size={13} className="text-purple-400" />
                      <span>Image Preview (Base64 Encoded for Multimodal Model Transmission):</span>
                    </div>
                    {fileContent.startsWith('data:image/') ? (
                      <div className="flex justify-center p-2 rounded bg-black/20 border border-white/10">
                        <img
                          src={fileContent}
                          alt={selectedFile.name}
                          className="max-h-40 max-w-full rounded object-contain"
                        />
                      </div>
                    ) : (
                      <div className="text-xs opacity-60 italic py-2">Encoding binary image data...</div>
                    )}
                  </div>
                ) : (
                  <>
                    <label className="text-[11px] opacity-70 block mb-1">
                      Custom Context Snippet or Override (Optional):
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Paste specific snippet from this file or leave blank..."
                      value={fileContent}
                      onChange={e => setFileContent(e.target.value)}
                      className="playground-input w-full rounded p-1.5 text-xs font-mono resize-none"
                    />
                  </>
                )}
              </div>
            )}

            <div className="flex items-center justify-between p-3 border-t playground-header">
              <span className="text-[10px] opacity-60">
                Max 5 attachments. Images encoded as Base64 for multimodal inference.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 rounded text-xs opacity-70 hover:opacity-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedFile}
                  onClick={handleConfirmAdd}
                  className="btn-theme-primary px-3 py-1.5 rounded disabled:opacity-40 text-xs font-medium transition cursor-pointer"
                >
                  Attach to Chat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
