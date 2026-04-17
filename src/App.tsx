import React, { useState, useEffect } from 'react';
import './App.css';

import companyLogo from './assets/logo.png';

// 🔥 UPDATED INTERFACE
interface Deployment {
  customer: string;
  project: string;
  environment: string;
  branch: string;
  commit: string;
  user: string;
  email: string;
  releaseDate: string;
  buildDate: string;
  totalUncommitted?: number;
  untrackedFiles?: string[];
  modifiedFiles?: string[];
  stagedFiles?: string[];
  tag?: string | null;      // 🔥 New field
  notes?: string | null;    // 🔥 New field
}

interface ApiResponse {
  pageNumber: number;
  pageSize: number;
  total: number;
  results: Deployment[];
}

interface CustomerGroup {
  customer: string;
  latest: Deployment[];
  history: Deployment[];
  isExpanded: boolean;
  loadingHistory: boolean;
}

type Environment = 'PROD' | 'STAGE' | 'TEST';

// API Configuration
const GITHUB_ORG = "keros-dev";
const GITHUB_REPO = "KNimbus-2017";
const API_BASE_URL = "https://release-tracking-api.keros-digital.com";

function App() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [customerGroups, setCustomerGroups] = useState<CustomerGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEnv, setSelectedEnv] = useState<Environment>('PROD');

  const isNewDeployment = (dateString: string): boolean => {
    if (dateString === '0001-01-01T00:00:00') return false;
    const deployDate = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - deployDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays <= 7;
  };

  const hasUncommittedChanges = (dep: Deployment): boolean => {
    if (!dep) return false;
    const hasTotal = (dep.totalUncommitted ?? 0) > 0;
    const hasUntracked = (dep.untrackedFiles?.length ?? 0) > 0;
    const hasModified = (dep.modifiedFiles?.length ?? 0) > 0;
    const hasStaged = (dep.stagedFiles?.length ?? 0) > 0;
    return hasTotal || hasUntracked || hasModified || hasStaged;
  };

  const getLatestDeployments = (data: Deployment[]): Deployment[] => {
    const map = new Map<string, Deployment>();
    data.forEach((dep) => {
      const key = dep.customer + '-' + dep.project + '-' + dep.environment;
      const existing = map.get(key);
      if (!existing || new Date(dep.releaseDate) > new Date(existing.releaseDate)) {
        map.set(key, dep);
      }
    });
    return Array.from(map.values());
  };

  const initializeGroups = (latestList: Deployment[]): CustomerGroup[] => {
    const map = new Map<string, Deployment[]>();
    
    latestList.forEach((dep) => {
      if (!map.has(dep.customer)) {
        map.set(dep.customer, []);
      }
      map.get(dep.customer)!.push(dep);
    });

    const result: CustomerGroup[] = Array.from(map.entries()).map(([customer, deps]) => {
      const sortedDeps = deps.sort(
        (a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
      );
      
      const latest = sortedDeps.slice(0, 5);
      const history = sortedDeps.slice(5);
      
      return {
        customer,
        latest,
        history,
        isExpanded: true,
        loadingHistory: false
      };
    });

    return result.sort((a, b) => {
      const dateA = a.latest.length > 0 ? new Date(a.latest[0].releaseDate).getTime() : 0;
      const dateB = b.latest.length > 0 ? new Date(b.latest[0].releaseDate).getTime() : 0;
      return dateB - dateA;
    });
  };

  const fetchDeployments = async (env: Environment) => {
    setLoading(true);
    setError(null);
    const apiUrl = API_BASE_URL + '/release/all/' + env;

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }
      const data: ApiResponse = await response.json();
      setDeployments(data.results);
      const latestList = getLatestDeployments(data.results);
      setCustomerGroups(initializeGroups(latestList));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomerHistory = async (customerName: string) => {
    setCustomerGroups(prev => prev.map(group => 
      group.customer === customerName ? { ...group, loadingHistory: true } : group
    ));

    try {
      const apiUrl = API_BASE_URL + '/release/all/' + selectedEnv;
      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error('HTTP Error: ' + response.status);
      
      const data: ApiResponse = await response.json();
      const allForCustomer = data.results.filter(d => d.customer === customerName);
      
      const latestMap = new Map<string, Deployment>();
      allForCustomer.forEach(dep => {
        const key = dep.project + '-' + dep.environment;
        const existing = latestMap.get(key);
        if (!existing || new Date(dep.releaseDate) > new Date(existing.releaseDate)) {
          latestMap.set(key, dep);
        }
      });

      const latestKeys = new Set(Array.from(latestMap.values()).map((d: Deployment) => 
        d.project + '-' + d.environment + '-' + d.commit
      ));

      const history = allForCustomer
        .filter(dep => !latestKeys.has(dep.project + '-' + dep.environment + '-' + dep.commit))
        .sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());

      setCustomerGroups(prev => prev.map(group => {
        if (group.customer !== customerName) return group;
        return {
          ...group,
          history,
          loadingHistory: false
        };
      }));
    } catch (err) {
      console.error('Error loading history:', err);
      setCustomerGroups(prev => prev.map(group => 
        group.customer === customerName ? { ...group, loadingHistory: false } : group
      ));
    }
  };

  const toggleCustomerGroup = (index: number) => {
    setCustomerGroups(prev => 
      prev.map((group, i) => 
        i === index ? { ...group, isExpanded: !group.isExpanded } : group
      )
    );
  };

  const toggleAllGroups = (expand: boolean) => {
    setCustomerGroups(prev => 
      prev.map(group => ({ ...group, isExpanded: expand }))
    );
  };

  const formatDate = (dateString: string): string => {
    if (dateString === '0001-01-01T00:00:00') return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '-';
      const formatter = new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const parts = formatter.formatToParts(date);
      const partMap: Record<string, string> = {};
      parts.forEach(({ type, value }) => { partMap[type] = value; });
      return `${partMap.year}/${partMap.month}/${partMap.day} ${partMap.hour}:${partMap.minute}`;
    } catch (e) { return '-'; }
  };

  const getEnvironmentBadge = (env: string) => {
    const colors: Record<string, string> = {
      PROD: '#dc3545',
      STAGE: '#ffc107',
      TEST: '#28a745'
    };
    return colors[env] || '#6c757d';
  };

  const getGitHubUrl = (commitHash: string) => {
    return 'https://github.com/' + GITHUB_ORG + '/' + GITHUB_REPO + '/commit/' + commitHash;
  };

  const handleEnvChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const newEnv = event.target.value as Environment;
    setSelectedEnv(newEnv);
    fetchDeployments(newEnv);
  };

  useEffect(() => {
    fetchDeployments(selectedEnv);
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-title">
          <img src={companyLogo} alt="Company Logo" className="app-logo" />
          <h1>Deploy Tracker</h1>
        </div>
        <div className="controls">
          <label htmlFor="env-select">Environment:</label>
          <select 
            id="env-select" 
            value={selectedEnv} 
            onChange={handleEnvChange}
            disabled={loading}
          >
            <option value="PROD">PROD</option>
            <option value="STAGE">STAGE</option>
            <option value="TEST">TEST</option>
          </select>
          <button onClick={() => fetchDeployments(selectedEnv)} disabled={loading} className="refresh-btn">
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </header>
      
      <main className="App-main">
        {loading && <div className="loading"><div className="spinner"></div><p>Loading data from {selectedEnv}...</p></div>}
        
        {error && (
          <div className="error-box">
            <h3>❌ Failed to load data</h3>
            <p><strong>Error:</strong> {error}</p>
            <button onClick={() => fetchDeployments(selectedEnv)} className="retry-btn">Retry</button>
          </div>
        )}
        
        {!loading && !error && customerGroups.length === 0 && (
          <div className="no-data">
            <h3>📭 No deployments found</h3>
            <p>No deployments found for environment: <strong>{selectedEnv}</strong></p>
          </div>
        )}

        {!loading && !error && customerGroups.length > 0 && (
          <div className="grouped-table-container">
            <div className="stats">
              <span>Customers: {customerGroups.length}</span>
              <div className="bulk-controls">
                <button onClick={() => toggleAllGroups(true)} className="bulk-btn">Expand All</button>
                <button onClick={() => toggleAllGroups(false)} className="bulk-btn">Collapse All</button>
              </div>
            </div>

            {customerGroups.map((group, groupIndex) => (
              <div key={group.customer} className="customer-group">
                <div className="customer-header" onClick={() => toggleCustomerGroup(groupIndex)}>
                  <span className={'toggle-icon ' + (group.isExpanded ? 'expanded' : 'collapsed')}>▶</span>
                  <span className="customer-name">{group.customer}</span>
                  <span className="deployment-count">
                    {group.history.length > 0 
                      ? group.latest.length + ' latest + ' + group.history.length + ' older' 
                      : group.latest.length + ' latest deployments'}
                  </span>
                </div>

                {group.isExpanded && (
                  <>
                    {/* MAIN TABLE */}
                    <table className="deployment-table">
                      <thead>
                        <tr>
                          <th>Project</th>
                          <th>Environment</th>
                          <th>Branch</th>
                          <th>Build Date</th>
                          <th>Commit</th>
                          <th>Deployer</th>
                          <th>Release Date</th>
                          <th>Notes</th> {/* 🔥 New Column */}
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.latest.map((dep, idx) => {
                          const isRecent = isNewDeployment(dep.releaseDate);
                          const hasChanges = hasUncommittedChanges(dep);
                          
                          return (
                            <tr key={group.customer + '-latest-' + idx} className={isRecent ? 'highlight-row' : ''}>
                              <td>
                                <div>{dep.project}</div>
                                {/* 🔥 TAG DISPLAY */}
                                {dep.tag && <span className="project-tag">{dep.tag}</span>}
                              </td>
                              <td>
                                <span className="badge" style={{ backgroundColor: getEnvironmentBadge(dep.environment) }}>
                                  {dep.environment}
                                </span>                                
                              </td>
                              <td><b>{dep.branch}</b></td>
                              <td>{formatDate(dep.buildDate)}</td>
                              <td className="commit">
                                <a href={getGitHubUrl(dep.commit)} target="_blank" rel="noopener noreferrer" className="commit-link">
                                  {dep.commit.substring(0, 7)} ↗
                                </a>
                                {hasChanges && (
                                  <span className="alert-badge" title={`Uncommitted changes: ${dep.totalUncommitted || 0} files`}>⚠️</span>
                                )}
                              </td>
                              <td>{dep.user}</td>
                              <td>{formatDate(dep.releaseDate)}</td>
                              <td className="notes-cell">
                                {/* 🔥 NOTES ICON */}
                                {dep.notes && (
                                  <span className="notes-icon" title={dep.notes}>📄</span>
                                )}
                              </td>
                              <td>
                                {isRecent && <span className="new-badge">NEW</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* HISTORY TABLE */}
                    {group.history.length > 0 && (
                      <div className="history-section">
                        <h4 className="history-title">Older Deployments</h4>
                        <table className="deployment-table history-table">
                          <thead>
                            <tr>
                              <th>Project</th>
                              <th>Environment</th>
                              <th>Branch</th>
                              <th>Build Date</th>
                              <th>Commit</th>
                              <th>Deployer</th>
                              <th>Release Date</th>
                              <th>Notes</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.history.map((dep, idx) => {
                              const isRecent = isNewDeployment(dep.releaseDate);
                              const hasChanges = hasUncommittedChanges(dep);

                              return (
                                <tr key={group.customer + '-hist-' + idx} className={isRecent ? 'highlight-row' : ''}>
                                  <td>
                                    <div>{dep.project}</div>
                                    {dep.tag && <span className="project-tag">{dep.tag}</span>}
                                  </td>
                                  <td>
                                    <span className="badge" style={{ backgroundColor: getEnvironmentBadge(dep.environment) }}>
                                      {dep.environment}
                                    </span>
                                  </td>
                                  <td><b>{dep.branch}</b></td>
                                  <td>{formatDate(dep.buildDate)}</td>
                                  <td className="commit">
                                    <a href={getGitHubUrl(dep.commit)} target="_blank" rel="noopener noreferrer" className="commit-link">
                                      {dep.commit.substring(0, 7)} ↗
                                    </a>
                                    {hasChanges && (
                                      <span className="alert-badge" title={`Uncommitted changes: ${dep.totalUncommitted || 0} files`}>⚠️</span>
                                    )}
                                  </td>
                                  <td>{dep.user}</td>
                                  <td>{formatDate(dep.releaseDate)}</td>
                                  <td className="notes-cell">
                                    {dep.notes && (
                                      <span className="notes-icon" title={dep.notes}>📄</span>
                                    )}
                                  </td>
                                  <td>
                                    {isRecent && <span className="new-badge">NEW</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="load-history-container">
                      <button onClick={() => loadCustomerHistory(group.customer)} disabled={group.loadingHistory} className="load-history-btn">
                        {group.loadingHistory ? 'Loading...' : 'Load Older Deployments'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;