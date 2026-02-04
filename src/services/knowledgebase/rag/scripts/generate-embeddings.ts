/**
 * Script para generar embeddings con OpenAI
 * 
 * Procesa chunks en batches y genera embeddings usando
 * OpenAI text-embedding-3-small (1536 dimensiones)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import OpenAI from 'openai'
import { config } from '../../../../config/env.js'
import type { VideoChunk } from '../tiktok/chunking.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface ChunkWithEmbedding extends VideoChunk {
  embedding: number[]
}

const BATCH_SIZE = 50 // Procesar 50 chunks por batch (reducido para evitar límites)
const MODEL = 'text-embedding-3-small' // 1536 dimensiones

async function generateEmbeddings(): Promise<void> {
  const inputPath = path.join(__dirname, '../data/tiktok/chunks.json')
  const outputPath = path.join(__dirname, '../data/tiktok/chunks_with_embeddings.json')

  console.log('🧠 Iniciando generación de embeddings...\n')
  console.log(`📂 Input: ${inputPath}`)
  console.log(`📂 Output: ${outputPath}`)
  console.log(`🤖 Modelo: ${MODEL}\n`)

  // Verificar API key
  if (!config.OPENAI_API_KEY || config.OPENAI_API_KEY === 'sk-your-key-here') {
    throw new Error('❌ OPENAI_API_KEY no configurada. Añádela en tu archivo .env')
  }

  const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY })

  // Leer chunks
  console.log('📖 Leyendo chunks...')
  
  const chunksData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'))
  const chunks: VideoChunk[] = chunksData.chunks
  
  console.log(`✅ ${chunks.length} chunks cargados\n`)

  // Generar embeddings en batches
  const chunksWithEmbeddings: ChunkWithEmbedding[] = []
  const totalBatches = Math.ceil(chunks.length / BATCH_SIZE)
  let totalCost = 0

  console.log(`🔄 Procesando ${totalBatches} batches de ${BATCH_SIZE} chunks...\n`)

  for (let i = 0; i < totalBatches; i++) {
    const batchStart = i * BATCH_SIZE
    const batchEnd = Math.min((i + 1) * BATCH_SIZE, chunks.length)
    const batch = chunks.slice(batchStart, batchEnd)
    
    const batchNum = i + 1
    const progress = ((batchNum / totalBatches) * 100).toFixed(1)
    
    process.stdout.write(`\r📊 Batch ${batchNum}/${totalBatches} (${progress}%) - Procesando ${batch.length} chunks...`)

    try {
      // Preparar inputs para la API
      const inputs = batch.map(chunk => chunk.content)

      // Llamar a OpenAI API
      const response = await openai.embeddings.create({
        model: MODEL,
        input: inputs,
        encoding_format: 'float'
      })

      // Calcular costo estimado
      const tokensUsed = response.usage.total_tokens
      const costPerToken = 0.00000002 // $0.02 por millón de tokens
      const batchCost = tokensUsed * costPerToken
      totalCost += batchCost

      // Asignar embeddings a chunks
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j]
        const embedding = response.data[j].embedding

        chunksWithEmbeddings.push({
          ...chunk,
          embedding
        })
      }

      // Rate limiting: Esperar un poco entre batches para evitar límites
      if (batchNum < totalBatches) {
        await new Promise(resolve => setTimeout(resolve, 200)) // 200ms entre batches
      }

    } catch (error: any) {
      console.error(`\n❌ Error en batch ${batchNum}:`, error.message)
      
      // Si es rate limit, esperar más tiempo y reintentar
      if (error.status === 429) {
        console.log('⏳ Rate limit alcanzado, esperando 60 segundos...')
        await new Promise(resolve => setTimeout(resolve, 60000))
        i-- // Reintentar este batch
        continue
      }
      
      throw error
    }
  }

  console.log('\n\n✅ Embeddings generados exitosamente!\n')

  // Guardar chunks con embeddings
  console.log('💾 Guardando chunks con embeddings...')
  
  const output = {
    metadata: {
      generated_at: new Date().toISOString(),
      total_chunks: chunksWithEmbeddings.length,
      model: MODEL,
      dimensions: 1536,
      estimated_cost_usd: totalCost.toFixed(6),
      stats: chunksData.metadata.stats
    },
    chunks: chunksWithEmbeddings
  }

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8')
  
  console.log(`✅ Guardado: ${outputPath}\n`)

  // Resumen
  console.log('═══════════════════════════════════════════════')
  console.log('📊 RESUMEN DE EMBEDDINGS')
  console.log('═══════════════════════════════════════════════')
  console.log(`Total de chunks: ${chunksWithEmbeddings.length}`)
  console.log(`Modelo: ${MODEL}`)
  console.log(`Dimensiones: 1536`)
  console.log(`Costo estimado: $${totalCost.toFixed(6)} USD`)
  console.log('═══════════════════════════════════════════════\n')

  // Verificar un embedding de muestra
  const sample = chunksWithEmbeddings[0]
  console.log('🔍 Muestra de embedding:')
  console.log(`  Chunk ID: ${sample.id}`)
  console.log(`  Vector length: ${sample.embedding.length}`)
  console.log(`  First 5 values: [${sample.embedding.slice(0, 5).join(', ')}...]`)
  console.log()

  console.log('✨ Embeddings listos para indexar en Pinecone!')
}

// Ejecutar script
generateEmbeddings()
  .then(() => {
    console.log('\n✅ Generación completada exitosamente!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Error durante la generación:', error)
    process.exit(1)
  })
