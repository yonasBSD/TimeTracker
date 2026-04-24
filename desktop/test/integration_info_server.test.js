const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const ApiClient = require('../src/renderer/js/api/client');

test('GET /api/v1/info against local mock matches TimeTracker payload', async () => {
  const infoBody = {
    api_version: 'v1',
    app_version: '9.9.9-test',
    endpoints: { projects: '/api/v1/projects' },
    setup_required: false,
  };

  const server = http.createServer((req, res) => {
    if (req.url === '/api/v1/info' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(infoBody));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = /** @type {import('net').AddressInfo} */ (server.address());
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    const r = await ApiClient.testPublicServerInfo(baseUrl);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.app_version, '9.9.9-test');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
