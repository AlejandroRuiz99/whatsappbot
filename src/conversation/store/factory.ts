/**
 * ConversationStore factory — initialises the active store at boot.
 *
 * Default (sandbox): InMemoryStore is already active in memory.ts. The factory
 * is a no-op unless SQLite is requested.
 *
 * Production (or when SQLITE_PATH is set): build SqliteConversationStore and
 * activate it via setActiveStore() so every legacy caller (memory.ts free
 * functions) transparently routes through SQLite.
 *
 * Idempotent: subsequent calls are no-ops.
 */

import { join } from 'node:path'
import { config } from '../../config/env.js'
import { setActiveStore } from './memory.js'
import { SqliteConversationStore } from './sqlite.js'
import { logger } from '../../observability/logger.js'

let initialized = false

function shouldUseSqlite(): boolean {
  if (process.env.SQLITE_PATH) return true
  return config.BOT_MODE === 'production'
}

function resolveDbPath(): string {
  if (process.env.SQLITE_PATH) return process.env.SQLITE_PATH
  return join(process.cwd(), 'data', 'conversations.db')
}

/**
 * Initialise the persistent store. Call once at boot, after env validation.
 * Safe to call multiple times — only the first call has effect.
 */
export function initConversationStore(): void {
  if (initialized) return
  initialized = true

  if (!shouldUseSqlite()) {
    logger.info('[STORE] In-memory store (sandbox default)')
    return
  }

  const dbPath = resolveDbPath()
  const sqlite = new SqliteConversationStore({ dbPath })
  setActiveStore(sqlite)
  logger.info(`[STORE] SQLite active at ${dbPath}`)
}
