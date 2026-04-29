import { z } from 'zod';

// ─── Base ─────────────────────────────────────────────────────────────────────

export const BaseEvent = z.object({
  schemaVersion: z.literal(1),
  sequenceNumber: z.number().int().positive().optional(), // assigned by SQLite rowid on insert
  sessionId: z.string().uuid(),
  timestamp: z.string().datetime(),
  parentEventId: z.number().int().positive().optional(),
  correlationId: z.string().optional(),
  projectId: z.string().optional(),
});

// ─── Session lifecycle ────────────────────────────────────────────────────────

export const SessionStartEvent = BaseEvent.extend({
  type: z.literal('session_start'),
  provider: z.enum(['claude', 'codex']),
  workspacePath: z.string(),
  managedByDaemon: z.boolean().optional(),
  canSendMessage: z.boolean().optional(),
  canTerminateSession: z.boolean().optional(),
  reason: z.string().optional(),
  branch: z.string().optional(),
  taskTitle: z.string().optional(),
});

export const SessionEndEvent = BaseEvent.extend({
  type: z.literal('session_end'),
  provider: z.enum(['claude', 'codex']),
  exitCode: z.number().int().optional(),
  failureReason: z.string().optional(),
});

export const SessionResumedEvent = BaseEvent.extend({
  type: z.literal('session_resumed'),
  provider: z.enum(['claude', 'codex']),
  resumedFromSessionId: z.string().uuid().optional(),
  resumeSource: z.enum(['codex_thread', 'codex_fresh_thread', 'claude_continue', 'launch', 'unknown']).optional(),
  workspacePath: z.string().optional(),
  branch: z.string().optional(),
  lastPrompt: z.string().optional(),
  providerThreadId: z.string().optional(),
});

export const TaskCreatedEvent = BaseEvent.extend({
  type: z.literal('task_created'),
  taskTitle: z.string().optional(),
  prompt: z.string().optional(),
  branch: z.string().optional(),
  workspacePath: z.string().optional(),
});

export const TaskUpdatedEvent = BaseEvent.extend({
  type: z.literal('task_updated'),
  taskTitle: z.string().optional(),
  status: z.string().optional(),
  summary: z.string().optional(),
  prompt: z.string().optional(),
});

export const CommandStartedEvent = BaseEvent.extend({
  type: z.literal('command_started'),
  command: z.string(),
  cwd: z.string().optional(),
});

export const CommandCompletedEvent = BaseEvent.extend({
  type: z.literal('command_completed'),
  command: z.string(),
  exitCode: z.number().int().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  stdoutExcerpt: z.string().optional(),
  stderrExcerpt: z.string().optional(),
});

export const ToolCompletedEvent = BaseEvent.extend({
  type: z.literal('tool_completed'),
  toolName: z.string(),
  output: z.unknown().optional(),
  success: z.boolean().optional(),
  durationMs: z.number().int().nonnegative().optional(),
});

// ─── Tool use ─────────────────────────────────────────────────────────────────

export const ToolCallEvent = BaseEvent.extend({
  type: z.literal('tool_call'),
  toolName: z.string(),
  input: z.unknown(),
});

export const ToolCalledEvent = BaseEvent.extend({
  type: z.literal('tool_called'),
  toolName: z.string(),
  input: z.unknown(),
});

// ─── File changes ─────────────────────────────────────────────────────────────

export const FileChangeEvent = BaseEvent.extend({
  type: z.literal('file_change'),
  filePath: z.string(),
  changeType: z.enum(['created', 'modified', 'deleted']),
  diff: z.string().optional(),
});

// ─── Approvals ────────────────────────────────────────────────────────────────

export const ApprovalRequestEvent = BaseEvent.extend({
  type: z.literal('approval_request'),
  approvalId: z.string().uuid(),
  actionType: z.enum(['shell_command', 'file_change', 'network_access', 'sandbox_escalation', 'mcp_tool_call', 'user_input']),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  proposedAction: z.string(),
  affectedPaths: z.array(z.string()).optional(),
  whyRisky: z.string().optional(),
});

export const ApprovalResolvedEvent = BaseEvent.extend({
  type: z.literal('approval_resolved'),
  approvalId: z.string().uuid(),
  decision: z.enum(['approved', 'denied', 'always_allow', 'timeout']),
});

// ─── Subagent events ──────────────────────────────────────────────────────────

export const SubagentSpawnEvent = BaseEvent.extend({
  type: z.literal('subagent_spawn'),
  subagentSessionId: z.string().uuid(),
});

export const SubagentCompleteEvent = BaseEvent.extend({
  type: z.literal('subagent_complete'),
  subagentSessionId: z.string().uuid(),
  success: z.boolean(),
});

// ─── Memory events ────────────────────────────────────────────────────────────

export const MemoryReadEvent = BaseEvent.extend({
  type: z.literal('memory_read'),
  memoryKey: z.string(),
});

export const MemoryWriteEvent = BaseEvent.extend({
  type: z.literal('memory_write'),
  memoryKey: z.string(),
  value: z.string(),
  suggested: z.boolean().default(false),
});

// ─── Session usage telemetry ────────────────────────────────────────────────

export const SessionUsageEvent = BaseEvent.extend({
  type: z.literal('session_usage'),
  provider: z.enum(['claude', 'codex']),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  reasoningOutputTokens: z.number().int().nonnegative().optional(),
  contextUsedTokens: z.number().int().nonnegative().optional(),
  contextWindowTokens: z.number().int().positive().optional(),
  contextPercent: z.number().min(0).max(100).optional(),
  model: z.string().optional(),
});

// ─── Provider parse error ─────────────────────────────────────────────────────

export const ProviderParseErrorEvent = BaseEvent.extend({
  type: z.literal('provider_parse_error'),
  provider: z.enum(['claude', 'codex']),
  rawPayload: z.string(),
  errorMessage: z.string(),
});

// ─── Session chat events ─────────────────────────────────────────────────────

export const SessionChatMessageEvent = BaseEvent.extend({
  type: z.literal('session_chat_message'),
  provider: z.enum(['claude', 'codex']),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
});

export const SessionChatErrorEvent = BaseEvent.extend({
  type: z.literal('session_chat_error'),
  provider: z.enum(['claude', 'codex']),
  reasonCode: z.enum([
    'CHAT_INVALID_REQUEST',
    'CHAT_SEND_BLOCKED',
    'CHAT_RUNTIME_UNAVAILABLE',
    'CHAT_SEND_FAILED',
    'RESUME_ROLLOUT_MISSING',
  ]),
  reason: z.string(),
});

// ─── Union ────────────────────────────────────────────────────────────────────

export const NormalizedEventSchema = z.discriminatedUnion('type', [
  SessionStartEvent,
  SessionEndEvent,
  SessionResumedEvent,
  TaskCreatedEvent,
  TaskUpdatedEvent,
  CommandStartedEvent,
  CommandCompletedEvent,
  ToolCallEvent,
  ToolCalledEvent,
  ToolCompletedEvent,
  FileChangeEvent,
  ApprovalRequestEvent,
  ApprovalResolvedEvent,
  SubagentSpawnEvent,
  SubagentCompleteEvent,
  MemoryReadEvent,
  MemoryWriteEvent,
  SessionUsageEvent,
  ProviderParseErrorEvent,
  SessionChatMessageEvent,
  SessionChatErrorEvent,
]);

export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;
