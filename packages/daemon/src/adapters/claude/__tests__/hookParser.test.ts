import { describe, expect, it } from 'vitest';
import { parseHookPayload } from '../hookParser.js';

describe('parseHookPayload lifecycle events', () => {
  it('maps allowed PreToolUse hooks to tool_called', () => {
    const result = parseHookPayload({
      session_id: 'claude-session-pretool',
      hook_event_name: 'PreToolUse',
      cwd: '/workspace',
      tool_name: 'Read',
      tool_use_id: 'toolu_read',
      tool_input: { file_path: '/workspace/src/index.ts' },
    });

    expect(result.requiresApproval).toBe(false);
    expect(result.event.type).toBe('tool_called');
    expect((result.event as { toolName: string }).toolName).toBe('Read');
    expect((result.event as { input: Record<string, unknown> }).input.file_path).toBe('/workspace/src/index.ts');
    expect((result.event as { correlationId: string }).correlationId).toBe('toolu_read');
  });

  it('maps PostToolUse Bash hooks to command_completed with output and correlation', () => {
    const result = parseHookPayload({
      session_id: 'claude-session-1',
      hook_event_name: 'PostToolUse',
      cwd: '/workspace',
      tool_name: 'Bash',
      tool_use_id: 'toolu_1',
      tool_input: { command: 'pnpm test' },
      tool_response: 'tests passed',
      exit_code: 0,
    });

    expect(result.requiresApproval).toBe(false);
    expect(result.event.type).toBe('command_completed');
    expect((result.event as { command: string }).command).toBe('pnpm test');
    expect((result.event as { exitCode: number }).exitCode).toBe(0);
    expect((result.event as { stdoutExcerpt: string }).stdoutExcerpt).toBe('tests passed');
    expect((result.event as { correlationId: string }).correlationId).toBe('toolu_1');
  });

  it('stamps approval requests with provider correlation ids', () => {
    const result = parseHookPayload({
      session_id: 'claude-session-approval',
      hook_event_name: 'PreToolUse',
      cwd: '/workspace',
      tool_name: 'Bash',
      tool_use_id: 'toolu_approval',
      tool_input: { command: 'rm -rf /tmp/build' },
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.event.type).toBe('approval_request');
    expect((result.event as { correlationId: string }).correlationId).toBe('toolu_approval');
  });

  it('maps non-file PostToolUse hooks to tool_completed', () => {
    const result = parseHookPayload({
      session_id: 'claude-session-2',
      hook_event_name: 'PostToolUse',
      cwd: '/workspace',
      tool_name: 'Read',
      tool_use_id: 'toolu_2',
      tool_input: { file_path: '/workspace/src/index.ts' },
      tool_response: 'file contents',
      success: true,
    });

    expect(result.requiresApproval).toBe(false);
    expect(result.event.type).toBe('tool_completed');
    expect((result.event as { toolName: string }).toolName).toBe('Read');
    expect((result.event as { output: string }).output).toBe('file contents');
    expect((result.event as { success: boolean }).success).toBe(true);
    expect((result.event as { correlationId: string }).correlationId).toBe('toolu_2');
  });

  it('maps task/progress notifications to task_updated', () => {
    const result = parseHookPayload({
      session_id: 'claude-session-task',
      hook_event_name: 'Notification',
      cwd: '/workspace',
      notification_type: 'task_progress',
      message: 'Updated implementation plan',
    });

    expect(result.requiresApproval).toBe(false);
    expect(result.event.type).toBe('task_updated');
    expect((result.event as { status: string }).status).toBe('task_progress');
    expect((result.event as { summary: string }).summary).toBe('Updated implementation plan');
  });
});
