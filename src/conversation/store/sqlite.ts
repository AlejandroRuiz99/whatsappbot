/**
 * SqliteConversationStore — persistent ConversationStore impl (master prompt §4.4).
 *
 * Uses Node's built-in `node:sqlite` (Node ≥ 22.5). No native build deps.
 * Schema lives under migrations/NNNN-*.sql at the repo root; the migrator
 * is idempotent and tracks applied files in a `_migrations` table.
 *
 * Conversation history lives as a JSON array in the `messages` column —
 * matches the spec's "phone, messages JSON" shape and lets `getHistory`
 * stay a single row read for the LLM hot path.
 */

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { botConfig } from '../../config/bot-config.js'
import { logger } from '../../observability/logger.js'
import type {
  ConversationStore,
  ConversationSummary,
  StoredMessage,
  Role,
} from './contract.js'
import type { RetrievedChunk } from '../../knowledge/rag/rag.service.js'

interface DbRow {
  phone: string
  messages: string
  created_at: number
  last_activity: number
  rag_cache: string | null
}

interface RAGCacheBlob {
  chunks: RetrievedChunk[]
  query: string
  timestamp: number
}

export interface SqliteStoreOptions {
  dbPath: string
  migrationsDir?: string
}

export class SqliteConversationStore implements ConversationStore {
  private readonly db: DatabaseSync
  private readonly maxMessages: number
  private readonly ragCacheTtlMs: number

  constructor(opts: SqliteStoreOptions) {
    const dir = dirname(opts.dbPath)
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true })

    this.db = new DatabaseSync(opts.dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.db.exec('PRAGMA synchronous = NORMAL')

    this.applyMigrations(opts.migrationsDir ?? join(process.cwd(), 'migrations'))

    this.maxMessages = botConfig.conversation.maxMessagesPerConversation
    this.ragCacheTtlMs = botConfig.conversation.ragCacheTtlMinutes * 60 * 1000

    logger.info(`[STORE] SQLite store ready at ${opts.dbPath}`)
  }

  private applyMigrations(dir: string): void {
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied INTEGER NOT NULL)'
    )

    if (!existsSync(dir)) {
      logger.warn(`[STORE] migrations dir not found at ${dir} — schema may be incomplete`)
      return
    }

    const applied = new Set(
      (this.db.prepare('SELECT id FROM _migrations').all() as { id: string }[]).map((r) => r.id)
    )
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    let count = 0
    for (const file of files) {
      if (applied.has(file)) continue
      const sql = readFileSync(join(dir, file), 'utf-8')
      this.db.exec(sql)
      this.db
        .prepare('INSERT INTO _migrations (id, applied) VALUES (?, ?)')
        .run(file, Date.now())
      count++
      logger.info(`[STORE] applied migration ${file}`)
    }
    if (count === 0) logger.debug('[STORE] schema up to date')
  }

  private getRow(phone: string): DbRow | null {
    const row = this.db
      .prepare(
        'SELECT phone, messages, created_at, last_activity, rag_cache FROM conversations WHERE phone = ?'
      )
      .get(phone) as DbRow | undefined
    return row ?? null
  }

  private appendMessage(phone: string, msg: StoredMessage): void {
    const row = this.getRow(phone)
    const now = Date.now()
    if (!row) {
      this.db
        .prepare(
          'INSERT INTO conversations (phone, messages, created_at, last_activity) VALUES (?, ?, ?, ?)'
        )
        .run(phone, JSON.stringify([msg]), now, now)
      return
    }
    const messages = JSON.parse(row.messages) as StoredMessage[]
    messages.push(msg)
    if (messages.length > this.maxMessages) {
      messages.splice(0, messages.length - this.maxMessages)
    }
    this.db
      .prepare('UPDATE conversations SET messages = ?, last_activity = ? WHERE phone = ?')
      .run(JSON.stringify(messages), now, phone)
  }

  addUserMessage(phone: string, content: string): void {
    this.appendMessage(phone, { role: 'user', content, timestamp: Date.now() })
  }

  addBotMessage(phone: string, content: string): void {
    this.appendMessage(phone, { role: 'assistant', content, timestamp: Date.now() })
  }

  getHistory(phone: string): Array<{ role: Role; content: string }> {
    const row = this.getRow(phone)
    if (!row) return []
    const messages = JSON.parse(row.messages) as StoredMessage[]
    return messages.map((m) => ({ role: m.role, content: m.content }))
  }

  getHistoryWithTimestamps(phone: string): StoredMessage[] | null {
    const row = this.getRow(phone)
    if (!row) return null
    return JSON.parse(row.messages) as StoredMessage[]
  }

  getUserMessageCount(phone: string): number {
    const row = this.getRow(phone)
    if (!row) return 0
    return (JSON.parse(row.messages) as StoredMessage[]).filter((m) => m.role === 'user').length
  }

  getUserTotalChars(phone: string): number {
    const row = this.getRow(phone)
    if (!row) return 0
    return (JSON.parse(row.messages) as StoredMessage[])
      .filter((m) => m.role === 'user')
      .reduce((s, m) => s + m.content.length, 0)
  }

  cacheRAGChunks(phone: string, chunks: RetrievedChunk[], query: string): void {
    const blob: RAGCacheBlob = { chunks, query, timestamp: Date.now() }
    const row = this.getRow(phone)
    const now = Date.now()
    if (!row) {
      this.db
        .prepare(
          'INSERT INTO conversations (phone, messages, created_at, last_activity, rag_cache) VALUES (?, ?, ?, ?, ?)'
        )
        .run(phone, '[]', now, now, JSON.stringify(blob))
      return
    }
    this.db
      .prepare('UPDATE conversations SET rag_cache = ? WHERE phone = ?')
      .run(JSON.stringify(blob), phone)
  }

  getCachedRAGChunks(phone: string): RetrievedChunk[] | null {
    const row = this.getRow(phone)
    if (!row?.rag_cache) return null
    const blob = JSON.parse(row.rag_cache) as RAGCacheBlob
    if (Date.now() - blob.timestamp > this.ragCacheTtlMs) {
      this.db.prepare('UPDATE conversations SET rag_cache = NULL WHERE phone = ?').run(phone)
      return null
    }
    return blob.chunks
  }

  list(): ConversationSummary[] {
    const rows = this.db
      .prepare(
        'SELECT phone, messages, last_activity FROM conversations ORDER BY last_activity DESC'
      )
      .all() as Array<{ phone: string; messages: string; last_activity: number }>

    return rows.map((row) => {
      const messages = JSON.parse(row.messages) as StoredMessage[]
      const userMsgs = messages.filter((m) => m.role === 'user')
      return {
        phone: row.phone,
        messageCount: messages.length,
        userMessageCount: userMsgs.length,
        userChars: userMsgs.reduce((s, m) => s + m.content.length, 0),
        lastActivity: row.last_activity,
        latestMessage: messages.length > 0 ? messages[messages.length - 1] : null,
      }
    })
  }

  delete(phone: string): boolean {
    const result = this.db.prepare('DELETE FROM conversations WHERE phone = ?').run(phone)
    return (result.changes ?? 0) > 0
  }

  /**
   * Drops conversations whose `last_activity` is older than `ttlMs`.
   * Called by the periodic cleanup timer; idempotent.
   */
  cleanupStale(ttlMs: number): number {
    const cutoff = Date.now() - ttlMs
    const result = this.db
      .prepare('DELETE FROM conversations WHERE last_activity < ?')
      .run(cutoff)
    return Number(result.changes ?? 0)
  }

  close(): void {
    this.db.close()
  }
}
