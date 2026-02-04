/**
 * Servicio RAG (Retrieval-Augmented Generation)
 * 
 * Funcionalidades:
 * - Búsqueda de chunks relevantes en Pinecone
 * - Ranking y filtrado por similitud
 * - Formateo de contexto para el LLM
 * - Extracción de videos para referenciar
 */

import OpenAI from 'openai'
import { config } from '../../../config/env.js'
import { getPineconeIndex } from './rag.config.js'
import { logger } from '../../../utils/logger.js'

export interface RetrievedChunk {
  content: string
  video_url: string
  video_id: string
  similarity: number
  chunk_index: number
  total_chunks: number
  topics: string[]
  metadata: any
}

export interface VideoReference {
  video_url: string
  video_id: string
  relevance: number
  snippet: string
  topics: string[]
}

export interface RAGResult {
  chunks: RetrievedChunk[]
  videos: VideoReference[]
  context: string
  shouldIncludeVideoLinks: boolean
}

let openaiClient: OpenAI | null = null

/**
 * Inicializar cliente de OpenAI para embeddings
 */
function getOpenAIClient(): OpenAI {
  if (openaiClient) {
    return openaiClient
  }

  if (!config.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY no configurada')
  }

  openaiClient = new OpenAI({ apiKey: config.OPENAI_API_KEY })
  return openaiClient
}

/**
 * Generar embedding para una query
 */
async function generateQueryEmbedding(query: string): Promise<number[]> {
  try {
    const openai = getOpenAIClient()
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      encoding_format: 'float'
    })

    return response.data[0].embedding
  } catch (error) {
    logger.error('Error generando embedding de query:', error)
    throw error
  }
}

/**
 * Buscar chunks relevantes en Pinecone
 */
export async function retrieveRelevantChunks(
  query: string,
  topK: number = config.RAG_TOP_K,
  minSimilarity: number = config.RAG_MIN_SIMILARITY
): Promise<RetrievedChunk[]> {
  try {
    // Generar embedding de la query
    const queryEmbedding = await generateQueryEmbedding(query)

    // Buscar en Pinecone
    const index = getPineconeIndex()
    
    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true
    })

    // Convertir resultados a RetrievedChunk
    const chunks: RetrievedChunk[] = []

    for (const match of queryResponse.matches || []) {
      const similarity = match.score || 0

      // Filtrar por similitud mínima
      if (similarity < minSimilarity) {
        continue
      }

      const metadata = match.metadata as any

      chunks.push({
        content: metadata.content || '',
        video_url: metadata.video_url || '',
        video_id: metadata.video_id || '',
        similarity,
        chunk_index: metadata.chunk_index || 0,
        total_chunks: metadata.total_chunks || 1,
        topics: (metadata.topics || '').split(',').filter((t: string) => t),
        metadata
      })
    }

    logger.info(`RAG: Encontrados ${chunks.length} chunks relevantes para: "${query.substring(0, 50)}..."`)

    return chunks
  } catch (error) {
    logger.error('Error recuperando chunks:', error)
    return [] // Retornar array vacío en caso de error (fallback gracefully)
  }
}

/**
 * Determinar si se deben incluir enlaces a videos
 */
export function shouldIncludeVideoLinks(
  chunks: RetrievedChunk[],
  threshold: number = config.RAG_VIDEO_THRESHOLD
): boolean {
  if (chunks.length === 0) {
    return false
  }

  // Incluir links si al menos un chunk supera el umbral
  return chunks.some(chunk => chunk.similarity >= threshold)
}

/**
 * Extraer videos únicos para recomendar
 */
export function extractUniqueVideos(
  chunks: RetrievedChunk[],
  minSimilarity: number = config.RAG_VIDEO_THRESHOLD
): VideoReference[] {
  // Filtrar chunks por umbral
  const relevantChunks = chunks.filter(c => c.similarity >= minSimilarity)

  if (relevantChunks.length === 0) {
    return []
  }

  // Agrupar por video_id
  const videoMap = new Map<string, RetrievedChunk[]>()

  for (const chunk of relevantChunks) {
    const existing = videoMap.get(chunk.video_id) || []
    existing.push(chunk)
    videoMap.set(chunk.video_id, existing)
  }

  // Crear referencias de video
  const videos: VideoReference[] = []

  for (const [videoId, videoChunks] of videoMap.entries()) {
    // Usar el chunk con mayor similitud
    const bestChunk = videoChunks.reduce((best, current) =>
      current.similarity > best.similarity ? current : best
    )

    // Crear snippet del contenido más relevante
    const snippet = bestChunk.content.substring(0, 200) + '...'

    videos.push({
      video_url: bestChunk.video_url,
      video_id: videoId,
      relevance: bestChunk.similarity,
      snippet,
      topics: bestChunk.topics
    })
  }

  // Ordenar por relevancia y limitar a top 3
  return videos
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3)
}

/**
 * Formatear contexto para el LLM
 */
export function formatContextForLLM(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return ''
  }

  let context = 'CONOCIMIENTO DEL DESPACHO:\n\n'

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const similarity = (chunk.similarity * 100).toFixed(1)

    context += `[Fuente ${i + 1} - Relevancia: ${similarity}%]\n`
    context += `${chunk.content}\n\n`
  }

  return context.trim()
}

/**
 * Formatear lista de videos para incluir en el prompt
 */
export function formatVideosForLLM(videos: VideoReference[]): string {
  if (videos.length === 0) {
    return ''
  }

  let text = 'VIDEOS RELEVANTES DISPONIBLES:\n\n'

  for (const video of videos) {
    const relevance = (video.relevance * 100).toFixed(1)
    const topics = video.topics.join(', ')
    
    text += `- Video sobre: ${topics}\n`
    text += `  Relevancia: ${relevance}%\n`
    text += `  URL: ${video.video_url}\n`
    text += `  Contenido: ${video.snippet}\n\n`
  }

  return text.trim()
}

/**
 * Función principal: Obtener contexto RAG completo
 */
export async function getRAGContext(query: string): Promise<RAGResult> {
  try {
    // Recuperar chunks relevantes
    const chunks = await retrieveRelevantChunks(query)

    // Determinar si incluir videos
    const includeLinks = shouldIncludeVideoLinks(chunks)

    // Extraer videos si es necesario
    const videos = includeLinks ? extractUniqueVideos(chunks) : []

    // Formatear contexto
    const context = formatContextForLLM(chunks)

    return {
      chunks,
      videos,
      context,
      shouldIncludeVideoLinks: includeLinks
    }
  } catch (error) {
    logger.error('Error obteniendo contexto RAG:', error)
    
    // Retornar contexto vacío en caso de error
    return {
      chunks: [],
      videos: [],
      context: '',
      shouldIncludeVideoLinks: false
    }
  }
}
