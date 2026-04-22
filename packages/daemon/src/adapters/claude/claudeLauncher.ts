import type Database from 'better-sqlite3';
import { execFileSync, spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { setClaudeSessionId } from '../../db/queries.js';
import { COCKPIT_ALLOWED_TOOLS } from './hookParser.js';

export class LaunchError extends Error {
  constructor(
    public readonly code: 'INVALID_WORKSPACE' | 'MISSING_BINARY' | 'AUTH_FAILED' | 'SPAWN_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'LaunchError';
  }
}

type ProcFactory = (
  file: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams;

export interface ManagedClaudeRuntime {
  sendMessage: (message: string) => Promise<string | void>
  terminateSession: () => void
  isActive: () => boolean
}

export type ClaudePermissionMode = 'default' | 'dangerously_skip'

interface PendingTurn {
  sawAssistant: boolean;
  resolve: () => void;
  reject: (error: Error) => void;
}

function extractText(value: unknown): string | null {
  if (typeof value === 'string') {
    const text = value.trim();
    return text.length > 0 ? text : null;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => extractText(entry))
      .filter((entry): entry is string => Boolean(entry));
    if (parts.length === 0) return null;
    return parts.join('\n').trim() || null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  if (typeof record['text'] === 'string') return extractText(record['text']);
  if (typeof record['message'] === 'string') return extractText(record['message']);
  if (typeof record['content'] === 'string') return extractText(record['content']);
  if ('content' in record) {
    const nested = extractText(record['content']);
    if (nested) return nested;
  }
  return null;
}

function extractAssistantTextFromEnvelope(envelope: Record<string, unknown>): string | null {
  if (envelope['type'] !== 'assistant') return null;
  const message = envelope['message'];
  if (!message || typeof message !== 'object') return null;
  const msg = message as Record<string, unknown>;
  if (msg['role'] !== 'assistant') return null;
  return extractText(msg['content']);
}

function extractAssistantDeltaFromEnvelope(envelope: Record<string, unknown>): string | null {
  if (envelope['type'] !== 'stream_event') return null;
  const event = envelope['event'];
  if (!event || typeof event !== 'object') return null;
  const ev = event as Record<string, unknown>;
  if (ev['type'] !== 'content_block_delta') return null;
  const delta = ev['delta'];
  if (!delta || typeof delta !== 'object') return null;
  const d = delta as Record<string, unknown>;
  if (d['type'] !== 'text_delta') return null;
  const text = d['text'];
  if (typeof text !== 'string') return null;
  return text.length > 0 ? text : null;
}

function extractResultTextFromEnvelope(envelope: Record<string, unknown>): string | null {
  if (envelope['type'] !== 'result') return null;
  return extractText(envelope['result']);
}

function createUserTurnPayload(content: string): string {
  return JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text: content }],
    },
  });
}

export class ClaudeLauncher {
  private readonly db: Database.Database | null;
  private readonly procFactory: ProcFactory | undefined;

  constructor(
    private readonly hookPort: number,
    db: Database.Database | null = null,
    procFactory?: ProcFactory,
  ) {
    this.db = db;
    this.procFactory = procFactory;
  }

  async preflight(workspacePath: string): Promise<void> {
    if (!fs.existsSync(workspacePath)) {
      throw new LaunchError('INVALID_WORKSPACE', `Workspace path does not exist: ${workspacePath}`);
    }
    try {
      execFileSync('which', ['claude'], { stdio: 'pipe' });
    } catch {
      throw new LaunchError('MISSING_BINARY', 'claude binary not found on PATH');
    }
  }

