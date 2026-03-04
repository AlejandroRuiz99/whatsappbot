import Fastify from 'fastify'
import { rmSync } from 'fs'
import { join } from 'path'
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
  
  // Reinicio: borra auth_info y reinicia el proceso
  fastify.post('/api/restart', async (_request, reply) => {
    logger.info('[SERVER] Reinicio solicitado via API')

    try {
      rmSync(join(process.cwd(), 'auth_info'), { recursive: true, force: true })
      logger.info('[SERVER] Carpeta auth_info eliminada')
    } catch (error) {
      logger.warn('[SERVER] No se pudo borrar auth_info (puede que no exista):', error)
    }

    reply.send({ status: 'restarting', message: 'Borrando sesión y reiniciando...' })

    // Dar tiempo a que la respuesta se envíe antes de salir
    setTimeout(() => {
      logger.info('[SERVER] Reiniciando proceso...')
      process.exit(0)
    }, 500)
  })

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
