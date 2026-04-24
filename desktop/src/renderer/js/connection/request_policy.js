/**
 * Bounded retries with jitter for idempotent requests only (GET/HEAD).
 * Prevents duplicate writes (e.g. timer start) from automatic retry loops.
 */

const SAFE_METHODS = new Set(['get', 'head']);

function isRetryableTransportOrServer(error) {
  if (!error || !error.config) return false;
  if (error.code === 'ECONNABORTED') return true;
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;
  if (!error.response) return true;
  const s = error.response.status;
  return s === 502 || s === 503 || s === 504;
}

/**
 * @param {import('axios').AxiosInstance} axiosInstance
 * @param {{ maxRetries?: number, baseDelayMs?: number }} [options]
 */
function attachIdempotentRetryInterceptors(axiosInstance, options = {}) {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 400;

  axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config;
      if (!config) return Promise.reject(error);

      const method = String(config.method || 'get').toLowerCase();
      if (!SAFE_METHODS.has(method)) return Promise.reject(error);

      const count = config.__retryCount || 0;
      if (count >= maxRetries) return Promise.reject(error);
      if (!isRetryableTransportOrServer(error)) return Promise.reject(error);

      config.__retryCount = count + 1;
      const backoff = baseDelayMs * 2 ** (config.__retryCount - 1);
      const jitter = Math.random() * 250;
      await new Promise((r) => setTimeout(r, backoff + jitter));
      return axiosInstance(config);
    },
  );
}

module.exports = { attachIdempotentRetryInterceptors, isRetryableTransportOrServer, SAFE_METHODS };