  async launch(
    sessionId: string,
    workspacePath: string,
    onExit?: () => void,
    onAssistantOutput?: (text: string) => void,
    permissionMode: ClaudePermissionMode | boolean = 'default',
  ): Promise<ManagedClaudeRuntime> {
    const HOOK_TIMEOUT_S = 60;
    const hookHost = process.env['COCKPIT_HOOK_HOST'] ?? '127.0.0.1';
    const hookCmd = `curl -sf --max-time ${HOOK_TIMEOUT_S - 5} -X POST http://${hookHost}:${this.hookPort}/hook -d @- -H 'Content-Type: application/json'`;
    const hookEntry = (matcher?: string) => ({
      ...(matcher !== undefined ? { matcher } : {}),
      hooks: [{ type: 'command', command: hookCmd, timeout: HOOK_TIMEOUT_S }],
    });

    const settings = {
      hooks: {
        SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: hookCmd, timeout: HOOK_TIMEOUT_S }] }],
        SessionEnd: [hookEntry()],
        PreToolUse: [hookEntry('')],
        PostToolUse: [hookEntry('')],
        PermissionRequest: [hookEntry('')],
        PermissionDenied: [hookEntry('')],
        Elicitation: [hookEntry()],
        ElicitationResult: [hookEntry()],
        SubagentStart: [hookEntry()],
        SubagentStop: [hookEntry()],
        Notification: [hookEntry()],
      },
    };

    const settingsPath = `${os.tmpdir()}/cockpit-claude-${sessionId}.json`;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    if (this.db) {
      setClaudeSessionId(this.db, sessionId, sessionId, workspacePath);
    }

    const effectivePermissionMode: ClaudePermissionMode =
      permissionMode === true
        ? 'dangerously_skip'
        : permissionMode === false
          ? 'default'
          : permissionMode;

    const args = [
      '-p',
      '--verbose',
      '--output-format=stream-json',
      '--input-format=stream-json',
      '--include-hook-events',
      '--include-partial-messages',
      '--session-id',
      sessionId,
      '--settings',
      settingsPath,
      ...(effectivePermissionMode === 'dangerously_skip'
        ? ['--dangerously-skip-permissions']
        : ['--permission-mode', 'default', '--allowedTools', [...COCKPIT_ALLOWED_TOOLS].join(' ')]),
    ];

    console.log(`[ClaudeLauncher] spawning claude ${args.join(' ')} in cwd=${workspacePath}`);

    let cleanedUpSettings = false;
    const cleanupSettings = (): void => {
      if (cleanedUpSettings) return;
      cleanedUpSettings = true;
      try {
        fs.unlinkSync(settingsPath);
      } catch {
        // ignore cleanup races
      }
    };

    const spawnFn = this.procFactory ?? ((file, spawnArgs, options) => spawn(file, spawnArgs, options));

    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawnFn('claude', args, {
        cwd: workspacePath,
        env: { ...process.env },
        stdio: 'pipe',
      });
    } catch (err) {
      cleanupSettings();
      const msg = err instanceof Error ? err.message : String(err);
      throw new LaunchError(
        msg.includes('ENOENT') ? 'MISSING_BINARY' : 'SPAWN_FAILED',
        `Failed to spawn claude: ${msg}`,
      );
    }

    return new Promise<ManagedClaudeRuntime>((resolve, reject) => {
      let startupOutput = '';
      let settled = false;
      let active = true;
      let startupTimer: NodeJS.Timeout | null = null;
      const pendingTurns: PendingTurn[] = [];

      const settleResolve = (runtime: ManagedClaudeRuntime): void => {
        if (settled) return;
        settled = true;
        if (startupTimer) clearTimeout(startupTimer);
        resolve(runtime);
      };

      const settleReject = (error: LaunchError): void => {
        if (settled) return;
        settled = true;
        if (startupTimer) clearTimeout(startupTimer);
        active = false;
        cleanupSettings();
        reject(error);
      };

      const rejectPendingTurns = (error: Error): void => {
        while (pendingTurns.length > 0) {
          const pending = pendingTurns.shift();
          pending?.reject(error);
        }
      };

      const handleJsonLine = (line: string): void => {
        const trimmed = line.trim();
        if (!trimmed) return;
        startupOutput += `${trimmed}\n`;

        let envelope: Record<string, unknown>;
        try {
          envelope = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          return;
        }

        const activeTurn = pendingTurns[0];

        const assistantDelta = extractAssistantDeltaFromEnvelope(envelope);
        if (assistantDelta && activeTurn) {
          activeTurn.sawAssistant = true;
          onAssistantOutput?.(assistantDelta);
          return;
        }

        const assistantText = extractAssistantTextFromEnvelope(envelope);
        if (assistantText && activeTurn && !activeTurn.sawAssistant) {
          activeTurn.sawAssistant = true;
          onAssistantOutput?.(assistantText);
          return;
        }

        const isResult = envelope['type'] === 'result';
        if (!isResult) return;

        const turn = pendingTurns.shift();
        if (!turn) return;

        const resultText = extractResultTextFromEnvelope(envelope);
        if (!turn.sawAssistant && resultText) {
          onAssistantOutput?.(resultText);
        }

        turn.resolve();
      };

      const wireLineStream = (onChunk: (line: string) => void): ((chunk: Buffer | string) => void) => {
        let buffer = '';
        return (chunk: Buffer | string) => {
          buffer += chunk.toString();
          while (true) {
            const newlineIndex = buffer.indexOf('\n');
            if (newlineIndex === -1) break;
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            onChunk(line);
          }
        };
      };

      proc.stdout.on('data', wireLineStream(handleJsonLine));
      proc.stderr.on('data', wireLineStream(handleJsonLine));

      proc.once('error', (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (!settled) {
          settleReject(
            new LaunchError(
              msg.includes('ENOENT') ? 'MISSING_BINARY' : 'SPAWN_FAILED',
              `Failed to spawn claude: ${msg}`,
            ),
          );
        }
      });

      proc.once('exit', (exitCode, signal) => {
        active = false;
        const reason = signal ? `signal ${signal}` : `code ${exitCode ?? 0}`;
        rejectPendingTurns(new Error(`Claude process exited (${reason})`));

        if (!settled) {
          settleReject(
            new LaunchError(
              'SPAWN_FAILED',
              `claude exited during startup (${reason}): ${startupOutput.trim()}`,
            ),
          );
          return;
        }

        console.log(`[ClaudeLauncher] session ${sessionId} exited (${reason})`);
        cleanupSettings();
        onExit?.();
      });

      startupTimer = setTimeout(() => {
        if (!active) return;
        settleResolve({
          sendMessage: async (message) => {
            if (!active || proc.killed || proc.stdin.destroyed || !proc.stdin.writable) {
              throw new LaunchError('SPAWN_FAILED', 'claude runtime is not available');
            }
            const content = message.trim();
            if (!content) return;
            const payload = `${createUserTurnPayload(content)}\n`;
            console.log('[ClaudeLauncher] writing user turn via stream-json stdin');

            return new Promise<void>((resolveTurn, rejectTurn) => {
              pendingTurns.push({
                sawAssistant: false,
                resolve: resolveTurn,
                reject: rejectTurn,
              });

              try {
                proc.stdin.write(payload);
              } catch (err) {
                const pending = pendingTurns.pop();
                const writeErr = err instanceof Error ? err : new Error(String(err));
                pending?.reject(writeErr);
              }
            });
          },
          terminateSession: () => {
            if (!active) return;
            active = false;
            try {
              proc.kill();
            } catch {
              // already exited
            }
          },
          isActive: () => active,
        });
      }, 300);
    });
  }
}
