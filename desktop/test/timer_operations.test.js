const test = require('node:test');
const assert = require('node:assert');
const {
  startTimerWithReconcile,
  stopTimerWithReconcile,
} = require('../src/renderer/js/connection/timer_operations');

test('startTimerWithReconcile reconciles when start times out but timer is active', async () => {
  const timer = {
    id: 1,
    start_time: new Date().toISOString(),
    project: { name: 'Proj' },
  };
  const api = {
    async startTimer() {
      const e = new Error('aborted');
      e.code = 'ECONNABORTED';
      throw e;
    },
    async getTimerStatus() {
      return { data: { active: true, timer } };
    },
  };

  const r = await startTimerWithReconcile(api, { projectId: 1, taskId: null, notes: null });
  assert.strictEqual(r._reconciled, true);
  assert.strictEqual(r.data.timer.id, 1);
});

test('stopTimerWithReconcile treats no_active_timer as reconciled', async () => {
  const api = {
    async stopTimer() {
      const e = new Error('bad');
      e.response = { status: 400, data: { error_code: 'no_active_timer' } };
      throw e;
    },
  };
  const r = await stopTimerWithReconcile(api);
  assert.strictEqual(r._reconciled, true);
});

test('stopTimerWithReconcile reconciles when stop ambiguous and timer already stopped', async () => {
  const api = {
    async stopTimer() {
      const e = new Error('timeout');
      e.code = 'ECONNABORTED';
      throw e;
    },
    async getTimerStatus() {
      return { data: { active: false } };
    },
  };
  const r = await stopTimerWithReconcile(api);
  assert.strictEqual(r._reconciled, true);
});
