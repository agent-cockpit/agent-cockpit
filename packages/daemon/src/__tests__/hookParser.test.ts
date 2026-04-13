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
