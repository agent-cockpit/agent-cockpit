import type Database from 'better-sqlite3';
import pty from 'node-pty';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setClaudeSessionId } from '../../db/queries.js';
import { platform } from '../../platform/index.js';

export interface PtyRuntime {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
  isActive: () => boolean
}

const HOOK_RELAY_SCRIPT = [
  "const http = require('node:http');",
  "const https = require('node:https');",
  "const { URL } = require('node:url');",
  "",
  "const target = process.argv[2];",
  "const timeoutMs = Number(process.argv[3] ?? '55000');",
  "if (!target) process.exit(2);",
  "",
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
  "",
  '  request.setTimeout(timeoutMs, () => {',
  '    request.destroy(new Error("timeout"));',
  '  });',
  "",
  '  request.on("error", () => process.exit(1));',
  '  request.write(body);',
  '  request.end();',
  '});',
  "process.stdin.on('error', () => process.exit(1));",
  'process.stdin.resume();',
  "",
].join('\n');

export class PtyLauncher {
  private readonly db: Database.Database | null;

  constructor(
    private readonly hookPort: number,
    db: Database.Database | null = null,
  ) {
    this.db = db;
  }

  async launch(
    sessionId: string,
    workspacePath: string,
    onData: (data: string) => void,
    onExit: () => void,
    model?: string,
    cols = 80,
    rows = 24,
  ): Promise<PtyRuntime> {
    const HOOK_TIMEOUT_S = 60;
    const HOOK_TIMEOUT_MS = (HOOK_TIMEOUT_S - 5) * 1000;
    const hookHost = process.env['COCKPIT_HOOK_HOST'] ?? '127.0.0.1';
    const hookUrl = `http://${hookHost}:${this.hookPort}/hook`;

    const hookRelayPath = path.join(os.tmpdir(), `cockpit-hook-relay-${sessionId}.cjs`);
    fs.writeFileSync(hookRelayPath, HOOK_RELAY_SCRIPT, 'utf8');

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
        SubagentStart: [hookEntry()],
        SubagentStop: [hookEntry()],
        Notification: [hookEntry()],
        Stop: [hookEntry()],
      },
    };

    const settingsPath = path.join(os.tmpdir(), `cockpit-claude-${sessionId}.json`);
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    if (this.db) {
      setClaudeSessionId(this.db, sessionId, sessionId, workspacePath);
    }

    let claudePath: string;
    try {
      claudePath = platform.resolveBinary('claude');
    } catch {
      fs.unlinkSync(settingsPath);
      fs.unlinkSync(hookRelayPath);
      throw new Error('claude binary not found on PATH');
    }

    const claudeArgs = [
      '--session-id', sessionId,
      '--settings', settingsPath,
      ...(model ? ['--model', model] : []),
    ];

    const isWindows = process.platform === 'win32';

    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v;
    }

    let spawnFile: string;
    let spawnArgs: string[];

    if (isWindows) {
      // PowerShell's & operator correctly invokes .cmd/.exe wrappers and
      // handles paths with spaces better than cmd.exe /c.
      const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;
      const psCmd = `& ${psQuote(claudePath)} ${claudeArgs.map(psQuote).join(' ')}`;
      spawnFile = 'powershell.exe';
      spawnArgs = ['-NoLogo', '-NoProfile', '-Command', psCmd];
    } else {
      const shQuote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
      const cmd = [claudePath, ...claudeArgs].map(shQuote).join(' ');
      spawnFile = process.env['SHELL'] ?? '/bin/zsh';
      spawnArgs = ['-l', '-c', cmd];
      env['TERM'] = 'xterm-256color';
      env['COLORTERM'] = 'truecolor';
    }

    let active = true;
    const cleanup = () => {
      try { fs.unlinkSync(settingsPath); } catch {}
      try { fs.unlinkSync(hookRelayPath); } catch {}
    };

    const ptyProcess = pty.spawn(spawnFile, spawnArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: workspacePath,
      env,
    });

    ptyProcess.onData(onData);
    ptyProcess.onExit(() => {
      active = false;
      cleanup();
      onExit();
    });

    console.log(`[PtyLauncher] spawned claude PTY session=${sessionId} cwd=${workspacePath}`);

    return {
      write: (data) => { if (active) ptyProcess.write(data); },
      resize: (c, r) => { if (active) { try { ptyProcess.resize(c, r); } catch {} } },
      kill: () => { if (active) { active = false; try { ptyProcess.kill(); } catch {} } },
      isActive: () => active,
    };
  }
}
