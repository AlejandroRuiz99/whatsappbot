/**
 * Script de análisis de transcripciones
 * 
 * Analiza:
 * - Longitud promedio de transcripciones
 * - Distribución de tokens
 * - Temas recurrentes (palabras clave)
 * - Estructura del contenido
 */

import fs from 'fs'
import path from 'path'
import csv from 'csv-parser'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface VideoData {
  video_id: string
  video_url: string
  transcript: string
  lang: string
  ingested_at: string
}

interface AnalysisResult {
  total_videos: number
  transcript_stats: {
    avg_length_chars: number
    min_length_chars: number
    max_length_chars: number
    avg_length_tokens: number
    min_length_tokens: number
    max_length_tokens: number
    avg_length_words: number
  }
  length_distribution: {
    very_short: number      // < 500 tokens
    short: number           // 500-1000 tokens
    medium: number          // 1000-2000 tokens
    long: number            // 2000-3000 tokens
    very_long: number       // > 3000 tokens
  }
  top_keywords: { word: string; count: number }[]
  topic_analysis: {
    [topic: string]: number
  }
  sample_transcripts: {
    shortest: VideoData
    average: VideoData
    longest: VideoData
  }
}

// Estimación simple de tokens (aproximadamente 1 token = 4 caracteres en español)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// Contar palabras
function countWords(text: string): number {
  return text.trim().split(/\s+/).length
}

// Detectar temas principales basados en palabras clave
function detectTopics(text: string): string[] {
  const lowerText = text.toLowerCase()
  const topics: string[] = []

  const topicKeywords: { [key: string]: string[] } = {
    'jubilacion': ['jubil', 'pensión', 'pension', 'jubilar', 'edad ordinaria', 'edad de jubilación'],
    'autonomos': ['autónomo', 'autonomo', 'régimen de autónomos', 'reta'],
    'incapacidad': ['incapacidad permanente', 'incapacidad temporal', 'incapacidad', 'baja médica', 'baja laboral'],
    'desempleo': ['paro', 'desempleo', 'prestación por desempleo', 'subsidio', 'sepe'],
    'cotizacion': ['cotiz', 'cotización', 'años cotizados', 'periodo cotizado'],
    'seguridad_social': ['seguridad social', 'inss', 'tesorería'],
    'pensiones': ['pensión', 'pension', 'prestación'],
    'viudedad': ['viudez', 'viudedad', 'viudo', 'viuda', 'fallecimiento'],
    'complementos': ['complemento', 'complemento por hijos', 'complemento a mínimos'],
    'ere': ['ere', 'despido', 'extinción']
  }

  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      topics.push(topic)
    }
  }

  return topics
}

