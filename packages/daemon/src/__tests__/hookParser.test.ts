import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase } from '../db/database.js';
import type { Database } from 'better-sqlite3';

// Placeholder imports - these will fail initially as signature changes in Plan 02
import { parseHookPayload } from '../adapters/claude/hookParser.js';
import type { HookPayload } from '../adapters/claude/hookParser.js';

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
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('Same claude_id maps to same UUID across multiple parseHookPayload calls (cache hit)', () => {
    const payload = makeSessionStart({ session_id: 'test-session-1' });

    // Note: parseHookPayload signature will change in Plan 02 to accept db and cache
    // This test will fail until Plan 02 is complete
    const result1 = parseHookPayload(payload);
    const result2 = parseHookPayload(payload);

    expect(result1.event.sessionId).toBeDefined();
    expect(result1.event.sessionId).toBe(result2.event.sessionId);
  });

  it('After clearing cache, claude_id still maps to same UUID (database hit)', () => {
    const payload = makeSessionStart({ session_id: 'test-session-db' });

    // Get initial sessionId
    const result1 = parseHookPayload(payload);
    const originalSessionId = result1.event.sessionId;
    expect(originalSessionId).toBeDefined();

    // Simulate cache clear - will need to add cache clearing helper in Plan 02
    // This test will fail until Plan 02 is complete
    // clearSessionCache(); // to be implemented

    // Call again with same claude_id - should get same UUID from database
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
    // This will fail until table is created in Plan 01
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
    expect(result.event.subagentSessionId).toBeDefined();

    // Verify claude_sessions row has correct workspace
    // Note: This will fail until subagent session mapping is implemented in Plan 02
    const row = db.prepare(
      'SELECT workspace FROM claude_sessions WHERE claude_id = ?'
    ).get('subagent-2') as { workspace: string } | undefined;
    expect(row?.workspace).toBe('/test/subagent-workspace');
  });
});
