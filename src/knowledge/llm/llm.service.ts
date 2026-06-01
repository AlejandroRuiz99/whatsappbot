/**
 * Servicio de LLM (Large Language Model)
 * Orquesta múltiples proveedores: Groq, OpenAI, o sistema local sin IA
 */

import { config } from '../../config/env.js'
import { logger } from '../../observability/logger.js'
import {
  addUserMessage,
  addBotMessage,
  getConversationHistory
} from '../../conversation/store/memory.js'
import { recordMetric } from '../../observability/metrics.js'
import { type RAGResult } from '../rag/rag.service.js'

import {
  hasGroqKey,
  hasOpenAIKey,
  generateWithGroq,
  generateWithOpenAI,
  type ChatMessage
} from './providers.js'
import { generarRespuestaLocal } from './local.js'
import { buildSystemPrompt } from './prompt-builder.js'
import { getRAGContextWithCache } from './rag-cache.js'

/**
 * Limpia formato markdown que el LLM tiende a generar.
 * En WhatsApp el markdown se ve como texto roto, no como formato.
 */
function stripMarkdown(text: string): string {
  let clean = text

  // Headers: ### Título → Título
  clean = clean.replace(/^#{1,6}\s+/gm, '')

  // Bold: **texto** o __texto__ → texto
  clean = clean.replace(/\*\*(.*?)\*\*/g, '$1')
  clean = clean.replace(/__(.*?)__/g, '$1')

  // Italic: *texto* o _texto_ → texto
  clean = clean.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1')
  clean = clean.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1')

  // Inline code: `código` → código
  clean = clean.replace(/`([^`]+)`/g, '$1')

  // Code blocks: ```...``` → contenido
  clean = clean.replace(/```[\s\S]*?```/g, (match) => {
    return match.replace(/```\w*\n?/g, '').replace(/```/g, '').trim()
  })

  // Listas con viñetas: "- item" o "* item" al inicio de línea → sin viñeta
  clean = clean.replace(/^[\s]*[-*]\s+/gm, '')

  // Listas numeradas: "1. item" → sin número (solo si parece lista, no "30 días")
  clean = clean.replace(/^\s*\d+\.\s+/gm, '')

  // Líneas horizontales: --- o *** → nada
  clean = clean.replace(/^[-*_]{3,}\s*$/gm, '')

  // Limpiar líneas vacías excesivas (máximo 2 seguidas)
  clean = clean.replace(/\n{3,}/g, '\n\n')

  return clean.trim()
}

/**
 * Construir mensajes para el LLM con historial de conversación
 */
function buildMessages(
  systemPrompt: string,
  userMessage: string,
  phone?: string
): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt }
  ]

  if (phone) {
    const history = getConversationHistory(phone)
    const recentHistory = history.slice(-10)
    messages.push(...recentHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    })))
  }

  // Añadir el mensaje actual si no está ya como último mensaje de usuario
  const lastMsg = messages[messages.length - 1]
  if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== userMessage) {
    messages.push({ role: 'user', content: userMessage })
  }

  return messages
}

/**
 * Formatear marcadores de debug para sandbox
 */
function formatDebugMarkers(ragContext: RAGResult): string {
  let markers = '\n\n---\n🔍 DEBUG - Fuentes de información:\n'

  ragContext.chunks.forEach((chunk, i) => {
    const similarity = (chunk.similarity * 100).toFixed(1)
    markers += `\n📄 Fuente ${i + 1}: Basado en video (similitud ${similarity}%)\n`
    markers += `   ${chunk.video_url}\n`
  })

  if (ragContext.videos.length > 0) {
    markers += '\n📺 Videos relacionados recomendados:\n'
    ragContext.videos.forEach((video, i) => {
      const relevance = (video.relevance * 100).toFixed(1)
      markers += `   ${i + 1}. ${video.video_url} (${relevance}%)\n`
    })
  }

  return markers
}

/**
 * Log detallado de chunks RAG
 */
function logRAGChunks(ragContext: RAGResult, debugMode: boolean): void {
  ragContext.chunks.forEach((chunk, i) => {
    const similarity = (chunk.similarity * 100).toFixed(1)
    const preview = chunk.content.substring(0, 100).replace(/\n/g, ' ')
    logger.debug(`[RAG] 📄 Chunk ${i + 1}:`)
    logger.debug(`     Video ID: ${chunk.video_id}`)
    logger.debug(`     Similitud: ${similarity}%`)
    logger.debug(`     Topics: ${chunk.topics.join(', ') || 'N/A'}`)
    logger.debug(`     Preview: "${preview}..."`)
    if (debugMode) {
      logger.debug(`     URL: ${chunk.video_url}`)
    }
  })

  if (ragContext.shouldIncludeVideoLinks) {
    logger.debug(`[RAG] 📺 Incluirá ${ragContext.videos.length} videos en la respuesta`)
    ragContext.videos.forEach((video, i) => {
      logger.debug(`     Video ${i + 1}: ${video.video_url} (Relevancia: ${(video.relevance * 100).toFixed(1)}%)`)
    })
  }
}

/**
 * Intenta obtener respuesta de un proveedor LLM concreto.
 * Devuelve null si el proveedor falla o no está disponible.
 */
async function tryProvider(
  name: string,
  generateFn: (messages: ChatMessage[]) => Promise<string | null>,
  userMessage: string,
  phone: string | undefined,
  ragContext: RAGResult | undefined,
  debugMode: boolean
): Promise<string | null> {
  logger.info(`[LLM] Usando ${name}...`)
  const systemPrompt = buildSystemPrompt(userMessage, phone, ragContext)
  const messages = buildMessages(systemPrompt, userMessage, phone)
  const t0 = Date.now()
  const result = await generateFn(messages)
  const latency = Date.now() - t0
  if (result) recordMetric('llm:latency', latency)

  if (!result) return null

  logger.info(`[LLM] ✅ Respuesta generada con ${name}`)
  let response = stripMarkdown(result)

  if (debugMode && ragContext && ragContext.chunks.length > 0) {
    response += formatDebugMarkers(ragContext)
  }

  if (phone) {
    addBotMessage(phone, response)
  }

  return response
}

/**
 * Función principal: obtiene respuesta del LLM
 */
export async function getAIResponse(
  userMessage: string,
  phone?: string,
  options?: { debugMode?: boolean }
): Promise<string> {
  const debugMode = options?.debugMode || false

  // Guardar mensaje del usuario en memoria
  if (phone) {
    addUserMessage(phone, userMessage)
  }

  // Obtener contexto RAG si está disponible
  let ragContext: RAGResult | undefined
  let usedCache = false

  try {
    if (hasOpenAIKey && config.PINECONE_API_KEY) {
      logger.info('[RAG] Buscando contexto relevante...')
      recordMetric('rag:query')

      const result = await getRAGContextWithCache(userMessage, phone)
      ragContext = result.ragContext
      usedCache = result.usedCache

      if (ragContext.chunks.length > 0) {
        logger.info(`[RAG] ✅ Encontrados ${ragContext.chunks.length} chunks relevantes ${usedCache ? '(caché + búsqueda reducida)' : ''}`)
        logRAGChunks(ragContext, debugMode)
      } else {
        logger.info('[RAG] ❌ No se encontró contexto relevante, usando solo base de conocimiento estándar')
      }
    }
  } catch (error) {
    logger.warn('[RAG] ⚠️ Error obteniendo contexto RAG, continuando sin él:', error)
    ragContext = undefined
  }

  // 1. Groq (principal, más rápido)
  if (hasGroqKey) {
    const resp = await tryProvider('Groq (Llama 3)', generateWithGroq, userMessage, phone, ragContext, debugMode)
    if (resp) return resp
    logger.warn('[LLM] Groq falló, intentando alternativas...')
  }

  // 2. OpenAI (fallback)
  if (hasOpenAIKey) {
    const resp = await tryProvider('OpenAI', generateWithOpenAI, userMessage, phone, ragContext, debugMode)
    if (resp) return resp
    logger.warn('[LLM] OpenAI falló, usando sistema local')
  }

  // 3. Sistema local (fallback final)
  if (!hasGroqKey && !hasOpenAIKey) {
    logger.info('[LLM] Sin API keys configuradas, usando sistema local')
  }

  const response = generarRespuestaLocal(userMessage)

  if (phone) {
    addBotMessage(phone, response)
  }

  return response
}
