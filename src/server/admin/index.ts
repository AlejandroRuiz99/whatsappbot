/**
 * Módulo de administración del bot.
 * Expone rutas REST y un endpoint SSE para el panel de control en /admin.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { FastifyInstance } from 'fastify'
import { botEvents, type BotEvent } from '../../observability/event-bus.js'
import { getLogBuffer, isDebugEnabled, setDebugEnabled } from '../../observability/log-service.js'
import { getMetricsSnapshot } from '../../observability/metrics.js'
import {
  listActiveConversations,
  getConversationWithTimestamps,
  deleteConversation,
} from '../../conversation/store/memory.js'
import { getConnectionStatus, getQRCode } from '../http.js'
import { getWhatsAppUser, getPendingMessageCount } from '../../channels/whatsapp/connection.js'
import { logger } from '../../observability/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Historial de eventos de conexión (últimos 20)
const connectionHistory: Array<{ status: string; timestamp: number }> = []
botEvents.subscribe((event) => {
  if (event.type === 'connection') {
    connectionHistory.push({ status: event.status, timestamp: event.timestamp })
    if (connectionHistory.length > 20) connectionHistory.shift()
  }
})

function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone
  const visible = 3
  return phone.slice(0, visible) + '*'.repeat(Math.max(phone.length - visible - 3, 3)) + phone.slice(-3)
}

function serveStatic(filePath: string): Buffer {
  return readFileSync(join(__dirname, filePath))
}

export async function registerAdminRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Archivos estáticos del dashboard ───
  fastify.get('/admin', (_req, reply) => {
    try {
      const html = serveStatic('admin.html')
      reply.type('text/html').send(html)
    } catch {
      reply.status(404).send('Admin UI not found. Run npm run build first.')
    }
  })

  fastify.get('/admin/admin.js', (_req, reply) => {
    const js = serveStatic('admin.js')
    reply.type('application/javascript').send(js)
  })

  fastify.get('/admin/admin.css', (_req, reply) => {
    const css = serveStatic('admin.css')
    reply.type('text/css').send(css)
  })

  // ─── SSE: stream de eventos en tiempo real ───
  fastify.get('/api/admin/events', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    reply.raw.write(': connected\n\n')

    const send = (event: BotEvent) => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      }
    }

    const unsub = botEvents.subscribe(send)

    // Heartbeat cada 20s para mantener la conexión viva
    const heartbeat = setInterval(() => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(': heartbeat\n\n')
      }
    }, 20_000)

    // Métricas cada 5s
    const metricsTick = setInterval(() => {
      if (!reply.raw.writableEnded) {
        const snap = getMetricsSnapshot()
        reply.raw.write(`data: ${JSON.stringify({ type: 'metrics', ...snap, timestamp: Date.now() })}\n\n`)
      }
    }, 5_000)

    await new Promise<void>((resolve) => {
      request.raw.on('close', resolve)
      request.raw.on('error', resolve)
    })

    clearInterval(heartbeat)
    clearInterval(metricsTick)
    unsub()
  })

  // ─── Conversaciones ───
  fastify.get('/api/admin/conversations', async () => {
    return listActiveConversations().map(c => ({
      ...c,
      phoneDisplay: maskPhone(c.phone),
      latestMessage: c.latestMessage
        ? { ...c.latestMessage, content: c.latestMessage.content.slice(0, 100) }
        : null,
    }))
  })

  fastify.get<{ Params: { phone: string } }>('/api/admin/conversations/:phone', async (request, reply) => {
    const { phone } = request.params
    const messages = getConversationWithTimestamps(phone)
    if (!messages) {
      reply.status(404).send({ error: 'Conversación no encontrada' })
      return
    }
    return { phone, phoneDisplay: maskPhone(phone), messages }
  })

  fastify.delete<{ Params: { phone: string } }>('/api/admin/conversations/:phone', async (request, reply) => {
    const { phone } = request.params
    const deleted = deleteConversation(phone)
    if (!deleted) {
      reply.status(404).send({ error: 'Conversación no encontrada' })
      return
    }
    logger.info(`[ADMIN] Conversación eliminada: ${maskPhone(phone)}`)
    return { success: true }
  })

  // ─── Logs ───
  fastify.get<{ Querystring: { level?: string; limit?: string } }>('/api/admin/logs', async (request) => {
    const { level, limit = '200' } = request.query
    const levels = level ? level.split(',').map(l => l.trim().toLowerCase()) : undefined
    const entries = getLogBuffer(levels).slice(-parseInt(limit, 10))
    return { logs: entries, debugEnabled: isDebugEnabled() }
  })

  // ─── Métricas ───
  fastify.get('/api/admin/metrics', async () => {
    return getMetricsSnapshot()
  })

  // ─── Estado de conexión ───
  fastify.get('/api/admin/connection', async () => {
    const status = getConnectionStatus()
    const qr = getQRCode()
    const user = getWhatsAppUser()
    const metrics = getMetricsSnapshot()
    return {
      status,
      connected: status === 'connected',
      qr,
      user,
      pendingMessages: getPendingMessageCount(),
      uptime: metrics.uptime,
      startedAt: metrics.startedAt,
      history: connectionHistory,
    }
  })

  // ─── Toggle debug ───
  fastify.post<{ Body: { enabled: boolean } }>('/api/admin/debug', async (request, reply) => {
    const { enabled } = request.body
    if (typeof enabled !== 'boolean') {
      reply.status(400).send({ error: 'Se requiere { enabled: boolean }' })
      return
    }
    setDebugEnabled(enabled)
    logger.info(`[ADMIN] Debug logging ${enabled ? 'activado' : 'desactivado'}`)
    return { debugEnabled: isDebugEnabled() }
  })

  // ─── Restart ───
  fastify.post('/api/admin/restart', async (_req, reply) => {
    logger.info('[ADMIN] Reinicio solicitado desde panel de administración')
    const { rmSync } = await import('fs')
    try {
      rmSync(join(process.cwd(), 'auth_info'), { recursive: true, force: true })
    } catch { /* puede no existir */ }
    reply.send({ status: 'restarting' })
    setTimeout(() => process.exit(0), 500)
  })

  logger.info('[ADMIN] Panel de administración disponible en /admin')
}
