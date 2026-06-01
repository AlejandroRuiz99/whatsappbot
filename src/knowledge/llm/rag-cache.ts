/**
 * Sistema de caché inteligente para contexto RAG
 */

import { logger } from '../../observability/logger.js'
import {
  getCachedRAGChunks,
  cacheRAGChunks
} from '../../conversation/store/memory.js'
import {
  getRAGContext,
  formatContextForLLM,
  shouldIncludeVideoLinks,
  extractUniqueVideos,
  type RAGResult,
  type RetrievedChunk
} from '../rag/rag.service.js'

// Número reducido de chunks para preguntas de seguimiento (ahorra tokens y latencia)
const FOLLOW_UP_TOP_K = 3

/**
 * Determina si una query es una pregunta de seguimiento corta
 * que puede beneficiarse del contexto RAG cacheado
 */
function isFollowUpQuery(query: string): boolean {
  const trimmed = query.trim()

  const followUpIndicators = [
    /^(y|pero|entonces|¿y|además|también|porque|cuando|cómo|dónde|qué|cuánto|cuál)/i,
    /^(si|no|ok|vale|entiendo)/i,
  ]

  const isShort = trimmed.length < 50
  const hasFollowUpWord = followUpIndicators.some(pattern => pattern.test(trimmed))

  return isShort && hasFollowUpWord
}

/**
 * Obtiene contexto RAG, usando caché si es apropiado.
 * Para preguntas de seguimiento reutiliza caché + búsqueda reducida (topK=3).
 */
export async function getRAGContextWithCache(
  userMessage: string,
  phone?: string
): Promise<{ ragContext: RAGResult; usedCache: boolean }> {
  // Sin phone no hay caché posible
  if (!phone) {
    const ragContext = await getRAGContext(userMessage)
    return { ragContext, usedCache: false }
  }

  const cachedChunks = getCachedRAGChunks(phone)
  const isFollowUp = isFollowUpQuery(userMessage)

  if (cachedChunks && cachedChunks.length > 0 && isFollowUp) {
    logger.debug(`[RAG] 🔄 Usando caché + búsqueda reducida (topK=${FOLLOW_UP_TOP_K}) para pregunta de seguimiento`)

    // Búsqueda reducida para seguimientos (menos tokens, menos latencia)
    const newContext = await getRAGContext(userMessage, FOLLOW_UP_TOP_K)

    // Combinar: máx 2 chunks de caché + nuevos hasta 5 total
    const combinedChunks: RetrievedChunk[] = []
    const seenVideoIds = new Set<string>()

    for (const chunk of cachedChunks.slice(0, 2)) {
      if (!seenVideoIds.has(chunk.video_id)) {
        combinedChunks.push(chunk)
        seenVideoIds.add(chunk.video_id)
      }
    }

    for (const chunk of newContext.chunks) {
      if (!seenVideoIds.has(chunk.video_id) && combinedChunks.length < 5) {
        combinedChunks.push(chunk)
        seenVideoIds.add(chunk.video_id)
      }
    }

    if (combinedChunks.length > 0) {
      cacheRAGChunks(phone, combinedChunks, userMessage)
    }

    const includeLinks = shouldIncludeVideoLinks(combinedChunks)
    const videos = includeLinks ? extractUniqueVideos(combinedChunks) : []
    const context = formatContextForLLM(combinedChunks)

    return {
      ragContext: { chunks: combinedChunks, videos, context, shouldIncludeVideoLinks: includeLinks },
      usedCache: true
    }
  }

  // Sin caché o no es seguimiento: búsqueda completa
  logger.debug(`[RAG] 🔍 Nueva búsqueda completa (${isFollowUp ? 'seguimiento sin caché' : 'primera consulta'})`)
  const ragContext = await getRAGContext(userMessage)

  if (ragContext.chunks.length > 0 && phone) {
    cacheRAGChunks(phone, ragContext.chunks, userMessage)
  }

  return { ragContext, usedCache: false }
}
