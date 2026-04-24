export const DAEMON_URL = import.meta.env['VITE_DAEMON_URL'] ?? 'http://localhost:54321'
export const WS_URL = DAEMON_URL.replace(/^http/, 'ws')
