/**
 * Servicio de LLM (Large Language Model)
 * Orquesta múltiples proveedores: Groq, OpenAI, o sistema local sin IA
 */

import { config } from '../../../config/env.js'
import { logger } from '../../../utils/logger.js'
import { 
  addUserMessage, 
  addBotMessage, 
  getConversationHistory
} from '../../conversation/memory.js'
import { type RAGResult } from '../rag/rag.service.js'

// Módulos internos
import { 
  hasGroqKey, 
  hasOpenAIKey, 
  generateWithGroq, 
  generateWithOpenAI,
  getLLMStatus,
  type ChatMessage
} from './providers.js'
import { generarRespuestaLocal } from './local.js'
import { buildSystemPrompt } from './prompt-builder.js'
import { getRAGContextWithCache } from './rag-cache.js'

// Re-exportar para compatibilidad
export { getLLMStatus } from './providers.js'
export { buscarServicios, SERVICIOS, CATEGORIAS } from '../services-catalog/catalog.data.js'

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
  
  // Añadir historial de conversación (últimos 10 mensajes)
  if (phone) {
    const history = getConversationHistory(phone)
    const recentHistory = history.slice(-10)
    messages.push(...recentHistory.map(m => ({ 
      role: m.role as 'user' | 'assistant', 
      content: m.content 
    })))
  }
  
  // Si el último mensaje del historial no es el actual, añadirlo
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
    markers += `\n📄 Fuente ${i+1}: Basado en video (similitud ${similarity}%)\n`
    markers += `   ${chunk.video_url}\n`
  })
  
  if (ragContext.videos.length > 0) {
    markers += '\n📺 Videos relacionados recomendados:\n'
    ragContext.videos.forEach((video, i) => {
      const relevance = (video.relevance * 100).toFixed(1)
      markers += `   ${i+1}. ${video.video_url} (${relevance}%)\n`
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
    logger.debug(`[RAG] 📄 Chunk ${i+1}:`)
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
      logger.debug(`     Video ${i+1}: ${video.video_url} (Relevancia: ${(video.relevance * 100).toFixed(1)}%)`)
    })
  }
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
      
      const result = await getRAGContextWithCache(userMessage, phone)
      ragContext = result.ragContext
      usedCache = result.usedCache
      
      if (ragContext.chunks.length > 0) {
        logger.info(`[RAG] ✅ Encontrados ${ragContext.chunks.length} chunks relevantes ${usedCache ? '(usando caché + nueva búsqueda)' : ''}`)
        logRAGChunks(ragContext, debugMode)
      } else {
        logger.info('[RAG] ❌ No se encontró contexto relevante, usando solo base de conocimiento estándar')
      }
    }
  } catch (error) {
    logger.warn('[RAG] ⚠️ Error obteniendo contexto RAG, continuando sin él:', error)
    ragContext = undefined
  }
  
  let response: string
  
  // 1. Primero intentar con Groq (más rápido y gratis)
  if (hasGroqKey) {
    logger.info('[LLM] Usando Groq (Llama 3)...')
    const systemPrompt = buildSystemPrompt(userMessage, phone, ragContext)
    const messages = buildMessages(systemPrompt, userMessage, phone)
    const respuestaGroq = await generateWithGroq(messages)
    
    if (respuestaGroq) {
      logger.info('[LLM] ✅ Respuesta generada con Groq')
      response = respuestaGroq
      
      if (debugMode && ragContext && ragContext.chunks.length > 0) {
        response += formatDebugMarkers(ragContext)
      }
      
      if (phone) {
        addBotMessage(phone, response)
      }
      return response
    }
    logger.warn('[LLM] Groq falló, intentando alternativas...')
  }
  
  // 2. Fallback: intentar con OpenAI si está configurado
  if (hasOpenAIKey) {
    logger.info('[LLM] Usando OpenAI...')
    const systemPrompt = buildSystemPrompt(userMessage, phone, ragContext)
    const messages = buildMessages(systemPrompt, userMessage, phone)
    const respuestaOpenAI = await generateWithOpenAI(messages)
    
    if (respuestaOpenAI) {
      logger.info('[LLM] ✅ Respuesta generada con OpenAI')
      response = respuestaOpenAI
      
      if (debugMode && ragContext && ragContext.chunks.length > 0) {
        response += formatDebugMarkers(ragContext)
      }
      
      if (phone) {
        addBotMessage(phone, response)
      }
      return response
    }
    logger.warn('[LLM] OpenAI falló, usando sistema local')
  }
  
  // 3. Fallback final: sistema local
  if (!hasGroqKey && !hasOpenAIKey) {
    logger.info('[LLM] Sin API keys configuradas, usando sistema local')
  }
  
  response = generarRespuestaLocal(userMessage)
  
  if (phone) {
    addBotMessage(phone, response)
  }
  
  return response
}
