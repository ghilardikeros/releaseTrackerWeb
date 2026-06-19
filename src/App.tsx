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
  tag?: string | null;
  notes?: string | null;
}

interface ApiResponse {
  pageNumber: number;
  pageSize: number;
  total: number;
  results: Deployment[];
}

interface SettingsResponse {
  useLogin: boolean;
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
const AUTH_LOGIN_URL = API_BASE_URL + '/auth/login';
const AUTH_PASSWORD_RESET_URL = API_BASE_URL + '/auth/password';
const SETTINGS_URL = API_BASE_URL + '/release/settings';
const ALERTS_URL = API_BASE_URL + '/release/alerts';

// 🔥 Session Duration: 7 days in milliseconds
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; 
const STORAGE_KEY = 'deployTrackerSession';

function App() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [customerGroups, setCustomerGroups] = useState<CustomerGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEnv, setSelectedEnv] = useState<Environment>('PROD');
  const [alerts, setAlerts] = useState<string[]>([]);
  
  // 🔥 Auth States
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [requiresLogin, setRequiresLogin] = useState<boolean>(false);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  
  // 🔥 Forgot Password States
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [resetEmail, setResetEmail] = useState<string>('');
  const [resetLoading, setResetLoading] = useState<boolean>(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  // 1. CHECK SETTINGS & FETCH ALERTS ON MOUNT
  useEffect(() => {
    const initApp = async () => {
      try {
        const settingsResponse = await fetch(SETTINGS_URL);
        if (!settingsResponse.ok) {
          setRequiresLogin(false);
        } else {
          const settings: SettingsResponse = await settingsResponse.json();
          setRequiresLogin(settings.useLogin);
        }

        // Fetch alerts (we fetch them on load, but only show if PROD)
        const alertsResponse = await fetch(ALERTS_URL);
        if (alertsResponse.ok) {
          const alertsData: string[] = await alertsResponse.json();
          setAlerts(alertsData);
        } else {
          setAlerts([]);
        }

        if (!requiresLogin) {
          setLoading(false);
          fetchDeployments(selectedEnv);
        } else {
          const sessionData = localStorage.getItem(STORAGE_KEY);
          if (sessionData) {
            try {
              const { validUntil } = JSON.parse(sessionData);
              if (Date.now() < validUntil) {
                setIsAuthenticated(true);
                setLoading(false);
                return;
              }
            } catch (e) {
              console.error('Session parsing error', e);
            }
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('Error initializing app:', err);
        setError('Failed to load application settings.');
        setLoading(false);
      }
    };

    initApp();
  }, []);

  // 2. FETCH DATA WHEN AUTHENTICATED OR SETTINGS ALLOW IT
  useEffect(() => {
    if (!requiresLogin || isAuthenticated) {
      fetchDeployments(selectedEnv);
    }
  }, [isAuthenticated, requiresLogin, selectedEnv]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);

    try {
      const response = await fetch(AUTH_LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (response.status === 202) {
        const validUntil = Date.now() + SESSION_DURATION;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ validUntil, email }));
        setIsAuthenticated(true);
      } else if (response.status === 401) {
        throw new Error('Invalid credentials');
      } else {
        const errorText = await response.text();
        throw new Error(`Login failed: ${response.status} - ${errorText}`);
      }
      
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setResetMessage(null);
    setResetError(null);

    try {
      const response = await fetch(AUTH_PASSWORD_RESET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Email: resetEmail })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to send reset email');
      }

      setResetMessage('Password reset email sent successfully!');
      setTimeout(() => {
        setShowResetModal(false);
        setResetEmail('');
        setResetMessage(null);
      }, 3000);

    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setResetLoading(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem(STORAGE_KEY);
    setDeployments([]);
    setCustomerGroups([]);
    setEmail('');
    setPassword('');
    setError(null);
    setLoading(true);
  };

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
      return { customer, latest, history, isExpanded: true, loadingHistory: false };
    });

    return result.sort((a, b) => {
      const dateA = a.latest.length > 0 ? new Date(a.latest[0].releaseDate).getTime() : 0;
      const dateB = b.latest.length > 0 ? new Date(b.latest[0].releaseDate).getTime() : 0;
      return dateB - dateA;
    });
  };

  const fetchDeployments = async (env: Environment) => {
    if (requiresLogin && !isAuthenticated) return;
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
    if (requiresLogin && !isAuthenticated) return;
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
        return { ...group, history, loadingHistory: false };
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

  const getGitHubUrl = (commitHash: string, project?: string): string => {
    if (project === 'SAGA') {
      return 'https://keros-projects.visualstudio.com/Keros/_git/Keros.ServiceBus/commit/' + commitHash;
    }
    return 'https://github.com/' + GITHUB_ORG + '/' + GITHUB_REPO + '/commit/' + commitHash;
  };

  const handleEnvChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const newEnv = event.target.value as Environment;
    setSelectedEnv(newEnv);
    if (!requiresLogin || isAuthenticated) {
      fetchDeployments(newEnv);
    }
  };

  // 🔥 LOGIN MODAL UI
  if (requiresLogin && !isAuthenticated) {
    return (
      <div className="login-overlay">
        <div className="login-box">
          <div className="login-header">
            <img src={companyLogo} alt="Logo" className="login-logo" />
            <h2>Deploy Tracker</h2>
          </div>
          
          {/* 🔥 NO ALERTS HERE (Only shown on PROD page after login or if no login required) */}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Email Address</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                autoFocus
                placeholder="name@example.com"
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
              />
            </div>
            {loginError && <div className="login-error">{loginError}</div>}
            <button type="submit" className="login-btn" disabled={loginLoading}>
              {loginLoading ? 'Verifying...' : 'Login'}
            </button>
          </form>
          <div className="forgot-password-link">
            <button type="button" onClick={() => setShowResetModal(true)} className="link-btn">
              Forgot Password?
            </button>
          </div>
        </div>

        {showResetModal && (
          <div className="modal-overlay" onClick={() => setShowResetModal(false)}>
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Reset Password</h3>
                <button className="close-btn" onClick={() => setShowResetModal(false)}>×</button>
              </div>
              <form onSubmit={handleResetPassword}>
                <p>Enter your email address to receive a password reset link.</p>
                <div className="form-group">
                  <label>Email Address</label>
                  <input 
                    type="email" 
                    value={resetEmail} 
                    onChange={(e) => setResetEmail(e.target.value)} 
                    required 
                    autoFocus
                  />
                </div>
                {resetMessage && <div className="success-message">{resetMessage}</div>}
                {resetError && <div className="login-error">{resetError}</div>}
                <button type="submit" className="login-btn" disabled={resetLoading}>
                  {resetLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // MAIN APP UI
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
          {requiresLogin && (
            <button onClick={handleLogout} className="logout-btn">Logout</button>
          )}
        </div>
      </header>
      
      {/* 🔥 ONLY SHOW ALERTS IF ENVIRONMENT IS PROD */}
      {alerts.length > 0 && selectedEnv === 'PROD' && (
        <div className="alerts-container">
          {alerts.map((alert, idx) => (
            <div key={idx} className="alert-banner">
              ⚠️ {alert}
            </div>
          ))}
        </div>
      )}
      
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
                          <th>Notes</th>
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
                                <a href={getGitHubUrl(dep.commit, dep.project)} target="_blank" rel="noopener noreferrer" className="commit-link">
                                  {dep.commit.substring(0, 7)} ↗
                                </a>
                                {hasChanges && (
                                  <span className="alert-badge" title={`Uncommitted changes: ${dep.totalUncommitted || 0} files`}>⚠️</span>
                                )}
                              </td>
                              <td>{dep.user}</td>
                              <td>{formatDate(dep.releaseDate)}</td>
                              <td className="notes-cell">
                                {dep.notes && <span className="notes-icon" title={dep.notes}>📄</span>}
                              </td>
                              <td>
                                {isRecent && <span className="new-badge">NEW</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

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
                                    <a href={getGitHubUrl(dep.commit, dep.project)} target="_blank" rel="noopener noreferrer" className="commit-link">
                                      {dep.commit.substring(0, 7)} ↗
                                    </a>
                                    {hasChanges && (
                                      <span className="alert-badge" title={`Uncommitted changes: ${dep.totalUncommitted || 0} files`}>⚠️</span>
                                    )}
                                  </td>
                                  <td>{dep.user}</td>
                                  <td>{formatDate(dep.releaseDate)}</td>
                                  <td className="notes-cell">
                                    {dep.notes && <span className="notes-icon" title={dep.notes}>📄</span>}
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