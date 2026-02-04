/**
 * Servicio de chunking semántico para transcripciones de videos TikTok
 * 
 * Estrategia adaptativa:
 * - Videos cortos (< 600 tokens): 1 chunk (completo)
 * - Videos medios (600-1500 tokens): 2-3 chunks
 * - Videos largos (> 1500 tokens): Chunks de ~400 tokens con overlap de 50
 */

export interface VideoChunk {
  id: string                    // chunk_id único (video_id + índice)
  video_id: string              // ID del video original
  video_url: string             // URL del TikTok
  content: string               // Texto del chunk
  chunk_index: number           // Posición en el video (0, 1, 2...)
  total_chunks: number          // Total de chunks del video
  metadata: {
    ingested_at: string
    lang: string
    topics: string[]
    token_count: number
  }
}

export interface VideoData {
  video_id: string
  video_url: string
  transcript: string
  lang: string
  ingested_at: string
}

/**
 * Estimar tokens (aproximadamente 1 token = 4 caracteres en español)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Detectar temas en el texto
 */
function detectTopics(text: string): string[] {
  const lowerText = text.toLowerCase()
  const topics: string[] = []

  const topicKeywords: { [key: string]: string[] } = {
    'jubilacion': ['jubil', 'pensión', 'pension', 'jubilar', 'edad ordinaria'],
    'autonomos': ['autónomo', 'autonomo', 'régimen de autónomos', 'reta'],
    'incapacidad': ['incapacidad permanente', 'incapacidad temporal', 'incapacidad', 'baja médica'],
    'desempleo': ['paro', 'desempleo', 'prestación por desempleo', 'subsidio', 'sepe'],
    'cotizacion': ['cotiz', 'cotización', 'años cotizados'],
    'seguridad_social': ['seguridad social', 'inss', 'tesorería'],
    'viudedad': ['viudez', 'viudedad', 'viudo', 'viuda'],
    'complementos': ['complemento', 'complemento por hijos', 'complemento a mínimos'],
    'ere': ['ere', 'despido', 'extinción'],
    'extranjeria': ['extranjería', 'residencia', 'nacionalidad', 'visado']
  }

  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      topics.push(topic)
    }
  }

  return topics.length > 0 ? topics : ['general']
}

/**
 * Dividir texto en oraciones respetando puntuación
 */
function splitIntoSentences(text: string): string[] {
  const sentences = text
    .replace(/([.?!])\s+/g, '$1|||')
    .split('|||')
    .map(s => s.trim())
    .filter(s => s.length > 0)

  return sentences
}

/**
 * Agrupar oraciones en chunks de tamaño objetivo
 */
function groupSentencesIntoChunks(
  sentences: string[],
  targetTokens: number,
  overlapTokens: number
): string[] {
  const chunks: string[] = []
  let currentChunk: string[] = []
  let currentTokens = 0

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]
    const sentenceTokens = estimateTokens(sentence)

    if (currentTokens + sentenceTokens > targetTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '))
      
      const overlapSentences: string[] = []
      let overlapCount = 0
      
      for (let j = currentChunk.length - 1; j >= 0 && overlapCount < overlapTokens; j--) {
        const overlapSentence = currentChunk[j]
        overlapCount += estimateTokens(overlapSentence)
        overlapSentences.unshift(overlapSentence)
      }
      
      currentChunk = [...overlapSentences, sentence]
      currentTokens = overlapCount + sentenceTokens
    } else {
      currentChunk.push(sentence)
      currentTokens += sentenceTokens
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '))
  }

  return chunks
}

/**
 * Crear chunks para un video individual
 */
export function chunkVideo(video: VideoData): VideoChunk[] {
  const transcript = video.transcript.trim()
  const totalTokens = estimateTokens(transcript)
  const topics = detectTopics(transcript)

  // Estrategia 1: Videos cortos (< 600 tokens) → 1 chunk completo
  if (totalTokens < 600) {
    return [{
      id: `${video.video_id}_0`,
      video_id: video.video_id,
      video_url: video.video_url,
      content: transcript,
      chunk_index: 0,
      total_chunks: 1,
      metadata: {
        ingested_at: video.ingested_at,
        lang: video.lang,
        topics,
        token_count: totalTokens
      }
    }]
  }

  // Estrategia 2: Videos medios (600-1500 tokens) → 2-3 chunks
  if (totalTokens < 1500) {
    const sentences = splitIntoSentences(transcript)
    const targetChunks = Math.ceil(totalTokens / 500)
    const sentencesPerChunk = Math.ceil(sentences.length / targetChunks)
    
    const chunks: VideoChunk[] = []
    
    for (let i = 0; i < targetChunks; i++) {
      const start = i * sentencesPerChunk
      const end = Math.min((i + 1) * sentencesPerChunk, sentences.length)
      const chunkSentences = sentences.slice(start, end)
      
      if (chunkSentences.length === 0) continue
      
      const content = chunkSentences.join(' ')
      
      chunks.push({
        id: `${video.video_id}_${i}`,
        video_id: video.video_id,
        video_url: video.video_url,
        content,
        chunk_index: i,
        total_chunks: targetChunks,
        metadata: {
          ingested_at: video.ingested_at,
          lang: video.lang,
          topics,
          token_count: estimateTokens(content)
        }
      })
    }
    
    return chunks
  }

  // Estrategia 3: Videos largos (> 1500 tokens) → Chunks de 400 tokens con overlap de 50
  const sentences = splitIntoSentences(transcript)
  const chunkTexts = groupSentencesIntoChunks(sentences, 400, 50)
  
  return chunkTexts.map((content, index) => ({
    id: `${video.video_id}_${index}`,
    video_id: video.video_id,
    video_url: video.video_url,
    content,
    chunk_index: index,
    total_chunks: chunkTexts.length,
    metadata: {
      ingested_at: video.ingested_at,
      lang: video.lang,
      topics,
      token_count: estimateTokens(content)
    }
  }))
}

/**
 * Procesar múltiples videos en batch
 */
export function chunkVideos(videos: VideoData[]): VideoChunk[] {
  const allChunks: VideoChunk[] = []
  
  for (const video of videos) {
    const chunks = chunkVideo(video)
    allChunks.push(...chunks)
  }
  
  return allChunks
}

/**
 * Obtener estadísticas de chunking
 */
export function getChunkingStats(chunks: VideoChunk[]): {
  total_chunks: number
  total_videos: number
  avg_chunks_per_video: number
  avg_tokens_per_chunk: number
  chunk_size_distribution: {
    small: number
    medium: number
    large: number
  }
} {
  const videoIds = new Set(chunks.map(c => c.video_id))
  const tokenCounts = chunks.map(c => c.metadata.token_count)
  
  return {
    total_chunks: chunks.length,
    total_videos: videoIds.size,
    avg_chunks_per_video: Number((chunks.length / videoIds.size).toFixed(2)),
    avg_tokens_per_chunk: Math.round(
      tokenCounts.reduce((sum, count) => sum + count, 0) / chunks.length
    ),
    chunk_size_distribution: {
      small: chunks.filter(c => c.metadata.token_count < 300).length,
      medium: chunks.filter(c => c.metadata.token_count >= 300 && c.metadata.token_count <= 500).length,
      large: chunks.filter(c => c.metadata.token_count > 500).length
    }
  }
}
