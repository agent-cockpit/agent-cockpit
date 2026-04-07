import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase } from '../db/database.js';
import { insertNote, listNotes, deleteNote } from '../memory/memoryNotes.js';
import type Database from 'better-sqlite3';

let db: Database.Database;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('insertNote + listNotes round-trip', () => {
  it('inserts a note and retrieves it via listNotes', () => {
    const workspace = '/home/user/project';
    const note = insertNote(db, { workspace, content: 'Remember this' });

    expect(note.note_id).toBeTruthy();
    expect(note.workspace).toBe(workspace);
    expect(note.content).toBe('Remember this');
    expect(note.pinned).toBe(1);

    const notes = listNotes(db, workspace);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.note_id).toBe(note.note_id);
    expect(notes[0]!.content).toBe('Remember this');
  });

  it('uses provided noteId and createdAt', () => {
    const workspace = '/home/user/project';
    const createdAt = '2026-01-01T00:00:00.000Z';
    const note = insertNote(db, { noteId: 'fixed-id', workspace, content: 'Fixed', createdAt });

    expect(note.note_id).toBe('fixed-id');
    expect(note.created_at).toBe(createdAt);
  });

  it('sets pinned=0 when pinned:false is passed', () => {
    const note = insertNote(db, { workspace: '/w', content: 'Not pinned', pinned: false });
    expect(note.pinned).toBe(0);
  });

  it('listNotes returns notes ordered by created_at DESC', () => {
    const workspace = '/home/user/ordered';
    insertNote(db, { workspace, content: 'Older', createdAt: '2026-01-01T00:00:00.000Z' });
    insertNote(db, { workspace, content: 'Newer', createdAt: '2026-01-02T00:00:00.000Z' });

    const notes = listNotes(db, workspace);
    expect(notes).toHaveLength(2);
    expect(notes[0]!.content).toBe('Newer');
    expect(notes[1]!.content).toBe('Older');
  });

  it('listNotes returns empty array for unknown workspace', () => {
    const notes = listNotes(db, '/workspace/that/does/not/exist');
    expect(notes).toEqual([]);
  });
});

describe('deleteNote', () => {
  it('removes a note by noteId', () => {
    const workspace = '/home/user/project';
    const note = insertNote(db, { workspace, content: 'To delete' });

    deleteNote(db, note.note_id);

    const notes = listNotes(db, workspace);
    expect(notes).toHaveLength(0);
  });

  it('does not throw when noteId does not exist', () => {
    expect(() => deleteNote(db, 'non-existent-id')).not.toThrow();
  });
});
