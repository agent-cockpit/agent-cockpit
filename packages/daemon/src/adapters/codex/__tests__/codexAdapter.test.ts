// Wave 0: failing stubs — implementations in plans 02 and 03
import { describe, it } from 'vitest';
import { CodexAdapter } from '../codexAdapter.js';

describe('CodexAdapter', () => {
  it.todo(
    'approval reply: resolveApproval(approvalId, approve) writes { id: serverId, result: { decision: accept } } to stdin'
  );

  it.todo(
    'approval deny: resolveApproval(approvalId, deny) writes { id: serverId, result: { decision: decline } } to stdin'
  );

  it.todo(
    'session resume: if threadId exists in DB, calls thread/resume instead of thread/start'
  );

  it.todo(
    'process guard: resolveApproval is a no-op when process has exited (no EPIPE throw)'
  );
});

// Prevent TypeScript from complaining about unused imports until implementation exists
void CodexAdapter;
