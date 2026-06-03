import type http from 'node:http';
import type Database from 'better-sqlite3';
import type { NormalizedEvent } from '@agentcockpit/shared';
import {
  getAllSharedContext,
  getSharedContextEntry,
  upsertSharedContext,
  deleteSharedContext,
  pushToSharedList,
  popFromSharedList,
  getAllSessions,
  getSessionWorkflow,
  getWorkflowByName,
  getAllWorkflows,
  insertWorkflowMessage,
  getWorkflowMessages,
} from '../db/queries.js';
import { eventBus } from '../eventBus.js';
import { logger } from '../logger.js';
import type { ManagedSessionRegistry } from '../ws/server.js';

export interface McpDeps {
  db: Database.Database;
  runtimeRegistry: ManagedSessionRegistry;
  ptyDataBuffers: Map<string, string[]>;
  apiPort: number;
  broadcastEvent: (event: NormalizedEvent) => void;
}

// Pending agent_message_wait calls: sessionId → waiter state
interface AgentWaiter {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  startIndex: number;
  timer: ReturnType<typeof setTimeout>;
}
const pendingWaiters = new Map<string, AgentWaiter>();

// Called by ws/server.ts when session_turn_complete fires
export function notifyTurnComplete(sessionId: string, ptyDataBuffers: Map<string, string[]>): void {
  const waiter = pendingWaiters.get(sessionId);
  if (!waiter) return;
  pendingWaiters.delete(sessionId);
  clearTimeout(waiter.timer);
  const buf = ptyDataBuffers.get(sessionId) ?? [];
  const response = buf.slice(waiter.startIndex).join('');
  waiter.resolve(response);
}

// ─── MCP JSON-RPC helpers ─────────────────────────────────────────────────────

function mcpResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}

function mcpError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

