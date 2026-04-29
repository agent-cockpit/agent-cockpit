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
      command: 'bash -c echo hello',
    },
  },
});

const itemCompletedCommandFixture = JSON.stringify({
  method: 'item/completed',
  params: {
    item: {
      type: 'commandExecution',
      id: 'item_1',
      command: 'bash -c echo hello',
      exitCode: 0,
      stdout: 'hello',
    },
  },
});

const itemStartedFileChangeFixture = JSON.stringify({
  method: 'item/started',
  params: {
    item: {
      type: 'fileChange',
      id: 'item_2',
      changes: [{ path: '/workspace/src/index.ts' }],
    },
  },
});

const itemStartedToolFixture = JSON.stringify({
  method: 'item/started',
  params: {
    item: {
      type: 'toolCall',
      id: 'tool_item_1',
      toolName: 'Read',
      input: { file_path: '/workspace/src/index.ts' },
    },
  },
});

const itemCompletedToolFixture = JSON.stringify({
  method: 'item/completed',
  params: {
    item: {
      type: 'toolCall',
      id: 'tool_item_1',
      toolName: 'Read',
      output: 'file contents',
      success: true,
    },
  },
});

const taskUpdatedFixture = JSON.stringify({
  method: 'task/updated',
  params: {
    task: {
      title: 'Implement lifecycle events',
      status: 'in_progress',
      summary: 'Added tool lifecycle parsing',
    },
  },
});

