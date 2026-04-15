import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase } from '../db/database.js';
import type BetterSqlite3 from 'better-sqlite3';

import { parseHookPayload, setClaudeSessionCache, setClaudeSessionDb, getOrCreateSessionId } from '../adapters/claude/hookParser.js';
import type { HookPayload } from '../adapters/claude/hookParser.js';
import { setClaudeSessionId } from '../db/queries.js';

// Helper: create a SessionStart hook payload
function makeSessionStart(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    session_id: 'test-session-1',
    hook_event_name: 'SessionStart',
    cwd: '/test/workspace',
    ...overrides,
  };
}

// Helper: create a SubagentStart hook payload
function makeSubagentStart(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    session_id: 'parent-session-1',
    hook_event_name: 'SubagentStart',
    agent_id: 'subagent-1',
    cwd: '/test/workspace',
    ...overrides,
  };
}

describe('parseHookPayload session mapping persistence', () => {
  let db: BetterSqlite3.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
    // Inject fresh db and empty cache before each test
    setClaudeSessionDb(db);
    setClaudeSessionCache(new Map());
  });

  afterEach(() => {
    // Disconnect db reference from module before closing
    setClaudeSessionDb(null);
    setClaudeSessionCache(new Map());
    db.close();
  });

  it('Same claude_id maps to same UUID across multiple parseHookPayload calls (cache hit)', () => {
    const payload = makeSessionStart({ session_id: 'test-session-1' });

    const result1 = parseHookPayload(payload);
    const result2 = parseHookPayload(payload);

    expect(result1.event.sessionId).toBeDefined();
    expect(result1.event.sessionId).toBe(result2.event.sessionId);
  });

  it('After clearing cache, claude_id still maps to same UUID (database hit)', () => {
    const payload = makeSessionStart({ session_id: 'test-session-db' });

    // Get initial sessionId — writes to DB and cache
    const result1 = parseHookPayload(payload);
    const originalSessionId = result1.event.sessionId;
    expect(originalSessionId).toBeDefined();

    // Clear the in-memory cache (simulates fresh process with same DB)
    setClaudeSessionCache(new Map());

    // Call again with same claude_id — should hit DB (Tier 2) and get same UUID
    const result2 = parseHookPayload(payload);
    expect(result2.event.sessionId).toBe(originalSessionId);
  });

  it('New claude_id generates new UUID and persists to database', () => {
    const payload = makeSessionStart({ session_id: 'test-session-new' });

    const result = parseHookPayload(payload);
    expect(result.event.sessionId).toBeDefined();

    // Verify UUID format (v4)
    expect(result.event.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    // Query database to verify row exists in claude_sessions table
    const row = db.prepare(
      'SELECT session_id FROM claude_sessions WHERE claude_id = ?'
    ).get('test-session-new');
    expect(row).toBeDefined();
  });

  it('Subagent sessions use workspace parameter correctly', () => {
    const payload = makeSubagentStart({
      agent_id: 'subagent-2',
      cwd: '/test/subagent-workspace'
    });

    const result = parseHookPayload(payload);
    expect(result.event.type).toBe('subagent_spawn');
    if (result.event.type !== 'subagent_spawn') return;
    expect(result.event.subagentSessionId).toBeDefined();

    // Verify claude_sessions row has correct workspace
    const row = db.prepare(
      'SELECT workspace FROM claude_sessions WHERE claude_id = ?'
    ).get('subagent-2') as { workspace: string } | undefined;
    expect(row?.workspace).toBe('/test/subagent-workspace');
  });
});

describe('parseHookPayload notification chat mapping', () => {
  let db: BetterSqlite3.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
    setClaudeSessionDb(db);
    setClaudeSessionCache(new Map());
  });

  afterEach(() => {
    setClaudeSessionDb(null);
    setClaudeSessionCache(new Map());
    db.close();
  });

  it('maps Notification payload with text content to session_chat_message assistant event', () => {
    const payload: HookPayload = {
      session_id: 'notify-chat-1',
      hook_event_name: 'Notification',
      cwd: '/workspace',
      message: 'Claude reply text',
    };

    const result = parseHookPayload(payload);
    expect(result.requiresApproval).toBe(false);
    expect(result.event.type).toBe('session_chat_message');
    if (result.event.type !== 'session_chat_message') return;
    expect(result.event.provider).toBe('claude');
    expect(result.event.role).toBe('assistant');
    expect(result.event.content).toBe('Claude reply text');
  });
});

