/**
 * Servicio de Memoria de Conversaciones
 * Almacena el historial de mensajes por usuario para dar contexto al LLM
 */

import { logger } from '../../utils/logger.js'
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
  ragCache?: RAGCache  // Caché de chunks RAG recientes
  metadata?: {
    clientType?: 'existing' | 'potential'
    name?: string
  }
}

// Configuración
const MAX_MESSAGES_PER_CONVERSATION = 10  // Últimos 10 mensajes
const MAX_CONVERSATIONS = 1000            // Máximo 1000 conversaciones en memoria
const CONVERSATION_TTL = 24 * 60 * 60 * 1000  // 24 horas de inactividad
const RAG_CACHE_TTL = 10 * 60 * 1000      // 10 minutos de caché para RAG

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
  
  // Limitar número de mensajes
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
  
  // Limitar número de mensajes
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
  
  // Devolver solo role y content (sin timestamp) para el LLM
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
  
  // Crear resumen de la conversación anterior
  const previousMessages = history.slice(0, -1) // Excluir el mensaje actual
  
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
 * Guarda metadata del cliente
 */
export function setClientMetadata(phone: string, metadata: Conversation['metadata']): void {
  const conversation = getOrCreateConversation(phone)
  conversation.metadata = { ...conversation.metadata, ...metadata }
}

/**
 * Obtiene metadata del cliente
 */
export function getClientMetadata(phone: string): Conversation['metadata'] | undefined {
  const key = normalizePhone(phone)
  return conversations.get(key)?.metadata
}

/**
 * Limpia una conversación específica
 */
export function clearConversation(phone: string): void {
  const key = normalizePhone(phone)
  conversations.delete(key)
  logger.debug(`[MEMORY] Conversación ${key} eliminada`)
}

/**
 * Limpia conversaciones inactivas
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
  
  // Si hay demasiadas conversaciones, eliminar las más antiguas
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
  
  // Limpiar cada hora
  cleanupInterval = setInterval(cleanupOldConversations, 60 * 60 * 1000)
  logger.info('[MEMORY] Sistema de memoria iniciado')
}

/**
 * Detiene el proceso de limpieza
 */
export function stopMemoryCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }
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
    // Caché expirado
    conversation.ragCache = undefined
    logger.debug(`[MEMORY] RAG cache expirado para ${key}`)
    return null
  }
  
  logger.debug(`[MEMORY] RAG cache recuperado para ${key}: ${conversation.ragCache.chunks.length} chunks (edad: ${Math.round(age / 1000)}s)`)
  return conversation.ragCache.chunks
}

/**
 * Limpia la caché RAG de una conversación
 */
export function clearRAGCache(phone: string): void {
  const key = normalizePhone(phone)
  const conversation = conversations.get(key)
  
  if (conversation?.ragCache) {
    conversation.ragCache = undefined
    logger.debug(`[MEMORY] RAG cache limpiado para ${key}`)
  }
}

/**
 * Obtiene estadísticas de memoria
 */
export function getMemoryStats(): { 
  totalConversations: number
  totalMessages: number
  oldestConversation: number | null
  cachedRAG: number
} {
  let totalMessages = 0
  let oldestActivity = Infinity
  let cachedRAG = 0
  
  for (const conversation of conversations.values()) {
    totalMessages += conversation.messages.length
    if (conversation.lastActivity < oldestActivity) {
      oldestActivity = conversation.lastActivity
    }
    if (conversation.ragCache && Date.now() - conversation.ragCache.timestamp < RAG_CACHE_TTL) {
      cachedRAG++
    }
  }
  
  return {
    totalConversations: conversations.size,
    totalMessages,
    oldestConversation: oldestActivity === Infinity ? null : Date.now() - oldestActivity,
    cachedRAG
  }
}
