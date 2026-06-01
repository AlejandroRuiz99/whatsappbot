/**
 * Escalation detection (master prompt §5.2).
 *
 * Rules:
 *  - Keywords live in bot.config.yaml — code carries no business constants.
 *  - Detection uses unicode-aware word boundaries (not raw substring) so
 *    "urgentemente" does NOT match the keyword "urgente".
 *  - Negation guard: if a Spanish negator appears within the previous
 *    NEGATION_WINDOW_TOKENS tokens, the match is suppressed. "no es urgente"
 *    no longer escalates. Keywords that THEMSELVES start with a negator
 *    (e.g. "no entiendo") skip the guard so they still escalate as intended.
 *  - A user repeating the same message ≥ repeatMessageThreshold times
 *    escalates regardless of content.
 */

import { logger } from '../../observability/logger.js'
import { botConfig } from '../../config/bot-config.js'

const MENSAJES_REPETIDOS_TTL_MS = 24 * 60 * 60 * 1000

const NEGATORS = new Set(['no', 'nunca', 'jamás', 'jamas', 'tampoco', 'sin', 'ni'])
const NEGATION_WINDOW_TOKENS = 4

const mensajesRepetidos = new Map<
  string,
  { ultimo: string; contador: number; timestamp: number }
>()

function detectarMensajeRepetido(phone: string, message: string): boolean {
  const lower = message.toLowerCase().trim()
  const now = Date.now()

  for (const [key, val] of mensajesRepetidos) {
    if (now - val.timestamp > MENSAJES_REPETIDOS_TTL_MS) {
      mensajesRepetidos.delete(key)
    }
  }

  const registro = mensajesRepetidos.get(phone)
  if (registro && registro.ultimo === lower) {
    registro.contador++
    registro.timestamp = now
    if (registro.contador >= botConfig.escalation.repeatMessageThreshold) {
      mensajesRepetidos.delete(phone)
      return true
    }
  } else {
    mensajesRepetidos.set(phone, { ultimo: lower, contador: 1, timestamp: now })
  }
  return false
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function firstToken(s: string): string {
  return (s.match(/\S+/)?.[0] ?? '').toLowerCase()
}

function isNegated(textBefore: string): boolean {
  const tokens = textBefore.match(/\p{L}+/gu) ?? []
  const window = tokens.slice(-NEGATION_WINDOW_TOKENS)
  return window.some((t) => NEGATORS.has(t.toLowerCase()))
}

function matchesKeyword(text: string, kw: string): boolean {
  const lower = text.toLowerCase()
  const kwLower = kw.toLowerCase()
  // Unicode-aware word boundary via lookbehind/lookahead.
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegex(kwLower)}(?![\\p{L}\\p{N}])`,
    'u'
  )
  const m = lower.match(re)
  if (!m || m.index === undefined) return false
  // Keywords that themselves start with a negator must not be filtered out
  // by the negation guard (e.g. "no entiendo" IS a legitimate escalation).
  if (NEGATORS.has(firstToken(kwLower))) return true
  return !isNegated(lower.slice(0, m.index))
}

export function shouldEscalate(
  message: string,
  phone?: string
): { escalate: boolean; reason?: string } {
  const esc = botConfig.escalation

  if (esc.urgencyKeywords.some((kw) => matchesKeyword(message, kw))) {
    return { escalate: true, reason: 'urgencia' }
  }
  if (esc.negativeKeywords.some((kw) => matchesKeyword(message, kw))) {
    return { escalate: true, reason: 'frustración' }
  }
  if (esc.complexityKeywords.some((kw) => matchesKeyword(message, kw))) {
    return { escalate: true, reason: 'consulta_compleja' }
  }
  if (phone && detectarMensajeRepetido(phone, message)) {
    return { escalate: true, reason: 'mensaje_repetido' }
  }
  return { escalate: false }
}

interface EscalateContext {
  from: string
  body: string
  name?: string
}

/**
 * Legacy log-only sink. Kept for the default EscalationNotifier fallback;
 * real transports live in src/conversation/escalation/telegram.ts.
 */
export async function notifyHuman(ctx: EscalateContext): Promise<void> {
  logger.warn('=== ESCALADO A HUMANO ===')
  logger.warn(`Numero: ${ctx.from}`)
  logger.warn(`Nombre: ${ctx.name || 'No disponible'}`)
  logger.warn(`Mensaje: ${ctx.body}`)
  logger.warn(`Timestamp: ${new Date().toISOString()}`)
  logger.warn('========================')
}
