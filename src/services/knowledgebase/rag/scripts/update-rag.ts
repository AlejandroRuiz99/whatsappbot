/**
 * Script para actualización incremental del RAG
 * Detecta y procesa solo los videos nuevos
 */

import fs from 'fs'
import path from 'path'
import csv from 'csv-parser'
import { fileURLToPath } from 'url'
import OpenAI from 'openai'
import { config } from '../../../../config/env.js'
import { getPineconeIndex } from '../rag.config.js'
import { chunkVideo, type VideoData, type VideoChunk } from '../tiktok/chunking.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface ChunkWithEmbedding extends VideoChunk {
  embedding: number[]
}

const MODEL = 'text-embedding-3-small'
const BATCH_SIZE = 100

async function updateRAG(): Promise<void> {
  console.log('🔄 Iniciando actualización incremental del RAG...\n')

  // 1. Leer videos existentes ya indexados
  console.log('📖 Leyendo chunks existentes...')
  
  const existingChunksPath = path.join(__dirname, '../data/tiktok/chunks_with_embeddings.json')
  
  if (!fs.existsSync(existingChunksPath)) {
    console.error('❌ No se encontró chunks_with_embeddings.json')
    console.error('   Ejecuta primero: npx tsx src/services/knowledgebase/rag/scripts/generate-embeddings.ts')
    process.exit(1)
  }

  const existingData = JSON.parse(fs.readFileSync(existingChunksPath, 'utf-8'))
  const existingVideoIds = new Set<string>()
  
  for (const chunk of existingData.chunks) {
    existingVideoIds.add(chunk.video_id)
  }

  console.log(`✅ ${existingVideoIds.size} videos ya indexados\n`)

  // 2. Leer CSV actual para buscar nuevos videos
  console.log('🔍 Buscando nuevos videos...')
  
  const csvPath = path.join(__dirname, '../data/tiktok/source.csv')
  
  const allVideos: VideoData[] = []
  
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row: any) => {
        // Solo videos con status OK y con transcripción
        if (row.status === 'OK' && row.transcript && row.transcript.trim()) {
          allVideos.push({
            video_id: row.video_id,
            video_url: row.video_url,
            transcript: row.transcript,
            lang: row.lang || 'es',
            ingested_at: row.ingested_at
          })
        }
      })
      .on('end', resolve)
      .on('error', reject)
  })

  // Filtrar solo videos nuevos
  const newVideos = allVideos.filter(v => !existingVideoIds.has(v.video_id))

  if (newVideos.length === 0) {
    console.log('✅ No hay videos nuevos para procesar\n')
    console.log('📊 Sistema RAG actualizado')
    return
  }

  console.log(`✅ Encontrados ${newVideos.length} videos nuevos\n`)

  // 3. Procesar nuevos videos (chunking)
  console.log('🔪 Generando chunks...')
  
  const newChunks: VideoChunk[] = []
  
  for (const video of newVideos) {
    const chunks = chunkVideo(video)
    newChunks.push(...chunks)
  }

  console.log(`✅ ${newChunks.length} chunks generados\n`)

  // 4. Generar embeddings
  console.log('🧠 Generando embeddings...')
  
  if (!config.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY no configurada')
  }

  const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY })
  const chunksWithEmbeddings: ChunkWithEmbedding[] = []
  const totalBatches = Math.ceil(newChunks.length / BATCH_SIZE)

  for (let i = 0; i < totalBatches; i++) {
    const batchStart = i * BATCH_SIZE
    const batchEnd = Math.min((i + 1) * BATCH_SIZE, newChunks.length)
    const batch = newChunks.slice(batchStart, batchEnd)
    
    const batchNum = i + 1
    const progress = ((batchNum / totalBatches) * 100).toFixed(1)
    
    process.stdout.write(`\r📊 Batch ${batchNum}/${totalBatches} (${progress}%)...`)

    try {
      const inputs = batch.map(chunk => chunk.content)
      
      const response = await openai.embeddings.create({
        model: MODEL,
        input: inputs,
        encoding_format: 'float'
      })

      for (let j = 0; j < batch.length; j++) {
        chunksWithEmbeddings.push({
          ...batch[j],
          embedding: response.data[j].embedding
        })
      }

      if (batchNum < totalBatches) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    } catch (error: any) {
      console.error(`\n❌ Error en batch ${batchNum}:`, error.message)
      throw error
    }
  }

  console.log('\n✅ Embeddings generados\n')

  // 5. Indexar en Pinecone
  console.log('📤 Indexando en Pinecone...')
  
  const index = getPineconeIndex()
  
  const vectors = chunksWithEmbeddings.map(chunk => ({
    id: chunk.id,
    values: chunk.embedding,
    metadata: {
      video_id: chunk.video_id,
      video_url: chunk.video_url,
      content: chunk.content,
      chunk_index: chunk.chunk_index,
      total_chunks: chunk.total_chunks,
      lang: chunk.metadata.lang,
      topics: chunk.metadata.topics.join(','),
      token_count: chunk.metadata.token_count,
      ingested_at: chunk.metadata.ingested_at
    }
  }))

  const upsertBatches = Math.ceil(vectors.length / BATCH_SIZE)

  for (let i = 0; i < upsertBatches; i++) {
    const batchStart = i * BATCH_SIZE
    const batchEnd = Math.min((i + 1) * BATCH_SIZE, vectors.length)
    const batch = vectors.slice(batchStart, batchEnd)
    
    const batchNum = i + 1
    const progress = ((batchNum / upsertBatches) * 100).toFixed(1)
    
    process.stdout.write(`\r📊 Batch ${batchNum}/${upsertBatches} (${progress}%)...`)

    try {
      // SDK v7.x requiere objeto con propiedad "records"
      await index.upsert({ records: batch })

      if (batchNum < upsertBatches) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    } catch (error: any) {
      console.error(`\n❌ Error en batch ${batchNum}:`, error.message)
      throw error
    }
  }

  console.log('\n✅ Indexación completada\n')

  // 6. Actualizar archivo local
  console.log('💾 Actualizando archivo local...')
  
  const updatedData = {
    metadata: {
      generated_at: new Date().toISOString(),
      total_chunks: existingData.chunks.length + chunksWithEmbeddings.length,
      model: MODEL,
      dimensions: 1536,
      last_update: {
        date: new Date().toISOString(),
        new_videos: newVideos.length,
        new_chunks: chunksWithEmbeddings.length
      }
    },
    chunks: [...existingData.chunks, ...chunksWithEmbeddings]
  }

  fs.writeFileSync(existingChunksPath, JSON.stringify(updatedData, null, 2), 'utf-8')
  
  console.log(`✅ Archivo actualizado\n`)

  // Resumen
  console.log('═══════════════════════════════════════════════')
  console.log('📊 RESUMEN DE ACTUALIZACIÓN')
  console.log('═══════════════════════════════════════════════')
  console.log(`Videos nuevos: ${newVideos.length}`)
  console.log(`Chunks nuevos: ${chunksWithEmbeddings.length}`)
  console.log(`Total videos: ${updatedData.metadata.total_chunks} chunks`)
  console.log('═══════════════════════════════════════════════\n')
  console.log('✨ Sistema RAG actualizado exitosamente!')
}

// Ejecutar actualización
updateRAG()
  .then(() => {
    console.log('\n✅ Actualización completada!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Error durante la actualización:', error)
    process.exit(1)
  })
