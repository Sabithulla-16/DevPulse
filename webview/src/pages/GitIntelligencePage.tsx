import React, { useState } from 'react';
import {
  GitBranch,
  GitCommit,
  Users,
  RefreshCw,
  FolderGit2,
  FileCode,
  FileText,
  Search,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  FileDiff,
  BarChart3
} from 'lucide-react';
import { MetricCard } from '../components/MetricCard';
import type {
  GitIntelligenceData,
  GitCommitInfo,
  GitWorkingTreeFile
} from '../types';
import {
  refreshGit,
  selectGitRepo,
  openFile,
  revealInExplorer
} from '../services/vscode';
import { formatNumber } from '../utils/formatters';

interface GitIntelligencePageProps {
  data: GitIntelligenceData | null;
  onNavigateTab?: (tab: string) => void;
}

export const GitIntelligencePage: React.FC<GitIntelligencePageProps> = ({
  data
}) => {
  const [activeTab, setActiveTab] = useState<'workingTree' | 'commits' | 'branches' | 'contributors' | 'churn'>('workingTree');
  const [searchCommit, setSearchCommit] = useState('');
  const [searchFile, setSearchFile] = useState('');

  const summary = data?.summary || {
    totalRepositories: 0,
    currentBranch: 'None',
    totalCommits: 0,
    commitsToday: 0,
    commitsThisWeek: 0,
    uncommittedChangesCount: 0,
    modifiedFilesCount: 0,
    addedFilesCount: 0,
    deletedFilesCount: 0,
    activeContributorsCount: 0
  };

  const repositories = data?.repositories || [];
  const selectedRepoId = data?.selectedRepoId || null;
  const branches = data?.branches || [];
  const commits = data?.recentCommits || [];
  const workingTree = data?.workingTree || [];
  const contributions = data?.contributions || { authors: [], dailyActivity: [] };
  const insights = data?.healthInsights || [];
  const codeChanges = data?.codeChanges || { frequentlyChangedFiles: [], extensionBreakdown: [] };

  const activeRepo = repositories.find(r => r.id === selectedRepoId) || repositories[0];
  const currentBranchObj = branches.find(b => b.isCurrent);

  const filteredCommits = commits.filter((c: GitCommitInfo) =>
    c.message.toLowerCase().includes(searchCommit.toLowerCase()) ||
    c.shortHash.toLowerCase().includes(searchCommit.toLowerCase()) ||
    c.authorName.toLowerCase().includes(searchCommit.toLowerCase())
  );

  const filteredWorkingTree = workingTree.filter((f: GitWorkingTreeFile) =>
    f.path.toLowerCase().includes(searchFile.toLowerCase())
  );

  const handleSelectRepo = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    selectGitRepo(id);
  };

  return (
    <div className="page-container">
      {/* Header Banner & Controls */}
      <section className="section-header-row">
        <div>
          <div className="eyebrow-tag">
            <FolderGit2 size={13} />
            <span>VERSION CONTROL INTELLIGENCE</span>
            {activeRepo && (
              <span style={{ opacity: 0.7, marginLeft: 4 }}>• {activeRepo.name}</span>
            )}
          </div>
          <h2 className="section-title">Git & Repository Intelligence</h2>
          <p className="section-desc">
            Local branch topology, uncommitted working tree diffs, commit frequency, and author contribution analytics.
          </p>
        </div>

        <div className="header-action-group">
          {/* Multi-repo selector if more than 1 repository */}
          {repositories.length > 1 && (
            <select
              className="select-input"
              value={selectedRepoId || ''}
              onChange={handleSelectRepo}
              style={{ width: 'auto', minWidth: 140, height: 32 }}
            >
              {repositories.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className="secondary-btn"
            onClick={() => refreshGit(selectedRepoId || undefined)}
            title="Refresh Git status"
          >
            <RefreshCw size={14} />
            <span>Refresh Git</span>
          </button>
        </div>
      </section>

      {/* Health Insights Banner */}
      {insights.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {insights.map((ins, idx) => (
            <div
              key={idx}
              className={`notification-banner ${ins.type === 'warning' ? 'is-warning' : ins.type === 'alert' ? 'is-error' : 'is-success'}`}
              style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}
            >
              {ins.type === 'warning' || ins.type === 'alert' ? (
                <ShieldAlert
                  size={16}
                  style={{
                    color: ins.type === 'warning' ? 'var(--color-warning)' : 'var(--color-destructive)',
                    flexShrink: 0
                  }}
                />
              ) : (
                <ShieldCheck size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, fontSize: 12 }}>
                <strong>{ins.title}:</strong> <span style={{ color: 'var(--color-muted-foreground)' }}>{ins.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4 Horizontal Metric Cards */}
      <section className="metric-cards-grid metrics-grid">
        <MetricCard
          label="CURRENT BRANCH"
          value={summary.currentBranch || 'detached HEAD'}
          detail={currentBranchObj ? (
            currentBranchObj.upstream
              ? `Tracking ${currentBranchObj.upstream}${currentBranchObj.aheadCount && currentBranchObj.aheadCount > 0 ? ` · ↑${currentBranchObj.aheadCount}` : ''}${currentBranchObj.behindCount && currentBranchObj.behindCount > 0 ? ` · ↓${currentBranchObj.behindCount}` : ''}`
              : 'Local branch (no upstream tracking)'
          ) : 'Repository synchronized'}
          icon={<GitBranch size={18} style={{ color: '#10b981' }} />}
          variant="accent"
        />

        <MetricCard
          label="UNCOMMITTED CHANGES"
          value={`${summary.uncommittedChangesCount} Files`}
          detail={`${summary.modifiedFilesCount} modified · ${summary.addedFilesCount} added · ${summary.deletedFilesCount} deleted`}
          icon={<FileDiff size={18} style={{ color: '#f59e0b' }} />}
          variant={summary.uncommittedChangesCount > 0 ? 'warning' : 'accent'}
        />

        <MetricCard
          label="RECENT COMMITS"
          value={`${summary.commitsToday} Today`}
          detail={`${summary.commitsThisWeek} this week · ${summary.totalCommits} total in history`}
          icon={<GitCommit size={18} style={{ color: '#38bdf8' }} />}
          variant="info"
        />

        <MetricCard
          label="CONTRIBUTORS"
          value={`${summary.activeContributorsCount || contributions.authors.length} Authors`}
          detail="Active repository authors & maintainers"
          icon={<Users size={18} style={{ color: '#a855f7' }} />}
          variant="default"
        />
      </section>

      {/* Tabs Header */}
      <div className="tabs-header" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'workingTree' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('workingTree')}
        >
          <FileText size={14} style={{ marginRight: 6 }} />
          Working Tree ({workingTree.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'commits' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('commits')}
        >
          <GitCommit size={14} style={{ marginRight: 6 }} />
          Commit History ({commits.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'branches' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('branches')}
        >
          <GitBranch size={14} style={{ marginRight: 6 }} />
          Branches ({branches.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'contributors' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('contributors')}
        >
          <Users size={14} style={{ marginRight: 6 }} />
          Contributors ({contributions.authors.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'churn' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('churn')}
        >
          <BarChart3 size={14} style={{ marginRight: 6 }} />
          Code Churn & Extensions
        </button>
      </div>

      {/* TAB 1: Working Tree Changes */}
      {activeTab === 'workingTree' && (
        <article className="card panel-card">
          <div className="table-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 13 }}>Uncommitted Files</strong>
              <span className="status-badge is-neutral">{filteredWorkingTree.length} changes</span>
            </div>

            <div className="search-input-wrap">
              <Search size={14} />
              <input
                type="text"
                className="search-field"
                placeholder="Filter files..."
                value={searchFile}
                onChange={e => setSearchFile(e.target.value)}
                style={{ width: 180 }}
              />
            </div>
          </div>

          {filteredWorkingTree.length === 0 ? (
            <div className="empty-state-box" style={{ padding: '36px 16px', textAlign: 'center' }}>
              <FileCode size={32} style={{ color: 'var(--color-muted-foreground)', opacity: 0.5, marginBottom: 8 }} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>Working Tree Clean</div>
              <p style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>
                No modified, staged, or untracked changes detected in workspace.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>STATUS</th>
                    <th>STAGE</th>
                    <th>FILE PATH</th>
                    <th style={{ textAlign: 'right' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkingTree.map(f => {
                    const isMod = f.status === 'M' || f.status === 'modified';
                    const isAdd = f.status === 'A' || f.status === 'added' || f.status === '?' || f.status === 'untracked';
                    const isDel = f.status === 'D' || f.status === 'deleted';

                    return (
                      <tr key={f.path}>
                        <td style={{ width: 100 }}>
                          <span className={`status-badge ${isMod ? 'is-warning' : isAdd ? 'is-good' : isDel ? 'is-danger' : 'is-neutral'}`}>
                            {isMod ? 'MODIFIED' : isAdd ? 'UNTRACKED' : isDel ? 'DELETED' : f.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ width: 90 }}>
                          <span className={`status-badge ${f.isStaged ? 'is-good' : 'is-neutral'}`}>
                            {f.isStaged ? 'Staged' : 'Worktree'}
                          </span>
                        </td>
                        <td>
                          {isDel ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-muted-foreground)' }}>
                              <FileCode size={13} />
                              <span className="table-cell-truncate" style={{ maxWidth: 360, textDecoration: 'line-through' }}>{f.path}</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="file-link-btn"
                              onClick={() => openFile(f.path)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--color-foreground)',
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6
                              }}
                            >
                              <FileCode size={13} style={{ color: 'var(--color-muted-foreground)' }} />
                              <span className="table-cell-truncate" style={{ maxWidth: 360 }}>{f.path}</span>
                              {f.oldPath && <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }}> (from {f.oldPath})</span>}
                            </button>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="action-btn"
                            style={{ fontSize: 11, padding: '2px 8px' }}
                            onClick={() => revealInExplorer(f.path)}
                          >
                            <ExternalLink size={12} style={{ marginRight: 4 }} />
                            Reveal
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>
      )}

      {/* TAB 2: Commit History */}
      {activeTab === 'commits' && (
        <article className="card panel-card">
          <div className="table-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 13 }}>Recent Commits</strong>
              <span className="status-badge is-neutral">{filteredCommits.length} commits</span>
            </div>

            <div className="search-input-wrap">
              <Search size={14} />
              <input
                type="text"
                className="search-field"
                placeholder="Search commits..."
                value={searchCommit}
                onChange={e => setSearchCommit(e.target.value)}
                style={{ width: 200 }}
              />
            </div>
          </div>

          {/* Historical Coverage Metadata Banner */}
          <div className="coverage-banner">
            <div>
              <span>Historical Coverage: </span>
              <strong>{data?.historyCoverage ? `${commits.length} of ${data.historyCoverage.totalInRepo} commits synchronized` : `${commits.length} commits synchronized`}</strong>
              {commits.length > 0 && commits[commits.length - 1] && (
                <span> (coverage from {new Date(commits[commits.length - 1].timestamp).toLocaleDateString()} to {new Date(commits[0].timestamp).toLocaleDateString()})</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }}>
              Local Repository Commits
            </div>
          </div>

          {filteredCommits.length === 0 ? (
            <div className="empty-state-box" style={{ padding: '36px 16px', textAlign: 'center' }}>
              <GitCommit size={32} style={{ color: 'var(--color-muted-foreground)', opacity: 0.5, marginBottom: 8 }} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>No Commits Found</div>
              <p style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>
                No commit history matches the current query.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>HASH</th>
                    <th>MESSAGE</th>
                    <th>AUTHOR</th>
                    <th style={{ textAlign: 'right' }}>CHANGES</th>
                    <th style={{ textAlign: 'right' }}>DATE</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCommits.map(c => (
                    <tr key={c.commitHash}>
                      <td>
                        <code style={{ fontSize: 11, background: 'var(--color-card-hover)', padding: '2px 6px', borderRadius: 4 }}>
                          {c.shortHash}
                        </code>
                      </td>
                      <td>
                        <span className="table-cell-truncate" style={{ maxWidth: 400, fontWeight: 600, color: 'var(--color-foreground)' }}>
                          {c.message}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--color-muted-foreground)', whiteSpace: 'nowrap' }}>
                        {c.authorName}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 11, whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--color-accent)', marginRight: 6 }}>+{c.insertions}</span>
                        <span style={{ color: 'var(--color-destructive)' }}>-{c.deletions}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--color-muted-foreground)', whiteSpace: 'nowrap' }}>
                        {new Date(c.timestamp).toLocaleDateString()} {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data?.historyCoverage?.hasMore && (
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  refreshGit(selectedRepoId || undefined, commits.length + 50);
                }}
                style={{ margin: '0 auto', fontSize: 12, padding: '6px 16px' }}
              >
                <span>Load More Commits (+50)</span>
              </button>
            </div>
          )}
        </article>
      )}

      {/* TAB 3: Branches */}
      {activeTab === 'branches' && (
        <article className="card panel-card">
          <div className="table-header-bar" style={{ marginBottom: 12 }}>
            <strong>Repository Branches & Tracking</strong>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>BRANCH NAME</th>
                  <th>TYPE</th>
                  <th>UPSTREAM TRACKING</th>
                  <th style={{ textAlign: 'center' }}>SYNC STATUS</th>
                  <th style={{ textAlign: 'right' }}>LAST COMMIT</th>
                </tr>
              </thead>
              <tbody>
                {branches.map(b => (
                  <tr key={b.name}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <GitBranch size={13} style={{ color: b.isCurrent ? 'var(--color-accent)' : 'var(--color-muted-foreground)' }} />
                        <strong style={{ color: b.isCurrent ? 'var(--color-accent)' : 'var(--color-foreground)' }}>
                          {b.name}
                        </strong>
                        {b.isCurrent && (
                          <span className="status-badge is-good" style={{ fontSize: 10, padding: '1px 5px' }}>
                            Current
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${b.isRemote ? 'is-info' : 'is-neutral'}`}>
                        {b.isRemote ? 'Remote' : 'Local'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>
                        {b.upstream || '—'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {b.aheadCount !== undefined || b.behindCount !== undefined ? (
                        <div style={{ display: 'inline-flex', gap: 6, fontSize: 11 }}>
                          {(b.aheadCount || 0) > 0 && (
                            <span style={{ color: 'var(--color-accent)' }}>↑ {b.aheadCount} ahead</span>
                          )}
                          {(b.behindCount || 0) > 0 && (
                            <span style={{ color: 'var(--color-warning)' }}>↓ {b.behindCount} behind</span>
                          )}
                          {(b.aheadCount || 0) === 0 && (b.behindCount || 0) === 0 && (
                            <span style={{ color: 'var(--color-muted-foreground)' }}>In Sync</span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }}>Untracked</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {b.lastCommitHash ? (
                        <code style={{ fontSize: 11, background: 'var(--color-card-hover)', padding: '2px 6px', borderRadius: 4 }}>
                          {b.lastCommitHash.slice(0, 7)}
                        </code>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {/* TAB 4: Contributor Analytics */}
      {activeTab === 'contributors' && (
        <article className="card panel-card">
          <div className="table-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <strong style={{ fontSize: 13 }}>Repository Contributor Analytics</strong>
              <div style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }}>
                Aggregated strictly from local Git repository commit metadata. Does not query remote hosting services or artificially merge different authors.
              </div>
            </div>
          </div>

          {contributions.authors.length === 0 ? (
            <div className="empty-state-box" style={{ padding: '36px 16px', textAlign: 'center' }}>
              <Users size={32} style={{ color: 'var(--color-muted-foreground)', opacity: 0.5, marginBottom: 8 }} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>No Author Records</div>
              <p style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>
                Commit history has no recorded authors yet.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>AUTHOR NAME</th>
                    <th style={{ textAlign: 'right' }}>COMMITS</th>
                    <th style={{ textAlign: 'right' }}>INSERTIONS</th>
                    <th style={{ textAlign: 'right' }}>DELETIONS</th>
                    <th style={{ textAlign: 'right' }}>LAST COMMIT</th>
                  </tr>
                </thead>
                <tbody>
                  {contributions.authors.map(a => (
                    <tr key={a.name}>
                      <td>
                        <strong style={{ color: 'var(--color-foreground)' }}>{a.name}</strong>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {a.commitCount}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--color-accent)' }}>
                        +{formatNumber(a.insertions)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--color-destructive)' }}>
                        -{formatNumber(a.deletions)}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--color-muted-foreground)' }}>
                        {a.lastCommitAt ? new Date(a.lastCommitAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data?.historyCoverage?.hasMore && (
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  refreshGit(selectedRepoId || undefined, commits.length + 50);
                }}
                style={{ margin: '0 auto', fontSize: 12, padding: '6px 16px' }}
              >
                <span>Load More Commits (+50)</span>
              </button>
            </div>
          )}
        </article>
      )}

      {/* TAB 5: Code Churn & File Extensions */}
      {activeTab === 'churn' && (
        <article className="card panel-card">
          <div className="table-header-bar" style={{ marginBottom: 14 }}>
            <div>
              <strong style={{ fontSize: 13 }}>Workspace Code Churn & File Extensions</strong>
              <div style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }}>
                Analysis of frequently touched files and extension distribution across active working tree diffs.
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Frequently Changed Files */}
            <div>
              <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--color-foreground)' }}>
                Active Working Tree Files ({codeChanges.frequentlyChangedFiles.length})
              </h4>
              {codeChanges.frequentlyChangedFiles.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--color-muted-foreground)', padding: 12 }}>
                  No active changes in working tree.
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>FILE</th>
                      <th style={{ textAlign: 'right' }}>CHANGES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codeChanges.frequentlyChangedFiles.map(f => (
                      <tr key={f.path}>
                        <td>
                          <span className="table-cell-truncate" style={{ maxWidth: 220, fontSize: 12 }}>
                            {f.path}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 11 }}>
                          {f.changeCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Extension Breakdown */}
            <div>
              <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--color-foreground)' }}>
                File Extension Distribution
              </h4>
              {codeChanges.extensionBreakdown.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--color-muted-foreground)', padding: 12 }}>
                  No extensions recorded.
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>EXTENSION</th>
                      <th style={{ textAlign: 'right' }}>FILES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codeChanges.extensionBreakdown.map(e => (
                      <tr key={e.extension}>
                        <td>
                          <code style={{ fontSize: 11, background: 'var(--color-card-hover)', padding: '2px 6px', borderRadius: 4 }}>
                            {e.extension}
                          </code>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 11 }}>
                          {e.changeCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </article>
      )}
    </div>
  );
};
