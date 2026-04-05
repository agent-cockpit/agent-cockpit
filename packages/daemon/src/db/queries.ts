import type Database from 'better-sqlite3';
import type { NormalizedEvent } from '@cockpit/shared';

export function persistEvent(
  db: Database.Database,
  event: NormalizedEvent,
): NormalizedEvent & { sequenceNumber: number } {
  const stmt = db.prepare<{
    sessionId: string;
    type: string;
    schemaVersion: number;
    payload: string;
    timestamp: string;
  }>(`
    INSERT INTO events (session_id, type, schema_version, payload, timestamp)
    VALUES (@sessionId, @type, @schemaVersion, @payload, @timestamp)
  `);

  const result = stmt.run({
    sessionId: event.sessionId,
    type: event.type,
    schemaVersion: event.schemaVersion,
    payload: JSON.stringify(event),
    timestamp: event.timestamp,
  });

  const sequenceNumber = result.lastInsertRowid as number;
  return { ...event, sequenceNumber };
}

export function getEventsSince(
  db: Database.Database,
  lastSeenSequence: number,
): Array<NormalizedEvent & { sequenceNumber: number }> {
  const rows = db.prepare<[number], { payload: string; sequence_number: number }>(
    'SELECT payload, sequence_number FROM events WHERE sequence_number > ? ORDER BY sequence_number ASC'
  ).all(lastSeenSequence);

  return rows.map((row) => ({
    ...(JSON.parse(row.payload) as NormalizedEvent),
    sequenceNumber: row.sequence_number,
  }));
}
