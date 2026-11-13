import initSqlJs, { type Database } from 'sql.js'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'

export async function openStore(path: string) {
  const SQL = await initSqlJs()
  const db: Database = existsSync(path) ? new SQL.Database(readFileSync(path)) : new SQL.Database()
  db.run(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS event_types (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, durationMinutes INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY, eventTypeId TEXT NOT NULL REFERENCES event_types(id), startsAt INTEGER NOT NULL, endsAt INTEGER NOT NULL, guestName TEXT NOT NULL, guestEmail TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS bookings_interval ON bookings(startsAt, endsAt);`)
  const save = () => {
    if (path === ':memory:') return
    const temp = `${path}.tmp`
    writeFileSync(temp, Buffer.from(db.export()))
    renameSync(temp, path)
  }
  const query = (sql: string, ...args: (string | number)[]) => {
    const statement = db.prepare(sql)
    try {
      statement.bind(args)
      const result: Record<string, unknown>[] = []
      while (statement.step()) result.push(statement.getAsObject())
      return result
    } finally { statement.free() }
  }
  let inTransaction = false
  return {
    get: (sql: string, ...args: (string | number)[]) => query(sql, ...args)[0],
    all: query,
    run: (sql: string, ...args: (string | number)[]) => { db.run(sql, args); if (!inTransaction) save() },
    transaction: (action: () => boolean) => {
      db.run('BEGIN IMMEDIATE')
      inTransaction = true
      try { const result = action(); db.run('COMMIT'); save(); return result }
      catch (error) { db.run('ROLLBACK'); throw error }
      finally { inTransaction = false }
    },
    close: () => { save(); db.close() },
  }
}

export type Store = Awaited<ReturnType<typeof openStore>>