const requestApprovalCommandFixture = JSON.stringify({
  method: 'item/commandExecution/requestApproval',
  id: 'req_1',
  params: {
    command: 'rm -rf /tmp/test',
    cwd: '/workspace',
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

const threadTokenUsageUpdatedFixture = JSON.stringify({
  method: 'thread/tokenUsage/updated',
  params: {
    threadId: 'thr_1',
    turnId: 'turn_1',
    tokenUsage: {
      total: {
        totalTokens: 4200,
        inputTokens: 3200,
        cachedInputTokens: 600,
        outputTokens: 1000,
        reasoningOutputTokens: 220,
      },
      last: {
        totalTokens: 640,
        inputTokens: 512,
        cachedInputTokens: 96,
        outputTokens: 128,
        reasoningOutputTokens: 42,
      },
      modelContextWindow: 128000,
    },
  },
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

const agentMessageDeltaFixture = JSON.stringify({
  method: 'item/agentMessage/delta',
  params: {
    threadId: 'thr_1',
    turnId: 'turn_1',
    itemId: 'agent_item_1',
    delta: 'Hello ',
  },
});

const itemCompletedAgentMessageFixture = JSON.stringify({
  method: 'item/completed',
  params: {
    item: {
      type: 'agentMessage',
      id: 'agent_item_1',
      text: 'Hello from Codex',
    },
  },
});

const requestApprovalPermissionsFixture = JSON.stringify({
  method: 'item/permissions/requestApproval',
  id: 'req_perm_1',
  params: {
    reason: 'Need write access',
    permissions: {
      fileSystem: {
        write: ['/workspace/src'],
      },
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

  it('item/started with type commandExecution → returns command_started event with correlation id', () => {
    const event = parseCodexLine(itemStartedCommandFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('command_started');
    expect((event as { type: string; command: string }).command).toBe('bash -c echo hello');
    expect((event as { type: string; correlationId: string }).correlationId).toBe('item_1');
  });

  it('item/completed with type commandExecution → returns command_completed output', () => {
    const event = parseCodexLine(itemCompletedCommandFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('command_completed');
    expect((event as { type: string; command: string }).command).toBe('bash -c echo hello');
    expect((event as { type: string; exitCode: number }).exitCode).toBe(0);
    expect((event as { type: string; stdoutExcerpt: string }).stdoutExcerpt).toBe('hello');
  });

  it('item/started with type fileChange → returns file_change event with correct filePath', () => {
    const event = parseCodexLine(itemStartedFileChangeFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('file_change');
    expect((event as { type: string; filePath: string }).filePath).toBe('/workspace/src/index.ts');
    expect((event as { type: string; correlationId: string }).correlationId).toBe('item_2');
  });

  it('item/started with generic tool fields → returns tool_called', () => {
    const event = parseCodexLine(itemStartedToolFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('tool_called');
    expect((event as { type: string; toolName: string }).toolName).toBe('Read');
    expect((event as { type: string; correlationId: string }).correlationId).toBe('tool_item_1');
  });

  it('item/completed with generic tool fields → returns tool_completed', () => {
    const event = parseCodexLine(itemCompletedToolFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('tool_completed');
    expect((event as { type: string; toolName: string }).toolName).toBe('Read');
    expect((event as { type: string; output: string }).output).toBe('file contents');
    expect((event as { type: string; success: boolean }).success).toBe(true);
  });

  it('task/updated → returns task_updated', () => {
    const event = parseCodexLine(taskUpdatedFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('task_updated');
    expect((event as { type: string; taskTitle: string }).taskTitle).toBe('Implement lifecycle events');
    expect((event as { type: string; status: string }).status).toBe('in_progress');
    expect((event as { type: string; summary: string }).summary).toBe('Added tool lifecycle parsing');
  });

  it('item/commandExecution/requestApproval → returns approval_request event with actionType shell_command', () => {
    const event = parseCodexLine(requestApprovalCommandFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('approval_request');
    expect((event as { type: string; actionType: string }).actionType).toBe('shell_command');
    expect((event as { type: string; riskLevel: string }).riskLevel).toBe('high');
    expect((event as { type: string; correlationId: string }).correlationId).toBe('req_1');
    expect((event as { type: string; _codexServerId: unknown })._codexServerId).toBe('req_1');
  });

  it('item/fileChange/requestApproval → returns approval_request event with actionType file_change', () => {
    const event = parseCodexLine(requestApprovalFileChangeFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('approval_request');
    expect((event as { type: string; actionType: string }).actionType).toBe('file_change');
    expect((event as { type: string; correlationId: string }).correlationId).toBe('item_3');
    expect((event as { type: string; _codexServerId: unknown })._codexServerId).toBe('req_2');
  });

  it('item/permissions/requestApproval → returns approval_request event with actionType sandbox_escalation', () => {
    const event = parseCodexLine(requestApprovalPermissionsFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('approval_request');
    expect((event as { actionType: string }).actionType).toBe('sandbox_escalation');
    expect((event as { riskLevel: string }).riskLevel).toBe('high');
  });

  it('turn/completed with status completed → returns null (turn end is not session end)', () => {
    const event = parseCodexLine(turnCompletedFixture, ctx);
    expect(event).toBeNull();
  });

  it('thread/tokenUsage/updated emits session_usage with totals + context percent', () => {
    const event = parseCodexLine(threadTokenUsageUpdatedFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('session_usage');
    expect((event as { provider: string }).provider).toBe('codex');
    expect((event as { inputTokens: number }).inputTokens).toBe(3200);
    expect((event as { outputTokens: number }).outputTokens).toBe(1000);
    expect((event as { totalTokens: number }).totalTokens).toBe(4200);
    expect((event as { contextUsedTokens: number }).contextUsedTokens).toBe(512);
    expect((event as { contextWindowTokens: number }).contextWindowTokens).toBe(128000);
    expect((event as { contextPercent: number }).contextPercent).toBe(0);
  });

  it('item/completed assistantMessage → returns session_chat_message assistant event', () => {
    const event = parseCodexLine(itemCompletedAssistantFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('session_chat_message');
    expect((event as { role: string }).role).toBe('assistant');
    expect((event as { content: string }).content).toBe('Hello from Codex');
  });

  it('item/agentMessage/delta emits assistant chunks and suppresses duplicate completed item for same itemId', () => {
    const deltaEvent = parseCodexLine(agentMessageDeltaFixture, ctx);
    expect(deltaEvent).not.toBeNull();
    expect(deltaEvent!.type).toBe('session_chat_message');
    expect((deltaEvent as { role: string }).role).toBe('assistant');
    expect((deltaEvent as { content: string }).content).toBe('Hello ');

    const completedEvent = parseCodexLine(itemCompletedAgentMessageFixture, ctx);
    expect(completedEvent).toBeNull();
  });

  it('item/agentMessage/delta preserves whitespace-only chunks', () => {
    const whitespaceDeltaFixture = JSON.stringify({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thr_1',
        turnId: 'turn_1',
        itemId: 'agent_item_2',
        delta: ' ',
      },
    });
    const event = parseCodexLine(whitespaceDeltaFixture, ctx);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('session_chat_message');
    expect((event as { content: string }).content).toBe(' ');
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

  it('commandExecution read-only network (curl) → shell_command medium', () => {
    const result = classifyCodexApproval('item/commandExecution/requestApproval', {
      item: { command: ['curl', 'https://example.com'] },
    });
    expect(result.actionType).toBe('shell_command');
    expect(result.riskLevel).toBe('medium');
    expect(result.proposedAction).toBe('curl https://example.com');
  });

  it('commandExecution side-effect network (git push) → shell_command high', () => {
    const result = classifyCodexApproval('item/commandExecution/requestApproval', {
      item: { command: ['git', 'push', 'origin', 'main'] },
    });
    expect(result.actionType).toBe('shell_command');
    expect(result.riskLevel).toBe('high');
    expect(result.proposedAction).toBe('git push origin main');
  });

  it('fileChange → file_change medium with affectedPaths', () => {
    const result = classifyCodexApproval('item/fileChange/requestApproval', {
      item: { path: '/x.ts', changeType: 'modified' },
    });
    expect(result.actionType).toBe('file_change');
    expect(result.riskLevel).toBe('medium');
    expect(result.proposedAction).toContain('/x.ts');
    expect(result.affectedPaths).toEqual(['/x.ts']);
  });

  it('execCommandApproval command array → shell_command high for risky command', () => {
    const result = classifyCodexApproval('execCommandApproval', {
      command: ['git', 'push', 'origin', 'main'],
    });
    expect(result.actionType).toBe('shell_command');
    expect(result.riskLevel).toBe('high');
    expect(result.proposedAction).toBe('git push origin main');
  });

  it('permissions approval → sandbox_escalation high with paths', () => {
    const result = classifyCodexApproval('item/permissions/requestApproval', {
      reason: 'Need write access',
      permissions: {
        fileSystem: { write: ['/workspace/src'] },
      },
    });
    expect(result.actionType).toBe('sandbox_escalation');
    expect(result.riskLevel).toBe('high');
    expect(result.proposedAction).toBe('Need write access');
    expect(result.affectedPaths).toEqual(['/workspace/src']);
  });
});
