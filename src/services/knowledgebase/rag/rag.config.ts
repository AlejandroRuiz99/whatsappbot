/**
 * Configuración de Pinecone Vector Database
 */

import { Pinecone } from '@pinecone-database/pinecone'
import { config } from '../../../config/env.js'
import { logger } from '../../../utils/logger.js'

let pineconeClient: Pinecone | null = null

/**
 * Inicializar cliente de Pinecone
 */
export function initPinecone(): Pinecone {
  if (pineconeClient) {
    return pineconeClient
  }

  if (!config.PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY no está configurada en .env')
  }

  try {
    pineconeClient = new Pinecone({
      apiKey: config.PINECONE_API_KEY,
    })

    logger.info('✅ Cliente de Pinecone inicializado')
    return pineconeClient
  } catch (error) {
    logger.error('❌ Error inicializando Pinecone:', error)
    throw error
  }
}

/**
 * Obtener índice de Pinecone
 */
export function getPineconeIndex() {
  const pc = initPinecone()
  // SDK v7.x requiere objeto con propiedad name
  const index = pc.index(config.PINECONE_INDEX_NAME)
  
  return index
}

/**
 * Verificar si el índice existe
 */
export async function checkIndexExists(): Promise<boolean> {
  try {
    const pc = initPinecone()
    const indexes = await pc.listIndexes()
    
    return indexes.indexes?.some(idx => idx.name === config.PINECONE_INDEX_NAME) || false
  } catch (error) {
    logger.error('Error verificando índice:', error)
    return false
  }
}

/**
 * Crear índice si no existe
 * 
 * Configuración:
 * - Dimensiones: 1536 (OpenAI text-embedding-3-small)
 * - Métrica: cosine
 * - Cloud: AWS (gratuito)
 * - Región: us-east-1
 */
export async function createIndexIfNotExists(): Promise<void> {
  const pc = initPinecone()
  const indexName = config.PINECONE_INDEX_NAME

  try {
    const exists = await checkIndexExists()
    
    if (exists) {
      logger.info(`✅ Índice "${indexName}" ya existe`)
      return
    }

    logger.info(`📝 Creando índice "${indexName}"...`)
    
    await pc.createIndex({
      name: indexName,
      dimension: 1536, // OpenAI text-embedding-3-small
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1'
        }
      }
    })

    // Esperar a que el índice esté listo
    logger.info('⏳ Esperando a que el índice esté listo...')
    
    let ready = false
    let attempts = 0
    const maxAttempts = 30 // 5 minutos máximo
    
    while (!ready && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)) // Esperar 10s
      
      const desc = await pc.describeIndex(indexName)
      ready = desc.status?.ready || false
      attempts++
      
      if (!ready) {
        logger.info(`  Esperando... (${attempts}/${maxAttempts})`)
      }
    }

    if (ready) {
      logger.info(`✅ Índice "${indexName}" creado y listo`)
    } else {
      throw new Error('Timeout esperando a que el índice esté listo')
    }
  } catch (error) {
    logger.error(`❌ Error creando índice "${indexName}":`, error)
    throw error
  }
}

/**
 * Obtener estadísticas del índice
 */
export async function getIndexStats() {
  try {
    const index = getPineconeIndex()
    const stats = await index.describeIndexStats()
    
    return {
      totalVectors: stats.totalRecordCount || 0,
      dimension: stats.dimension || 0,
      indexFullness: stats.indexFullness || 0,
      namespaces: stats.namespaces || {}
    }
  } catch (error) {
    logger.error('Error obteniendo estadísticas del índice:', error)
    throw error
  }
}

/**
 * Eliminar todos los vectores del índice (usar con cuidado)
 */
export async function deleteAllVectors(): Promise<void> {
  try {
    const index = getPineconeIndex()
    
    logger.warn('⚠️  Eliminando todos los vectores del índice...')
    
    await index.deleteAll()
    
    logger.info('✅ Todos los vectores eliminados')
  } catch (error) {
    logger.error('❌ Error eliminando vectores:', error)
    throw error
  }
}
