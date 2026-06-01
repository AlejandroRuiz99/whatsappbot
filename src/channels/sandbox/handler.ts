/**
 * Sandbox handler — thin adapter that calls the injected MessageRouter
 * and shapes the result for the sandbox UI (per-bubble messages).
 */

import type { MessageRouter } from '../../pipeline/router.contract.js'
import { splitIntoNaturalMessages } from '../../conversation/humanizer/index.js'
import { addToConversation } from './index.js'

export interface BotResponse {
  text: string
  flow: string
}

export async function routeSandboxMessage(
  router: MessageRouter,
  message: string,
  debugMode: boolean
): Promise<BotResponse[]> {
  const response = await router.route({
    from: 'sandbox_user@s.whatsapp.net',
    body: message,
    meta: { debugMode },
  })

  let bubbles: BotResponse[] = []

  if (response.silent) {
    return []
  }

  if (response.reaction) {
    // Sandbox UI has no native reactions — render the emoji as a bubble.
    bubbles = [{ text: response.reaction, flow: response.flow }]
  } else if (response.messages) {
    for (const text of response.messages) {
      for (const part of splitIntoNaturalMessages(text)) {
        bubbles.push({ text: part, flow: response.flow })
      }
    }
  }

  for (const b of bubbles) {
    addToConversation('bot', b.text, b.flow)
  }
  return bubbles
}
