/**
 * Protección del panel admin (revisión de seguridad 2026-06).
 *
 * El panel /admin y las APIs /api/admin/* exponen PII de clientes (teléfonos,
 * conversaciones, alertas) y acciones sensibles (borrar conversación, pausar
 * el bot, reiniciar/desvincular WhatsApp). En un pod con URL pública esto no
 * puede quedar abierto.
 *
 * Diseño deliberadamente simple (sin dependencias): un token compartido
 * (ADMIN_TOKEN). Si no está definido, el guard NO bloquea — solo avisa al
 * arranque — para no romper el uso en local. Si está definido, se exige en:
 *   - cookie `admin_token` (la pone el GET /admin cuando se entra con ?token=)
 *   - header `x-admin-token`
 *   - query `?token=` (primer acceso; se traslada a cookie)
 *
 * Comparación en tiempo constante para no filtrar el token por timing.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { config } from '../config/env.js'
import { logger } from '../observability/logger.js'

const COOKIE_NAME = 'admin_token'

// Rutas que el guard protege. /api/restart se incluye porque desvincula
// WhatsApp igual que /api/admin/restart.
function isProtected(url: string): boolean {
  const path = url.split('?')[0]
  return (
    path === '/admin' ||
    path.startsWith('/admin/') ||
    path.startsWith('/api/admin') ||
    path === '/api/restart'
  )
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function readCookie(req: FastifyRequest, name: string): string | undefined {
  const raw = req.headers.cookie
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

function providedToken(req: FastifyRequest): string | undefined {
  const header = req.headers['x-admin-token']
  if (typeof header === 'string' && header) return header
  const query = (req.query as Record<string, unknown> | undefined)?.token
  if (typeof query === 'string' && query) return query
  return readCookie(req, COOKIE_NAME)
}

export function registerAdminAuth(fastify: FastifyInstance): void {
  const token = config.ADMIN_TOKEN

  if (!token) {
    if (config.BOT_MODE === 'production') {
      logger.warn(
        '[AUTH] ADMIN_TOKEN no definido: el panel /admin queda ABIERTO. ' +
          'Define ADMIN_TOKEN en producción — expone datos de clientes.'
      )
    } else {
      logger.info('[AUTH] ADMIN_TOKEN no definido: panel /admin sin protección (modo local)')
    }
    return
  }

  fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isProtected(req.url)) return

    const supplied = providedToken(req)
    if (supplied && constantTimeEqual(supplied, token)) {
      // Primer acceso con ?token= → fijar cookie para las llamadas siguientes
      // (el admin.js hace fetch a /api/admin/* y la cookie viaja sola).
      const viaQuery = (req.query as Record<string, unknown> | undefined)?.token
      if (typeof viaQuery === 'string' && viaQuery) {
        const secure = config.BOT_MODE === 'production' ? '; Secure' : ''
        reply.header(
          'set-cookie',
          `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/${secure}; Max-Age=86400`
        )
      }
      return
    }

    // Para el HTML del panel devolvemos un 401 legible; para las APIs, JSON.
    reply.status(401)
    if (req.url.split('?')[0] === '/admin') {
      reply.type('text/html').send(
        '<html><head><meta charset="utf-8"><title>Acceso restringido</title>' +
          '<style>body{font-family:system-ui;background:#0b141a;color:#e9edef;display:flex;' +
          'align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}' +
          '.c{padding:32px;border:1px solid #2a3a4d;border-radius:12px;max-width:420px}</style></head>' +
          '<body><div class="c"><h2>🔒 Panel restringido</h2>' +
          '<p>Accede con tu token: <code>/admin?token=TU_TOKEN</code></p></div></body></html>'
      )
    } else {
      reply.send({ error: 'unauthorized' })
    }
  })

  logger.info('[AUTH] Panel /admin protegido con ADMIN_TOKEN')
}
