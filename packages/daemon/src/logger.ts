/**
 * Structured daemon logger.
 *
 * Usage:
 *   import { logger } from './logger.js'
 *   logger.info('hook', 'SessionStart received', { sessionId, cwd })
 *   logger.error('ws', 'Client send failed', err)
 *
 * Log levels (controlled by COCKPIT_LOG_LEVEL env var):
 *   debug < info < warn < error
 *   Default: info
 *
 * Output format (one JSON line per entry):
 *   {"ts":"2026-04-14T12:00:00.000Z","level":"info","ns":"hook","msg":"...","data":{...}}
 *
 * Set COCKPIT_LOG_PRETTY=1 for human-readable output (dev).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const ENV_LEVEL = (process.env['COCKPIT_LOG_LEVEL'] ?? 'info') as LogLevel
const MIN_LEVEL = LEVELS[ENV_LEVEL] ?? LEVELS.info
const PRETTY = process.env['COCKPIT_LOG_PRETTY'] === '1' || process.env['NODE_ENV'] !== 'production'

function format(level: LogLevel, ns: string, msg: string, data?: unknown): string {
  const ts = new Date().toISOString()
  if (PRETTY) {
    const dataStr = data !== undefined ? ' ' + JSON.stringify(data) : ''
    const levelPad = level.toUpperCase().padEnd(5)
    return `[${ts}] ${levelPad} [${ns}] ${msg}${dataStr}`
  }
  const entry: Record<string, unknown> = { ts, level, ns, msg }
  if (data !== undefined) entry['data'] = data
  return JSON.stringify(entry)
}

function log(level: LogLevel, ns: string, msg: string, data?: unknown): void {
  if ((LEVELS[level] ?? 0) < MIN_LEVEL) return
  const line = format(level, ns, msg, data)
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n')
  } else {
    process.stdout.write(line + '\n')
  }
}

export const logger = {
  debug: (ns: string, msg: string, data?: unknown) => log('debug', ns, msg, data),
  info: (ns: string, msg: string, data?: unknown) => log('info', ns, msg, data),
  warn: (ns: string, msg: string, data?: unknown) => log('warn', ns, msg, data),
  error: (ns: string, msg: string, data?: unknown) => log('error', ns, msg, data),
}
