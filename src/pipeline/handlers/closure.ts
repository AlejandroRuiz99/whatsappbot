/**
 * Closure handler — detects short goodbye/thanks messages.
 * Master prompt §3 flow #5: "reacción con emoji, sin texto".
 *
 * Keyword/regex list will move to bot.config.yaml in a later phase
 * (master prompt: "El código no contiene constantes de negocio").
 */

import { pickRandom } from '../../utils/helpers.js'

const CLOSURE_PATTERNS: readonly RegExp[] = [
  /^(muchas\s+)?gracias(\s+por\s+todo)?$/,
  /^gracias\s+por\s+la\s+info(rmaci[oó]n)?$/,
  /^(te|le)\s+agradezco$/,
  /^ok(ay)?$/,
  /^vale$/,
  /^perfecto$/,
  /^genial$/,
  /^de\s+acuerdo$/,
  /^entendido$/,
  /^(muy\s+)?bien$/,
  /^guay$/,
  /^estupendo$/,
  /^👍$/,
]

export function isClosureMessage(text: string): boolean {
  const cleaned = text.trim().toLowerCase().replace(/[.!,;¡¿?…]+/g, '').trim()
  return CLOSURE_PATTERNS.some((p) => p.test(cleaned))
}

export function getClosureEmoji(text: string): string {
  const lower = text.toLowerCase()
  if (/gracia/.test(lower)) return pickRandom(['🙏', '😊'])
  if (/perfect|genial|estupendo|guay/.test(lower)) return pickRandom(['😊', '👌'])
  return '👍'
}
