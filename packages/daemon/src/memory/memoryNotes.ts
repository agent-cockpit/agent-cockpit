import type Database from 'better-sqlite3';
import crypto from 'node:crypto';

export type MemoryNoteCategory = 'commands' | 'architecture' | 'gotchas' | 'conventions' | 'other'
export type MemoryNoteScope = 'shared' | 'local'

const CATEGORIES: ReadonlySet<MemoryNoteCategory> = new Set([
  'commands',
  'architecture',
  'gotchas',
  'conventions',
  'other',
]);

const SCOPES: ReadonlySet<MemoryNoteScope> = new Set(['shared', 'local']);

function normalizeCategory(value: unknown): MemoryNoteCategory {
  if (typeof value !== 'string') return 'other';
  const lower = value.toLowerCase().trim();
  return CATEGORIES.has(lower as MemoryNoteCategory) ? (lower as MemoryNoteCategory) : 'other';
}

function normalizeScope(value: unknown): MemoryNoteScope {
  if (typeof value !== 'string') return 'local';
  const lower = value.toLowerCase().trim();
  return SCOPES.has(lower as MemoryNoteScope) ? (lower as MemoryNoteScope) : 'local';
}

export interface MemoryNote {
  note_id: string;
  workspace: string;
  content: string;
  pinned: number;
  created_at: string;
  category: MemoryNoteCategory;
  scope: MemoryNoteScope;
}

export function insertNote(
  db: Database.Database,
  note: {
    noteId?: string;
    workspace: string;
    content: string;
    pinned?: boolean;
    createdAt?: string;
    category?: string;
    scope?: string;
  },
): MemoryNote {
  const noteId = note.noteId ?? crypto.randomUUID();
  const createdAt = note.createdAt ?? new Date().toISOString();
  const pinned = note.pinned !== false ? 1 : 0;
  const category = normalizeCategory(note.category);
  const scope = normalizeScope(note.scope);
  db.prepare(
    'INSERT INTO memory_notes (note_id, workspace, content, pinned, created_at, category, scope) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(noteId, note.workspace, note.content, pinned, createdAt, category, scope);
  return {
    note_id: noteId,
    workspace: note.workspace,
    content: note.content,
    pinned,
    created_at: createdAt,
    category,
    scope,
  };
}

export function listNotes(db: Database.Database, workspace: string): MemoryNote[] {
  const rows = db
    .prepare('SELECT * FROM memory_notes WHERE workspace = ? ORDER BY created_at DESC')
    .all(workspace) as Array<MemoryNote & { category?: unknown; scope?: unknown }>;
  return rows.map((row) => ({
    ...row,
    category: normalizeCategory(row.category),
    scope: normalizeScope(row.scope),
  }));
}

export function deleteNote(db: Database.Database, noteId: string): void {
  db.prepare('DELETE FROM memory_notes WHERE note_id = ?').run(noteId);
}
