/**
 * Servicio de Humanización
 * Delays realistas, escritura simulada y mensajes cortos estilo WhatsApp
 */

import { logger } from '../../utils/logger.js'
import { botConfig } from '../../config/bot-config.js'

const h = botConfig.humanizer

/**
 * Calcula un delay de "lectura" antes de empezar a escribir.
 */
export function calculateReadingDelay(clientMessageLength: number): number {
  const rd = h.readingDelay
  if (clientMessageLength < 20) return randomBetween(rd.veryShort[0], rd.veryShort[1])
  if (clientMessageLength < 80) return randomBetween(rd.short[0], rd.short[1])
  if (clientMessageLength < 200) return randomBetween(rd.medium[0], rd.medium[1])
  return randomBetween(rd.long[0], rd.long[1])
}

/**
 * Calcula un delay realista de escritura.
 */
export function calculateTypingDelay(text: string): number {
  const len = text.length
  const td = h.typingDelay

  if (len < 30) return randomBetween(td.veryShort[0], td.veryShort[1])
  if (len < 80) return randomBetween(td.short[0], td.short[1])

  if (len < 180) {
    const base = (len / td.medium.charsPerSecond) * 1000
    return randomBetween(Math.max(td.medium.min, base * 0.8), Math.min(td.medium.max, base * 1.3))
  }

  const base = (len / td.long.charsPerSecond) * 1000
  return randomBetween(Math.max(td.long.min, base * 0.7), Math.min(td.long.max, base * 1.1))
}

/**
 * Divide texto en mensajes cortos estilo WhatsApp.
 */
export function splitIntoNaturalMessages(text: string): string[] {
  const trimmed = text.trim()
  const maxLen = h.whatsappMaxLength

  if (trimmed.length <= maxLen) {
    return [trimmed]
  }

  const cb = h.cohesiveBlock
  const hasParagraphs = trimmed.includes('\n\n')
  const sentenceCount = (trimmed.match(/[.!?]+/g) || []).length
  if (!hasParagraphs && sentenceCount <= cb.maxSentences && trimmed.length <= cb.maxLength && Math.random() < cb.probability) {
    return [trimmed]
  }

  const messages: string[] = []
  const paragraphs = trimmed.split('\n\n').filter(p => p.trim().length > 0)

  for (const paragraph of paragraphs) {
    const cleaned = paragraph.trim()

    if (cleaned.length <= maxLen) {
      messages.push(cleaned)
      continue
    }

    const sentences = cleaned.split(/(?<=[.!?])\s+/)
    let current = ''

    for (const sentence of sentences) {
      if (current.length === 0) {
        current = sentence
      } else if (current.length + sentence.length + 1 <= maxLen) {
        current += ' ' + sentence
      } else {
        messages.push(current.trim())
        current = sentence
      }
    }

    if (current.trim().length > 0) {
      messages.push(current.trim())
    }
  }

  const result: string[] = []
  for (const msg of messages) {
    if (msg.length <= maxLen * 1.5) {
      result.push(msg)
    } else {
      const parts = splitAtCommas(msg, maxLen)
      result.push(...parts)
    }
  }

  return result.length > 0 ? result : [trimmed]
}

function splitAtCommas(text: string, maxLen: number): string[] {
  const parts: string[] = []
  const segments = text.split(/,\s*/)
  let current = ''

  for (const seg of segments) {
    if (current.length === 0) {
      current = seg
    } else if (current.length + seg.length + 2 <= maxLen) {
      current += ', ' + seg
    } else {
      parts.push(current.trim())
      current = seg
    }
  }

  if (current.trim().length > 0) {
    parts.push(current.trim())
  }

  return parts
}

/**
 * Simula typing indicator y envía mensaje después del delay
 */
export async function simulateTypingAndSend(
  chat: any,
  text: string
): Promise<void> {
  const delay = calculateTypingDelay(text)

  logger.debug(`[HUMANIZER] Simulando escritura: ${Math.round(delay / 1000)}s para ${text.length} chars`)

  if (chat.sendStateTyping) {
    await chat.sendStateTyping()
  }

  await sleep(delay)

  if (chat.sendMessage) {
    await chat.sendMessage(text)
  }
}

/**
 * Envía múltiples mensajes con pausas naturales entre ellos.
 */
export async function sendHumanizedMessage(
  chat: any,
  text: string
): Promise<void> {
  const messages = splitIntoNaturalMessages(text)

  if (messages.length === 1) {
    await simulateTypingAndSend(chat, messages[0])
    return
  }

  logger.debug(`[HUMANIZER] Enviando ${messages.length} mensajes separados`)

  for (let i = 0; i < messages.length; i++) {
    await simulateTypingAndSend(chat, messages[i])

    if (i < messages.length - 1) {
      const nextLen = messages[i + 1].length
      const pause = pauseBetweenMessages(i, messages.length, nextLen)
      logger.debug(`[HUMANIZER] Pausa entre mensajes: ${Math.round(pause / 1000)}s (siguiente: ${nextLen} chars)`)
      await sleep(pause)
    }
  }
}

/**
 * Versión para sandbox (sin WhatsApp real)
 */
export async function sendHumanizedMessageSandbox(
  to: string,
  text: string,
  sendMessage: (to: string, text: string) => Promise<void>
): Promise<void> {
  const messages = splitIntoNaturalMessages(text)

  for (let i = 0; i < messages.length; i++) {
    const delay = calculateTypingDelay(messages[i])
    await sleep(delay)
    await sendMessage(to, messages[i])

    if (i < messages.length - 1) {
      const nextLen = messages[i + 1].length
      const pause = pauseBetweenMessages(i, messages.length, nextLen)
      await sleep(pause)
    }
  }
}

/**
 * Calcula la pausa entre mensajes consecutivos.
 */
export function pauseBetweenMessages(index: number, total: number, nextMessageLength: number): number {
  const pbm = h.pauseBetweenMessages
  let base: number

  if (nextMessageLength < 30) {
    base = randomBetween(pbm.shortNext[0], pbm.shortNext[1])
  } else if (nextMessageLength < 100) {
    base = randomBetween(pbm.mediumNext[0], pbm.mediumNext[1])
  } else {
    base = randomBetween(pbm.longNext[0], pbm.longNext[1])
  }

  if (index === 0) {
    base = Math.round(base * pbm.firstMessageFactor)
  }

  if (index >= total - 2) {
    base += randomBetween(pbm.lastMessageExtra[0], pbm.lastMessageExtra[1])
  }

  return base
}

export function addHumanVariation(text: string, _probability: number = 0.05): string {
  return text
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function getHumanizationStats(text: string): {
  messageCount: number
  averageDelay: number
  totalDelay: number
  characterCount: number
} {
  const messages = splitIntoNaturalMessages(text)
  const delays = messages.map(m => calculateTypingDelay(m))
  const totalDelay = delays.reduce((sum, d) => sum + d, 0)
  const averageDelay = totalDelay / delays.length
  const pauseDelay = (messages.length - 1) * 2000

  return {
    messageCount: messages.length,
    averageDelay: Math.round(averageDelay),
    totalDelay: Math.round(totalDelay + pauseDelay),
    characterCount: text.length
  }
}
