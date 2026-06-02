/**
 * Servicio de Memoria de Conversaciones.
 *
 * Estructura (Phase 2):
 *  - `InMemoryStore`  → ConversationStore impl basado en un Map en proceso.
 *  - `activeStore`    → store activo. Por defecto es el InMemoryStore.
 *                       Factory (factory.ts) puede llamar setActiveStore()
 *                       para sustituirlo por SqliteConversationStore.
 *  - Free functions   → API legacy que los consumers (AI flow, admin, sandbox)
 *                       siguen usando. Ahora son thin wrappers sobre activeStore.
 *
 * Resultado: cambiar de in-memory a SQLite es UN SOLO setter; no hace falta
 * tocar llm.service.ts, prompt-builder.ts, rag-cache.ts, admin/index.ts, etc.
 */

import { logger } from '../../observability/logger.js'
import { botConfig } from '../../config/bot-config.js'
import type { RetrievedChunk } from '../../knowledge/rag/rag.service.js'
import type {
  ConversationStore,
  ConversationSummary,
  StoredMessage,
  Role,
} from './contract.js'

export type { ConversationSummary } from './contract.js'

interface Message {
  role: Role
  content: string
  timestamp: number
}

interface RAGCacheEntry {
  chunks: RetrievedChunk[]
  query: string
  timestamp: number
}

interface Conversation {
  messages: Message[]
  lastActivity: number
  ragCache?: RAGCacheEntry
}

const { conversation: convConfig } = botConfig
const MAX_MESSAGES_PER_CONVERSATION = convConfig.maxMessagesPerConversation
const MAX_CONVERSATIONS = convConfig.maxConversations
const CONVERSATION_TTL = convConfig.ttlHours * 60 * 60 * 1000
const RAG_CACHE_TTL = convConfig.ragCacheTtlMinutes * 60 * 1000

/**
 * Normaliza el número de teléfono para usarlo como key.
 * Si tras quitar el sufijo JID no quedan dígitos (caso sandbox_user),
 * devuelve el id sin sufijo en vez de cadena vacía — así los callers
 * con `if (phone)` no se saltan la persistencia.
 */
function normalizePhone(phone: string): string {
  const stripped = phone.replace('@s.whatsapp.net', '')
  const digits = stripped.replace(/\D/g, '')
  return digits || stripped
}

// ─── In-memory implementation ───

class InMemoryStore implements ConversationStore {
  private conversations = new Map<string, Conversation>()
  private cleanupInterval: NodeJS.Timeout | null = null

  private getOrCreate(phone: string): Conversation {
    const key = normalizePhone(phone)
    let conv = this.conversations.get(key)
    if (!conv) {
      conv = { messages: [], lastActivity: Date.now() }
      this.conversations.set(key, conv)
    }
    return conv
  }

  addUserMessage(phone: string, content: string): void {
    const conv = this.getOrCreate(phone)
    conv.messages.push({ role: 'user', content, timestamp: Date.now() })
    conv.lastActivity = Date.now()
    if (conv.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
      conv.messages = conv.messages.slice(-MAX_MESSAGES_PER_CONVERSATION)
    }
    logger.debug(
      `[MEMORY] Usuario ${normalizePhone(phone)}: ${conv.messages.length} mensajes en memoria`
    )
  }

  addBotMessage(phone: string, content: string): void {
    const conv = this.getOrCreate(phone)
    conv.messages.push({ role: 'assistant', content, timestamp: Date.now() })
    conv.lastActivity = Date.now()
    if (conv.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
      conv.messages = conv.messages.slice(-MAX_MESSAGES_PER_CONVERSATION)
    }
  }

  getHistory(phone: string): Array<{ role: Role; content: string }> {
    const key = normalizePhone(phone)
    const conv = this.conversations.get(key)
    if (!conv) return []
    return conv.messages.map((m) => ({ role: m.role, content: m.content }))
  }

