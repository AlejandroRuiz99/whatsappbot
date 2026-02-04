/**
 * Script para indexar embeddings en Pinecone
 * 
 * Lee chunks con embeddings y los sube a Pinecone en batches
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { initPinecone, createIndexIfNotExists, getPineconeIndex, getIndexStats } from '../rag.config.js'
import type { VideoChunk } from '../tiktok/chunking.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface ChunkWithEmbedding extends VideoChunk {
  embedding: number[]
}

const UPSERT_BATCH_SIZE = 100 // Pinecone recomienda batches de 100-200

async function indexToPinecone(): Promise<void> {
  const inputPath = path.join(__dirname, '../data/tiktok/chunks_with_embeddings.json')

  console.log('📤 Iniciando indexación a Pinecone...\n')
  console.log(`📂 Input: ${inputPath}\n`)

  // Leer chunks con embeddings
  console.log('📖 Leyendo chunks con embeddings...')
  
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'))
  const chunks: ChunkWithEmbedding[] = data.chunks
  
  console.log(`✅ ${chunks.length} chunks cargados\n`)

  // Inicializar Pinecone
  console.log('🔌 Conectando a Pinecone...')
  initPinecone()
  console.log('✅ Conectado\n')

  // Crear índice si no existe
  console.log('🔍 Verificando índice...')
  await createIndexIfNotExists()
  console.log()

  // Obtener índice
  const index = getPineconeIndex()

  // Preparar vectores para Pinecone
  console.log('📝 Preparando vectores...')
  
  const vectors = chunks.map(chunk => ({
    id: chunk.id,
    values: chunk.embedding,
    metadata: {
      video_id: chunk.video_id,
      video_url: chunk.video_url,
      // Truncar content a 2000 caracteres para no exceder límites de Pinecone
      content: chunk.content.substring(0, 2000),
      chunk_index: chunk.chunk_index,
      total_chunks: chunk.total_chunks,
      lang: chunk.metadata.lang,
      topics: chunk.metadata.topics.join(','), // Pinecone no soporta arrays, usar string
      token_count: chunk.metadata.token_count,
      ingested_at: chunk.metadata.ingested_at
    }
  }))

  console.log(`✅ ${vectors.length} vectores preparados\n`)

  // Upsert en batches
  const totalBatches = Math.ceil(vectors.length / UPSERT_BATCH_SIZE)
  
  console.log(`📤 Subiendo a Pinecone en ${totalBatches} batches...\n`)

  for (let i = 0; i < totalBatches; i++) {
    const batchStart = i * UPSERT_BATCH_SIZE
    const batchEnd = Math.min((i + 1) * UPSERT_BATCH_SIZE, vectors.length)
    const batch = vectors.slice(batchStart, batchEnd)
    
    const batchNum = i + 1
    const progress = ((batchNum / totalBatches) * 100).toFixed(1)
    
    process.stdout.write(`\r📊 Batch ${batchNum}/${totalBatches} (${progress}%) - Subiendo ${batch.length} vectores...`)

    try {
      // SDK v7.x requiere objeto con propiedad "records"
      await index.upsert({ records: batch })

      // Pequeña pausa entre batches para evitar rate limits
      if (batchNum < totalBatches) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    } catch (error: any) {
      console.error(`\n❌ Error en batch ${batchNum}:`, error.message)
      
      // Si es rate limit, esperar y reintentar
      if (error.status === 429) {
        console.log('\n⏳ Rate limit alcanzado, esperando 60 segundos...')
        await new Promise(resolve => setTimeout(resolve, 60000))
        i-- // Reintentar este batch
        continue
      }
      
      throw error
    }
  }

  console.log('\n\n✅ Todos los vectores indexados exitosamente!\n')

  // Esperar un momento para que Pinecone actualice estadísticas
  console.log('⏳ Esperando actualización de estadísticas...')
  await new Promise(resolve => setTimeout(resolve, 5000))

  // Verificar indexación
  console.log('🔍 Verificando indexación...\n')
  
  try {
    const stats = await getIndexStats()
    
    console.log('═══════════════════════════════════════════════')
    console.log('📊 ESTADÍSTICAS DE PINECONE')
    console.log('═══════════════════════════════════════════════')
    console.log(`Total de vectores: ${stats.totalVectors}`)
    console.log(`Dimensiones: ${stats.dimension}`)
    console.log(`Fullness: ${(stats.indexFullness * 100).toFixed(2)}%`)
    console.log('═══════════════════════════════════════════════\n')

    if (stats.totalVectors !== vectors.length) {
      console.warn(`⚠️  Advertencia: Esperábamos ${vectors.length} vectores pero Pinecone reporta ${stats.totalVectors}`)
      console.warn('   Esto puede ser normal si hay un retraso en la actualización de estadísticas.')
    } else {
      console.log('✅ Indexación verificada correctamente!')
    }
  } catch (error) {
    console.warn('⚠️  No se pudieron obtener estadísticas (puede ser normal):', error)
  }

  console.log('\n✨ ¡Sistema RAG listo para usar!')
  console.log('\n📌 Próximos pasos:')
  console.log('  1. Crear servicio RAG para búsquedas')
  console.log('  2. Integrar con el LLM actual')
  console.log('  3. Probar queries de ejemplo')
}

// Ejecutar script
indexToPinecone()
  .then(() => {
    console.log('\n✅ Indexación completada exitosamente!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Error durante la indexación:', error)
    console.error('\nDetalles del error:', error.stack)
    process.exit(1)
  })
