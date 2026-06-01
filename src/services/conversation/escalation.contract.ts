/**
 * EscalationNotifier — contract (master prompt §4.3 + §5.2).
 *
 * Real human notification (Telegram / email / webhook) lands in Phase 4.
 * For now the default implementation only logs — matches current behavior
 * of escalate.ts:notifyHuman so this PR is additive.
 *
 * The payload shape follows the spec verbatim:
 *   { phone, reason, lastMessages, conversationUrl? }
 * Phase 4 will fill `lastMessages` from ConversationStore and supply
 * `conversationUrl` from the admin dashboard base URL.
 */

import { notifyHuman } from './escalate.js'

export type EscalationReason =
  | 'urgencia'
  | 'frustración'
  | 'consulta_compleja'
  | 'mensaje_repetido'
  | 'response_filter_failed' // reserved for Phase 5
  | 'other'

export interface EscalationPayload {
  phone: string
  reason: EscalationReason | string
  lastMessages: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>
  conversationUrl?: string
  /** Optional display name from WhatsApp pushName, if available. */
  name?: string
}

export interface EscalationNotifier {
  notify(payload: EscalationPayload): Promise<void>
}

/**
 * Default log-only implementation. Adapts the spec payload to the current
 * notifyHuman signature ({from, body, name?}).
 * Phase 4 replaces this with TelegramEscalationNotifier (real destination).
 */
export const defaultEscalationNotifier: EscalationNotifier = {
  notify: async (payload) => {
    const latest = payload.lastMessages.at(-1)
    await notifyHuman({
      from: payload.phone,
      body: latest?.content ?? `[no body — reason=${payload.reason}]`,
      name: payload.name,
    })
  },
}
