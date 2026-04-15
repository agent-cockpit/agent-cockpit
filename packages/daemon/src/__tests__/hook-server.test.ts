import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import type { NormalizedEvent } from '@cockpit/shared';

// ─── Unit tests: riskClassifier ───────────────────────────────────────────────

describe('classifyRisk', () => {
  // Lazy import to avoid module caching across test files
  let classifyRisk: (toolName: string, toolInput: Record<string, unknown>) => {
    actionType: string;
    riskLevel: string;
    whyRisky: string;
  };

  beforeEach(async () => {
    const mod = await import('../adapters/claude/riskClassifier.js');
    classifyRisk = mod.classifyRisk;
  });

  it('Test 8: Bash rm -rf → shell_command / critical', () => {
    const result = classifyRisk('Bash', { command: 'rm -rf /tmp' });
    expect(result.actionType).toBe('shell_command');
    expect(result.riskLevel).toBe('critical');
  });

  it('Test 9: Bash curl → network_access / high', () => {
    const result = classifyRisk('Bash', { command: 'curl https://example.com' });
    expect(result.actionType).toBe('network_access');
    expect(result.riskLevel).toBe('high');
  });

  it('Test 10: Write path.ts → file_change / low', () => {
    const result = classifyRisk('Write', { path: 'foo.ts' });
    expect(result.actionType).toBe('file_change');
    expect(result.riskLevel).toBe('low');
  });

  it('Test 11: Unknown MCP tool → mcp_tool_call / medium', () => {
    const result = classifyRisk('MyMcpTool', {});
    expect(result.actionType).toBe('mcp_tool_call');
    expect(result.riskLevel).toBe('medium');
  });
});

// ─── Unit tests: hookParser ───────────────────────────────────────────────────

