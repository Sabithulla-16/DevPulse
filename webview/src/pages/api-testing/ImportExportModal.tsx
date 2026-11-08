import React, { useState } from 'react';
import {
  X,
  Upload,
  Download,
  Copy,
  Check,
  FileCode,
  FileText,
  Terminal
} from 'lucide-react';
import type { ApiTestCollectionItem } from '../../types';

interface ImportExportModalProps {
  mode: 'import' | 'export';
  collections: ApiTestCollectionItem[];
  onClose: () => void;
  onImport: (format: 'postman' | 'openapi' | 'curl', content: string) => void;
  onExport: (format: 'postman', collectionId: string) => void;
  exportResult?: { filename: string; content: string } | null;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  mode: initialMode,
  collections,
  onClose,
  onImport,
  onExport,
  exportResult
}) => {
  const [activeMode, setActiveMode] = useState<'import' | 'export'>(initialMode);
  const [importFormat, setImportFormat] = useState<'postman' | 'openapi' | 'curl'>('postman');
  const [importContent, setImportContent] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>(collections[0]?.id || '');
  const [copied, setCopied] = useState(false);

  const handleImportSubmit = () => {
    if (!importContent.trim()) return;
    onImport(importFormat, importContent);
    onClose();
  };

  const handleExportGenerate = () => {
    if (!selectedCollectionId) return;
    onExport('postman', selectedCollectionId);
  };

  const handleCopyExport = () => {
    if (!exportResult?.content) return;
    navigator.clipboard.writeText(exportResult.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadExport = () => {
    if (!exportResult) return;
    const blob = new Blob([exportResult.content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportResult.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="studio-modal-overlay">
      <div className="studio-modal-container import-export-modal">
        <div className="modal-header">
          <div className="modal-title-wrap">
            {activeMode === 'import' ? <Upload size={18} /> : <Download size={18} />}
            <span>{activeMode === 'import' ? 'Import API Specifications' : 'Export API Collection'}</span>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-tabs">
          <button
            type="button"
            className={`modal-tab-btn ${activeMode === 'import' ? 'is-active' : ''}`}
            onClick={() => setActiveMode('import')}
          >
            Import
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${activeMode === 'export' ? 'is-active' : ''}`}
            onClick={() => setActiveMode('export')}
          >
            Export
          </button>
        </div>

        {activeMode === 'import' ? (
          <div className="modal-body">
            <div className="import-format-selector">
              <label>Specification Format:</label>
              <div className="format-options">
                <button
                  type="button"
                  className={`format-btn ${importFormat === 'postman' ? 'is-active' : ''}`}
                  onClick={() => setImportFormat('postman')}
                >
                  <FileCode size={14} />
                  <span>Postman v2.1</span>
                </button>
                <button
                  type="button"
                  className={`format-btn ${importFormat === 'openapi' ? 'is-active' : ''}`}
                  onClick={() => setImportFormat('openapi')}
                >
                  <FileText size={14} />
                  <span>OpenAPI 3.0 / 3.1</span>
                </button>
                <button
                  type="button"
                  className={`format-btn ${importFormat === 'curl' ? 'is-active' : ''}`}
                  onClick={() => setImportFormat('curl')}
                >
                  <Terminal size={14} />
                  <span>cURL Command</span>
                </button>
              </div>
            </div>

            <div className="import-input-wrap">
              <label>
                {importFormat === 'curl'
                  ? 'Paste raw cURL command line string:'
                  : 'Paste JSON / specification content:'}
              </label>
              <textarea
                className="import-textarea"
                placeholder={
                  importFormat === 'curl'
                    ? "curl -X POST https://api.example.com/v1/users -H 'Content-Type: application/json' -d '{\"name\":\"Alice\"}'"
                    : '{\n  "info": {\n    "name": "My API Collection"\n  },\n  "item": []\n}'
                }
                value={importContent}
                onChange={e => setImportContent(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="export-select-collection">
              <label>Select Collection to Export:</label>
              <select
                className="studio-select"
                value={selectedCollectionId}
                onChange={e => setSelectedCollectionId(e.target.value)}
              >
                {collections.map(col => (
                  <option key={col.id} value={col.id}>
                    {col.name} ({col.requests.length} requests)
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="studio-btn studio-btn-primary export-generate-btn"
              onClick={handleExportGenerate}
            >
              Generate Postman Collection JSON
            </button>

            {exportResult && (
              <div className="export-result-box">
                <div className="result-top">
                  <span className="file-name">{exportResult.filename}</span>
                  <div className="result-actions">
                    <button type="button" className="studio-btn studio-btn-ghost" onClick={handleCopyExport}>
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button type="button" className="studio-btn studio-btn-primary" onClick={handleDownloadExport}>
                      <Download size={13} />
                      <span>Download JSON</span>
                    </button>
                  </div>
                </div>
                <textarea
                  className="export-preview-textarea"
                  readOnly
                  value={exportResult.content}
                />
              </div>
            )}
          </div>
        )}

        <div className="modal-footer">
          {activeMode === 'import' ? (
            <>
              <button type="button" className="studio-btn studio-btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="studio-btn studio-btn-primary"
                disabled={!importContent.trim()}
                onClick={handleImportSubmit}
              >
                Import Spec
              </button>
            </>
          ) : (
            <button type="button" className="studio-btn studio-btn-ghost" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
