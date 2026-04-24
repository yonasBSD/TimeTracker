const test = require('node:test');
const assert = require('node:assert');
const { createConnectionManager } = require('../src/renderer/js/connection/connection_manager');

function memoryStore() {
  /** @type {Record<string, unknown>} */
  const data = {};
  return {
    storeGet: async (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    storeSet: async (k, v) => {
      data[k] = v;
    },
    storeDelete: async (k) => {
      delete data[k];
    },
    storeClear: async () => {
      for (const k of Object.keys(data)) delete data[k];
    },
    data,
  };
}

test('logoutKeepServer removes token keys but keeps server_url', async () => {
  const { storeGet, storeSet, storeDelete, storeClear, data } = memoryStore();
  await storeSet('server_url', 'https://example.com');
  await storeSet('api_token', 'tt_test');
  await storeSet('api_token_server_url', 'https://example.com');

  const mgr = createConnectionManager({
    storeGet,
    storeSet,
    storeDelete,
    storeClear,
    onCacheClear: () => {},
  });

  await mgr.logoutKeepServer();

  assert.strictEqual(data.server_url, 'https://example.com');
  assert.strictEqual(data.api_token, undefined);
  assert.strictEqual(data.api_token_server_url, undefined);
  const snap = mgr.getSnapshot();
  assert.strictEqual(snap.state, mgr.CONNECTION_STATE.NOT_CONFIGURED);
  assert.strictEqual(snap.serverUrl, 'https://example.com');
});

test('fullStoreReset clears store and snapshot', async () => {
  const { storeGet, storeSet, storeDelete, storeClear, data } = memoryStore();
  await storeSet('server_url', 'https://a.com');
  await storeSet('api_token', 'tt_x');

  const cleared = [];
  const mgr = createConnectionManager({
    storeGet,
    storeSet,
    storeDelete,
    storeClear,
    onCacheClear: () => cleared.push(1),
  });

  await mgr.fullStoreReset();

  assert.strictEqual(Object.keys(data).length, 0);
  assert.strictEqual(cleared.length, 1);
  assert.strictEqual(mgr.getSnapshot().serverUrl, null);
});

test('subscribe is called with initial snapshot', async () => {
  const { storeGet, storeSet, storeDelete, storeClear } = memoryStore();
  const calls = [];
  const mgr = createConnectionManager({
    storeGet,
    storeSet,
    storeDelete,
    storeClear,
    onCacheClear: () => {},
  });
  mgr.subscribe((s) => calls.push(s.state));
  assert.ok(calls.length >= 1);
});
