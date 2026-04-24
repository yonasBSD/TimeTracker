/** Global connection lifecycle for the desktop renderer. */
const CONNECTION_STATE = {
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  ERROR: 'ERROR',
  OFFLINE: 'OFFLINE',
};

module.exports = { CONNECTION_STATE };
