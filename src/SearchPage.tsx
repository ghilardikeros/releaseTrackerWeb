import React, { useState } from 'react';
import './SearchPage.css';

// Import existing types from App.tsx
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

// 🔥 NEW SEARCH MODEL (matching C# SearchReleaseModel)
interface SearchReleaseModel {
  Customer: string;
  Environment: string;
  Tag?: string;
  Project?: string;
  RangeStartOn?: string; // ISO date string
  RangeEndOn?: string;   // ISO date string
}

type Environment = 'PROD' | 'STAGE' | 'TEST';

const API_BASE_URL = "https://release-tracking-api.keros-digital.com";
const SEARCH_URL = API_BASE_URL + '/release/search';

function SearchPage() {
  const [searchForm, setSearchForm] = useState<SearchReleaseModel>({
    Customer: '',
    Environment: '',
    Tag: '',
    Project: '',
    RangeStartOn: undefined,
    RangeEndOn: undefined
  });

  const [results, setResults] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchPerformed, setSearchPerformed] = useState<boolean>(false);

  // Helper to get existing utility functions from App context
  // (Copy these from App.tsx or import as utilities)
  const formatDate = (dateString: string): string => {
    if (!dateString || dateString === '0001-01-01T00:00:00') return '-';
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

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setSearchForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 🔥 Validation - Customer and Environment are Required
    if (!searchForm.Customer.trim()) {
      setError('Customer is required');
      return;
    }
    if (!searchForm.Environment) {
      setError('Environment is required');
      return;
    }

    setLoading(true);
    setError(null);
    setSearchPerformed(true);

    try {
      const payload = {
        Customer: searchForm.Customer,
        Environment: searchForm.Environment,
        ...(searchForm.Tag && { Tag: searchForm.Tag }),
        ...(searchForm.Project && { Project: searchForm.Project }),
        ...(searchForm.RangeStartOn && { RangeStartOn: searchForm.RangeStartOn }),
        ...(searchForm.RangeEndOn && { RangeEndOn: searchForm.RangeEndOn })
      };

      const response = await fetch(SEARCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      const data: ApiResponse = await response.json();
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setSearchForm({
      Customer: '',
      Environment: '',
      Tag: '',
      Project: '',
      RangeStartOn: undefined,
      RangeEndOn: undefined
    });
    setResults([]);
    setError(null);
    setSearchPerformed(false);
  };

  // 🔥 REUSE EXISTING TABLE COMPONENT LOGIC
  const renderDeploymentRow = (dep: Deployment, keyPrefix: string, index: number) => {
    const isRecent = isNewDeployment(dep.releaseDate);
    const hasChanges = hasUncommittedChanges(dep);

    return (
      <tr key={`${keyPrefix}-${index}`} className={isRecent ? 'highlight-row' : ''}>
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
          <a href={`https://github.com/keros-dev/KNimbus-2017/commit/${dep.commit}`} target="_blank" rel="noopener noreferrer" className="commit-link">
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
  };

  return (
    <div className="SearchPage">
      <header className="App-header">
        <div className="header-title">
          <h1>🔎 Search Releases</h1>
        </div>
        <div className="controls">
          <button onClick={() => window.history.back()} className="refresh-btn">
            ← Back to Dashboard
          </button>
        </div>
      </header>

      <main className="App-main">
        {/* 🔥 SEARCH FORM */}
        <div className="search-form-container">
          <form onSubmit={handleSubmit} className="search-form">
            <div className="form-row">
                <div className="form-group half">
                <label htmlFor="Customer">
                    Customer <span className="required">*</span>
                </label>
                <input
                    type="text"
                    id="Customer"
                    name="Customer"
                    value={searchForm.Customer}
                    onChange={handleInputChange}
                    placeholder="e.g., Acme Corp"
                    required
                />
                </div>
                <div className="form-group half">
                <label htmlFor="Environment">
                    Environment <span className="required">*</span>
                </label>
                <select
                    id="Environment"
                    name="Environment"
                    value={searchForm.Environment}
                    onChange={handleInputChange}
                    required
                >
                    <option value="">Select Environment</option>
                    <option value="PROD">PROD</option>
                    <option value="STAGE">STAGE</option>
                    <option value="TEST">TEST</option>
                </select>
                </div>
            </div>

            <div className="form-row">
                <div className="form-group half">
                    <label htmlFor="Project">Project (Optional)</label>
                    <select
                    id="Project"
                    name="Project"
                    value={searchForm.Project || ''}
                    onChange={handleInputChange}
                    >
                    <option value="">Select Project</option>
                    <option value="BE">BE</option>
                    <option value="BEAPI">BEAPI</option>
                    <option value="JOBS">JOBS</option>
                    <option value="IAL">IAL</option>
                    <option value="SAGA">SAGA</option>
                    </select>
                </div>
                <div className="form-group half">
                    <label htmlFor="Tag">Tag (Optional)</label>
                    <input
                    type="text"
                    id="Tag"
                    name="Tag"
                    value={searchForm.Tag}
                    onChange={handleInputChange}
                    placeholder="e.g., v1.2.3"
                    />
                </div>
                </div>

            {/* 🔥 DATE-ONLY RANGES (UPDATED) */}
            <div className="form-row">
                <div className="form-group half">
                <label htmlFor="RangeStartOn">Date Range Start (Optional)</label>
                <input
                    type="date"
                    id="RangeStartOn"
                    name="RangeStartOn"
                    value={searchForm.RangeStartOn || ''}
                    onChange={handleInputChange}
                />
                </div>
                <div className="form-group half">
                <label htmlFor="RangeEndOn">Date Range End (Optional)</label>
                <input
                    type="date"
                    id="RangeEndOn"
                    name="RangeEndOn"
                    value={searchForm.RangeEndOn || ''}
                    onChange={handleInputChange}
                />
                </div>
            </div>

            {error && <div className="login-error">{error}</div>}

            <div className="form-actions">
                <button type="submit" className="login-btn" disabled={loading}>
                {loading ? 'Searching...' : 'Search'}
                </button>
                <button type="button" onClick={handleClear} className="clear-btn" disabled={loading}>
                Clear
                </button>
            </div>
            </form>
        </div>

        {/* 🔥 RESULTS SECTION */}
        {searchPerformed && !loading && !error && results.length === 0 && (
          <div className="no-data">
            <h3>📭 No Results Found</h3>
            <p>No releases matched your search criteria.</p>
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Searching for releases...</p>
          </div>
        )}

        {!loading && !error && results.length > 0 && (
          <div className="search-results">
            <div className="stats">
              <span><strong>{results.length}</strong> release{results.length !== 1 ? 's' : ''} found</span>
            </div>

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
                {results.map((dep, idx) => renderDeploymentRow(dep, 'search', idx))}
              </tbody>
            </table>
          </div>
        )}

        {error && (
          <div className="error-box">
            <h3>❌ Search Failed</h3>
            <p><strong>Error:</strong> {error}</p>
            <button onClick={() => setSearchPerformed(false)} className="retry-btn">Back to Form</button>
          </div>
        )}
      </main>
    </div>
  );
}

export default SearchPage;