  getHistoryWithTimestamps(phone: string): StoredMessage[] | null {
    const key = normalizePhone(phone)
    const conv = this.conversations.get(key)
    if (!conv) return null
    return conv.messages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }))
  }

  getUserMessageCount(phone: string): number {
    const key = normalizePhone(phone)
    const conv = this.conversations.get(key)
    if (!conv) return 0
    return conv.messages.filter((m) => m.role === 'user').length
  }

  getUserTotalChars(phone: string): number {
    const key = normalizePhone(phone)
    const conv = this.conversations.get(key)
    if (!conv) return 0
    return conv.messages
      .filter((m) => m.role === 'user')
      .reduce((s, m) => s + m.content.length, 0)
  }

  cacheRAGChunks(phone: string, chunks: RetrievedChunk[], query: string): void {
    const conv = this.getOrCreate(phone)
    conv.ragCache = { chunks, query, timestamp: Date.now() }
    logger.debug(
      `[MEMORY] RAG cache guardado para ${normalizePhone(phone)}: ${chunks.length} chunks`
    )
  }

  getCachedRAGChunks(phone: string): RetrievedChunk[] | null {
    const key = normalizePhone(phone)
    const conv = this.conversations.get(key)
    if (!conv?.ragCache) return null
    const age = Date.now() - conv.ragCache.timestamp
    if (age > RAG_CACHE_TTL) {
      conv.ragCache = undefined
      logger.debug(`[MEMORY] RAG cache expirado para ${key}`)
      return null
    }
    logger.debug(
      `[MEMORY] RAG cache recuperado para ${key}: ${conv.ragCache.chunks.length} chunks (edad: ${Math.round(age / 1000)}s)`
    )
    return conv.ragCache.chunks
  }

  list(): ConversationSummary[] {
    return [...this.conversations.entries()]
      .sort((a, b) => b[1].lastActivity - a[1].lastActivity)
      .map(([phone, conv]) => {
        const msgs = conv.messages
        return {
          phone,
          messageCount: msgs.length,
          userMessageCount: msgs.filter((m) => m.role === 'user').length,
          userChars: msgs
            .filter((m) => m.role === 'user')
            .reduce((s, m) => s + m.content.length, 0),
          lastActivity: conv.lastActivity,
          latestMessage: msgs.length > 0 ? msgs[msgs.length - 1] : null,
        }
      })
  }

  delete(phone: string): boolean {
    const key = normalizePhone(phone)
    return this.conversations.delete(key)
  }

  startCleanup(): void {
    if (this.cleanupInterval) return
    this.cleanupInterval = setInterval(
      () => this.cleanupOld(),
      convConfig.cleanupIntervalMinutes * 60 * 1000
    )
  }

  private cleanupOld(): void {
    const now = Date.now()
    let cleaned = 0
    for (const [key, conv] of this.conversations) {
      if (now - conv.lastActivity > CONVERSATION_TTL) {
        this.conversations.delete(key)
        cleaned++
      }
    }
    if (this.conversations.size > MAX_CONVERSATIONS) {
      const sorted = [...this.conversations.entries()].sort(
        (a, b) => a[1].lastActivity - b[1].lastActivity
      )
      for (const [key] of sorted.slice(
        0,
        this.conversations.size - MAX_CONVERSATIONS
      )) {
        this.conversations.delete(key)
        cleaned++
      }
    }
    if (cleaned > 0) {
      logger.info(
        `[MEMORY] Limpiadas ${cleaned} conversaciones inactivas. Total: ${this.conversations.size}`
      )
    }
  }
}

// ─── Singleton + delegation facade ───

const inMemoryStore = new InMemoryStore()
let activeStore: ConversationStore = inMemoryStore

/**
 * Swap the active store. Called by factory.ts when SQLite is enabled.
 * Idempotent and reversible (pass inMemoryStore back to revert).
 */
export function setActiveStore(store: ConversationStore): void {
  activeStore = store
}

/**
 * Read access to the underlying in-memory singleton — only used by tests /
 * the cleanup wiring below.
 */
export function getInMemoryStore(): InMemoryStore {
  return inMemoryStore
}

// ─── Legacy free-function API (delegates to activeStore) ───

export const addUserMessage = (phone: string, content: string): void =>
  activeStore.addUserMessage(phone, content)

export const addBotMessage = (phone: string, content: string): void =>
  activeStore.addBotMessage(phone, content)

export const getConversationHistory = (
  phone: string
): Array<{ role: Role; content: string }> => activeStore.getHistory(phone)

export const getUserMessageCount = (phone: string): number =>
  activeStore.getUserMessageCount(phone)

export const getUserTotalChars = (phone: string): number =>
  activeStore.getUserTotalChars(phone)

export const cacheRAGChunks = (
  phone: string,
  chunks: RetrievedChunk[],
  query: string
): void => activeStore.cacheRAGChunks(phone, chunks, query)

export const getCachedRAGChunks = (phone: string): RetrievedChunk[] | null =>
  activeStore.getCachedRAGChunks(phone)

export const listActiveConversations = (): ConversationSummary[] =>
  activeStore.list()

export const getConversationWithTimestamps = (
  phone: string
): StoredMessage[] | null => activeStore.getHistoryWithTimestamps(phone)

export const deleteConversation = (phone: string): boolean =>
  activeStore.delete(phone)

/**
 * Cleanup is in-memory-specific. SQLite has its own TTL strategy (see
 * SqliteConversationStore.cleanupStale). If the active store is the in-memory
 * one, schedule the periodic timer; otherwise no-op.
 */
export function startMemoryCleanup(): void {
  if (activeStore === inMemoryStore) {
    inMemoryStore.startCleanup()
  }
}

/**
 * Builds a Spanish-language summary of the prior conversation, ready for the
 * system prompt. Presentation helper, not a store primitive — kept here for
 * the historical callsite in prompt-builder.ts.
 */
export function getConversationContext(phone: string): string {
  const history = activeStore.getHistory(phone)
  if (history.length === 0) return ''

  const previousMessages = history.slice(0, -1)
  if (previousMessages.length === 0) return ''

  return `
Contexto de conversación previa:
${previousMessages
  .map((m, i) => {
    const timeAgo =
      i === previousMessages.length - 1 ? 'hace un momento' : 'anteriormente'
    return `${timeAgo} - ${m.role === 'user' ? 'el cliente dijo' : 'tú respondiste'}: "${m.content}"`
  })
  .join('\n')}

Si es relevante, haz referencia natural a esto (ej: "como me comentaba...", "sobre lo que me preguntaba antes..."). Si no viene al caso, no lo menciones.`
}
