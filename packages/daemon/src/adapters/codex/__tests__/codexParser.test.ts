// Wave 1: full assertions — implementations in codexParser.ts and codexRiskClassifier.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { parseCodexLine, type CodexParserContext } from '../codexParser.js';
import { classifyCodexApproval } from '../codexRiskClassifier.js';

// Fixture JSONL strings for Codex app-server notification shapes
const turnStartedFixture = JSON.stringify({
  method: 'turn/started',
  params: { turn: { id: 'turn_1' } },
});

const turnStartedFixture2 = JSON.stringify({
  method: 'turn/started',
  params: { turn: { id: 'turn_2' } },
});

const itemStartedCommandFixture = JSON.stringify({
  method: 'item/started',
  params: {
    item: {
      type: 'commandExecution',
      id: 'item_1',
      command: ['bash', '-c', 'echo hello'],
    },
  },
});

const itemStartedFileChangeFixture = JSON.stringify({
  method: 'item/started',
  params: {
    item: {
      type: 'fileChange',
      id: 'item_2',
      path: '/workspace/src/index.ts',
    },
  },
});

const requestApprovalCommandFixture = JSON.stringify({
  method: 'item/commandExecution/requestApproval',
  id: 'req_1',
  params: {
    item: {
      type: 'commandExecution',
      id: 'item_1',
      command: ['rm', '-rf', '/tmp/test'],
    },
  },
});

const requestApprovalFileChangeFixture = JSON.stringify({
  method: 'item/fileChange/requestApproval',
  id: 'req_2',
  params: {
    item: {
      type: 'fileChange',
      id: 'item_3',
      path: '/workspace/src/app.ts',
    },
  },
});

const turnCompletedFixture = JSON.stringify({
  method: 'turn/completed',
  params: { turn: { id: 'turn_1', status: 'completed' } },
});

const itemCompletedAssistantFixture = JSON.stringify({
  method: 'item/completed',
  params: {
    item: {
      type: 'assistantMessage',
      id: 'item_assistant_1',
      content: [{ type: 'text', text: 'Hello from Codex' }],
    },
  },
});

const codexStreamErrorFixture = JSON.stringify({
  method: 'codex/event/stream_error',
  params: {
    msg: {
      type: 'stream_error',
      message: 'Reconnecting... 1/5',
    },
  },
});

const codexErrorFixture = JSON.stringify({
  method: 'error',
  params: {
    error: {
      message: 'stream disconnected before completion',
    },
  },
});

const malformedJsonFixture = '{ not valid json at all ~~~';

// Helper to create a fresh context for each test
function makeCtx(overrides: Partial<CodexParserContext> = {}): CodexParserContext {
  return {
    sessionId: '00000000-0000-0000-0000-000000000001',
    workspacePath: '/workspace',
    sessionStartEmitted: false,
    ...overrides,
  };
}

