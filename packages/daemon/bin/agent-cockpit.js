#!/usr/bin/env node
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createConnection } from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const tsxBin = resolve(root, 'node_modules', '.bin', 'tsx');
const entry = resolve(root, 'src', 'index.ts');
const port = parseInt(process.env.COCKPIT_WS_PORT ?? '54321', 10);
const url = `http://localhost:${port}`;

const child = spawn(tsxBin, [entry], { stdio: 'inherit' });

function waitForPort(retries = 50) {
  return new Promise((resolve, reject) => {
    function attempt() {
      const socket = createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => { socket.destroy(); resolve(undefined); });
      socket.once('error', () => {
        socket.destroy();
        if (retries-- <= 0) return reject(new Error('timeout'));
        setTimeout(attempt, 200);
      });
    }
    attempt();
  });
}

waitForPort().then(() => {
  const opener =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start' :
    'xdg-open';
  try { execSync(`${opener} ${url}`, { stdio: 'ignore' }); } catch { /* ignore */ }
}).catch(() => { /* daemon failed to start */ });

child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
