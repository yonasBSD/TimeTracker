const test = require('node:test');
const assert = require('node:assert');

const ApiClient = require('../src/renderer/js/api/client');

test('normalizeBaseUrl trims trailing slashes', () => {
  assert.strictEqual(ApiClient.normalizeBaseUrl('https://example.com/'), 'https://example.com');
  assert.strictEqual(ApiClient.normalizeBaseUrl('http://10.0.0.1:5000///'), 'http://10.0.0.1:5000');
});

test('normalizeBaseUrl leaves empty string', () => {
  assert.strictEqual(ApiClient.normalizeBaseUrl(''), '');
  assert.strictEqual(ApiClient.normalizeBaseUrl('   '), '');
});

test('isTimeTrackerInfoPayload accepts v1 info shape', () => {
  const ok = {
    api_version: 'v1',
    app_version: '1.0.0',
    endpoints: { projects: '/api/v1/projects' },
  };
  assert.strictEqual(ApiClient.isTimeTrackerInfoPayload(ok), true);
});

test('isTimeTrackerInfoPayload rejects wrong api_version', () => {
  assert.strictEqual(
    ApiClient.isTimeTrackerInfoPayload({ api_version: 'v2', endpoints: {} }),
    false,
  );
});

test('isTimeTrackerInfoPayload rejects missing endpoints object', () => {
  assert.strictEqual(ApiClient.isTimeTrackerInfoPayload({ api_version: 'v1' }), false);
});

test('classifyAxiosError maps 401', () => {
  const err = { response: { status: 401, data: {} } };
  const r = ApiClient.classifyAxiosError(err);
  assert.strictEqual(r.code, 'UNAUTHORIZED');
  assert.ok(r.message.includes('token'));
});

test('classifyAxiosError maps TLS-ish code', () => {
  const err = { code: 'DEPTH_ZERO_SELF_SIGNED_CERT', message: 'self signed certificate' };
  const r = ApiClient.classifyAxiosError(err);
  assert.strictEqual(r.code, 'TLS');
  assert.ok(r.message.toLowerCase().includes('cert'));
});

test('classifyAxiosError maps ENOTFOUND', () => {
  const err = { code: 'ENOTFOUND', message: 'getaddrinfo' };
  const r = ApiClient.classifyAxiosError(err);
  assert.strictEqual(r.code, 'DNS');
});

test('classifyAxiosError maps unknown transport without response', () => {
  const err = { message: 'Network Error' };
  const r = ApiClient.classifyAxiosError(err);
  assert.strictEqual(r.code, 'UNKNOWN');
  assert.ok(r.message.toLowerCase().includes('reachable'));
});
