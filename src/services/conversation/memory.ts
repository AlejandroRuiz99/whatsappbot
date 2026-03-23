/**
 * Servicio de Memoria de Conversaciones
 * Almacena el historial de mensajes por usuario para dar contexto al LLM
 */

import { logger } from '../../utils/logger.js'
import { botConfig } from '../../config/bot-config.js'
import type { RetrievedChunk } from '../knowledgebase/rag/rag.service.js'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface RAGCache {
  chunks: RetrievedChunk[]
  query: string
  timestamp: number
}

interface Conversation {
  messages: Message[]
  lastActivity: number
  ragCache?: RAGCache
}

const { conversation: convConfig } = botConfig
const MAX_MESSAGES_PER_CONVERSATION = convConfig.maxMessagesPerConversation
const MAX_CONVERSATIONS = convConfig.maxConversations
const CONVERSATION_TTL = convConfig.ttlHours * 60 * 60 * 1000
const RAG_CACHE_TTL = convConfig.ragCacheTtlMinutes * 60 * 1000

// Almacén de conversaciones (en memoria)
const conversations = new Map<string, Conversation>()

// Intervalo de limpieza
let cleanupInterval: NodeJS.Timeout | null = null

/**
 * Normaliza el número de teléfono para usarlo como key
 */
function normalizePhone(phone: string): string {
  return phone.replace('@s.whatsapp.net', '').replace(/\D/g, '')
}

/**
 * Obtiene o crea una conversación
 */
function getOrCreateConversation(phone: string): Conversation {
  const key = normalizePhone(phone)

  if (!conversations.has(key)) {
    conversations.set(key, {
      messages: [],
      lastActivity: Date.now()
    })
  }

  return conversations.get(key)!
}

/**
 * Añade un mensaje del usuario al historial
 */
export function addUserMessage(phone: string, content: string): void {
  const conversation = getOrCreateConversation(phone)

  conversation.messages.push({
    role: 'user',
    content,
    timestamp: Date.now()
  })

  conversation.lastActivity = Date.now()

  if (conversation.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
    conversation.messages = conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION)
  }

  logger.debug(`[MEMORY] Usuario ${normalizePhone(phone)}: ${conversation.messages.length} mensajes en memoria`)
}

/**
 * Añade una respuesta del bot al historial
 */
export function addBotMessage(phone: string, content: string): void {
  const conversation = getOrCreateConversation(phone)

  conversation.messages.push({
    role: 'assistant',
    content,
    timestamp: Date.now()
  })

  conversation.lastActivity = Date.now()

  if (conversation.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
    conversation.messages = conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION)
  }
}

/**
 * Obtiene el historial de una conversación para el LLM
 */
export function getConversationHistory(phone: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  const key = normalizePhone(phone)
  const conversation = conversations.get(key)

  if (!conversation) {
    return []
  }

  return conversation.messages.map(m => ({
    role: m.role,
    content: m.content
  }))
}

/**
 * Obtiene un resumen del contexto para el system prompt
 */
export function getConversationContext(phone: string): string {
  const history = getConversationHistory(phone)

  if (history.length === 0) {
    return ''
  }

  // Excluir el mensaje actual (último del historial)
  const previousMessages = history.slice(0, -1)

  if (previousMessages.length === 0) {
    return ''
  }

  return `
Contexto de conversación previa:
${previousMessages.map((m, i) => {
  const timeAgo = i === previousMessages.length - 1 ? 'hace un momento' : 'anteriormente'
  return `${timeAgo} - ${m.role === 'user' ? 'el cliente dijo' : 'tú respondiste'}: "${m.content}"`
}).join('\n')}

Si es relevante, haz referencia natural a esto (ej: "como me comentaba...", "sobre lo que me preguntaba antes..."). Si no viene al caso, no lo menciones.`
}

/**
 * Limpia conversaciones inactivas y recorta por número máximo
 */
