import type Database from 'better-sqlite3';
import { execFileSync, spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setClaudeSessionId } from '../../db/queries.js';
import { platform } from '../../platform/index.js';
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

export interface ClaudeSessionUsageSnapshot {
  model?: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens: number
  contextUsedTokens?: number
  contextWindowTokens?: number
  contextPercent?: number
}

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

function toNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return Math.round(value);
}

function extractClaudeUsageCounts(value: unknown): {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const usage = value as Record<string, unknown>;
  const inputTokens = toNonNegativeInteger(usage['input_tokens']);
  const outputTokens = toNonNegativeInteger(usage['output_tokens']);
  if (inputTokens === null || outputTokens === null) return null;
  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens: toNonNegativeInteger(usage['cache_read_input_tokens']) ?? 0,
    cacheCreationInputTokens: toNonNegativeInteger(usage['cache_creation_input_tokens']) ?? 0,
  };
}

function extractInitModel(envelope: Record<string, unknown>): string | null {
  if (envelope['type'] !== 'system') return null;
  if (envelope['subtype'] !== 'init') return null;
  const model = envelope['model'];
  if (typeof model !== 'string') return null;
  const trimmed = model.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveClaudeModelContextWindow(model: string | null): number | null {
  if (!model) return null;
  const normalized = model.trim().toLowerCase();
  if (!normalized.startsWith('claude')) return null;

  // Anthropic docs list Claude 4.x, 3.7, and 3.5 default context windows as 200K.
  // Claude Code currently does not expose a direct context-window field in stream-json.
  return 200_000;
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

function isWindowsCommandWrapper(binaryPath: string): boolean {
  const ext = path.extname(binaryPath).toLowerCase();
  return ext === '.cmd' || ext === '.bat';
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
    let claudePath: string;
    try {
      claudePath = platform.resolveBinary('claude');
    } catch {
      throw new LaunchError('MISSING_BINARY', 'claude binary not found on PATH');
    }
    try {
      if (isWindowsCommandWrapper(claudePath)) {
        execFileSync('cmd.exe', ['/d', '/s', '/c', `"${claudePath}" --version`], { stdio: 'pipe' });
      } else {
        execFileSync(claudePath, ['--version'], { stdio: 'pipe' });
      }
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
    onUsageSnapshot?: (usage: ClaudeSessionUsageSnapshot) => void,
    model?: string,
  ): Promise<ManagedClaudeRuntime> {
    const HOOK_TIMEOUT_S = 60;
    const HOOK_TIMEOUT_MS = (HOOK_TIMEOUT_S - 5) * 1000;
    const hookHost = process.env['COCKPIT_HOOK_HOST'] ?? '127.0.0.1';
    const hookUrl = `http://${hookHost}:${this.hookPort}/hook`;
    const hookRelayPath = path.join(os.tmpdir(), `cockpit-hook-relay-${sessionId}.cjs`);
    fs.writeFileSync(
      hookRelayPath,
      [
        "const http = require('node:http');",
        "const https = require('node:https');",
        "const { URL } = require('node:url');",
        '',
        "const target = process.argv[2];",
        "const timeoutMs = Number(process.argv[3] ?? '55000');",
        "if (!target) process.exit(2);",
        '',
        'let body = "";',
        "process.stdin.setEncoding('utf8');",
        "process.stdin.on('data', (chunk) => { body += chunk; });",
        "process.stdin.on('end', () => {",
        "  const url = new URL(target);",
        "  const transport = url.protocol === 'https:' ? https : http;",
        '  const request = transport.request({',
        '    protocol: url.protocol,',
        '    hostname: url.hostname,',
        '    port: url.port || (url.protocol === "https:" ? 443 : 80),',
        '    path: `${url.pathname}${url.search}`,',
        "    method: 'POST',",
        '    headers: {',
        "      'content-type': 'application/json',",
        "      'content-length': Buffer.byteLength(body),",
        '    },',
        '  }, (response) => {',
        '    response.resume();',
        '    response.on("end", () => {',
        '      const status = response.statusCode ?? 500;',
        '      process.exit(status >= 200 && status < 300 ? 0 : 1);',
        '    });',
        '  });',
        '',
        '  request.setTimeout(timeoutMs, () => {',
        '    request.destroy(new Error("timeout"));',
        '  });',
        '',
        '  request.on("error", () => process.exit(1));',
        '  request.write(body);',
        '  request.end();',
        '});',
        "process.stdin.on('error', () => process.exit(1));",
        'process.stdin.resume();',
        '',
      ].join('\n'),
      'utf8',
    );
    const hookCmd = `"${process.execPath}" "${hookRelayPath}" "${hookUrl}" "${HOOK_TIMEOUT_MS}"`;
    const hookEntry = (matcher?: string) => ({
      ...(matcher !== undefined ? { matcher } : {}),
      hooks: [{ type: 'command', command: hookCmd, timeout: HOOK_TIMEOUT_S }],
    });

    const settings = {
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: hookCmd, timeout: HOOK_TIMEOUT_S }] }],
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

    const settingsPath = path.join(os.tmpdir(), `cockpit-claude-${sessionId}.json`);
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
      '--include-partial-messages',
      '--session-id',
      sessionId,
      '--settings',
      settingsPath,
      ...(model ? ['--model', model] : []),
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
      try {
        fs.unlinkSync(hookRelayPath);
      } catch {
        // ignore cleanup races
      }
    };

    const platformOpts = platform.defaultSpawnOptions();
    const baseEnv = { ...process.env, ...(platformOpts.env ?? {}) };

    // When a custom procFactory is injected (tests), use it as-is with 'claude' as the name.
    // In production, resolve the platform-specific binary path and merge platform spawn options.
    const spawnFn: ProcFactory = this.procFactory
      ? (file, spawnArgs, options) => this.procFactory!(file, spawnArgs, options)
      : (file, spawnArgs, options) => {
          let binary: string;
          try {
            binary = platform.resolveBinary(file);
          } catch {
            throw Object.assign(new Error(`ENOENT: binary not found: ${file}`), { code: 'ENOENT' });
          }
          return spawn(binary, spawnArgs, { ...platformOpts, ...options, env: baseEnv });
        };

    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawnFn('claude', args, {
        cwd: workspacePath,
        env: baseEnv,
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
      let activeModel: string | null = null;
      let cumulativeInputTokens = 0;
      let cumulativeOutputTokens = 0;
      let cumulativeCachedInputTokens = 0;

      const makeRuntime = (): ManagedClaudeRuntime => ({
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

      const handleStderrLine = (line: string): void => {
        const trimmed = line.trim();
        if (!trimmed) return;
        startupOutput += `[stderr] ${trimmed}\n`;
        console.warn(`[ClaudeLauncher] [stderr] ${trimmed}`);
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

        const modelFromInit = extractInitModel(envelope);
        if (modelFromInit) {
          activeModel = modelFromInit;
          settleResolve(makeRuntime());
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

        const usageCounts = extractClaudeUsageCounts(envelope['usage']);
        if (usageCounts) {
          cumulativeInputTokens += usageCounts.inputTokens;
          cumulativeOutputTokens += usageCounts.outputTokens;
          cumulativeCachedInputTokens += usageCounts.cacheReadInputTokens + usageCounts.cacheCreationInputTokens;

          const contextWindowTokens = resolveClaudeModelContextWindow(activeModel);
          const contextUsedTokens = usageCounts.inputTokens;
          const contextPercent =
            contextWindowTokens && contextWindowTokens > 0
              ? Math.max(0, Math.min(100, Math.round((contextUsedTokens / contextWindowTokens) * 100)))
              : undefined;

          onUsageSnapshot?.({
            ...(activeModel ? { model: activeModel } : {}),
            inputTokens: cumulativeInputTokens,
            outputTokens: cumulativeOutputTokens,
            totalTokens: cumulativeInputTokens + cumulativeOutputTokens,
            cachedInputTokens: cumulativeCachedInputTokens,
            contextUsedTokens,
            ...(contextWindowTokens ? { contextWindowTokens } : {}),
            ...(contextPercent !== undefined ? { contextPercent } : {}),
          });
        }

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
      proc.stderr.on('data', wireLineStream(handleStderrLine));

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

        if (exitCode !== 0 && exitCode !== null) {
          console.warn(`[ClaudeLauncher] session ${sessionId} exited unexpectedly (${reason}). Output:\n${startupOutput.slice(-2000).trim()}`);
        } else {
          console.log(`[ClaudeLauncher] session ${sessionId} exited (${reason})`);
        }
        cleanupSettings();
        onExit?.();
      });

      // Settle on first {type:"system",subtype:"init"} envelope — that's Claude's ready signal.
      // Fall back to a 5 s timeout so the session still opens when Claude skips the init envelope.
      startupTimer = setTimeout(() => {
        if (!active) return;
        console.warn('[ClaudeLauncher] startup timeout: no init envelope in 5s, settling');
        settleResolve(makeRuntime());
      }, 5000);
    });
  }
}