const TOOL_DEFINITIONS = [
  {
    name: 'context_get',
    description: 'Read shared context. Returns all entries or a specific key.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string', description: 'Specific key to retrieve. Omit for all entries.' } },
    },
  },
  {
    name: 'context_set',
    description: 'Write a key-value pair to shared context (visible to all agents).',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'context_delete',
    description: 'Delete a key from shared context.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
  },
  {
    name: 'context_push',
    description: 'Atomically append an item to a shared list. Creates the list if it does not exist. Safe to call from multiple agents simultaneously — no race conditions.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'List key.' },
        value: { type: 'string', description: 'Item to append.' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'context_pop',
    description: 'Atomically claim (remove and return) the first item from a shared list. Returns null if the list is empty. Use this for task queues — each agent gets a unique item with no duplicates.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'List key.' },
      },
      required: ['key'],
    },
  },
  {
    name: 'agent_list',
    description: 'List all active agent sessions.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agent_spawn',
    description: 'Launch a new agent session. Returns the new sessionId.',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: 'Absolute path to workspace directory.' },
        provider: { type: 'string', enum: ['claude', 'codex'], description: 'Agent provider. Defaults to claude.' },
        model: { type: 'string', description: 'Model override (optional).' },
        systemPrompt: { type: 'string', description: 'Additional instructions appended to the system prompt of the spawned agent.' },
      },
      required: ['workspacePath'],
    },
  },
  {
    name: 'agent_message',
    description: 'Send a message to another active agent session (fire-and-forget).',
    inputSchema: {
      type: 'object',
      properties: {
        targetSessionId: { type: 'string', description: 'Session ID of the target agent.' },
        content: { type: 'string', description: 'Message to send.' },
      },
      required: ['targetSessionId', 'content'],
    },
  },
  {
    name: 'agent_message_wait',
    description: 'Send a message to another agent and wait for its response. Blocks until the target completes its turn.',
    inputSchema: {
      type: 'object',
      properties: {
        targetSessionId: { type: 'string', description: 'Session ID of the target agent.' },
        content: { type: 'string', description: 'Message to send.' },
        timeoutMs: { type: 'number', description: 'Max wait time in milliseconds. Defaults to 60000.' },
      },
      required: ['targetSessionId', 'content'],
    },
  },
  {
    name: 'delegate_task',
    description: 'Spawn a new agent, give it a task, and wait for its response — all in one call. Use this to delegate subtasks in parallel rather than doing everything sequentially. Returns the agent\'s response when it finishes.',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: 'Workspace directory for the child agent.' },
        task: { type: 'string', description: 'Full instructions for the child agent.' },
        timeoutMs: { type: 'number', description: 'Max wait time in milliseconds. Defaults to 120000.' },
        model: { type: 'string', description: 'Model override (optional).' },
      },
      required: ['workspacePath', 'task'],
    },
  },
  {
    name: 'workflow_message_send',
    description: 'Send a message from this workflow to another workflow by name. The message is visible in the cockpit UI and can be read by agents in the target workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        targetWorkflowName: { type: 'string', description: 'Name of the target workflow.' },
        content: { type: 'string', description: 'Message content.' },
      },
      required: ['targetWorkflowName', 'content'],
    },
  },
  {
    name: 'workflow_messages_read',
    description: 'Read all messages sent to this workflow (most recent last). Returns an array of messages with sender workflow, content, and timestamp.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'workflow_list',
    description: 'List all registered workflows by name and ID.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ─── Tool handlers ────────────────────────────────────────────────────────────

async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  callerSessionId: string,
  deps: McpDeps,
): Promise<unknown> {
  switch (name) {
    case 'context_get': {
      const workflowId = getSessionWorkflow(deps.db, callerSessionId) ?? undefined;
      if (args['key'] !== undefined) {
        const entry = getSharedContextEntry(deps.db, String(args['key']), workflowId);
        return entry ?? null;
      }
      return getAllSharedContext(deps.db, workflowId);
    }

    case 'context_set': {
      const key = String(args['key']);
      const value = String(args['value']);
      const workflowId = getSessionWorkflow(deps.db, callerSessionId) ?? undefined;
      upsertSharedContext(deps.db, key, value, callerSessionId, workflowId);
      deps.broadcastEvent({
        schemaVersion: 1,
        sessionId: callerSessionId,
        type: 'shared_context_update',
        key,
        value,
        updatedBySessionId: callerSessionId,
        timestamp: new Date().toISOString(),
      } as NormalizedEvent);
      return { ok: true };
    }

    case 'context_delete': {
      const key = String(args['key']);
      const workflowId = getSessionWorkflow(deps.db, callerSessionId) ?? undefined;
      deleteSharedContext(deps.db, key, workflowId);
      deps.broadcastEvent({
        schemaVersion: 1,
        sessionId: callerSessionId,
        type: 'shared_context_update',
        key,
        value: null,
        updatedBySessionId: callerSessionId,
        timestamp: new Date().toISOString(),
      } as NormalizedEvent);
      return { ok: true };
    }

    case 'context_push': {
      const key = String(args['key']);
      const value = String(args['value']);
      const workflowId = getSessionWorkflow(deps.db, callerSessionId) ?? undefined;
      const remaining = pushToSharedList(deps.db, key, value, callerSessionId, workflowId);
      deps.broadcastEvent({
        schemaVersion: 1,
        sessionId: callerSessionId,
        type: 'shared_context_update',
        key,
        value: JSON.stringify(remaining),
        updatedBySessionId: callerSessionId,
        timestamp: new Date().toISOString(),
      } as NormalizedEvent);
      return { ok: true, length: remaining.length };
    }

    case 'context_pop': {
      const key = String(args['key']);
      const workflowId = getSessionWorkflow(deps.db, callerSessionId) ?? undefined;
      const { item, remaining } = popFromSharedList(deps.db, key, callerSessionId, workflowId);
      if (item !== null) {
        deps.broadcastEvent({
          schemaVersion: 1,
          sessionId: callerSessionId,
          type: 'shared_context_update',
          key,
          value: JSON.stringify(remaining),
          updatedBySessionId: callerSessionId,
          timestamp: new Date().toISOString(),
        } as NormalizedEvent);
      }
      return { item };
    }

    case 'agent_list': {
      const sessions = getAllSessions(deps.db);
      return sessions
        .filter((s) => !s.endedAt)
        .map((s) => ({ sessionId: s.sessionId, provider: s.provider, workspacePath: s.workspacePath, status: 'active' }));
    }

    case 'agent_spawn': {
      const workspacePath = String(args['workspacePath']);
      const provider = (args['provider'] as string | undefined) ?? 'claude';
      const model = args['model'] !== undefined ? String(args['model']) : undefined;
      const spawnSystemPrompt = args['systemPrompt'] !== undefined ? String(args['systemPrompt']) : undefined;
      const apiHost = process.env['COCKPIT_HOOK_HOST'] ?? '127.0.0.1';
      const resp = await fetch(`http://${apiHost}:${deps.apiPort}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, workspacePath, parentSessionId: callerSessionId, ...(model ? { model } : {}), ...(spawnSystemPrompt ? { systemPrompt: spawnSystemPrompt } : {}) }),
      });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`agent_spawn failed: ${resp.status} ${body}`);
      }
      return await resp.json();
    }

    case 'agent_message': {
      const targetId = String(args['targetSessionId']);
      const content = String(args['content']);
      const runtime = deps.runtimeRegistry.get(targetId);
      if (!runtime) throw new Error(`No active session: ${targetId}`);
      await runtime.sendMessage(content);
      const messageId = crypto.randomUUID();
      deps.broadcastEvent({
        schemaVersion: 1,
        sessionId: callerSessionId,
        type: 'inter_agent_message',
        fromSessionId: callerSessionId,
        toSessionId: targetId,
        content,
        messageId,
        timestamp: new Date().toISOString(),
      } as NormalizedEvent);
      return { ok: true, messageId };
    }

    case 'agent_message_wait': {
      const targetId = String(args['targetSessionId']);
      const content = String(args['content']);
      const timeoutMs = typeof args['timeoutMs'] === 'number' ? args['timeoutMs'] : 60000;
      const runtime = deps.runtimeRegistry.get(targetId);
      if (!runtime) throw new Error(`No active session: ${targetId}`);

      const startIndex = deps.ptyDataBuffers.get(targetId)?.length ?? 0;
      const messageId = crypto.randomUUID();

      const responseText = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingWaiters.delete(targetId);
          reject(new Error(`agent_message_wait timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        pendingWaiters.set(targetId, { resolve, reject, startIndex, timer });
      });

      deps.broadcastEvent({
        schemaVersion: 1,
        sessionId: callerSessionId,
        type: 'inter_agent_message',
        fromSessionId: callerSessionId,
        toSessionId: targetId,
        content,
        messageId,
        timestamp: new Date().toISOString(),
      } as NormalizedEvent);

      // Send after registering waiter to avoid race
      await runtime.sendMessage(content);

      return { response: responseText, messageId };
    }

    case 'delegate_task': {
      const workspacePath = String(args['workspacePath']);
      const task = String(args['task']);
      const timeoutMs = typeof args['timeoutMs'] === 'number' ? args['timeoutMs'] : 120000;
      const model = args['model'] !== undefined ? String(args['model']) : undefined;
      const apiHost = process.env['COCKPIT_HOOK_HOST'] ?? '127.0.0.1';

      // Spawn child agent
      const spawnResp = await fetch(`http://${apiHost}:${deps.apiPort}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'claude', workspacePath, parentSessionId: callerSessionId, ...(model ? { model } : {}) }),
      });
      if (!spawnResp.ok) {
        const body = await spawnResp.text();
        throw new Error(`delegate_task spawn failed: ${spawnResp.status} ${body}`);
      }
      const { sessionId: childId } = await spawnResp.json() as { sessionId: string };

      // Wait for the runtime to register (PTY takes a moment to appear)
      const POLL_INTERVAL_MS = 200;
      const READY_TIMEOUT_MS = 15000;
      const readyDeadline = Date.now() + READY_TIMEOUT_MS;
      while (!deps.runtimeRegistry.get(childId)) {
        if (Date.now() > readyDeadline) throw new Error(`delegate_task: child session ${childId} did not become ready within ${READY_TIMEOUT_MS}ms`);
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }

      const runtime = deps.runtimeRegistry.get(childId)!;
      const startIndex = deps.ptyDataBuffers.get(childId)?.length ?? 0;
      const messageId = crypto.randomUUID();

      const responseText = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingWaiters.delete(childId);
          reject(new Error(`delegate_task timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        pendingWaiters.set(childId, { resolve, reject, startIndex, timer });
      });

      deps.broadcastEvent({
        schemaVersion: 1,
        sessionId: callerSessionId,
        type: 'inter_agent_message',
        fromSessionId: callerSessionId,
        toSessionId: childId,
        content: task,
        messageId,
        timestamp: new Date().toISOString(),
      } as NormalizedEvent);

      await runtime.sendMessage(task);

      return { sessionId: childId, response: responseText, messageId };
    }

    case 'workflow_message_send': {
      const targetName = String(args['targetWorkflowName']);
      const content = String(args['content']);
      const fromWorkflowId = getSessionWorkflow(deps.db, callerSessionId);
      if (!fromWorkflowId) throw new Error('This session is not part of a workflow');
      const target = getWorkflowByName(deps.db, targetName);
      if (!target) throw new Error(`Workflow not found: ${targetName}`);
      const messageId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      insertWorkflowMessage(deps.db, {
        id: messageId,
        fromWorkflowId,
        toWorkflowId: target.id,
        fromSessionId: callerSessionId,
        content,
        createdAt,
      });
      deps.broadcastEvent({
        schemaVersion: 1,
        sessionId: callerSessionId,
        type: 'workflow_message',
        fromWorkflowId,
        toWorkflowId: target.id,
        fromSessionId: callerSessionId,
        content,
        messageId,
        timestamp: createdAt,
      } as NormalizedEvent);
      return { ok: true, messageId };
    }

    case 'workflow_messages_read': {
      const workflowId = getSessionWorkflow(deps.db, callerSessionId);
      if (!workflowId) throw new Error('This session is not part of a workflow');
      return getWorkflowMessages(deps.db, workflowId);
    }

    case 'workflow_list': {
      return getAllWorkflows(deps.db);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── HTTP request handler ─────────────────────────────────────────────────────

const MAX_BODY = 1024 * 512; // 512KB

export function handleMcpRequest(
  callerSessionId: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: McpDeps,
): void {
  let body = '';
  req.on('data', (chunk: Buffer) => {
    body += chunk.toString();
    if (body.length > MAX_BODY) {
      res.writeHead(413);
      res.end();
      req.destroy();
    }
  });

  req.on('end', () => {
    void (async () => {
      let rpc: { jsonrpc: string; id?: unknown; method: string; params?: unknown };
      try {
        rpc = JSON.parse(body) as typeof rpc;
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mcpError(null, -32700, 'Parse error')));
        return;
      }

      const { id, method, params } = rpc;

      try {
        let result: unknown;

        if (method === 'initialize') {
          result = {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'agent-cockpit', version: '1.0.0' },
          };
        } else if (method === 'notifications/initialized') {
          // Notification — no response
          res.writeHead(204);
          res.end();
          return;
        } else if (method === 'tools/list') {
          result = { tools: TOOL_DEFINITIONS };
        } else if (method === 'tools/call') {
          const p = params as { name: string; arguments?: Record<string, unknown> };
          const toolResult = await dispatchTool(p.name, p.arguments ?? {}, callerSessionId, deps);
          result = {
            content: [{ type: 'text', text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2) }],
          };
        } else if (method === 'ping') {
          result = {};
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(mcpError(id, -32601, `Method not found: ${method}`)));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mcpResult(id, result)));
      } catch (err) {
        logger.error('mcp', 'Tool error', { method, callerSessionId, err: String(err) });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mcpError(id, -32000, String(err))));
      }
    })();
  });
}
