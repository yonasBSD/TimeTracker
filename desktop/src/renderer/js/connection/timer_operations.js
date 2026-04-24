/**
 * Single-flight timer mutations + reconcile after ambiguous failures
 * (response lost but server may have applied the action).
 */

let _startFlight = null;
let _stopFlight = null;

/**
 * @param {import('../api/client')} apiClient
 * @param {{ projectId: number, taskId: number|null, notes: string|null }} payload
 */
async function startTimerWithReconcile(apiClient, payload) {
  if (_startFlight) return _startFlight;

  _startFlight = (async () => {
    try {
      return await apiClient.startTimer(payload);
    } catch (err) {
      const ambiguous =
        !err.response ||
        err.code === 'ECONNABORTED' ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT';
      if (!ambiguous) throw err;
      try {
        const status = await apiClient.getTimerStatus();
        if (status.data && status.data.active && status.data.timer) {
          return { data: { message: 'Timer already running', timer: status.data.timer }, _reconciled: true };
        }
      } catch (reconcileErr) {
        console.error('startTimer reconcile failed:', reconcileErr);
      }
      throw err;
    }
  })();

  try {
    return await _startFlight;
  } finally {
    _startFlight = null;
  }
}

/** @param {import('../api/client')} apiClient */
async function stopTimerWithReconcile(apiClient) {
  if (_stopFlight) return _stopFlight;

  _stopFlight = (async () => {
    try {
      return await apiClient.stopTimer();
    } catch (err) {
      const statusCode = err.response && err.response.status;
      if (statusCode === 400 && err.response.data && err.response.data.error_code === 'no_active_timer') {
        return { data: err.response.data, _reconciled: true };
      }
      const ambiguous =
        !err.response ||
        err.code === 'ECONNABORTED' ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT';
      if (!ambiguous) throw err;
      try {
        const status = await apiClient.getTimerStatus();
        if (status.data && !status.data.active) {
          return { data: { message: 'Timer already stopped' }, _reconciled: true };
        }
      } catch (reconcileErr) {
        console.error('stopTimer reconcile failed:', reconcileErr);
      }
      throw err;
    }
  })();

  try {
    return await _stopFlight;
  } finally {
    _stopFlight = null;
  }
}

module.exports = { startTimerWithReconcile, stopTimerWithReconcile };
