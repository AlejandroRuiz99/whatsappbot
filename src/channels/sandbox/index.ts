import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { logger } from '../../observability/logger.js'
import { deleteConversation } from '../../conversation/store/memory.js'
import type { CRMClient } from '../../conversation/classifier/contract.js'
import type { MessageRouter } from '../../pipeline/router.contract.js'
import { routeSandboxMessage } from './handler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Sandbox-only state (UI-controlled toggles)
let sandboxIsExistingClient = false
let sandboxDebugMode = false

// Router injected by src/index.ts at boot
let router: MessageRouter | null = null
export function setRouter(r: MessageRouter): void {
  router = r
}

/**
 * CRM impl backed by the sandbox UI toggle. Wired into the sandbox-mode
 * router instance so the test UI can flip "is existing client" at runtime.
 */
export const sandboxCRM: CRMClient = {
  isExistingClient: async () => sandboxIsExistingClient,
}

const conversationHistory: Array<{
  id: string
  from: 'user' | 'bot'
  message: string
  timestamp: string
  flow?: string
}> = []

export function addToConversation(from: 'user' | 'bot', message: string, flow?: string) {
  conversationHistory.push({
    id: Date.now().toString(),
    from,
    message,
    timestamp: new Date().toISOString(),
    flow,
  })
  if (conversationHistory.length > 100) {
    conversationHistory.shift()
  }
}

// ─── Route registration ───
// La página QR del sandbox se eliminó: `/` redirige siempre a /admin
// (src/server/http.ts) y el QR vive en la ruta global /qr.

export async function registerSandboxRoutes(fastify: FastifyInstance) {
  fastify.get('/sandbox/sandbox.js', async (request, reply) => {
    try {
      const content = readFileSync(join(__dirname, 'sandbox.js'), 'utf8')
      reply.type('application/javascript').send(content)
    } catch (error) {
      logger.error('Error serving sandbox.js:', error)
      reply.status(404).send('File not found')
    }
  })

  fastify.get('/sandbox/styles.css', async (request, reply) => {
    try {
      const content = readFileSync(join(__dirname, 'styles.css'), 'utf8')
      reply.type('text/css').send(content)
    } catch (error) {
      logger.error('Error serving styles.css:', error)
      reply.status(404).send('File not found')
    }
  })

  fastify.get('/sandbox', async (request, reply) => {
    try {
      const html = readFileSync(join(__dirname, 'sandbox.html'), 'utf8')
      reply.type('text/html').send(html)
    } catch (error) {
      logger.error('Error serving sandbox.html:', error)
      reply.status(500).send('Error loading sandbox')
    }
  })

  fastify.get('/api/conversation', async () => conversationHistory)

  fastify.post('/api/simulate', async (request, reply) => {
    const { message } = request.body as { message: string }
    if (!message) {
      return reply.status(400).send({ error: 'Mensaje requerido' })
    }

    addToConversation('user', message)

    if (!router) {
      return { responses: [{ text: 'Bot router no configurado', flow: 'error' }] }
    }

    try {
      const responses = await routeSandboxMessage(router, message, sandboxDebugMode)
      return { responses }
    } catch (error) {
      logger.error('Error procesando mensaje simulado:', error)
      return { responses: [{ text: 'Error al procesar el mensaje', flow: 'error' }] }
    }
  })

  fastify.get('/api/sandbox/client-mode', async () => ({ isExisting: sandboxIsExistingClient }))

  fastify.post('/api/sandbox/client-mode', async (request) => {
    const { isExisting } = request.body as { isExisting: boolean }
    sandboxIsExistingClient = isExisting
    logger.info(`[SANDBOX] Modo: ${isExisting ? 'CONTACTO GUARDADO' : 'CONTACTO NUEVO'}`)
    return { success: true, isExisting: sandboxIsExistingClient }
  })

  fastify.get('/api/sandbox/debug-mode', async () => ({ debugMode: sandboxDebugMode }))

  fastify.post('/api/sandbox/debug-mode', async (request) => {
    const { debugMode } = request.body as { debugMode: boolean }
    sandboxDebugMode = debugMode
    logger.info(`[SANDBOX] Debug: ${debugMode ? 'ON' : 'OFF'}`)
    return { success: true, debugMode: sandboxDebugMode }
  })

  fastify.post('/api/conversation/clear', async () => {
    conversationHistory.length = 0
    deleteConversation('sandbox_user')
    logger.info('[SANDBOX] Nueva conversación: historial y memoria del bot reseteados')
    return { success: true }
  })

  logger.info('[SERVER] Rutas del sandbox registradas')
}
