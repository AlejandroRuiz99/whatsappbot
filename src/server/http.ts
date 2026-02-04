import Fastify from 'fastify'
import { config } from '../config/env.js'
import { logger } from '../utils/logger.js'

// Estado de conexión (compartido entre sandbox y producción)
let currentQR: string | null = null
let connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'logged_out' = 'disconnected'

export function setQRCode(qr: string | null) {
  currentQR = qr
}

export function getQRCode() {
  return currentQR
}

export function setConnectionStatus(status: typeof connectionStatus) {
  connectionStatus = status
}

export function getConnectionStatus() {
  return connectionStatus
}

/**
 * Inicia el servidor HTTP
 * - En modo 'sandbox': carga UI de pruebas con chat simulado
 * - En modo 'production': solo APIs mínimas (health, status)
 */
export async function startServer() {
  const fastify = Fastify({ logger: false })
  
  // Health check
  fastify.get('/health', async () => ({
    status: 'ok',
    connection: connectionStatus,
    mode: config.BOT_MODE
  }))
  
  // API status
  fastify.get('/api/status', async () => ({
    status: connectionStatus,
    mode: config.BOT_MODE
  }))
  
  // Rutas del sandbox (solo en modo sandbox)
  if (config.BOT_MODE === 'sandbox') {
    const { registerSandboxRoutes } = await import('./sandbox/index.js')
    await registerSandboxRoutes(fastify)
    logger.info(`[SERVER] Modo SANDBOX - UI en http://localhost:${config.PORT}`)
  } else {
    logger.info(`[SERVER] Modo PRODUCTION - Solo APIs`)
  }
  
  await fastify.listen({ port: config.PORT, host: '0.0.0.0' })
  logger.info(`[SERVER] Puerto ${config.PORT}`)
  
  return fastify
}
