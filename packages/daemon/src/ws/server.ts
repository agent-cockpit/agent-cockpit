import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type Database from 'better-sqlite3';
import { handleConnection } from './handlers.js';

export function createWsServer(
  db: Database.Database,
  port: number,
): { wss: WebSocketServer; httpServer: ReturnType<typeof createServer> } {
  const httpServer = createServer();
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws, req) => {
    handleConnection(ws, req, db);
  });

  httpServer.listen(port, () => {
    console.log(`[cockpit-daemon] WebSocket server listening on ws://localhost:${port}`);
  });

  return { wss, httpServer };
}

export function broadcast(wss: WebSocketServer, payload: string): void {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}
