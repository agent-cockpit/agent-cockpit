// Wave 0: failing stubs — implementations in plans 02 and 03
import { describe, it } from 'vitest';
import { parseCodexLine } from '../codexParser.js';

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

const malformedJsonFixture = '{ not valid json at all ~~~';

describe('parseCodexLine', () => {
  it.todo(
    'turn/started first call → returns session_start event with provider: codex'
  );

  it.todo(
    'turn/started subsequent call (same session) → returns null (no duplicate session_start)'
  );

  it.todo(
    'item/started with type commandExecution → returns tool_call event with toolName set to joined command'
  );

  it.todo(
    'item/started with type fileChange → returns file_change event with correct filePath'
  );

  it.todo(
    'item/commandExecution/requestApproval → returns approval_request event with actionType shell_command'
  );

  it.todo(
    'item/fileChange/requestApproval → returns approval_request event with actionType file_change'
  );

  it.todo(
    'turn/completed with status completed → returns session_end event'
  );

  it.todo(
    'malformed JSON string → returns provider_parse_error event (not thrown)'
  );
});

// Prevent TypeScript from complaining about unused imports until implementation exists
void parseCodexLine;
void turnStartedFixture;
void turnStartedFixture2;
void itemStartedCommandFixture;
void itemStartedFileChangeFixture;
void requestApprovalCommandFixture;
void requestApprovalFileChangeFixture;
void turnCompletedFixture;
void malformedJsonFixture;
