/**
 * Ver configuración del índice de Pinecone
 */

import { initPinecone } from '../rag.config.js'

async function checkIndex() {
  console.log('🔍 Verificando configuración del índice...\n')

  const pc = initPinecone()

  // Listar índices
  const indexes = await pc.listIndexes()
  
  console.log('📋 Índices disponibles:')
  for (const idx of indexes.indexes || []) {
    console.log(`\n  Nombre: ${idx.name}`)
    console.log(`  Dimensión: ${idx.dimension}`)
    console.log(`  Métrica: ${idx.metric}`)
    console.log(`  Host: ${idx.host}`)
    console.log(`  Spec: ${JSON.stringify(idx.spec, null, 2)}`)
  }

  // Describir el índice específico
  console.log('\n\n🔍 Detalle del índice "tiktok-despacho":')
  try {
    const desc = await pc.describeIndex('tiktok-despacho')
    console.log(JSON.stringify(desc, null, 2))
  } catch (error: any) {
    console.error('Error:', error.message)
  }
}

checkIndex()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