function cleanupOldConversations(): void {
  const now = Date.now()
  let cleaned = 0

  for (const [key, conversation] of conversations) {
    if (now - conversation.lastActivity > CONVERSATION_TTL) {
      conversations.delete(key)
      cleaned++
    }
  }

  if (conversations.size > MAX_CONVERSATIONS) {
    const sorted = [...conversations.entries()]
      .sort((a, b) => a[1].lastActivity - b[1].lastActivity)

    const toDelete = sorted.slice(0, conversations.size - MAX_CONVERSATIONS)
    for (const [key] of toDelete) {
      conversations.delete(key)
      cleaned++
    }
  }

  if (cleaned > 0) {
    logger.info(`[MEMORY] Limpiadas ${cleaned} conversaciones inactivas. Total: ${conversations.size}`)
  }
}

/**
 * Inicia el proceso de limpieza automática
 */
export function startMemoryCleanup(): void {
  if (cleanupInterval) return

  cleanupInterval = setInterval(cleanupOldConversations, convConfig.cleanupIntervalMinutes * 60 * 1000)
  logger.info('[MEMORY] Sistema de memoria iniciado')
}

/**
 * Guarda chunks RAG en la caché de conversación
 */
export function cacheRAGChunks(phone: string, chunks: RetrievedChunk[], query: string): void {
  const conversation = getOrCreateConversation(phone)

  conversation.ragCache = {
    chunks,
    query,
    timestamp: Date.now()
  }

  logger.debug(`[MEMORY] RAG cache guardado para ${normalizePhone(phone)}: ${chunks.length} chunks`)
}

/**
 * Obtiene chunks RAG cacheados si son recientes
 * @returns chunks cacheados o null si expiró o no existe
 */
export function getCachedRAGChunks(phone: string): RetrievedChunk[] | null {
  const key = normalizePhone(phone)
  const conversation = conversations.get(key)

  if (!conversation?.ragCache) {
    return null
  }

  const age = Date.now() - conversation.ragCache.timestamp

  if (age > RAG_CACHE_TTL) {
    conversation.ragCache = undefined
    logger.debug(`[MEMORY] RAG cache expirado para ${key}`)
    return null
  }

  logger.debug(`[MEMORY] RAG cache recuperado para ${key}: ${conversation.ragCache.chunks.length} chunks (edad: ${Math.round(age / 1000)}s)`)
  return conversation.ragCache.chunks
}

/**
 * Cuenta mensajes del usuario en la conversación actual
 */
export function getUserMessageCount(phone: string): number {
  const key = normalizePhone(phone)
  const conversation = conversations.get(key)
  if (!conversation) return 0
  return conversation.messages.filter(m => m.role === 'user').length
}

/**
 * Devuelve el total de caracteres que ha escrito el usuario.
 * Mejor métrica que el número de mensajes para saber cuánto ha contado sobre su problema.
 */
export function getUserTotalChars(phone: string): number {
  const key = normalizePhone(phone)
  const conversation = conversations.get(key)
  if (!conversation) return 0
  return conversation.messages
    .filter(m => m.role === 'user')
    .reduce((sum, m) => sum + m.content.length, 0)
}

// ─── Funciones para el panel de administración ───

export interface ConversationSummary {
  phone: string
  messageCount: number
  userMessageCount: number
  userChars: number
  lastActivity: number
  latestMessage: { role: 'user' | 'assistant'; content: string; timestamp: number } | null
}

/**
 * Lista todas las conversaciones activas ordenadas por última actividad (desc)
 */
export function listActiveConversations(): ConversationSummary[] {
  return [...conversations.entries()]
    .sort((a, b) => b[1].lastActivity - a[1].lastActivity)
    .map(([phone, conv]) => {
      const msgs = conv.messages
      return {
        phone,
        messageCount: msgs.length,
        userMessageCount: msgs.filter(m => m.role === 'user').length,
        userChars: msgs.filter(m => m.role === 'user').reduce((s, m) => s + m.content.length, 0),
        lastActivity: conv.lastActivity,
        latestMessage: msgs.length > 0 ? msgs[msgs.length - 1] : null,
      }
    })
}

/**
 * Devuelve el historial completo de una conversación con timestamps
 */
export function getConversationWithTimestamps(
  phone: string
): Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }> | null {
  const key = normalizePhone(phone)
  const conversation = conversations.get(key)
  if (!conversation) return null
  return conversation.messages.map(m => ({
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
  }))
}

/**
 * Elimina una conversación específica
 */
export function deleteConversation(phone: string): boolean {
  const key = normalizePhone(phone)
  return conversations.delete(key)
}
