const ApiClient = require('../api/client');
const { CONNECTION_STATE } = require('./connection_state');

const STORE_SERVER = 'server_url';
const STORE_TOKEN = 'api_token';
const STORE_TOKEN_SERVER = 'api_token_server_url';
const STORE_USERNAME = 'username';

/**
 * Single source of truth for server URL, API client lifecycle, and connection state.
 * @param {{
 *   storeGet: (k: string) => Promise<unknown>,
 *   storeSet: (k: string, v: unknown) => Promise<void>,
 *   storeDelete: (k: string) => Promise<void>,
 *   storeClear: () => Promise<void>,
 *   onCacheClear?: () => void,
 * }} deps
 */
function createConnectionManager(deps) {
  const storeGet = deps.storeGet;
  const storeSet = deps.storeSet;
  const storeDelete = deps.storeDelete;
  const storeClear = deps.storeClear;
  const onCacheClear = deps.onCacheClear || (() => {});

  /** @type {import('../api/client') | null} */
  let apiClient = null;

  /** @type {Set<(s: ReturnType<typeof getSnapshot>) => void>} */
  const listeners = new Set();

  let offlineListenerBound = false;

  /** @type {{ state: string, serverUrl: string|null, lastError: string|null, lastConnectedAt: number|null, serverVersion: string|null }} */
  let snapshot = {
    state: CONNECTION_STATE.NOT_CONFIGURED,
    serverUrl: null,
    lastError: null,
    lastConnectedAt: null,
    serverVersion: null,
  };

  function getSnapshot() {
    return { ...snapshot };
  }

  function getClient() {
    return apiClient;
  }

  function notify() {
    const s = getSnapshot();
    for (const fn of listeners) {
      try {
        fn(s);
      } catch (e) {
        console.error('ConnectionManager listener error:', e);
      }
    }
  }

  function setSnap(partial) {
    snapshot = { ...snapshot, ...partial };
    notify();
  }

  function tearDownClient() {
    apiClient = null;
  }

  function isTransportSessionError(code) {
    return [
      'TIMEOUT',
      'REFUSED',
      'UNREACHABLE',
      'DNS',
      'TLS',
      'UNKNOWN',
    ].includes(code);
  }

  function attachWindowListeners() {
    if (typeof window === 'undefined' || offlineListenerBound) return;
    offlineListenerBound = true;
    window.addEventListener('online', () => {
      if (snapshot.state === CONNECTION_STATE.OFFLINE && apiClient) {
        setSnap({ state: CONNECTION_STATE.CONNECTING, lastError: null });
      }
    });
    window.addEventListener('offline', () => {
      setSnap({
        state: CONNECTION_STATE.OFFLINE,
        lastError: 'Network offline.',
      });
    });
  }

  /**
   * @param {string} baseUrl
   * @returns {Promise<import('../api/client').ValidationResult & { app_version?: string|null }>}
   */
  async function testServer(baseUrl) {
    const normalized = ApiClient.normalizeBaseUrl(String(baseUrl || '').trim());
    if (!normalized) {
      return { ok: false, code: 'NO_URL', message: 'Please enter a server URL.' };
    }
    return ApiClient.testPublicServerInfo(normalized);
  }

  async function bootstrapFromStore() {
    attachWindowListeners();

    const serverRaw = await storeGet(STORE_SERVER);
    const token = await storeGet(STORE_TOKEN);
    const serverUrlEarly = serverRaw ? ApiClient.normalizeBaseUrl(String(serverRaw)) : null;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      tearDownClient();
      setSnap({
        state: CONNECTION_STATE.OFFLINE,
        serverUrl: serverUrlEarly,
        lastError: 'Network offline.',
      });
      return {
        ok: false,
        reason: 'offline',
        hadCredentials: Boolean(serverUrlEarly && token),
      };
    }
    const tokenServer = await storeGet(STORE_TOKEN_SERVER);

    let serverUrl = serverRaw ? ApiClient.normalizeBaseUrl(String(serverRaw)) : null;
    if (serverUrl && serverRaw && serverUrl !== String(serverRaw).trim()) {
      await storeSet(STORE_SERVER, serverUrl);
    }

    if (!serverUrl) {
      tearDownClient();
      setSnap({
        state: CONNECTION_STATE.NOT_CONFIGURED,
        serverUrl: null,
        lastError: null,
        serverVersion: null,
      });
      return { ok: false, reason: 'no_server' };
    }

    if (!token) {
      tearDownClient();
      setSnap({
        state: CONNECTION_STATE.NOT_CONFIGURED,
        serverUrl,
        lastError: null,
        serverVersion: null,
      });
      return { ok: false, reason: 'no_token' };
    }

    const tokenNorm = tokenServer ? ApiClient.normalizeBaseUrl(String(tokenServer)) : null;
    if (tokenNorm && tokenNorm !== serverUrl) {
      await storeDelete(STORE_TOKEN);
      await storeDelete(STORE_TOKEN_SERVER);
      tearDownClient();
      onCacheClear();
      setSnap({
        state: CONNECTION_STATE.NOT_CONFIGURED,
        serverUrl,
        lastError: 'This saved sign-in was for a different server. Please sign in again.',
        serverVersion: null,
      });
      return { ok: false, reason: 'token_server_mismatch' };
    }

    apiClient = new ApiClient(serverUrl, {
      enableIdempotentRetry: false,
      timeoutMs: 15000,
    });
    await apiClient.setAuthToken(String(token));

    setSnap({
      state: CONNECTION_STATE.CONNECTING,
      serverUrl,
      lastError: null,
    });

    const session = await apiClient.validateSession();

    if (session.ok) {
      if (!tokenNorm) {
        await storeSet(STORE_TOKEN_SERVER, serverUrl);
      }
      const now = Date.now();
      setSnap({
        state: CONNECTION_STATE.CONNECTED,
        serverUrl,
        lastError: null,
        lastConnectedAt: now,
        serverVersion: null,
      });
      return { ok: true, session };
    }

    if (isTransportSessionError(session.code)) {
      tearDownClient();
      setSnap({
        state: CONNECTION_STATE.ERROR,
        serverUrl,
        lastError: session.message || 'Server not reachable.',
        serverVersion: null,
      });
      return { ok: false, reason: 'session_unreachable', session, message: session.message };
    }

    tearDownClient();
    await storeDelete(STORE_TOKEN);
    await storeDelete(STORE_TOKEN_SERVER);
    onCacheClear();
    setSnap({
      state: CONNECTION_STATE.ERROR,
      serverUrl,
      lastError: session.message || 'Session invalid',
      serverVersion: null,
    });
    return { ok: false, reason: 'session', session };
  }

  /**
   * Validate server + username/password, then persist the issued token.
   * @param {string} serverUrl
   * @param {string} username
   * @param {string} password
   */
  async function login(serverUrl, username, password) {
    const normalized = ApiClient.normalizeBaseUrl(String(serverUrl || '').trim());
    const pub = await ApiClient.testPublicServerInfo(normalized);
    if (!pub.ok) {
      setSnap({
        state: CONNECTION_STATE.ERROR,
        serverUrl: normalized,
        lastError: pub.message,
      });
      return { ok: false, step: 'server', ...pub };
    }

    const auth = await ApiClient.loginWithPassword(normalized, username, password);
    if (!auth.ok) {
      setSnap({
        state: CONNECTION_STATE.ERROR,
        serverUrl: normalized,
        lastError: auth.message || 'Login failed',
        serverVersion: pub.app_version || null,
      });
      return { ok: false, step: 'auth', session: auth };
    }

    const probe = new ApiClient(normalized);
    await probe.setAuthToken(auth.token);
    const session = await probe.validateSession();
    if (!session.ok) {
      setSnap({
        state: CONNECTION_STATE.ERROR,
        serverUrl: normalized,
        lastError: session.message || 'Login failed',
        serverVersion: null,
      });
      return { ok: false, step: 'auth', session };
    }

    await storeSet(STORE_SERVER, normalized);
    await storeSet(STORE_TOKEN, auth.token);
    await storeSet(STORE_TOKEN_SERVER, normalized);
    await storeSet(STORE_USERNAME, String(username || '').trim());

    apiClient = probe;
    const now = Date.now();
    setSnap({
      state: CONNECTION_STATE.CONNECTED,
      serverUrl: normalized,
      lastError: null,
      lastConnectedAt: now,
      serverVersion: pub.app_version || null,
    });
    return { ok: true, session, app_version: pub.app_version || null };
  }

  async function logoutKeepServer() {
    await storeDelete(STORE_TOKEN);
    await storeDelete(STORE_TOKEN_SERVER);
    tearDownClient();
    onCacheClear();
    const serverRaw = await storeGet(STORE_SERVER);
    const serverUrl = serverRaw ? ApiClient.normalizeBaseUrl(String(serverRaw)) : null;
    setSnap({
      state: CONNECTION_STATE.NOT_CONFIGURED,
      serverUrl,
      lastError: null,
      serverVersion: null,
    });
  }

  async function fullStoreReset() {
    await storeClear();
    tearDownClient();
    onCacheClear();
    snapshot = {
      state: CONNECTION_STATE.NOT_CONFIGURED,
      serverUrl: null,
      lastError: null,
      lastConnectedAt: null,
      serverVersion: null,
    };
    notify();
  }

  /** @returns {Promise<import('../api/client').ValidationResult>} */
  async function validateSessionRefresh() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSnap({
        state: CONNECTION_STATE.OFFLINE,
        lastError: 'Network offline.',
      });
      return { ok: false, code: 'OFFLINE', message: 'Network offline.' };
    }

    if (!apiClient) {
      setSnap({
        state: CONNECTION_STATE.NOT_CONFIGURED,
        lastError: null,
      });
      return { ok: false, code: 'NO_CLIENT', message: 'Not connected.' };
    }

    const session = await apiClient.validateSession();
    if (session.ok) {
      const now = Date.now();
      setSnap({
        state: CONNECTION_STATE.CONNECTED,
        lastError: null,
        lastConnectedAt: now,
      });
      return session;
    }

    if (session.code === 'UNAUTHORIZED') {
      setSnap({
        state: CONNECTION_STATE.ERROR,
        lastError: session.message || 'Unauthorized',
      });
      return session;
    }

    const transportish =
      session.code === 'TIMEOUT' ||
      session.code === 'REFUSED' ||
      session.code === 'UNREACHABLE' ||
      session.code === 'DNS' ||
      session.code === 'TLS' ||
      session.code === 'UNKNOWN';

    if (transportish) {
      setSnap({
        state: CONNECTION_STATE.ERROR,
        lastError: session.message || 'Server not reachable',
      });
      return session;
    }

    setSnap({
      state: CONNECTION_STATE.ERROR,
      lastError: session.message || 'Connection error',
    });
    return session;
  }

  /**
   * Validate server + username/password, then persist the issued token (including optional sync prefs).
   * @param {string} serverUrl
   * @param {string} username
   * @param {string} password
   * @param {{ auto_sync?: boolean, sync_interval?: number }|null} syncExtras
   */
  async function saveServerAndCredentials(serverUrl, username, password, syncExtras) {
    const normalized = ApiClient.normalizeBaseUrl(String(serverUrl || '').trim());
    const pub = await ApiClient.testPublicServerInfo(normalized);
    if (!pub.ok) {
      setSnap({
        state: CONNECTION_STATE.ERROR,
        lastError: pub.message,
      });
      return { ok: false, step: 'server', ...pub };
    }

    const auth = await ApiClient.loginWithPassword(normalized, username, password);
    if (!auth.ok) {
      setSnap({
        state: CONNECTION_STATE.ERROR,
        lastError: auth.message || 'Login failed. Settings were not saved.',
      });
      return { ok: false, step: 'auth', session: auth };
    }

    const probe = new ApiClient(normalized);
    await probe.setAuthToken(auth.token);
    const session = await probe.validateSession();
    if (!session.ok) {
      setSnap({
        state: CONNECTION_STATE.ERROR,
        lastError: session.message || 'Session check failed. Settings were not saved.',
      });
      return { ok: false, step: 'auth', session };
    }

    if (syncExtras) {
      if (syncExtras.auto_sync !== undefined) await storeSet('auto_sync', syncExtras.auto_sync);
      if (syncExtras.sync_interval !== undefined) await storeSet('sync_interval', syncExtras.sync_interval);
    }

    await storeSet(STORE_SERVER, normalized);
    await storeSet(STORE_TOKEN, auth.token);
    await storeSet(STORE_TOKEN_SERVER, normalized);
    await storeSet(STORE_USERNAME, String(username || '').trim());

    apiClient = probe;
    const now = Date.now();
    setSnap({
      state: CONNECTION_STATE.CONNECTED,
      serverUrl: normalized,
      lastError: null,
      lastConnectedAt: now,
      serverVersion: pub.app_version || null,
    });
    return { ok: true, session };
  }

  /**
   * Test server + username/password without persisting.
   */
  async function testServerAndCredentials(serverUrl, username, password) {
    const normalized = ApiClient.normalizeBaseUrl(String(serverUrl || '').trim());
    const pub = await ApiClient.testPublicServerInfo(normalized);
    if (!pub.ok) return pub;
    const auth = await ApiClient.loginWithPassword(normalized, username, password);
    if (!auth.ok) return auth;
    const probe = new ApiClient(normalized);
    await probe.setAuthToken(auth.token);
    const session = await probe.validateSession();
    if (!session.ok) return session;
    return { ok: true, app_version: pub.app_version || null };
  }

  function subscribe(fn) {
    listeners.add(fn);
    try {
      fn(getSnapshot());
    } catch (e) {
      console.error('ConnectionManager subscribe initial error:', e);
    }
    return () => listeners.delete(fn);
  }

  /** Mark connection error while keeping client (e.g. timer poll failed). */
  function signalError(message) {
    if (!apiClient) return;
    setSnap({
      state: CONNECTION_STATE.ERROR,
      lastError: message || 'Connection error',
    });
  }

  return {
    CONNECTION_STATE,
    getSnapshot,
    getClient,
    subscribe,
    testServer,
    testServerAndCredentials,
    bootstrapFromStore,
    login,
    logoutKeepServer,
    fullStoreReset,
    validateSessionRefresh,
    saveServerAndCredentials,
    tearDownClient,
    signalError,
    /** Expose for tests */
    _setSnapForTest: setSnap,
  };
}

module.exports = { createConnectionManager, STORE_SERVER, STORE_TOKEN, STORE_TOKEN_SERVER };
