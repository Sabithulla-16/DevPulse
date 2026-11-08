import React, { useState, useMemo, useEffect } from 'react';
import {
  FolderTree,
  FileText,
  Search,
  HardDrive,
  Copy,
  Clock,
  RefreshCw,
  XCircle,
  Trash2,
  TrendingUp,
  FileCode,
  AlertCircle,
  Layers,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  ExternalLink,
  Folder,
  Check,
  ArrowUpDown
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { MetricCard } from '../components/MetricCard';
import { formatBytes, formatDuration, formatTimestamp } from '../utils/formatters';
import {
  startWorkspaceScan,
  cancelWorkspaceScan,
  clearScanHistory,
  requestExtensionFiles,
  openFile,
  revealInExplorer
} from '../services/vscode';
import type { FileIntelligenceData, ExtensionFilesResult, FileEntryRecord } from '../types';

interface FileIntelligencePageProps {
  data: FileIntelligenceData | null;
  extensionFilesData?: ExtensionFilesResult | null;
  onClearExtensionFiles?: () => void;
}

export const FileIntelligencePage: React.FC<FileIntelligencePageProps> = ({
  data,
  extensionFilesData,
  onClearExtensionFiles
}) => {
  const summary = data?.summary;
  const isScanning = data?.isScanning ?? false;
  const progress = data?.progress;
  const largestFiles = data?.largestFiles ?? [];
  const directories = data?.directories ?? [];
  const extensions = data?.extensions ?? [];
  const duplicates = data?.duplicates ?? [];
  const growth = data?.growth;
  const growthHistory = data?.growthHistory ?? [];

  // Filter & sorting states
  const [fileSearch, setFileSearch] = useState('');
  const [dirSearch, setDirSearch] = useState('');
  const [activeTabSection, setActiveTabSection] = useState<'largest' | 'dirs' | 'duplicates'>('largest');

  // Extension Drill-down states
  const [activeDrillDownExt, setActiveDrillDownExt] = useState<string | null>(null);
  const [extSearch, setExtSearch] = useState('');
  const [extSortBy, setExtSortBy] = useState<'name' | 'path' | 'size' | 'modified'>('size');
  const [extSortOrder, setExtSortOrder] = useState<'asc' | 'desc'>('desc');
  const [extPage, setExtPage] = useState(1);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [isLoadingExtFiles, setIsLoadingExtFiles] = useState(false);

  // Growth chart data
  const chartHistoryData = useMemo(() => {
    return growthHistory.map(item => ({
      time: formatTimestamp(item.timestamp),
      sizeMb: Math.round((item.totalSizeBytes / (1024 * 1024)) * 10) / 10,
      files: item.fileCount
    }));
  }, [growthHistory]);

  // Trigger extension query when drill-down parameters change
  useEffect(() => {
    if (activeDrillDownExt) {
      setIsLoadingExtFiles(true);
      requestExtensionFiles({
        extension: activeDrillDownExt,
        search: extSearch,
        sortBy: extSortBy,
        sortOrder: extSortOrder,
        page: extPage,
        pageSize: 50
      });
    }
  }, [activeDrillDownExt, extSearch, extSortBy, extSortOrder, extPage]);

  // Turn off loading once data arrives
  useEffect(() => {
    if (extensionFilesData) {
      setIsLoadingExtFiles(false);
    }
  }, [extensionFilesData]);

  const handleOpenExtensionDrillDown = (rawExt: string) => {
    const ext = rawExt.replace(/^\./, '').toLowerCase().trim();
    setActiveDrillDownExt(ext);
    setExtSearch('');
    setExtPage(1);
    setExtSortBy('size');
    setExtSortOrder('desc');
  };

  const handleBackToOverview = () => {
    setActiveDrillDownExt(null);
    if (onClearExtensionFiles) {
      onClearExtensionFiles();
    }
  };

  const handleCopyPath = async (relPath: string) => {
    try {
      await navigator.clipboard.writeText(relPath);
      setCopiedPath(relPath);
      setTimeout(() => setCopiedPath(null), 2000);
    } catch {}
  };

  // Filtered largest files
  const filteredFiles = useMemo(() => {
    return largestFiles.filter(f => {
      return (
        f.name.toLowerCase().includes(fileSearch.toLowerCase()) ||
        f.path.toLowerCase().includes(fileSearch.toLowerCase())
      );
    });
  }, [largestFiles, fileSearch]);

  // Filtered directories
  const filteredDirs = useMemo(() => {
    return directories.filter(d =>
      d.name.toLowerCase().includes(dirSearch.toLowerCase()) ||
      d.path.toLowerCase().includes(dirSearch.toLowerCase())
    );
  }, [directories, dirSearch]);

  // Total wasted duplicate bytes
  const totalWastedBytes = useMemo(() => {
    return duplicates.reduce((acc, d) => acc + d.wastedBytes, 0);
  }, [duplicates]);

  return (
    <div className="page-container">
      {/* Header Banner & Controls */}
      <section className="section-header-row">
        <div>
          <div className="eyebrow-tag">
            <FolderTree size={13} />
            <span>WORKSPACE STORAGE INTELLIGENCE</span>
          </div>
          <h2 className="section-title">File & Asset Intelligence</h2>
          <p className="section-desc">
            Deep recursive workspace analyzer with .gitignore support, largest asset auditing,
            extension breakdowns, and streaming duplicate content detection.
          </p>
        </div>

        <div className="header-action-group">
          {isScanning ? (
            <button
              type="button"
              className="secondary-btn btn-danger"
              onClick={cancelWorkspaceScan}
            >
              <XCircle size={14} />
              <span>Cancel Scan</span>
            </button>
          ) : (
            <button
              type="button"
              className="action-btn btn-resume"
              onClick={startWorkspaceScan}
            >
              <RefreshCw size={14} />
              <span>Scan Workspace</span>
            </button>
          )}

          <button
            type="button"
            className="secondary-btn"
            onClick={clearScanHistory}
            title="Clear scan history"
          >
            <Trash2 size={14} />
            <span>Clear History</span>
          </button>
        </div>
      </section>

      {/* Live Scan Progress Banner */}
      {isScanning && progress && (
        <article className="card scan-progress-card">
          <div className="flex-align-between">
            <div className="flex-align-center" style={{ gap: '8px' }}>
              <RefreshCw size={15} className="spin-icon text-accent" />
              <strong>Scanning Workspace...</strong>
            </div>
            <span className="badge badge-running">{progress.scannedCount} files indexed</span>
          </div>
          <p className="scan-path-text">{progress.currentPath || progress.statusText}</p>
          <div className="progress-bar-track">
            <div className="progress-bar-indeterminate" />
          </div>
        </article>
      )}

      {/* Storage Summary Metric Cards */}
      <section className="metric-cards-grid metrics-grid">
        <MetricCard
          label="WORKSPACE STORAGE"
          value={summary ? formatBytes(summary.totalSizeBytes) : '0 B'}
          detail={summary ? `Across ${summary.scannedFileCount} scanned files` : 'No active scan'}
          icon={<HardDrive size={18} style={{ color: '#eab308' }} />}
          variant="accent"
        />

        <MetricCard
          label="TOTAL FILES"
          value={summary ? summary.totalFileCount.toLocaleString() : '0'}
          detail={summary ? `${summary.excludedFileCount} excluded via gitignore` : 'Ready to scan'}
          icon={<FileText size={18} style={{ color: '#38bdf8' }} />}
          variant="info"
        />

        <MetricCard
          label="DIRECTORIES"
          value={summary ? summary.totalFolderCount.toLocaleString() : '0'}
          detail={summary ? `${summary.excludedFolderCount} excluded folders` : 'Ready to scan'}
          icon={<FolderTree size={18} style={{ color: '#10b981' }} />}
          variant="warning"
        />

        <MetricCard
          label="LAST SCAN DURATION"
          value={summary ? `${summary.scanDurationMs} ms` : '0 ms'}
          detail={summary ? `At ${formatTimestamp(summary.timestamp)}` : 'Idle'}
          icon={<Clock size={18} style={{ color: '#a855f7' }} />}
          variant="default"
        />
      </section>

      {/* Empty State */}
      {!summary && !isScanning ? (
        <article className="card empty-alerts-card">
          <div className="empty-icon-circle">
            <FolderTree size={32} />
          </div>
          <h3>No Workspace Scan Data</h3>
          <p>
            Scan your workspace to analyze storage consumption, identify heavy dependencies and assets,
            and detect duplicate files.
          </p>
          <button type="button" className="action-btn btn-resume" onClick={startWorkspaceScan}>
            <RefreshCw size={14} /> <span>Start Workspace Scan</span>
          </button>
        </article>
      ) : (
        <>
          {/* Storage Growth History Chart */}
          {chartHistoryData.length > 1 && !activeDrillDownExt && (
            <article className="card panel-card">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Workspace Growth Tracking</h3>
                  <p className="card-subtitle">Historical storage progression across scans</p>
                </div>
                <div className="flex-align-center">
                  <span className="badge badge-running">
                    <TrendingUp size={12} />
                    {growth ? `${growth.growthPercentage >= 0 ? '+' : ''}${growth.growthPercentage}%` : 'Tracked'}
                  </span>
                </div>
              </div>

              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartHistoryData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="storageGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22C55E" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#22C55E" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.07)" vertical={false} />
                    <XAxis dataKey="time" stroke="#64748B" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={11} tickLine={false} unit=" MB" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1E293B',
                        borderColor: '#475569',
                        borderRadius: '8px',
                        color: '#F8FAFC',
                        fontSize: '12px'
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sizeMb"
                      name="Storage (MB)"
                      stroke="#22C55E"
                      strokeWidth={2}
                      fill="url(#storageGradient)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </article>
          )}

          {/* EXTENSION STORAGE BREAKDOWN BAR & CHIPS */}
          {!activeDrillDownExt && (
            <article className="card panel-card">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Storage Breakdown by File Extension</h3>
                  <p className="card-subtitle">Click any format to inspect every matching file</p>
                </div>
              </div>

              {/* Proportional Stack Bar */}
              <div className="extension-bar-stack">
                {extensions.slice(0, 8).map((ext, idx) => {
                  const colors = ['#22C55E', '#38BDF8', '#818CF8', '#F59E0B', '#EC4899', '#A855F7', '#14B8A6', '#64748B'];
                  const bg = colors[idx % colors.length];
                  const normExt = ext.extension.startsWith('.') ? ext.extension : `.${ext.extension}`;
                  return (
                    <div
                      key={ext.extension}
                      className="extension-bar-segment"
                      style={{ width: `${Math.max(ext.percentage, 2)}%`, backgroundColor: bg, cursor: 'pointer' }}
                      title={`${normExt.toUpperCase()}: ${formatBytes(ext.totalSizeBytes)} (${ext.percentage}%) - Click to inspect all files`}
                      onClick={() => handleOpenExtensionDrillDown(ext.extension)}
                    />
                  );
                })}
              </div>

              {/* Extension Pills - Clickable */}
              <div className="extension-chips-grid">
                {extensions.map(ext => {
                  const normExt = ext.extension.startsWith('.') ? ext.extension : `.${ext.extension}`;
                  return (
                    <div
                      key={ext.extension}
                      className="extension-chip"
                      onClick={() => handleOpenExtensionDrillDown(ext.extension)}
                      style={{ cursor: 'pointer' }}
                      title={`Click to view all ${ext.fileCount} ${normExt} files`}
                    >
                      <FileCode size={13} className="text-info" />
                      <span className="ext-name">{normExt}</span>
                      <span className="ext-size">{formatBytes(ext.totalSizeBytes)}</span>
                      <span className="ext-pct">({ext.fileCount} files · {ext.percentage}%)</span>
                    </div>
                  );
                })}
              </div>
            </article>
          )}

          {/* EXTENSION FILES DRILL-DOWN VIEW */}
          {activeDrillDownExt && (
            <article className="card panel-card extension-drilldown-card">
              <div className="card-header">
                <div className="flex-align-center" style={{ gap: '12px' }}>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={handleBackToOverview}
                    title="Return to Extension Analytics overview"
                  >
                    <ArrowLeft size={14} />
                    <span>Back to Extension Analytics</span>
                  </button>

                  <div>
                    <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="ext-badge" style={{ fontSize: '13px', padding: '2px 8px' }}>
                        .{activeDrillDownExt}
                      </span>
                      <span>Files Listing</span>
                    </h3>
                    <p className="card-subtitle">
                      {extensionFilesData
                        ? `Showing ${extensionFilesData.totalCount} files (${formatBytes(extensionFilesData.totalSizeBytes)} total)`
                        : 'Loading files...'}
                    </p>
                  </div>
                </div>

                <div className="flex-align-center" style={{ gap: '10px' }}>
                  <div className="search-input-wrap">
                    <Search size={14} />
                    <input
                      type="text"
                      placeholder={`Search .${activeDrillDownExt} files...`}
                      value={extSearch}
                      onChange={e => {
                        setExtSearch(e.target.value);
                        setExtPage(1);
                      }}
                      className="search-field"
                    />
                  </div>

                  <div className="theme-toggle-group">
                    <button
                      type="button"
                      className={`theme-pill ${extSortBy === 'size' ? 'is-selected' : ''}`}
                      onClick={() => {
                        if (extSortBy === 'size') {
                          setExtSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
                        } else {
                          setExtSortBy('size');
                          setExtSortOrder('desc');
                        }
                      }}
                    >
                      <ArrowUpDown size={12} /> Size {extSortBy === 'size' ? (extSortOrder === 'desc' ? '↓' : '↑') : ''}
                    </button>
                    <button
                      type="button"
                      className={`theme-pill ${extSortBy === 'name' ? 'is-selected' : ''}`}
                      onClick={() => {
                        if (extSortBy === 'name') {
                          setExtSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
                        } else {
                          setExtSortBy('name');
                          setExtSortOrder('asc');
                        }
                      }}
                    >
                      <ArrowUpDown size={12} /> Name {extSortBy === 'name' ? (extSortOrder === 'asc' ? '↑' : '↓') : ''}
                    </button>
                    <button
                      type="button"
                      className={`theme-pill ${extSortBy === 'modified' ? 'is-selected' : ''}`}
                      onClick={() => {
                        if (extSortBy === 'modified') {
                          setExtSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
                        } else {
                          setExtSortBy('modified');
                          setExtSortOrder('desc');
                        }
                      }}
                    >
                      <ArrowUpDown size={12} /> Date {extSortBy === 'modified' ? (extSortOrder === 'desc' ? '↓' : '↑') : ''}
                    </button>
                  </div>
                </div>
              </div>

              {/* Files Table */}
              <div className="events-table-wrapper">
                <table className="events-table">
                  <thead>
                    <tr>
                      <th>File Name</th>
                      <th>Relative Path</th>
                      <th>Format</th>
                      <th>Size</th>
                      <th>Last Modified</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingExtFiles ? (
                      <tr>
                        <td colSpan={6} className="empty-cell">
                          <RefreshCw size={14} className="spin-icon" style={{ display: 'inline', marginRight: 6 }} />
                          Querying SQLite database for .{activeDrillDownExt} files...
                        </td>
                      </tr>
                    ) : extensionFilesData && extensionFilesData.files.length > 0 ? (
                      extensionFilesData.files.map(file => (
                        <tr key={file.path}>
                          <td className="file-name-cell">
                            <FileText size={14} className="file-icon text-info" />
                            <strong>{file.name}</strong>
                          </td>
                          <td className="file-path-cell" title={file.path}>
                            {file.path}
                          </td>
                          <td>
                            <span className="ext-badge">.{file.extension || activeDrillDownExt}</span>
                          </td>
                          <td className="metric-num-cell">
                            <strong>{formatBytes(file.sizeBytes)}</strong>
                          </td>
                          <td className="timestamp-cell">
                            {new Date(file.lastModified).toLocaleDateString()}{' '}
                            {new Date(file.lastModified).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td>
                            <div className="flex-align-center" style={{ gap: '6px' }}>
                              <button
                                type="button"
                                className="action-pill-btn"
                                onClick={() => openFile(file.path)}
                                title="Open file in VS Code editor"
                              >
                                <ExternalLink size={12} />
                                <span>Open</span>
                              </button>

                              <button
                                type="button"
                                className="action-pill-btn"
                                onClick={() => revealInExplorer(file.path)}
                                title="Reveal in Operating System Explorer"
                              >
                                <Folder size={12} />
                                <span>Reveal</span>
                              </button>

                              <button
                                type="button"
                                className="action-pill-btn"
                                onClick={() => handleCopyPath(file.path)}
                                title="Copy relative path"
                              >
                                {copiedPath === file.path ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
                                <span>{copiedPath === file.path ? 'Copied' : 'Path'}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="empty-cell">
                          No files matching format ".{activeDrillDownExt}"
                          {extSearch ? ` and query "${extSearch}"` : ''}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              {extensionFilesData && extensionFilesData.totalPages > 1 && (
                <div className="card-footer flex-align-between" style={{ padding: '12px 16px' }}>
                  <span className="card-subtitle">
                    Page {extensionFilesData.page} of {extensionFilesData.totalPages} ({extensionFilesData.totalCount} total files)
                  </span>

                  <div className="flex-align-center" style={{ gap: '8px' }}>
                    <button
                      type="button"
                      className="secondary-btn"
                      disabled={extPage <= 1}
                      onClick={() => setExtPage(prev => Math.max(1, prev - 1))}
                    >
                      Previous
                    </button>
                    <span className="badge badge-idle" style={{ padding: '4px 10px' }}>
                      {extPage} / {extensionFilesData.totalPages}
                    </span>
                    <button
                      type="button"
                      className="secondary-btn"
                      disabled={extPage >= extensionFilesData.totalPages}
                      onClick={() => setExtPage(prev => Math.min(extensionFilesData.totalPages, prev + 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </article>
          )}

          {/* TAB SECTIONS FOR LARGEST, DIRS, DUPLICATES (Only when not in drill-down) */}
          {!activeDrillDownExt && (
            <>
              {/* Tab Navigation for Detailed Sections */}
              <div className="subnav-tabs-row">
                <button
                  type="button"
                  className={`subnav-tab ${activeTabSection === 'largest' ? 'is-active' : ''}`}
                  onClick={() => setActiveTabSection('largest')}
                >
                  <FileText size={14} />
                  <span>Top Largest Files ({largestFiles.length})</span>
                </button>

                <button
                  type="button"
                  className={`subnav-tab ${activeTabSection === 'dirs' ? 'is-active' : ''}`}
                  onClick={() => setActiveTabSection('dirs')}
                >
                  <FolderTree size={14} />
                  <span>Directory Explorer ({directories.length})</span>
                </button>

                <button
                  type="button"
                  className={`subnav-tab ${activeTabSection === 'duplicates' ? 'is-active' : ''}`}
                  onClick={() => setActiveTabSection('duplicates')}
                >
                  <Copy size={14} />
                  <span>Duplicate Content ({duplicates.length})</span>
                  {totalWastedBytes > 0 && (
                    <span className="badge badge-warning" style={{ fontSize: '9px', padding: '1px 5px' }}>
                      {formatBytes(totalWastedBytes)} wasted
                    </span>
                  )}
                </button>
              </div>

              {/* SECTION 1: Largest Files */}
              {activeTabSection === 'largest' && (
                <article className="card panel-card">
                  <div className="card-header">
                    <div>
                      <h3 className="card-title">Top Largest Files</h3>
                      <p className="card-subtitle">Identify assets consuming the most storage</p>
                    </div>
                    <div className="search-input-wrap">
                      <Search size={14} />
                      <input
                        type="text"
                        placeholder="Search file name or path..."
                        value={fileSearch}
                        onChange={e => setFileSearch(e.target.value)}
                        className="search-field"
                      />
                    </div>
                  </div>

                  <div className="events-table-wrapper">
                    <table className="events-table">
                      <thead>
                        <tr>
                          <th>File Name</th>
                          <th>Relative Path</th>
                          <th>Format</th>
                          <th>File Size</th>
                          <th>Last Modified</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFiles.map(file => (
                          <tr key={file.path}>
                            <td className="file-name-cell">
                              <FileText size={14} className="file-icon" />
                              <strong>{file.name}</strong>
                            </td>
                            <td className="file-path-cell">{file.path}</td>
                            <td>
                              <span
                                className="ext-badge"
                                style={{ cursor: 'pointer' }}
                                onClick={() => handleOpenExtensionDrillDown(file.extension)}
                                title="Click to view all files of this format"
                              >
                                .{file.extension}
                              </span>
                            </td>
                            <td className="metric-num-cell">
                              <strong>{formatBytes(file.sizeBytes)}</strong>
                            </td>
                            <td className="timestamp-cell">
                              {new Date(file.lastModified).toLocaleDateString()}
                            </td>
                            <td>
                              <div className="flex-align-center" style={{ gap: '6px' }}>
                                <button
                                  type="button"
                                  className="action-pill-btn"
                                  onClick={() => openFile(file.path)}
                                  title="Open file in VS Code"
                                >
                                  <ExternalLink size={12} />
                                  <span>Open</span>
                                </button>
                                <button
                                  type="button"
                                  className="action-pill-btn"
                                  onClick={() => revealInExplorer(file.path)}
                                  title="Reveal in Explorer"
                                >
                                  <Folder size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {filteredFiles.length === 0 && (
                          <tr>
                            <td colSpan={6} className="empty-cell">
                              No files matching your search filter.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>
              )}

              {/* SECTION 2: Directory Explorer */}
              {activeTabSection === 'dirs' && (
                <article className="card panel-card">
                  <div className="card-header">
                    <div>
                      <h3 className="card-title">Directory Hierarchy Explorer</h3>
                      <p className="card-subtitle">Storage footprint across workspace folders</p>
                    </div>
                    <div className="search-input-wrap">
                      <Search size={14} />
                      <input
                        type="text"
                        placeholder="Search folders..."
                        value={dirSearch}
                        onChange={e => setDirSearch(e.target.value)}
                        className="search-field"
                      />
                    </div>
                  </div>

                  <div className="events-table-wrapper">
                    <table className="events-table">
                      <thead>
                        <tr>
                          <th>Folder</th>
                          <th>Relative Path</th>
                          <th>Recursive Size</th>
                          <th>Direct Files</th>
                          <th>Recursive Files</th>
                          <th>Subfolders</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDirs.map(dir => (
                          <tr key={dir.path}>
                            <td className="dir-name-cell">
                              <FolderTree size={14} className="dir-icon text-info" />
                              <strong>{dir.name}</strong>
                            </td>
                            <td className="file-path-cell">{dir.path}</td>
                            <td className="metric-num-cell">
                              <strong>{formatBytes(dir.totalSizeBytes)}</strong>
                            </td>
                            <td>{dir.directFileCount}</td>
                            <td>{dir.recursiveFileCount}</td>
                            <td>{dir.childDirCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              )}

              {/* SECTION 3: Duplicate Detection */}
              {activeTabSection === 'duplicates' && (
                <article className="card panel-card">
                  <div className="card-header">
                    <div>
                      <h3 className="card-title">Duplicate Content Detection</h3>
                      <p className="card-subtitle">
                        Files with identical SHA-256 hashes. Total wasted storage: {formatBytes(totalWastedBytes)}
                      </p>
                    </div>
                    <span className="badge badge-warning">{duplicates.length} duplicate groups</span>
                  </div>

                  {duplicates.length === 0 ? (
                    <div className="empty-state-box">
                      <Copy size={20} className="text-accent" />
                      <span>No duplicate files detected in this workspace!</span>
                    </div>
                  ) : (
                    <div className="duplicates-list">
                      {duplicates.map(grp => (
                        <div key={grp.hash} className="duplicate-group-card">
                          <div className="duplicate-group-header">
                            <div className="duplicate-hash-info">
                              <Copy size={15} className="text-warning" />
                              <span className="hash-label">SHA-256: {grp.hash.substring(0, 16)}...</span>
                              <span className="counter-pill">{grp.fileCount} copies</span>
                            </div>
                            <div className="duplicate-waste-info">
                              <span>Wasted: <strong>{formatBytes(grp.wastedBytes)}</strong></span>
                              <small>({formatBytes(grp.fileSizeBytes)} each)</small>
                            </div>
                          </div>

                          <ul className="duplicate-files-list">
                            {grp.files.map(filePath => (
                              <li key={filePath} className="duplicate-file-item flex-align-between">
                                <div className="flex-align-center" style={{ gap: '6px' }}>
                                  <FileText size={13} className="text-muted" />
                                  <span>{filePath}</span>
                                </div>
                                <div className="flex-align-center" style={{ gap: '4px' }}>
                                  <button
                                    type="button"
                                    className="action-pill-btn"
                                    onClick={() => openFile(filePath)}
                                    title="Open file"
                                  >
                                    <ExternalLink size={11} />
                                  </button>
                                  <button
                                    type="button"
                                    className="action-pill-btn"
                                    onClick={() => revealInExplorer(filePath)}
                                    title="Reveal in Explorer"
                                  >
                                    <Folder size={11} />
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};