// Extraer palabras clave (excluyendo stopwords)
function extractKeywords(texts: string[]): { word: string; count: number }[] {
  const stopwords = new Set([
    'el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'ser', 'se', 'no', 'haber', 'por',
    'con', 'su', 'para', 'como', 'estar', 'tener', 'le', 'lo', 'todo', 'pero', 'más',
    'hacer', 'o', 'poder', 'decir', 'este', 'ir', 'otro', 'ese', 'si', 'me', 'ya',
    'ver', 'porque', 'dar', 'cuando', 'muy', 'sin', 'vez', 'mucho', 'saber', 'qué',
    'sobre', 'mi', 'alguno', 'mismo', 'yo', 'también', 'hasta', 'año', 'dos', 'querer',
    'entre', 'así', 'primero', 'desde', 'grande', 'eso', 'ni', 'nos', 'llegar', 'pasar',
    'tiempo', 'ella', 'él', 'si', 'día', 'uno', 'bien', 'poco', 'deber', 'entonces',
    'poner', 'cosa', 'tanto', 'hombre', 'parecer', 'nuestro', 'tan', 'donde', 'ahora',
    'parte', 'después', 'vida', 'quedar', 'siempre', 'creer', 'hablar', 'llevar', 'dejar',
    'es', 'son', 'una', 'las', 'los', 'del', 'al', 'esta', 'estos', 'estas', 'te', 'tu',
    'va', 'han', 'he', 'ha', 'hay'
  ])

  const wordCount = new Map<string, number>()

  for (const text of texts) {
    const words = text.toLowerCase()
      .replace(/[^\wáéíóúñü\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopwords.has(w))

    for (const word of words) {
      wordCount.set(word, (wordCount.get(word) || 0) + 1)
    }
  }

  return Array.from(wordCount.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50)
}

async function analyzeTranscripts(): Promise<void> {
  const inputPath = path.join(__dirname, '../data/cleaned_videos.csv')
  const outputPath = path.join(__dirname, '../data/transcript_analysis.json')

  console.log('📊 Iniciando análisis de transcripciones...\n')
  console.log(`📂 Input: ${inputPath}\n`)

  const videos: VideoData[] = []

  // Leer CSV limpio
  console.log('📖 Leyendo videos limpios...')
  
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(inputPath)
      .pipe(csv())
      .on('data', (row: any) => {
        videos.push({
          video_id: row.video_id,
          video_url: row.video_url,
          transcript: row.transcript,
          lang: row.lang,
          ingested_at: row.ingested_at
        })
      })
      .on('end', resolve)
      .on('error', reject)
  })

  console.log(`✅ ${videos.length} videos cargados\n`)

  // Análisis de longitud
  console.log('📏 Analizando longitudes...')
  
  const lengths = videos.map(v => ({
    chars: v.transcript.length,
    tokens: estimateTokens(v.transcript),
    words: countWords(v.transcript),
    video: v
  }))

  lengths.sort((a, b) => a.chars - b.chars)

  const stats = {
    chars: {
      min: lengths[0].chars,
      max: lengths[lengths.length - 1].chars,
      avg: Math.round(lengths.reduce((sum, l) => sum + l.chars, 0) / lengths.length)
    },
    tokens: {
      min: lengths[0].tokens,
      max: lengths[lengths.length - 1].tokens,
      avg: Math.round(lengths.reduce((sum, l) => sum + l.tokens, 0) / lengths.length)
    },
    words: {
      min: lengths[0].words,
      max: lengths[lengths.length - 1].words,
      avg: Math.round(lengths.reduce((sum, l) => sum + l.words, 0) / lengths.length)
    }
  }

  console.log(`  Caracteres: min=${stats.chars.min}, max=${stats.chars.max}, avg=${stats.chars.avg}`)
  console.log(`  Tokens (estimado): min=${stats.tokens.min}, max=${stats.tokens.max}, avg=${stats.tokens.avg}`)
  console.log(`  Palabras: min=${stats.words.min}, max=${stats.words.max}, avg=${stats.words.avg}\n`)

  // Distribución de longitudes
  console.log('📊 Calculando distribución...')
  
  const distribution = {
    very_short: lengths.filter(l => l.tokens < 500).length,
    short: lengths.filter(l => l.tokens >= 500 && l.tokens < 1000).length,
    medium: lengths.filter(l => l.tokens >= 1000 && l.tokens < 2000).length,
    long: lengths.filter(l => l.tokens >= 2000 && l.tokens < 3000).length,
    very_long: lengths.filter(l => l.tokens >= 3000).length
  }

  console.log(`  Muy cortos (< 500 tokens): ${distribution.very_short}`)
  console.log(`  Cortos (500-1000): ${distribution.short}`)
  console.log(`  Medios (1000-2000): ${distribution.medium}`)
  console.log(`  Largos (2000-3000): ${distribution.long}`)
  console.log(`  Muy largos (> 3000): ${distribution.very_long}\n`)

  // Análisis de temas
  console.log('🏷️  Analizando temas...')
  
  const topicCounts: { [key: string]: number } = {}
  
  for (const video of videos) {
    const topics = detectTopics(video.transcript)
    for (const topic of topics) {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1
    }
  }

  const sortedTopics = Object.entries(topicCounts)
    .sort(([, a], [, b]) => b - a)

  console.log('  Top temas:')
  for (const [topic, count] of sortedTopics.slice(0, 10)) {
    const percentage = ((count / videos.length) * 100).toFixed(1)
    console.log(`    - ${topic}: ${count} videos (${percentage}%)`)
  }
  console.log()

  // Análisis de palabras clave
  console.log('🔑 Extrayendo palabras clave...')
  
  const keywords = extractKeywords(videos.map(v => v.transcript))
  
  console.log('  Top 20 palabras clave:')
  for (const { word, count } of keywords.slice(0, 20)) {
    console.log(`    - ${word}: ${count}`)
  }
  console.log()

  // Encontrar videos de muestra
  const medianIndex = Math.floor(lengths.length / 2)

  const result: AnalysisResult = {
    total_videos: videos.length,
    transcript_stats: {
      avg_length_chars: stats.chars.avg,
      min_length_chars: stats.chars.min,
      max_length_chars: stats.chars.max,
      avg_length_tokens: stats.tokens.avg,
      min_length_tokens: stats.tokens.min,
      max_length_tokens: stats.tokens.max,
      avg_length_words: stats.words.avg
    },
    length_distribution: distribution,
    top_keywords: keywords,
    topic_analysis: topicCounts,
    sample_transcripts: {
      shortest: lengths[0].video,
      average: lengths[medianIndex].video,
      longest: lengths[lengths.length - 1].video
    }
  }

  // Guardar resultado
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8')
  console.log(`💾 Análisis guardado: ${outputPath}\n`)

  // Resumen
  console.log('═══════════════════════════════════════════════')
  console.log('📊 RESUMEN DE ANÁLISIS')
  console.log('═══════════════════════════════════════════════')
  console.log(`Total de videos: ${videos.length}`)
  console.log(`\nLongitud promedio:`)
  console.log(`  - ${stats.tokens.avg} tokens (~${Math.ceil(stats.tokens.avg / 512)} chunks de 512 tokens)`)
  console.log(`  - ${stats.words.avg} palabras`)
  console.log(`  - ${stats.chars.avg} caracteres`)
  console.log(`\nRecomendación de chunking:`)
  
  if (stats.tokens.avg < 600) {
    console.log(`  ✅ Videos cortos: Usar video completo como chunk único`)
  } else if (stats.tokens.avg < 1500) {
    console.log(`  ✅ Videos medios: Dividir en 2-3 chunks de ~400 tokens`)
  } else {
    console.log(`  ✅ Videos largos: Dividir en chunks de 300-400 tokens con overlap de 50`)
  }
  
  console.log(`\nTema principal: ${sortedTopics[0]?.[0] || 'N/A'}`)
  console.log('═══════════════════════════════════════════════')
}

// Ejecutar análisis
analyzeTranscripts()
  .then(() => {
    console.log('\n✅ Análisis completado exitosamente!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Error durante el análisis:', error)
    process.exit(1)
  })
