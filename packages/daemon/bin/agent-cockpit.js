#!/usr/bin/env node
import { register } from 'tsx/esm/api';
import { createConnection } from 'node:net';
import { execSync } from 'node:child_process';

register();

const port = parseInt(process.env.COCKPIT_WS_PORT ?? '54321', 10);
const url = `http://localhost:${port}`;

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
}).catch(() => {});

await import('../src/index.ts');
