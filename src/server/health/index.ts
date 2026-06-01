/**
 * Health routes — unauthenticated, no sensitive info.
 * Master prompt §4.2 / §4.5: `/health` and `/ready` live in server/health/.
 * `/ready` lands in Phase 8 (security + readiness signaling).
 */

import type { FastifyInstance } from 'fastify'
import { config } from '../../config/env.js'
import { getConnectionStatus } from '../http.js'

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', async () => ({
    status: 'ok',
    connection: getConnectionStatus(),
    mode: config.BOT_MODE,
  }))
}
