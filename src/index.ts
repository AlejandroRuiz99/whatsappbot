/**
 * Bot WhatsApp - Compromiso Legal
 * Punto de entrada principal
 */

import { config } from './config/env.js'
import { logger } from './utils/logger.js'
import { startMemoryCleanup } from './services/conversation/memory.js'
import { startServer } from './server/http.js'
import { connectToWhatsApp } from './whatsapp/index.js'

async function main() {
  logger.info('========================================')
  logger.info('=== Bot WhatsApp - Compromiso Legal ===')
  logger.info(`Modo: ${config.BOT_MODE}`)
  logger.info('========================================')

  // Iniciar sistema de memoria
  startMemoryCleanup()
  logger.info('[MEMORY] Sistema de memoria iniciado')

  // Iniciar servidor HTTP
  await startServer()
  logger.info(`Servidor web: http://localhost:${config.PORT}`)

  // Configuración específica por modo
  if (config.BOT_MODE === 'sandbox') {
    const { setMessageHandler } = await import('./server/sandbox/index.js')
    const { handleSandboxMessage } = await import('./server/sandbox/handler.js')
    setMessageHandler(handleSandboxMessage)
    logger.info(`[SANDBOX] UI: http://localhost:${config.PORT}/sandbox`)
    logger.info(`[SANDBOX] Filtrando mensajes de: ${config.TEST_PHONE_NUMBER}`)
  }

  // Conectar a WhatsApp
  await connectToWhatsApp()
}

// Iniciar aplicación
main().catch((error) => {
  logger.error('Error fatal:', error)
  process.exit(1)
})
