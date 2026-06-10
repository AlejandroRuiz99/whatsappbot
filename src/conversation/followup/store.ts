/**
 * FollowUpStore — persistencia del recontacto programado (MEJORAS BOT 2026-06).
 *
 * Misma política que el ConversationStore (factory.ts): SQLite cuando
 * BOT_MODE=production o SQLITE_PATH está definido; memoria en sandbox.
 * El esquema vive en migrations/0002_followups.sql (lo aplica el migrador
 * del conversation store); el impl SQLite hace CREATE IF NOT EXISTS como
 * cinturón por si se abre con una base nueva.
 */

import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { config } from '../../config/env.js'
import { logger } from '../../observability/logger.js'

export interface FollowUpRecord {
  phone: string
  dueAt: number
  kind: string
  context: string
  createdAt: number
  attempts: number
}

export interface FollowUpStore {
  upsert(record: FollowUpRecord): void
  cancel(phone: string): void
  listDue(now: number): FollowUpRecord[]
  remove(phone: string): void
  bumpAttempts(phone: string): number
}

class InMemoryFollowUpStore implements FollowUpStore {
  private readonly map = new Map<string, FollowUpRecord>()

  upsert(record: FollowUpRecord): void {
    this.map.set(record.phone, { ...record })
  }

  cancel(phone: string): void {
    this.map.delete(phone)
  }

  listDue(now: number): FollowUpRecord[] {
    return [...this.map.values()].filter((f) => f.dueAt <= now)
  }

  remove(phone: string): void {
    this.map.delete(phone)
  }

  bumpAttempts(phone: string): number {
    const rec = this.map.get(phone)
    if (!rec) return 0
    rec.attempts += 1
    return rec.attempts
  }
}

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS followups (
  phone TEXT PRIMARY KEY,
  due_at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  context TEXT,
  created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_followups_due_at ON followups (due_at);
`

interface FollowUpRow {
  phone: string
  due_at: number
  kind: string
  context: string | null
  created_at: number
  attempts: number
}

class SqliteFollowUpStore implements FollowUpStore {
  private readonly db: DatabaseSync

  constructor(dbPath: string) {
    const dir = dirname(dbPath)
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new DatabaseSync(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA busy_timeout = 5000')
    this.db.exec(CREATE_SQL)
    logger.info(`[FOLLOWUP] SQLite store ready at ${dbPath}`)
  }

  upsert(record: FollowUpRecord): void {
    this.db
      .prepare(
        `INSERT INTO followups (phone, due_at, kind, context, created_at, attempts)
         VALUES (?, ?, ?, ?, ?, 0)
         ON CONFLICT(phone) DO UPDATE SET
           due_at = excluded.due_at,
           kind = excluded.kind,
           context = excluded.context,
           created_at = excluded.created_at,
           attempts = 0`
      )
      .run(record.phone, record.dueAt, record.kind, record.context, record.createdAt)
  }

  cancel(phone: string): void {
    this.db.prepare('DELETE FROM followups WHERE phone = ?').run(phone)
  }

  listDue(now: number): FollowUpRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM followups WHERE due_at <= ?')
      .all(now) as unknown as FollowUpRow[]
    return rows.map((r) => ({
      phone: r.phone,
      dueAt: r.due_at,
      kind: r.kind,
      context: r.context ?? '',
      createdAt: r.created_at,
      attempts: r.attempts,
    }))
  }

  remove(phone: string): void {
    this.db.prepare('DELETE FROM followups WHERE phone = ?').run(phone)
  }

  bumpAttempts(phone: string): number {
    this.db.prepare('UPDATE followups SET attempts = attempts + 1 WHERE phone = ?').run(phone)
    const row = this.db
      .prepare('SELECT attempts FROM followups WHERE phone = ?')
      .get(phone) as { attempts: number } | undefined
    return row?.attempts ?? 0
  }
}

let activeStore: FollowUpStore | null = null

function shouldUseSqlite(): boolean {
  if (process.env.SQLITE_PATH) return true
  return config.BOT_MODE === 'production'
}

function resolveDbPath(): string {
  if (process.env.SQLITE_PATH) return process.env.SQLITE_PATH
  return join(process.cwd(), 'data', 'conversations.db')
}

/**
 * Inicializa el store de follow-ups. Llamar una vez al arranque, después de
 * initConversationStore() (para que la migración 0002 ya esté aplicada).
 */
export function initFollowUpStore(): void {
  if (activeStore) return
  if (shouldUseSqlite()) {
    activeStore = new SqliteFollowUpStore(resolveDbPath())
  } else {
    activeStore = new InMemoryFollowUpStore()
    logger.info('[FOLLOWUP] In-memory store (sandbox default)')
  }
}

export function getFollowUpStore(): FollowUpStore {
  if (!activeStore) initFollowUpStore()
  return activeStore!
}
