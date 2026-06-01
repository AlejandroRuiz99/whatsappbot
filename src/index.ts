/**
 * Bot WhatsApp - Compromiso Legal
 * Punto de entrada principal
 */

import { config, providerStatus, ragStatus } from './config/env.js'
import { logger } from './observability/logger.js'
import { startMemoryCleanup } from './conversation/store/memory.js'
import { startServer } from './server/http.js'
import { connectToWhatsApp } from './channels/whatsapp/index.js'

async function main() {
  logger.info('========================================')
  logger.info('=== Bot WhatsApp - Compromiso Legal ===')
  logger.info(`Modo: ${config.BOT_MODE}`)
  logger.info(
    `LLM providers: groq=${providerStatus.groq ? 'on' : 'off'}, openai=${providerStatus.openai ? 'on' : 'off'}`
  )
  if (ragStatus.enabled) {
    logger.info('[RAG] enabled (OpenAI embeddings + Pinecone)')
  } else {
    logger.warn(`[RAG] disabled: ${ragStatus.reason}`)
  }
  logger.info('========================================')

  // Iniciar sistema de memoria
  startMemoryCleanup()
  logger.info('[MEMORY] Sistema de memoria iniciado')

  // Iniciar servidor HTTP
  await startServer()
  logger.info(`Servidor web: http://localhost:${config.PORT}`)

  // Configuración específica por modo
  if (config.BOT_MODE === 'sandbox') {
    const { setMessageHandler } = await import('./channels/sandbox/index.js')
    const { handleSandboxMessage } = await import('./channels/sandbox/handler.js')
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
