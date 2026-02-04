/**
 * Sistema de caché inteligente para contexto RAG
 */

import { logger } from '../../../utils/logger.js'
import { 
  getCachedRAGChunks, 
  cacheRAGChunks 
} from '../../conversation/memory.js'
import { 
  getRAGContext, 
  formatContextForLLM,
  shouldIncludeVideoLinks,
  extractUniqueVideos,
  type RAGResult,
  type RetrievedChunk
} from '../rag/rag.service.js'

/**
 * Determina si una query es una pregunta de seguimiento corta
 * que puede beneficiarse del contexto RAG cacheado
 */
export function isFollowUpQuery(query: string): boolean {
  const trimmed = query.trim()
  
  // Es una pregunta de seguimiento si:
  // 1. Es corta (menos de 50 caracteres)
  // 2. Empieza con palabras de continuación
  // 3. No contiene contexto completo
  
  const followUpIndicators = [
    /^(y|pero|entonces|¿y|además|también|porque|cuando|cómo|dónde|qué|cuánto|cuál)/i,
    /^(si|no|ok|vale|entiendo)/i,
  ]
  
  const isShort = trimmed.length < 50
  const hasFollowUpWord = followUpIndicators.some(pattern => pattern.test(trimmed))
  
  return isShort && hasFollowUpWord
}

/**
 * Obtiene contexto RAG, usando caché si es apropiado
 */
export async function getRAGContextWithCache(
  userMessage: string, 
  phone?: string
): Promise<{ ragContext: RAGResult; usedCache: boolean }> {
  // Si no hay phone, no podemos usar caché
  if (!phone) {
    const ragContext = await getRAGContext(userMessage)
    return { ragContext, usedCache: false }
  }
  
  // Verificar si hay caché y si la query es de seguimiento
  const cachedChunks = getCachedRAGChunks(phone)
  const isFollowUp = isFollowUpQuery(userMessage)
  
  if (cachedChunks && cachedChunks.length > 0 && isFollowUp) {
    // Reutilizar caché + hacer búsqueda ligera
    logger.debug(`[RAG] 🔄 Usando caché + nueva búsqueda para pregunta de seguimiento`)
    
    // Hacer búsqueda nueva pero con menos resultados
    const newContext = await getRAGContext(userMessage)
    
    // Combinar: caché + nuevos resultados (máximo 5 chunks totales)
    const combinedChunks: RetrievedChunk[] = []
    const seenVideoIds = new Set<string>()
    
    // Primero añadir de la caché (máximo 2)
    for (const chunk of cachedChunks.slice(0, 2)) {
      if (!seenVideoIds.has(chunk.video_id)) {
        combinedChunks.push(chunk)
        seenVideoIds.add(chunk.video_id)
      }
    }
    
    // Luego añadir nuevos chunks
    for (const chunk of newContext.chunks) {
      if (!seenVideoIds.has(chunk.video_id) && combinedChunks.length < 5) {
        combinedChunks.push(chunk)
        seenVideoIds.add(chunk.video_id)
      }
    }
    
    // Guardar combinación en caché
    if (combinedChunks.length > 0) {
      cacheRAGChunks(phone, combinedChunks, userMessage)
    }
    
    // Construir resultado
    const includeLinks = shouldIncludeVideoLinks(combinedChunks)
    const videos = includeLinks ? extractUniqueVideos(combinedChunks) : []
    const context = formatContextForLLM(combinedChunks)
    
    return {
      ragContext: {
        chunks: combinedChunks,
        videos,
        context,
        shouldIncludeVideoLinks: includeLinks
      },
      usedCache: true
    }
  }
  
  // No hay caché o no es seguimiento - búsqueda normal
  logger.debug(`[RAG] 🔍 Nueva búsqueda completa (${isFollowUp ? 'seguimiento sin caché' : 'primera consulta'})`)
  const ragContext = await getRAGContext(userMessage)
  
  // Guardar en caché si encontramos chunks
  if (ragContext.chunks.length > 0 && phone) {
    cacheRAGChunks(phone, ragContext.chunks, userMessage)
  }
  
  return { ragContext, usedCache: false }
}
