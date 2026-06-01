/**
 * Script para procesar videos y generar chunks
 */

import fs from 'fs'
import path from 'path'
import csv from 'csv-parser'
import { fileURLToPath } from 'url'
import { chunkVideos, getChunkingStats, type VideoData, type VideoChunk } from '../chunking.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function processChunks(): Promise<void> {
  const inputPath = path.join(__dirname, '../data/cleaned_videos.csv')
  const outputPath = path.join(__dirname, '../data/chunks.json')

  console.log('🔪 Iniciando procesamiento de chunks...\n')
  console.log(`📂 Input: ${inputPath}`)
  console.log(`📂 Output: ${outputPath}\n`)

  // Leer videos limpios
  console.log('📖 Leyendo videos...')
  
  const videos: VideoData[] = []
  
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(inputPath)
      .pipe(csv())
      .on('data', (row: any) => {
        videos.push({
          video_id: row.video_id,
          video_url: row.video_url,
          transcript: row.transcript,
          lang: row.lang || 'es',
          ingested_at: row.ingested_at
        })
      })
      .on('end', resolve)
      .on('error', reject)
  })

  console.log(`✅ ${videos.length} videos cargados\n`)

  // Procesar chunks
  console.log('🔪 Generando chunks...')
  
  const startTime = Date.now()
  const chunks = chunkVideos(videos)
  const endTime = Date.now()
  
  console.log(`✅ ${chunks.length} chunks generados en ${endTime - startTime}ms\n`)

  // Estadísticas
  console.log('📊 Calculando estadísticas...')
  
  const stats = getChunkingStats(chunks)
  
  console.log(`  Total chunks: ${stats.total_chunks}`)
  console.log(`  Total videos: ${stats.total_videos}`)
  console.log(`  Promedio chunks/video: ${stats.avg_chunks_per_video}`)
  console.log(`  Promedio tokens/chunk: ${stats.avg_tokens_per_chunk}`)
  console.log(`\n  Distribución de tamaños:`)
  console.log(`    - Pequeños (< 300 tokens): ${stats.chunk_size_distribution.small}`)
  console.log(`    - Medianos (300-500 tokens): ${stats.chunk_size_distribution.medium}`)
  console.log(`    - Grandes (> 500 tokens): ${stats.chunk_size_distribution.large}\n`)

  // Guardar chunks
  console.log('💾 Guardando chunks...')
  
  const output = {
    metadata: {
      generated_at: new Date().toISOString(),
      total_chunks: chunks.length,
      total_videos: videos.length,
      stats
    },
    chunks
  }

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8')
  
  console.log(`✅ Chunks guardados: ${outputPath}\n`)

  // Mostrar ejemplos
  console.log('📝 Ejemplos de chunks:\n')
  
  const sampleChunks = chunks.slice(0, 3)
  
  for (const chunk of sampleChunks) {
    console.log(`Chunk ID: ${chunk.id}`)
    console.log(`Video: ${chunk.video_url}`)
    console.log(`Tokens: ${chunk.metadata.token_count}`)
    console.log(`Topics: ${chunk.metadata.topics.join(', ')}`)
    console.log(`Content: ${chunk.content.substring(0, 150)}...`)
    console.log('---')
  }

  // Resumen final
  console.log('\n═══════════════════════════════════════════════')
  console.log('📊 RESUMEN DE CHUNKING')
  console.log('═══════════════════════════════════════════════')
  console.log(`Videos procesados: ${videos.length}`)
  console.log(`Chunks generados: ${chunks.length}`)
  console.log(`Ratio: ${stats.avg_chunks_per_video} chunks/video`)
  console.log(`Tamaño promedio: ${stats.avg_tokens_per_chunk} tokens/chunk`)
  console.log('═══════════════════════════════════════════════\n')
  console.log('✅ Dataset listo para generar embeddings!')
}

// Ejecutar script
processChunks()
  .then(() => {
    console.log('\n✅ Procesamiento completado exitosamente!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Error durante el procesamiento:', error)
    process.exit(1)
  })
