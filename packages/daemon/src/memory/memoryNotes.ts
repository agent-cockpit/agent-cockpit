import type Database from 'better-sqlite3';
import crypto from 'node:crypto';

export interface MemoryNote {
  note_id: string;
  workspace: string;
  content: string;
  pinned: number;
  created_at: string;
}

export function insertNote(
  db: Database.Database,
  note: { noteId?: string; workspace: string; content: string; pinned?: boolean; createdAt?: string },
): MemoryNote {
  const noteId = note.noteId ?? crypto.randomUUID();
  const createdAt = note.createdAt ?? new Date().toISOString();
  const pinned = note.pinned !== false ? 1 : 0;
  db.prepare(
    'INSERT INTO memory_notes (note_id, workspace, content, pinned, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(noteId, note.workspace, note.content, pinned, createdAt);
  return { note_id: noteId, workspace: note.workspace, content: note.content, pinned, created_at: createdAt };
}

export function listNotes(db: Database.Database, workspace: string): MemoryNote[] {
  return db
    .prepare('SELECT * FROM memory_notes WHERE workspace = ? ORDER BY created_at DESC')
    .all(workspace) as MemoryNote[];
}

export function deleteNote(db: Database.Database, noteId: string): void {
  db.prepare('DELETE FROM memory_notes WHERE note_id = ?').run(noteId);
}
