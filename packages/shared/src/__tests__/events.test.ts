import { describe, it, expect } from 'vitest';
import { NormalizedEventSchema } from '../index.js';
import { ZodError } from 'zod';

const validBase = {
  schemaVersion: 1 as const,
  sessionId: '123e4567-e89b-12d3-a456-426614174000',
  timestamp: new Date().toISOString(),
};

describe('NormalizedEventSchema', () => {
  describe('session_start', () => {
    it('parses a valid session_start event', () => {
      const result = NormalizedEventSchema.parse({
        ...validBase,
        type: 'session_start',
        provider: 'claude',
        workspacePath: '/home/user/project',
      });
      expect(result.type).toBe('session_start');
      expect(result.schemaVersion).toBe(1);
    });

    it('rejects session_start missing provider', () => {
      expect(() =>
        NormalizedEventSchema.parse({ ...validBase, type: 'session_start', workspacePath: '/x' })
      ).toThrow(ZodError);
    });
  });

  describe('base validation', () => {
    it('rejects event missing type', () => {
      expect(() =>
        NormalizedEventSchema.parse({ ...validBase })
      ).toThrow(ZodError);
    });

    it('rejects schemaVersion !== 1', () => {
      expect(() =>
        NormalizedEventSchema.parse({ ...validBase, schemaVersion: 2, type: 'session_start', provider: 'claude', workspacePath: '/x' })
      ).toThrow(ZodError);
    });

    it('sequenceNumber is optional (adapters omit it)', () => {
      const result = NormalizedEventSchema.parse({
        ...validBase,
        type: 'session_start',
        provider: 'claude',
        workspacePath: '/x',
      });
      expect(result.sequenceNumber).toBeUndefined();
    });
  });

  describe('tool_call', () => {
    it('parses a valid tool_call event', () => {
      const result = NormalizedEventSchema.parse({
        ...validBase,
        type: 'tool_call',
        toolName: 'Bash',
        input: { command: 'ls' },
      });
      expect(result.type).toBe('tool_call');
    });
  });

  describe('file_change', () => {
    it('parses a valid file_change event', () => {
      const result = NormalizedEventSchema.parse({
        ...validBase,
        type: 'file_change',
        filePath: '/src/main.ts',
        changeType: 'modified',
      });
      expect(result.type).toBe('file_change');
    });
  });

  describe('approval_request', () => {
    it('parses a valid approval_request event', () => {
      const result = NormalizedEventSchema.parse({
        ...validBase,
        type: 'approval_request',
        approvalId: '223e4567-e89b-12d3-a456-426614174001',
        actionType: 'shell_command',
        riskLevel: 'high',
        proposedAction: 'rm -rf /tmp/test',
      });
      expect(result.type).toBe('approval_request');
    });
  });
});
