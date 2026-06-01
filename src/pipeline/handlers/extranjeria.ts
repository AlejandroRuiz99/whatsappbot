/**
 * Extranjería handler — detects immigration-related queries.
 * Master prompt §3 flow #2: derivar al número específico del despacho.
 *
 * Keywords live in bot.config.yaml (single source of truth, §4.1).
 */

import { botConfig } from '../../config/bot-config.js'

export function isExtranjeriaQuery(message: string): boolean {
  const lower = message.toLowerCase()
  return botConfig.extranjeria.keywords.some((kw) => lower.includes(kw.toLowerCase()))
}
