/**
 * Script de health check para el sistema RAG
 * Verifica conectividad y estado del sistema
 */

import { initPinecone, getIndexStats, checkIndexExists } from '../rag.config.js'
import { config } from '../../../../config/env.js'
import OpenAI from 'openai'
import { logger } from '../../../../utils/logger.js'

async function healthCheck(): Promise<void> {
  console.log('🏥 Ejecutando health check del sistema RAG...\n')

  let allHealthy = true

  // 1. Verificar OpenAI API
  console.log('🤖 Verificando OpenAI API...')
  
  if (!config.OPENAI_API_KEY) {
    console.log('  ❌ OpenAI API Key no configurada')
    allHealthy = false
  } else {
    try {
      const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY })
      
      // Test simple
      await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: 'test',
        encoding_format: 'float'
      })
      
      console.log('  ✅ OpenAI API funcionando correctamente')
    } catch (error: any) {
      console.log(`  ❌ Error con OpenAI API: ${error.message}`)
      allHealthy = false
    }
  }

  console.log()

  // 2. Verificar Pinecone
  console.log('📍 Verificando Pinecone...')
  
  if (!config.PINECONE_API_KEY) {
    console.log('  ❌ Pinecone API Key no configurada')
    allHealthy = false
  } else {
    try {
      initPinecone()
      console.log('  ✅ Cliente de Pinecone inicializado')

      // Verificar índice
      const exists = await checkIndexExists()
      
      if (!exists) {
        console.log(`  ⚠️  Índice "${config.PINECONE_INDEX_NAME}" NO existe`)
        console.log('     Ejecuta: npx tsx src/services/knowledgebase/rag/scripts/index-to-pinecone.ts')
        allHealthy = false
      } else {
        console.log(`  ✅ Índice "${config.PINECONE_INDEX_NAME}" existe`)

        // Obtener estadísticas
        try {
          const stats = await getIndexStats()
          
          console.log(`\n  📊 Estadísticas del índice:`)
          console.log(`     - Vectores indexados: ${stats.totalVectors}`)
          console.log(`     - Dimensiones: ${stats.dimension}`)
          console.log(`     - Fullness: ${(stats.indexFullness * 100).toFixed(2)}%`)

          if (stats.totalVectors === 0) {
            console.log(`\n  ⚠️  El índice está vacío`)
            console.log('     Ejecuta: npx tsx src/services/knowledgebase/rag/scripts/index-to-pinecone.ts')
            allHealthy = false
          }
        } catch (error) {
          console.log(`  ⚠️  No se pudieron obtener estadísticas del índice`)
        }
      }
    } catch (error: any) {
      console.log(`  ❌ Error con Pinecone: ${error.message}`)
      allHealthy = false
    }
  }

  console.log()

  // 3. Test de query completo
  if (config.OPENAI_API_KEY && config.PINECONE_API_KEY) {
    console.log('🧪 Probando query end-to-end...')
    
    try {
      // Importar dinámicamente para evitar errores si no está configurado
      const { retrieveRelevantChunks } = await import('../rag.service.js')
      
      const testQuery = '¿Cuántos años necesito para jubilarme?'
      const chunks = await retrieveRelevantChunks(testQuery, 3, 0.5)
      
      if (chunks.length > 0) {
        console.log(`  ✅ Query exitosa, encontrados ${chunks.length} chunks`)
        console.log(`     Similitud máxima: ${(chunks[0].similarity * 100).toFixed(1)}%`)
      } else {
        console.log(`  ⚠️  Query exitosa pero sin resultados relevantes`)
        console.log('     Esto puede ser normal dependiendo del contenido indexado')
      }
    } catch (error: any) {
      console.log(`  ❌ Error en query: ${error.message}`)
      allHealthy = false
    }
  }

  console.log()

  // Resumen final
  console.log('═══════════════════════════════════════════════')
  
  if (allHealthy) {
    console.log('✅ SISTEMA RAG SALUDABLE')
    console.log('═══════════════════════════════════════════════')
    console.log('\n🚀 El sistema RAG está operativo y listo para usar')
  } else {
    console.log('⚠️  SISTEMA RAG CON PROBLEMAS')
    console.log('═══════════════════════════════════════════════')
    console.log('\n🔧 Revisa los errores arriba y corrige la configuración')
  }

  console.log()
}

// Ejecutar health check
healthCheck()
  .then(() => {
    console.log('✅ Health check completado!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Error durante el health check:', error)
    process.exit(1)
  })