describe('parseHookPayload file change mapping', () => {
  let db: BetterSqlite3.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
    setClaudeSessionDb(db);
    setClaudeSessionCache(new Map());
  });

  afterEach(() => {
    setClaudeSessionDb(null);
    setClaudeSessionCache(new Map());
    db.close();
  });

  it('maps PostToolUse Write to file_change created with filePath', () => {
    const payload: HookPayload = {
      session_id: 'write-file-1',
      hook_event_name: 'PostToolUse',
      tool_name: 'Write',
      tool_input: { path: '/workspace/src/new-file.ts', content: 'export const x = 1' },
      cwd: '/workspace',
    };

    const result = parseHookPayload(payload);
    expect(result.requiresApproval).toBe(false);
    expect(result.event.type).toBe('file_change');
    if (result.event.type !== 'file_change') return;
    expect(result.event.filePath).toBe('/workspace/src/new-file.ts');
    expect(result.event.changeType).toBe('created');
  });

  it('maps PostToolUse Edit to file_change modified with filePath', () => {
    const payload: HookPayload = {
      session_id: 'edit-file-1',
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/workspace/src/existing.ts', old_string: 'a', new_string: 'b' },
      cwd: '/workspace',
    };

    const result = parseHookPayload(payload);
    expect(result.requiresApproval).toBe(false);
    expect(result.event.type).toBe('file_change');
    if (result.event.type !== 'file_change') return;
    expect(result.event.filePath).toBe('/workspace/src/existing.ts');
    expect(result.event.changeType).toBe('modified');
  });

  it('maps PostToolUse Update with file_path to file_change modified', () => {
    const payload: HookPayload = {
      session_id: 'update-file-1',
      hook_event_name: 'PostToolUse',
      tool_name: 'Update',
      tool_input: { file_path: '/workspace/src/update.ts', old_string: 'a', new_string: 'b' },
      cwd: '/workspace',
    };

    const result = parseHookPayload(payload);
    expect(result.requiresApproval).toBe(false);
    expect(result.event.type).toBe('file_change');
    if (result.event.type !== 'file_change') return;
    expect(result.event.filePath).toBe('/workspace/src/update.ts');
    expect(result.event.changeType).toBe('modified');
  });
});

describe('getOrCreateSessionId passthrough (pre-registered sessions)', () => {
  let db: BetterSqlite3.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
    setClaudeSessionDb(db);
    setClaudeSessionCache(new Map());
  });

  afterEach(() => {
    setClaudeSessionDb(null);
    setClaudeSessionCache(new Map());
    db.close();
  });

  it('returns pre-registered UUID unchanged when DB has mapping (launched session passthrough)', () => {
    // Simulate what ClaudeLauncher.launch() does: pre-register sessionId → sessionId
    const presetUuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    setClaudeSessionId(db, presetUuid, 'claude-hook-abc', '/workspace');

    // When hook arrives with 'claude-hook-abc', should return 'presetUuid' (not a new random UUID)
    const result = getOrCreateSessionId('claude-hook-abc', '/workspace', db, new Map());
    expect(result).toBe(presetUuid);
  });

  it('when sessionId === claudeSessionId (self-mapped launch), returns same UUID on first hook', () => {
    const launchedUuid = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    // ClaudeLauncher registers (session_id=launchedUuid, claude_id=launchedUuid)
    setClaudeSessionId(db, launchedUuid, launchedUuid, '/work');

    const result = getOrCreateSessionId(launchedUuid, '/work', db, new Map());
    expect(result).toBe(launchedUuid);
  });

  it('cold cache + cold DB generates a new UUID (Tier 3 unchanged)', () => {
    const result = getOrCreateSessionId('organic-session-x', '/ws', db, new Map());
    expect(result).toBeDefined();
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    // result must NOT equal the input (since input is not a UUID)
    expect(result).not.toBe('organic-session-x');
  });

  it('repeated calls for same claudeSessionId return the same UUID (idempotent)', () => {
    const cache = new Map<string, string>();
    const result1 = getOrCreateSessionId('stable-session', '/ws', db, cache);
    const result2 = getOrCreateSessionId('stable-session', '/ws', db, cache);
    const result3 = getOrCreateSessionId('stable-session', '/ws', db, cache);
    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });
});

describe('parseHookPayload subagent integrity under approval flows', () => {
  let db: BetterSqlite3.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
    setClaudeSessionDb(db);
    setClaudeSessionCache(new Map());
  });

  afterEach(() => {
    setClaudeSessionDb(null);
    setClaudeSessionCache(new Map());
    db.close();
  });

  it('SubagentStart and SubagentStop events preserve type and sessionId integrity alongside approval events', () => {
    // Register parent session first via SessionStart
    const parentPayload: HookPayload = {
      session_id: 'parent-appr-sess',
      hook_event_name: 'SessionStart',
      cwd: '/workspace',
    };
    const parentResult = parseHookPayload(parentPayload);
    const parentSessionId = parentResult.event.sessionId;

    // SubagentStart under same parent
    const subagentStartPayload: HookPayload = {
      session_id: 'parent-appr-sess',
      hook_event_name: 'SubagentStart',
      agent_id: 'sub-for-appr',
      cwd: '/workspace',
    };
    const subResult = parseHookPayload(subagentStartPayload);
    expect(subResult.event.type).toBe('subagent_spawn');

    // Approval PreToolUse (requires approval)
    const approvalPayload: HookPayload = {
      session_id: 'parent-appr-sess',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /tmp/important' },
      cwd: '/workspace',
    };
    const approvalResult = parseHookPayload(approvalPayload);
    expect(approvalResult.event.type).toBe('approval_request');
    expect(approvalResult.requiresApproval).toBe(true);

    // SubagentStop still maps correctly after approval event
    const subagentStopPayload: HookPayload = {
      session_id: 'parent-appr-sess',
      hook_event_name: 'SubagentStop',
      agent_id: 'sub-for-appr',
      cwd: '/workspace',
    };
    const subStopResult = parseHookPayload(subagentStopPayload);
    expect(subStopResult.event.type).toBe('subagent_complete');
    // SessionId must be consistent across all events
    expect(subStopResult.event.sessionId).toBe(parentSessionId);
  });
});