describe('parseCodexLine', () => {
  let ctx: CodexParserContext;

  beforeEach(() => {
    ctx = makeCtx();
  });

  it('turn/started first call → returns session_start event with provider: codex', () => {
    const event = parseCodexLine(turnStartedFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('session_start');
    expect((event as { type: string; provider: string }).provider).toBe('codex');
    expect((event as { type: string; workspacePath: string }).workspacePath).toBe('/workspace');
    expect(event!.sessionId).toBe(ctx.sessionId);
    expect(ctx.sessionStartEmitted).toBe(true);
  });

  it('turn/started subsequent call (same session) → returns null (no duplicate session_start)', () => {
    // First call — should emit
    parseCodexLine(turnStartedFixture, ctx);
    // Second call with sessionStartEmitted = true — should return null
    const event = parseCodexLine(turnStartedFixture2, ctx);
    expect(event).toBeNull();
  });

  it('item/started with type commandExecution → returns tool_call event with toolName set to joined command', () => {
    const event = parseCodexLine(itemStartedCommandFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('tool_call');
    expect((event as { type: string; toolName: string }).toolName).toBe('bash -c echo hello');
  });

  it('item/started with type fileChange → returns file_change event with correct filePath', () => {
    const event = parseCodexLine(itemStartedFileChangeFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('file_change');
    expect((event as { type: string; filePath: string }).filePath).toBe('/workspace/src/index.ts');
  });

  it('item/commandExecution/requestApproval → returns approval_request event with actionType shell_command', () => {
    const event = parseCodexLine(requestApprovalCommandFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('approval_request');
    expect((event as { type: string; actionType: string }).actionType).toBe('shell_command');
    expect((event as { type: string; riskLevel: string }).riskLevel).toBe('high');
    expect((event as { type: string; _codexServerId: unknown })._codexServerId).toBe('req_1');
  });

  it('item/fileChange/requestApproval → returns approval_request event with actionType file_change', () => {
    const event = parseCodexLine(requestApprovalFileChangeFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('approval_request');
    expect((event as { type: string; actionType: string }).actionType).toBe('file_change');
    expect((event as { type: string; _codexServerId: unknown })._codexServerId).toBe('req_2');
  });

  it('turn/completed with status completed → returns null (turn end is not session end)', () => {
    const event = parseCodexLine(turnCompletedFixture, ctx);
    expect(event).toBeNull();
  });

  it('item/completed assistantMessage → returns session_chat_message assistant event', () => {
    const event = parseCodexLine(itemCompletedAssistantFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('session_chat_message');
    expect((event as { role: string }).role).toBe('assistant');
    expect((event as { content: string }).content).toBe('Hello from Codex');
  });

  it('codex/event/stream_error → returns session_chat_error with reason', () => {
    const event = parseCodexLine(codexStreamErrorFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('session_chat_error');
    expect((event as { reasonCode: string }).reasonCode).toBe('CHAT_SEND_FAILED');
    expect((event as { reason: string }).reason).toBe('Reconnecting... 1/5');
  });

  it('error notification → returns session_chat_error with provider reason', () => {
    const event = parseCodexLine(codexErrorFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('session_chat_error');
    expect((event as { reason: string }).reason).toBe('stream disconnected before completion');
  });

  it('malformed JSON string → returns provider_parse_error event (not thrown)', () => {
    expect(() => {
      const event = parseCodexLine(malformedJsonFixture, ctx);
      expect(event).not.toBeNull();
      expect(event!.type).toBe('provider_parse_error');
      expect((event as { type: string; provider: string }).provider).toBe('codex');
      expect((event as { type: string; rawPayload: string }).rawPayload).toBe(malformedJsonFixture);
      expect((event as { type: string; errorMessage: string }).errorMessage).toBeTruthy();
    }).not.toThrow();
  });
});

describe('classifyCodexApproval', () => {
  it('commandExecution low-risk → shell_command medium', () => {
    const result = classifyCodexApproval('item/commandExecution/requestApproval', {
      item: { command: ['ls'] },
    });
    expect(result.actionType).toBe('shell_command');
    expect(result.riskLevel).toBe('medium');
    expect(result.proposedAction).toBe('ls');
  });

  it('commandExecution high-risk (rm) → shell_command high', () => {
    const result = classifyCodexApproval('item/commandExecution/requestApproval', {
      item: { command: ['rm', '-rf', '/tmp'] },
    });
    expect(result.actionType).toBe('shell_command');
    expect(result.riskLevel).toBe('high');
    expect(result.proposedAction).toBe('rm -rf /tmp');
  });

  it('fileChange → file_change medium with affectedPaths', () => {
    const result = classifyCodexApproval('item/fileChange/requestApproval', {
      item: { path: '/x.ts', changeType: 'modified' },
    });
    expect(result.actionType).toBe('file_change');
    expect(result.riskLevel).toBe('medium');
    expect(result.proposedAction).toBe('modify /x.ts');
    expect(result.affectedPaths).toEqual(['/x.ts']);
  });
});