describe('parseHookPayload', () => {
  let parseHookPayload: (payload: Record<string, unknown>) => {
    event: NormalizedEvent;
    requiresApproval: boolean;
  };

  beforeEach(async () => {
    const mod = await import('../adapters/claude/hookParser.js');
    parseHookPayload = mod.parseHookPayload;
  });

  it('Test 1: SessionStart maps to session_start with workspacePath', () => {
    const result = parseHookPayload({
      hook_event_name: 'SessionStart',
      session_id: 'sess-001',
      cwd: '/proj',
    });
    expect(result.event.type).toBe('session_start');
    expect(result.event.provider).toBe('claude');
    if (result.event.type === 'session_start') {
      expect(result.event.workspacePath).toBe('/proj');
    }
  });

  it('Test 2: Same session_id always maps to same UUID sessionId', () => {
    const r1 = parseHookPayload({
      hook_event_name: 'SessionStart',
      session_id: 'sess-dup',
      cwd: '/proj',
    });
    const r2 = parseHookPayload({
      hook_event_name: 'SessionEnd',
      session_id: 'sess-dup',
    });
    expect(r1.event.sessionId).toBe(r2.event.sessionId);
    // Must be a valid UUID
    expect(r1.event.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('Test 3: SessionEnd maps to session_end', () => {
    const result = parseHookPayload({
      hook_event_name: 'SessionEnd',
      session_id: 'sess-002',
    });
    expect(result.event.type).toBe('session_end');
  });

  it('Test 4: PreToolUse with non-blocking tool → tool_call, requiresApproval false', () => {
    const result = parseHookPayload({
      hook_event_name: 'PreToolUse',
      session_id: 'sess-003',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
    });
    expect(result.event.type).toBe('tool_call');
    expect(result.requiresApproval).toBe(false);
  });

  it('Test 5: PostToolUse Bash → tool_call', () => {
    const result = parseHookPayload({
      hook_event_name: 'PostToolUse',
      session_id: 'sess-004',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
    });
    expect(result.event.type).toBe('tool_call');
  });

  it('Test 5b: PostToolUse Write → file_change', () => {
    const result = parseHookPayload({
      hook_event_name: 'PostToolUse',
      session_id: 'sess-004b',
      tool_name: 'Write',
      tool_input: { path: '/tmp/path.ts', content: 'const x = 1' },
    });
    expect(result.event.type).toBe('file_change');
    if (result.event.type !== 'file_change') return;
    expect(result.event.filePath).toBe('/tmp/path.ts');
    expect(result.event.changeType).toBe('created');
  });

  it('Test 6: SubagentStart → subagent_spawn', () => {
    const result = parseHookPayload({
      hook_event_name: 'SubagentStart',
      session_id: 'sess-005',
      agent_id: 'agent-1',
    });
    expect(result.event.type).toBe('subagent_spawn');
  });

  it('Test 7: SubagentStop → subagent_complete', () => {
    const result = parseHookPayload({
      hook_event_name: 'SubagentStop',
      session_id: 'sess-006',
      agent_id: 'agent-1',
    });
    expect(result.event.type).toBe('subagent_complete');
  });
});

// ─── Integration tests: hookServer ───────────────────────────────────────────

describe('hookServer', () => {
  let server: http.Server;
  let port: number;
  let createHookServer: (
    port: number,
    onEvent: (event: NormalizedEvent) => void,
    onDecisionNeeded: (approvalId: string, event: NormalizedEvent) => void,
  ) => http.Server;
  let resolveApproval: (approvalId: string, decision: 'allow' | 'deny' | 'always_allow', reason?: string) => void;

  beforeEach(async () => {
    const mod = await import('../adapters/claude/hookServer.js');
    createHookServer = mod.createHookServer;
    resolveApproval = mod.resolveApproval;
    port = 0; // OS assigns a free port
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  /** Helper: POST JSON to the server's /hook endpoint */
  function postHook(
    serverInstance: http.Server,
    body: unknown,
  ): Promise<{ status: number; body: string }> {
    const addr = serverInstance.address() as { port: number };
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/hook',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
        },
        (res) => {
          let responseBody = '';
          res.on('data', (chunk: Buffer) => { responseBody += chunk.toString(); });
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: responseBody }));
        },
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  it('Test 12: SessionStart POST emits event and responds 200', async () => {
    const events: NormalizedEvent[] = [];
    server = createHookServer(
      port,
      (e) => events.push(e),
      () => {},
    );
    await new Promise<void>((resolve) => server.once('listening', resolve));

    const res = await postHook(server, {
      hook_event_name: 'SessionStart',
      session_id: 'test-sess-12',
      cwd: '/workspace',
    });

    expect(res.status).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('session_start');
  });

  it('Test 13: High-risk Bash PreToolUse calls onDecisionNeeded and does NOT close response', async () => {
    const decisions: Array<{ approvalId: string; event: NormalizedEvent }> = [];
    server = createHookServer(
      port,
      () => {},
      (approvalId, event) => decisions.push({ approvalId, event }),
    );
    await new Promise<void>((resolve) => server.once('listening', resolve));

    // Fire-and-forget — response will be held open
    let responseResolved = false;
    const addr = server.address() as { port: number };
    const responsePromise = new Promise<void>((resolve, reject) => {
      const data = JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'test-sess-13',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /tmp' },
      });
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/hook',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
        },
        (res) => {
          res.resume(); // put in flowing mode so 'end' fires
          res.on('end', () => { responseResolved = true; resolve(); });
        },
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    });

    // Give the server time to process
    await new Promise<void>((r) => setTimeout(r, 100));

    // Decision callback must have been called
    expect(decisions).toHaveLength(1);
    const { approvalId, event } = decisions[0]!;
    expect(event.type).toBe('approval_request');
    expect(approvalId).toBeTruthy();

    // Response must NOT have ended yet
    expect(responseResolved).toBe(false);

    // Clean up: resolve the held approval so server shuts down cleanly
    resolveApproval(approvalId, 'deny');
    await responsePromise;
  });

  it('Test 14: resolveApproval allow closes held response with correct PreToolUse envelope', async () => {
    const decisions: Array<{ approvalId: string }> = [];
    server = createHookServer(
      port,
      () => {},
      (approvalId) => decisions.push({ approvalId }),
    );
    await new Promise<void>((resolve) => server.once('listening', resolve));

    const addr = server.address() as { port: number };
    let responseBody = '';
    const responsePromise = new Promise<void>((resolve, reject) => {
      const data = JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'test-sess-14',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /tmp' },
      });
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/hook',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
        },
        (res) => {
          res.on('data', (chunk: Buffer) => { responseBody += chunk.toString(); });
          res.on('end', () => resolve());
        },
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    });

    await new Promise<void>((r) => setTimeout(r, 100));
    const { approvalId } = decisions[0]!;

    resolveApproval(approvalId, 'allow', 'approved by user');
    await responsePromise;

    const parsed = JSON.parse(responseBody) as {
      hookSpecificOutput: { hookEventName: string; permissionDecision: string };
    };
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('Test 15: resolveApproval on unknown/expired approvalId is a no-op', () => {
    server = createHookServer(port, () => {}, () => {});
    expect(() => resolveApproval('nonexistent-id', 'allow')).not.toThrow();
  });

  it('Test 16: PermissionRequest hook type returns correct PermissionRequest envelope on allow', async () => {
    const decisions: Array<{ approvalId: string }> = [];
    server = createHookServer(
      port,
      () => {},
      (approvalId) => decisions.push({ approvalId }),
    );
    await new Promise<void>((resolve) => server.once('listening', resolve));

    const addr = server.address() as { port: number };
    let responseBody = '';
    const responsePromise = new Promise<void>((resolve, reject) => {
      const data = JSON.stringify({
        hook_event_name: 'PermissionRequest',
        session_id: 'test-sess-16',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /tmp' },
      });
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/hook',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
        },
        (res) => {
          res.on('data', (chunk: Buffer) => { responseBody += chunk.toString(); });
          res.on('end', () => resolve());
        },
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    });

    await new Promise<void>((r) => setTimeout(r, 100));
    expect(decisions).toHaveLength(1);
    const { approvalId } = decisions[0]!;

    resolveApproval(approvalId, 'allow');
    await responsePromise;

    const parsed = JSON.parse(responseBody) as {
      hookSpecificOutput: { hookEventName: string; decision: { behavior: string } };
    };
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PermissionRequest');
    expect(parsed.hookSpecificOutput.decision.behavior).toBe('allow');
  });

  it('Test 17: double resolveApproval on same approvalId — second call is a no-op (no throw, response not double-ended)', async () => {
    const decisions: Array<{ approvalId: string }> = [];
    server = createHookServer(
      port,
      () => {},
      (approvalId) => decisions.push({ approvalId }),
    );
    await new Promise<void>((resolve) => server.once('listening', resolve));

    const addr = server.address() as { port: number };
    const responsePromise = new Promise<void>((resolve, reject) => {
      const data = JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'test-sess-17',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /tmp' },
      });
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/hook',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve());
        },
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    });

    await new Promise<void>((r) => setTimeout(r, 100));
    const { approvalId } = decisions[0]!;

    // First resolve
    resolveApproval(approvalId, 'allow');
    await responsePromise;

    // Second resolve on same id — must not throw
    expect(() => resolveApproval(approvalId, 'deny')).not.toThrow();
  });
});

// ─── Database schema tests ────────────────────────────────────────────────────

describe('openDatabase schema', () => {
  it('Test 16: openDatabase(:memory:) creates approvals and always_allow_rules tables', async () => {
    const { openDatabase } = await import('../db/database.js');
    const db = openDatabase(':memory:');

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('approvals');
    expect(tableNames).toContain('always_allow_rules');

    db.close();
  });
});
