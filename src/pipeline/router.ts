/**
 * DefaultMessageRouter — implements MessageRouter (master prompt §3, §4.3).
 *
 * Single source of truth for §3 flow dispatch. Channels (whatsapp, sandbox)
 * are thin adapters: they translate channel-specific events into
 * MessageInput, call router.route(), then apply the RoutedResponse.
 *
 * Order (matches master prompt §3):
 *   existing_client → extranjeria → escalation → closure → ai
 *
 * Structural_ignore stays at the channel (it never reaches the router).
 * Media stays at the channel today; folding into the router is deferred.
 */

import type {
  MessageRouter,
  MessageInput,
  RoutedResponse,
} from './router.contract.js'
import type { ConversationStore } from '../conversation/store/contract.js'
import type { CRMClient } from '../conversation/classifier/contract.js'
import type { EscalationNotifier } from '../conversation/escalation/contract.js'
import { shouldEscalate } from '../conversation/escalation/escalate.js'
import { getAIResponse } from '../knowledge/llm/llm.service.js'
import { MESSAGES } from './templates.js'
import { isClosureMessage, getClosureEmoji } from './handlers/closure.js'
import { isExtranjeriaQuery } from './handlers/extranjeria.js'
import { logger } from '../observability/logger.js'
import { recordMetric } from '../observability/metrics.js'
import { botEvents } from '../observability/event-bus.js'

export interface RouterDeps {
  store: ConversationStore
  crm: CRMClient
  notifier: EscalationNotifier
}

function normalizePhone(jid: string): string {
  const stripped = jid.replace('@s.whatsapp.net', '')
  const digits = stripped.replace(/\D/g, '')
  // Fallback: keep non-digit ids (e.g. 'sandbox_user') so memory/AI flow
  // don't see them as empty/falsy and skip persistence.
  return digits || stripped
}

export class DefaultMessageRouter implements MessageRouter {
  constructor(private readonly deps: RouterDeps) {}

  async route(input: MessageInput): Promise<RoutedResponse> {
    const phone = normalizePhone(input.from)
    const debugMode = Boolean(input.meta?.debugMode)

    // 1. EXISTING CLIENT
    if (await this.deps.crm.isExistingClient(phone)) {
      const text = MESSAGES.existingClient
      this.deps.store.addUserMessage(phone, input.body)
      this.deps.store.addBotMessage(phone, text)
      logger.bot(`[ROUTER] ${phone} → existing_client`)
      recordMetric('flow', 'cliente_existente')
      return { flow: 'existing_client', messages: [text] }
    }

    // 2. EXTRANJERIA
    if (isExtranjeriaQuery(input.body)) {
      const text = MESSAGES.extranjeria
      this.deps.store.addUserMessage(phone, input.body)
      this.deps.store.addBotMessage(phone, text)
      logger.info(`[ROUTER] ${phone} → extranjeria`)
      recordMetric('flow', 'extranjeria_redirect')
      return { flow: 'extranjeria', messages: [text] }
    }

    // 3. ESCALATION
    const esc = shouldEscalate(input.body, phone)
    if (esc.escalate) {
      // Build a richer payload: last N messages from the store + the
      // current incoming one (not stored yet — added below).
      const history = this.deps.store.getHistoryWithTimestamps(phone) ?? []
      const lastMessages = history.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }))
      lastMessages.push({
        role: 'user',
        content: input.body,
        timestamp: Date.now(),
      })

      await this.deps.notifier.notify({
        phone,
        reason: esc.reason || 'other',
        lastMessages,
        name: input.pushName,
      })
      const text = MESSAGES.escalation
      this.deps.store.addUserMessage(phone, input.body)
      this.deps.store.addBotMessage(phone, text)
      logger.bot(`[ROUTER] ${phone} → escalation (${esc.reason})`)
      recordMetric('escalation')
      recordMetric('flow', `escalado_${esc.reason}`)
      botEvents.publish({
        type: 'escalation',
        phone,
        reason: esc.reason ?? 'desconocido',
        message: input.body,
        timestamp: Date.now(),
      })
      return {
        flow: 'escalation',
        messages: [text],
        meta: { reason: esc.reason },
      }
    }

    // 4. CLOSURE (spec §3 #5 — after the high-priority gates)
    if (isClosureMessage(input.body)) {
      this.deps.store.addUserMessage(phone, input.body)
      this.deps.store.addBotMessage(phone, '👍')
      logger.info(`[ROUTER] ${phone} → closure`)
      recordMetric('flow', 'closure')
      return { flow: 'closure', reaction: getClosureEmoji(input.body) }
    }

    // 5. AI — getAIResponse owns its own memory writes
    logger.bot(`[ROUTER] ${phone} → ai`)
    recordMetric('flow', 'ia_response')
    const ai = await getAIResponse(input.body, phone, { debugMode })
    return { flow: 'ai', messages: [ai] }
  }
}

export function createDefaultRouter(deps: RouterDeps): MessageRouter {
  return new DefaultMessageRouter(deps)
}
