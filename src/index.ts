/**
 * Bot WhatsApp - Compromiso Legal
 * Punto de entrada principal. Construye los contratos §4.3, instancia el
 * MessageRouter y los inyecta en los canales activos.
 */

import {
  config,
  providerStatus,
  ragStatus,
  escalationStatus,
} from './config/env.js'
import { logger } from './observability/logger.js'
import { startMemoryCleanup } from './conversation/store/memory.js'
import { defaultConversationStore } from './conversation/store/contract.js'
import { defaultCRMClient } from './conversation/classifier/contract.js'
import {
  defaultEscalationNotifier,
  type EscalationNotifier,
} from './conversation/escalation/contract.js'
import { createTelegramNotifier } from './conversation/escalation/telegram.js'
import { createDefaultRouter } from './pipeline/router.js'
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
  if (escalationStatus.transport === 'telegram') {
    logger.info('[ESCALATION] transport=telegram (real human notification)')
  } else {
    logger.warn(`[ESCALATION] transport=log — ${escalationStatus.reason}`)
  }
  logger.info('========================================')

  startMemoryCleanup()
  logger.info('[MEMORY] Sistema de memoria iniciado')

  await startServer()
  logger.info(`Servidor web: http://localhost:${config.PORT}`)

  // Escalation notifier: Telegram when configured, console-log otherwise.
  // Telegram impl wraps the log impl as fallback so alerts are never lost.
  const notifier: EscalationNotifier =
    escalationStatus.transport === 'telegram'
      ? createTelegramNotifier(
          {
            botToken: config.TELEGRAM_BOT_TOKEN,
            chatId: config.TELEGRAM_NOTIFICATION_CHAT_ID,
          },
          defaultEscalationNotifier
        )
      : defaultEscalationNotifier

  // Production router — uses the static-list CRM.
  const productionRouter = createDefaultRouter({
    store: defaultConversationStore,
    crm: defaultCRMClient,
    notifier,
  })

  // Sandbox mode: build a second router instance whose CRM reflects the
  // UI toggle, and wire it into the sandbox HTTP routes.
  if (config.BOT_MODE === 'sandbox') {
    const { sandboxCRM, setRouter } = await import('./channels/sandbox/index.js')
    const sandboxRouter = createDefaultRouter({
      store: defaultConversationStore,
      crm: sandboxCRM,
      notifier,
    })
    setRouter(sandboxRouter)
    logger.info(`[SANDBOX] UI: http://localhost:${config.PORT}/sandbox`)
    logger.info(`[SANDBOX] Filtrando mensajes de: ${config.TEST_PHONE_NUMBER}`)
  }

  await connectToWhatsApp(productionRouter)
}

main().catch((error) => {
  logger.error('Error fatal:', error)
  process.exit(1)
})
