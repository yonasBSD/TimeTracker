import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { ApiClient, classifyAxiosError, normalizeServerUrlInput } from './services/api.js';
import { storeClear, storeDelete, storeGet, storeSet } from './services/store.js';
import { buildDiagnostics } from './services/diagnostics.js';
import { createSyncEngine } from './sync/syncEngine.js';

const views = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'projects', label: 'Projects' },
  { id: 'entries', label: 'Time Entries' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'workforce', label: 'Workforce' },
  { id: 'settings', label: 'Settings' },
];

const defaultConnection = {
  state: 'not_configured',
  serverUrl: '',
  message: 'Not configured',
  lastOk: null,
};

function App() {
  const [booting, setBooting] = useState(true);
  const [authStep, setAuthStep] = useState('server');
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authInfo, setAuthInfo] = useState('');
  const [diagnostics, setDiagnostics] = useState(null);
  const [apiClient, setApiClient] = useState(null);
  const [connection, setConnection] = useState(defaultConnection);
  const [activeView, setActiveView] = useState('dashboard');
  const [theme, setTheme] = useState('system');
  const [toast, setToast] = useState(null);
  const [data, setData] = useState({
    user: null,
    timer: null,
    projects: [],
    tasks: [],
    entries: [],
    invoices: [],
    expenses: [],
    workforce: {},
  });
  const [loading, setLoading] = useState({});
  const [filters, setFilters] = useState({ project: '', entrySearch: '' });
  const [settings, setSettings] = useState({ autoSync: true, syncInterval: 60 });
  const [syncStatus, setSyncStatus] = useState({
    queueDepth: 0,
    syncing: false,
    lastSyncAt: null,
    lastError: '',
  });
  const [startTimerOpen, setStartTimerOpen] = useState(false);
  const [newEntryOpen, setNewEntryOpen] = useState(false);
  const syncEngineRef = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => setToast(null), type === 'error' ? 7000 : 4000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const savedTheme = (await storeGet('theme_mode')) || 'system';
      const savedUrl = (await storeGet('server_url')) || '';
      const savedUsername = (await storeGet('username')) || '';
      const token = await storeGet('api_token');
      const tokenServer = await storeGet('api_token_server_url');
      const autoSync = await storeGet('auto_sync');
      const syncInterval = await storeGet('sync_interval');

      if (cancelled) return;
      setTheme(savedTheme);
      setServerUrl(savedUrl || '');
      setUsername(savedUsername || '');
      setSettings({
        autoSync: autoSync !== null && autoSync !== undefined ? Boolean(autoSync) : true,
        syncInterval: Number(syncInterval || 60),
      });

      if (!savedUrl) {
        setAuthStep('server');
        setConnection(defaultConnection);
        setBooting(false);
        return;
      }

      if (!token || (tokenServer && tokenServer !== savedUrl)) {
        setAuthStep(tokenServer && tokenServer !== savedUrl ? 'server' : 'credentials');
        setConnection({ state: 'not_configured', serverUrl: savedUrl, message: 'Sign in required', lastOk: null });
        setBooting(false);
        return;
      }

      const client = new ApiClient(savedUrl, token);
      setConnection({ state: 'connecting', serverUrl: savedUrl, message: 'Checking session…', lastOk: null });
      const session = await client.validateSession();
      if (cancelled) return;

      if (!session.ok) {
        setAuthStep('credentials');
        setAuthError(session.message || 'Please sign in again.');
        setDiagnostics(buildDiagnostics(savedUrl, session));
        setConnection({ state: 'error', serverUrl: savedUrl, message: session.message || 'Session unavailable', lastOk: null });
        setBooting(false);
        return;
      }

      setApiClient(client);
      setConnection({ state: 'connected', serverUrl: savedUrl, message: 'Connected', lastOk: Date.now() });
      setBooting(false);
    }

    boot().catch((error) => {
      console.error('Desktop boot failed', error);
      setDiagnostics(buildDiagnostics(serverUrl, classifyAxiosError(error)));
      setAuthError('Startup failed. Check your server URL and sign in again.');
      setAuthStep('server');
      setBooting(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'system' ? '' : theme;
    storeSet('theme_mode', theme);
  }, [theme]);

  const refreshCoreData = useCallback(async () => {
    if (!apiClient) return;
    setLoading((s) => ({ ...s, core: true }));
    try {
      const [user, timer, projects, tasks, entries] = await Promise.all([
        apiClient.getUsersMe().catch(() => ({ user: null })),
        apiClient.getTimerStatus().catch(() => ({ active: false })),
        apiClient.getProjects().catch(() => ({ projects: [] })),
        apiClient.getTasks().catch(() => ({ tasks: [] })),
        apiClient.getTimeEntries({ perPage: 25 }).catch(() => ({ time_entries: [] })),
      ]);
      setData((current) => ({
        ...current,
        user: user.user || null,
        timer,
        projects: projects.projects || projects.items || [],
        tasks: tasks.tasks || tasks.items || [],
        entries: entries.time_entries || entries.entries || entries.items || [],
      }));
      syncEngineRef.current?.cacheReadData({
        projects: projects.projects || projects.items || [],
        tasks: tasks.tasks || tasks.items || [],
        timeEntries: entries.time_entries || entries.entries || entries.items || [],
      });
      setConnection((c) => ({ ...c, state: 'connected', message: 'Connected', lastOk: Date.now() }));
    } catch (error) {
      const classified = classifyAxiosError(error);
      setConnection((c) => ({ ...c, state: 'error', message: classified.message }));
      showToast(classified.message, 'error');
    } finally {
      setLoading((s) => ({ ...s, core: false }));
    }
  }, [apiClient, showToast]);

  useEffect(() => {
    if (!apiClient) return;
    const engine = createSyncEngine({
      apiClient,
      settings,
      onStatus: setSyncStatus,
      onToast: showToast,
      onRefresh: refreshCoreData,
    });
    syncEngineRef.current = engine;
    engine.start();
    refreshCoreData();
    return () => engine.stop();
  }, [apiClient, settings.autoSync, settings.syncInterval, refreshCoreData, showToast]);

  useEffect(() => {
    if (!apiClient) return undefined;
    const id = window.setInterval(async () => {
      const session = await apiClient.validateSession();
      if (!session.ok) {
        setConnection((c) => ({ ...c, state: 'error', message: session.message }));
      }
    }, 30000);
    return () => window.clearInterval(id);
  }, [apiClient]);

  const handleServerTest = async () => {
    const normalized = ApiClient.normalizeBaseUrl(normalizeServerUrlInput(serverUrl));
    setAuthError('');
    setAuthInfo('');
    setDiagnostics(null);
    if (!normalized) {
      setAuthError('Enter your TimeTracker server URL.');
      return;
    }
    setConnection({ state: 'connecting', serverUrl: normalized, message: 'Testing server…', lastOk: null });
    const result = await ApiClient.testPublicServerInfo(normalized);
    if (!result.ok) {
      setAuthError(result.message);
      setDiagnostics(buildDiagnostics(normalized, result));
      setConnection({ state: 'error', serverUrl: normalized, message: result.message, lastOk: null });
      return;
    }
    setServerUrl(normalized);
    setAuthInfo(`TimeTracker server detected${result.app_version ? ` (${result.app_version})` : ''}.`);
    setConnection({ state: 'connected', serverUrl: normalized, message: 'Server reachable', lastOk: Date.now() });
    setAuthStep('credentials');
  };

  const handleLogin = async (event, overrides = {}) => {
    event.preventDefault();
    const loginServerUrl = overrides.serverUrl ?? serverUrl;
    const loginUsername = overrides.username ?? username;
    const loginPassword = overrides.password ?? password;
    const normalized = ApiClient.normalizeBaseUrl(normalizeServerUrlInput(loginServerUrl));
    setAuthError('');
    setDiagnostics(null);
    if (!normalized || !loginUsername || !loginPassword) {
      setAuthError('Enter server URL, username, and password.');
      return;
    }

    setConnection({ state: 'connecting', serverUrl: normalized, message: 'Signing in…', lastOk: null });
    const info = await ApiClient.testPublicServerInfo(normalized);
    if (!info.ok) {
      setAuthError(info.message);
      setDiagnostics(buildDiagnostics(normalized, info));
      setConnection({ state: 'error', serverUrl: normalized, message: info.message, lastOk: null });
      return;
    }

    const login = await ApiClient.loginWithPassword(normalized, loginUsername, loginPassword);
    if (!login.ok) {
      setAuthError(login.message || 'Login failed.');
      setDiagnostics(buildDiagnostics(normalized, login));
      setConnection({ state: 'error', serverUrl: normalized, message: login.message || 'Login failed', lastOk: null });
      return;
    }

    const client = new ApiClient(normalized, login.token);
    const session = await client.validateSession();
    if (!session.ok) {
      setAuthError(session.message || 'The account cannot access the desktop API.');
      setDiagnostics(buildDiagnostics(normalized, session));
      setConnection({ state: 'error', serverUrl: normalized, message: session.message || 'Session failed', lastOk: null });
      return;
    }

    await storeSet('server_url', normalized);
    await storeSet('username', loginUsername.trim());
    await storeSet('api_token', login.token);
    await storeSet('api_token_server_url', normalized);
    setUsername(loginUsername.trim());
    setPassword('');
    setApiClient(client);
    setConnection({ state: 'connected', serverUrl: normalized, message: 'Connected', lastOk: Date.now() });
    showToast('Signed in successfully', 'success');
  };

  const handleLogout = async () => {
    await storeDelete('api_token');
    await storeDelete('api_token_server_url');
    setApiClient(null);
    setAuthStep(serverUrl ? 'credentials' : 'server');
    setConnection({ state: 'not_configured', serverUrl, message: 'Signed out', lastOk: null });
  };

  const handleReset = async () => {
    if (!window.confirm('Reset desktop configuration and local cache?')) return;
    await syncEngineRef.current?.clearAll();
    await storeClear();
    setApiClient(null);
    setServerUrl('');
    setUsername('');
    setPassword('');
    setAuthStep('server');
    setData({ user: null, timer: null, projects: [], tasks: [], entries: [], invoices: [], expenses: [], workforce: {} });
    setConnection(defaultConnection);
  };

  const loadView = useCallback(async (view) => {
    if (!apiClient) return;
    setLoading((s) => ({ ...s, [view]: true }));
    try {
      if (view === 'invoices') {
        const response = await apiClient.getInvoices({ perPage: 25 });
        setData((d) => ({ ...d, invoices: response.invoices || response.items || [] }));
      } else if (view === 'expenses') {
        const response = await apiClient.getExpenses({ perPage: 25 });
        setData((d) => ({ ...d, expenses: response.expenses || response.items || [] }));
      } else if (view === 'workforce') {
        const [periods, capacity, requests] = await Promise.all([
          apiClient.getTimesheetPeriods({}).catch(() => ({ periods: [] })),
          apiClient.getCapacityReport({}).catch(() => ({ capacity: [] })),
          apiClient.getTimeOffRequests({}).catch(() => ({ requests: [] })),
        ]);
        setData((d) => ({ ...d, workforce: { periods, capacity, requests } }));
      }
    } catch (error) {
      const classified = classifyAxiosError(error);
      showToast(classified.message, 'error');
    } finally {
      setLoading((s) => ({ ...s, [view]: false }));
    }
  }, [apiClient, showToast]);

  const changeView = (view) => {
    setActiveView(view);
    loadView(view);
  };

  const startTimer = async ({ projectId, taskId, notes }) => {
    if (!apiClient) return;
    try {
      if (!navigator.onLine) {
        await syncEngineRef.current?.queueOperation('timer_start', { projectId, taskId, notes });
        showToast('Offline: timer start queued for sync', 'info');
        setStartTimerOpen(false);
        return;
      }
      await apiClient.startTimer({ projectId, taskId, notes });
      setStartTimerOpen(false);
      await refreshCoreData();
      showToast('Timer started', 'success');
    } catch (error) {
      const classified = classifyAxiosError(error);
      showToast(classified.message, 'error');
    }
  };

  const stopTimer = async () => {
    if (!apiClient) return;
    try {
      if (!navigator.onLine) {
        await syncEngineRef.current?.queueOperation('timer_stop', {});
        showToast('Offline: timer stop queued for sync', 'info');
        return;
      }
      await apiClient.stopTimer();
      await refreshCoreData();
      showToast('Timer stopped', 'success');
    } catch (error) {
      const classified = classifyAxiosError(error);
      showToast(classified.message, 'error');
    }
  };

  const createTimeEntry = async (payload) => {
    if (!apiClient) return;
    try {
      if (!navigator.onLine) {
        await syncEngineRef.current?.queueOperation('time_entry_create', payload);
        showToast('Offline: time entry queued for sync', 'info');
        setNewEntryOpen(false);
        return;
      }
      await apiClient.createTimeEntry(payload);
      setNewEntryOpen(false);
      await refreshCoreData();
      showToast('Time entry created', 'success');
    } catch (error) {
      const classified = classifyAxiosError(error);
      showToast(classified.message, 'error');
    }
  };

  const filteredProjects = useMemo(() => {
    const q = filters.project.trim().toLowerCase();
    if (!q) return data.projects;
    return data.projects.filter((p) => String(p.name || '').toLowerCase().includes(q));
  }, [data.projects, filters.project]);

  const filteredEntries = useMemo(() => {
    const q = filters.entrySearch.trim().toLowerCase();
    if (!q) return data.entries;
    return data.entries.filter((entry) => {
      const haystack = [entry.project_name, entry.task_name, entry.notes, entry.description].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [data.entries, filters.entrySearch]);

  if (booting) return <LoadingScreen />;

  if (!apiClient) {
    return (
      <AuthFlow
        step={authStep}
        setStep={setAuthStep}
        serverUrl={serverUrl}
        setServerUrl={setServerUrl}
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
        error={authError}
        info={authInfo}
        diagnostics={diagnostics}
        connection={connection}
        onTestServer={handleServerTest}
        onLogin={handleLogin}
        theme={theme}
        setTheme={setTheme}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} onChange={changeView} />
      <main className="workspace">
        <TopBar
          connection={connection}
          user={data.user}
          syncStatus={syncStatus}
          theme={theme}
          setTheme={setTheme}
          onSyncNow={() => syncEngineRef.current?.syncNow()}
          onLogout={handleLogout}
        />
        <section className="view-frame">
          {activeView === 'dashboard' && (
            <DashboardView
              data={data}
              loading={loading.core}
              onRefresh={refreshCoreData}
              onStart={() => setStartTimerOpen(true)}
              onStop={stopTimer}
              syncStatus={syncStatus}
            />
          )}
          {activeView === 'projects' && (
            <ProjectsView
              projects={filteredProjects}
              filter={filters.project}
              setFilter={(value) => setFilters((f) => ({ ...f, project: value }))}
              loading={loading.core}
            />
          )}
          {activeView === 'entries' && (
            <EntriesView
              entries={filteredEntries}
              filter={filters.entrySearch}
              setFilter={(value) => setFilters((f) => ({ ...f, entrySearch: value }))}
              onNew={() => setNewEntryOpen(true)}
              loading={loading.core}
            />
          )}
          {activeView === 'invoices' && <SimpleListView title="Invoices" items={data.invoices} loading={loading.invoices} />}
          {activeView === 'expenses' && <SimpleListView title="Expenses" items={data.expenses} loading={loading.expenses} />}
          {activeView === 'workforce' && <WorkforceView workforce={data.workforce} loading={loading.workforce} />}
          {activeView === 'settings' && (
            <SettingsView
              serverUrl={serverUrl}
              setServerUrl={setServerUrl}
              username={username}
              setUsername={setUsername}
              settings={settings}
              setSettings={setSettings}
              syncStatus={syncStatus}
              theme={theme}
              setTheme={setTheme}
              onSave={async ({ nextUrl, nextUsername, nextPassword, nextSettings }) => {
                setServerUrl(nextUrl);
                setUsername(nextUsername);
                setSettings(nextSettings);
                if (nextPassword) {
                  await handleLogin(
                    { preventDefault() {} },
                    { serverUrl: nextUrl, username: nextUsername, password: nextPassword },
                  );
                }
                await storeSet('auto_sync', nextSettings.autoSync);
                await storeSet('sync_interval', nextSettings.syncInterval);
                showToast('Settings saved', 'success');
              }}
              onReset={handleReset}
              onSyncNow={() => syncEngineRef.current?.syncNow()}
            />
          )}
        </section>
      </main>
      {startTimerOpen && (
        <StartTimerDialog
          projects={data.projects}
          tasks={data.tasks}
          onClose={() => setStartTimerOpen(false)}
          onSubmit={startTimer}
        />
      )}
      {newEntryOpen && (
        <TimeEntryDialog
          projects={data.projects}
          tasks={data.tasks}
          onClose={() => setNewEntryOpen(false)}
          onSubmit={createTimeEntry}
        />
      )}
      {toast && <Toast toast={toast} />}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <img src="../assets/logo.svg" alt="TimeTracker" />
      <div className="spinner" />
      <h1>TimeTracker</h1>
      <p>Preparing your workspace…</p>
    </div>
  );
}

function AuthFlow(props) {
  const {
    step,
    setStep,
    serverUrl,
    setServerUrl,
    username,
    setUsername,
    password,
    setPassword,
    error,
    info,
    diagnostics,
    connection,
    onTestServer,
    onLogin,
    theme,
    setTheme,
  } = props;
  return (
    <div className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <img src="../assets/logo.svg" alt="" />
          <div>
            <p className="eyebrow">Desktop workspace</p>
            <h1>Connect to TimeTracker</h1>
            <p>Use your server URL and normal TimeTracker account.</p>
          </div>
        </div>
        <div className="stepper" aria-label="Setup progress">
          <span className={step === 'server' ? 'active' : ''}>1. Server</span>
          <span className={step === 'credentials' ? 'active' : ''}>2. Sign in</span>
        </div>
        {step === 'server' ? (
          <div className="form-grid">
            <label>
              Server URL
              <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://127.0.0.1" />
            </label>
            <p className="hint">Use the base URL only. For your Docker stack this is usually https://127.0.0.1.</p>
            <button className="btn primary" onClick={onTestServer}>Test server</button>
          </div>
        ) : (
          <form className="form-grid" onSubmit={onLogin}>
            <label>
              Server URL
              <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
            </label>
            <label>
              Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </label>
            <label>
              Password
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" />
            </label>
            <div className="button-row">
              <button type="button" className="btn ghost" onClick={() => setStep('server')}>Back</button>
              <button className="btn primary" type="submit">Sign in</button>
            </div>
          </form>
        )}
        {info && <div className="message success">{info}</div>}
        {error && <div className="message error">{error}</div>}
        {diagnostics && <DiagnosticsPanel diagnostics={diagnostics} />}
        <div className="auth-footer">
          <ConnectionPill connection={connection} />
          <ThemeSwitch theme={theme} setTheme={setTheme} />
        </div>
      </section>
      <aside className="auth-hero">
        <p className="eyebrow">Modern offline-ready app</p>
        <h2>Track time, sync safely, stay in control.</h2>
        <ul>
          <li>Server diagnostics for bad URLs, TLS, and network issues.</li>
          <li>Local cache and queued writes when your network drops.</li>
          <li>Light, dark, and system theme modes.</li>
        </ul>
      </aside>
    </div>
  );
}

function Sidebar({ activeView, onChange }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src="../assets/logo.svg" alt="" />
        <div>
          <strong>TimeTracker</strong>
          <span>Desktop</span>
        </div>
      </div>
      <nav>
        {views.map((view) => (
          <button
            key={view.id}
            className={activeView === view.id ? 'active' : ''}
            onClick={() => onChange(view.id)}
            aria-current={activeView === view.id ? 'page' : undefined}
          >
            {view.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

function TopBar({ connection, user, syncStatus, theme, setTheme, onSyncNow, onLogout }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Welcome{user?.username ? `, ${user.username}` : ''}</p>
        <h1>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h1>
      </div>
      <div className="topbar-actions">
        <ConnectionPill connection={connection} />
        <button className="sync-pill" onClick={onSyncNow} title={syncStatus.lastError || 'Sync now'}>
          {syncStatus.syncing ? 'Syncing…' : `Queue ${syncStatus.queueDepth}`}
        </button>
        <ThemeSwitch theme={theme} setTheme={setTheme} />
        <button className="btn ghost" onClick={onLogout}>Sign out</button>
      </div>
    </header>
  );
}

function DashboardView({ data, loading, onRefresh, onStart, onStop, syncStatus }) {
  const active = data.timer?.active;
  const seconds = active && data.timer?.timer?.start_time
    ? Math.max(0, Math.floor((Date.now() - new Date(data.timer.timer.start_time).getTime()) / 1000))
    : 0;
  return (
    <div className="view-stack">
      <div className="hero-card">
        <div>
          <p className="eyebrow">Active timer</p>
          <h2>{active ? formatDuration(seconds) : 'No timer running'}</h2>
          <p>{active ? data.timer?.timer?.project_name || 'Tracking time' : 'Start a focused session when you are ready.'}</p>
        </div>
        <div className="button-row">
          <button className="btn primary" onClick={onStart}>Start timer</button>
          <button className="btn danger" onClick={onStop} disabled={!active}>Stop</button>
          <button className="btn ghost" onClick={onRefresh}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>
      <div className="stats-grid">
        <StatCard label="Projects" value={data.projects.length} />
        <StatCard label="Recent entries" value={data.entries.length} />
        <StatCard label="Queued sync" value={syncStatus.queueDepth} />
      </div>
      <Panel title="Recent time entries" action={<button className="btn small" onClick={onRefresh}>Reload</button>}>
        <EntryList entries={data.entries.slice(0, 8)} />
      </Panel>
    </div>
  );
}

function ProjectsView({ projects, filter, setFilter, loading }) {
  return (
    <div className="view-stack">
      <ViewHeader title="Projects" subtitle="Search and pick work quickly." />
      <input className="command-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search projects…" />
      {loading ? <SkeletonGrid /> : (
        <div className="card-grid">
          {projects.map((project) => (
            <article className="project-card" key={project.id || project.name}>
              <span className="status-dot" />
              <h3>{project.name}</h3>
              <p>{project.client_name || project.status || 'Active project'}</p>
            </article>
          ))}
          {!projects.length && <EmptyState title="No projects found" text="Try a different search or sync with the server." />}
        </div>
      )}
    </div>
  );
}

function EntriesView({ entries, filter, setFilter, onNew, loading }) {
  return (
    <div className="view-stack">
      <ViewHeader title="Time entries" subtitle="Review recent work and add manual entries." action={<button className="btn primary" onClick={onNew}>New entry</button>} />
      <input className="command-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search notes, projects, tasks…" />
      {loading ? <SkeletonList /> : <EntryList entries={entries} />}
    </div>
  );
}

function SimpleListView({ title, items, loading }) {
  return (
    <div className="view-stack">
      <ViewHeader title={title} subtitle="A polished React view backed by the existing API." />
      {loading ? <SkeletonList /> : (
        <div className="list-card">
          {items?.length ? items.map((item, index) => (
            <div className="list-row" key={item.id || index}>
              <strong>{item.name || item.title || item.invoice_number || item.category || `Item ${index + 1}`}</strong>
              <span>{item.status || item.amount || item.total || ''}</span>
            </div>
          )) : <EmptyState title={`No ${title.toLowerCase()} yet`} text="This section is ready for server data." />}
        </div>
      )}
    </div>
  );
}

function WorkforceView({ workforce, loading }) {
  const periods = workforce?.periods?.periods || workforce?.periods?.items || [];
  const requests = workforce?.requests?.requests || workforce?.requests?.items || [];
  return (
    <div className="view-stack">
      <ViewHeader title="Workforce" subtitle="Timesheets, capacity, and leave at a glance." />
      {loading ? <SkeletonGrid /> : (
        <div className="stats-grid">
          <StatCard label="Timesheet periods" value={periods.length} />
          <StatCard label="Time-off requests" value={requests.length} />
          <StatCard label="Capacity rows" value={(workforce?.capacity?.capacity || workforce?.capacity?.items || []).length} />
        </div>
      )}
    </div>
  );
}

function SettingsView(props) {
  const {
    serverUrl,
    setServerUrl,
    username,
    setUsername,
    settings,
    setSettings,
    syncStatus,
    theme,
    setTheme,
    onSave,
    onReset,
    onSyncNow,
  } = props;
  const [password, setPassword] = useState('');
  return (
    <div className="view-stack">
      <ViewHeader title="Settings" subtitle="Server, sign-in, theme, and sync controls." />
      <div className="settings-grid">
        <Panel title="Connection">
          <label>Server URL<input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} /></label>
          <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} /></label>
          <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Enter to re-authenticate" /></label>
          <button className="btn primary" onClick={() => onSave({ nextUrl: serverUrl, nextUsername: username, nextPassword: password, nextSettings: settings })}>Save settings</button>
        </Panel>
        <Panel title="Appearance">
          <ThemeSwitch theme={theme} setTheme={setTheme} expanded />
        </Panel>
        <Panel title="Offline sync">
          <label className="switch-row"><input type="checkbox" checked={settings.autoSync} onChange={(e) => setSettings((s) => ({ ...s, autoSync: e.target.checked }))} /> Auto sync</label>
          <label>Interval seconds<input type="number" min="10" value={settings.syncInterval} onChange={(e) => setSettings((s) => ({ ...s, syncInterval: Number(e.target.value || 60) }))} /></label>
          <p className="hint">Queue depth: {syncStatus.queueDepth}. Last sync: {syncStatus.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString() : 'Never'}.</p>
          {syncStatus.lastError && <p className="message error">{syncStatus.lastError}</p>}
          <div className="button-row">
            <button className="btn" onClick={onSyncNow}>Sync now</button>
            <button className="btn danger" onClick={onReset}>Reset app</button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function StartTimerDialog({ projects, tasks, onClose, onSubmit }) {
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [notes, setNotes] = useState('');
  const filteredTasks = tasks.filter((task) => !projectId || String(task.project_id) === String(projectId));
  return (
    <Dialog title="Start timer" onClose={onClose}>
      <label>Project<select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Choose project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Task<select value={taskId} onChange={(e) => setTaskId(e.target.value)}><option value="">No task</option>{filteredTasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <div className="button-row"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => onSubmit({ projectId, taskId, notes })}>Start</button></div>
    </Dialog>
  );
}

function TimeEntryDialog({ projects, tasks, onClose, onSubmit }) {
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [notes, setNotes] = useState('');
  const [duration, setDuration] = useState(60);
  const today = new Date().toISOString().slice(0, 10);
  const filteredTasks = tasks.filter((task) => !projectId || String(task.project_id) === String(projectId));
  return (
    <Dialog title="New time entry" onClose={onClose}>
      <label>Project<select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Choose project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Task<select value={taskId} onChange={(e) => setTaskId(e.target.value)}><option value="">No task</option>{filteredTasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>Minutes<input type="number" min="1" value={duration} onChange={(e) => setDuration(Number(e.target.value || 0))} /></label>
      <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <div className="button-row">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onSubmit({ project_id: projectId, task_id: taskId || null, duration_minutes: duration, date: today, notes })}>Create</button>
      </div>
    </Dialog>
  );
}

function Dialog({ title, children, onClose }) {
  useEffect(() => {
    const handler = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose}>×</button></div>
        <div className="form-grid">{children}</div>
      </section>
    </div>
  );
}

function DiagnosticsPanel({ diagnostics }) {
  return (
    <details className="diagnostics">
      <summary>Connection diagnostics</summary>
      <ul>{diagnostics.checks.map((check) => <li key={check}>{check}</li>)}</ul>
      <pre>{diagnostics.technical}</pre>
    </details>
  );
}

function EntryList({ entries }) {
  if (!entries?.length) return <EmptyState title="No time entries" text="Create one manually or sync with the server." />;
  return (
    <div className="list-card">
      {entries.map((entry, index) => (
        <div className="list-row" key={entry.id || index}>
          <div>
            <strong>{entry.project_name || entry.project?.name || 'Time entry'}</strong>
            <p>{entry.task_name || entry.notes || entry.description || 'No notes'}</p>
          </div>
          <span>{entry.duration_formatted || formatMinutes(entry.duration_minutes || entry.duration || 0)}</span>
        </div>
      ))}
    </div>
  );
}

function ViewHeader({ title, subtitle, action }) {
  return <div className="view-header"><div><p className="eyebrow">Workspace</p><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>;
}

function Panel({ title, action, children }) {
  return <section className="panel"><div className="panel-head"><h3>{title}</h3>{action}</div>{children}</section>;
}

function StatCard({ label, value }) {
  return <div className="stat-card"><span>{label}</span><strong>{value}</strong></div>;
}

function EmptyState({ title, text }) {
  return <div className="empty-state"><h3>{title}</h3><p>{text}</p></div>;
}

function SkeletonGrid() {
  return <div className="card-grid">{[1, 2, 3].map((i) => <div className="skeleton-card" key={i} />)}</div>;
}

function SkeletonList() {
  return <div className="list-card">{[1, 2, 3, 4].map((i) => <div className="skeleton-row" key={i} />)}</div>;
}

function ConnectionPill({ connection }) {
  return <span className={`connection-pill ${connection.state}`}>{connection.message || connection.state}</span>;
}

function ThemeSwitch({ theme, setTheme, expanded }) {
  return (
    <label className={expanded ? 'theme-switch expanded' : 'theme-switch'}>
      {expanded && <span>Theme</span>}
      <select value={theme} onChange={(e) => setTheme(e.target.value)}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}

function Toast({ toast }) {
  return <div className={`toast ${toast.type}`} role="status">{toast.message}</div>;
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function formatMinutes(minutes) {
  if (!minutes) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

createRoot(document.getElementById('root')).render(<App />);
