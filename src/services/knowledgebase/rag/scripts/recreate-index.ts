/**
 * Recrear índice de Pinecone desde cero
 */

import { Pinecone } from '@pinecone-database/pinecone'
import { config } from '../../../../config/env.js'

async function recreateIndex() {
  console.log('🔄 Recreando índice de Pinecone...\n')

  const pc = new Pinecone({
    apiKey: config.PINECONE_API_KEY
  })

  const indexName = 'tiktok-despacho'

  // 1. Verificar si existe
  const indexes = await pc.listIndexes()
  const exists = indexes.indexes?.some(idx => idx.name === indexName)

  if (exists) {
    console.log(`🗑️  Eliminando índice existente "${indexName}"...`)
    await pc.deleteIndex(indexName)
    console.log('✅ Índice eliminado\n')

    // Esperar a que se elimine completamente
    console.log('⏳ Esperando 10 segundos...')
    await new Promise(resolve => setTimeout(resolve, 10000))
  }

  // 2. Crear nuevo índice
  console.log(`📝 Creando nuevo índice "${indexName}"...`)
  
  await pc.createIndex({
    name: indexName,
    dimension: 1536,
    metric: 'cosine',
    spec: {
      serverless: {
        cloud: 'aws',
        region: 'us-east-1'
      }
    }
  })

  console.log('✅ Índice creado\n')

  // 3. Esperar a que esté listo
  console.log('⏳ Esperando a que el índice esté listo...')
  
  let ready = false
  let attempts = 0
  const maxAttempts = 30

  while (!ready && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 10000)) // 10s
    
    try {
      const desc = await pc.describeIndex(indexName)
      ready = desc.status?.ready || false
      attempts++
      
      if (!ready) {
        console.log(`  Intento ${attempts}/${maxAttempts}...`)
      }
    } catch (error) {
      attempts++
    }
  }

  if (ready) {
    console.log('✅ Índice listo!\n')

    // 4. Probar upsert
    console.log('🧪 Probando upsert...')
    
    const index = pc.index(indexName)
    
    const testVector = {
      id: 'test-vector-1',
      values: Array(1536).fill(0.1),
      metadata: { test: 'value' }
    }

    try {
      await index.upsert({ records: [testVector] })
      console.log('✅ Upsert exitoso!')
      
      // Eliminar vector de prueba
      await index.deleteOne({ id: 'test-vector-1' })
      console.log('✅ Test completado, vector de prueba eliminado')
    } catch (error: any) {
      console.error('❌ Error en upsert:', error.message)
    }
  } else {
    console.error('❌ Timeout esperando a que el índice esté listo')
  }

  console.log('\n✨ Proceso completado!')
}

recreateIndex()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
