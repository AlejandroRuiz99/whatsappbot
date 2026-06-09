/**
 * Extranjería handler — detects immigration-related queries.
 * Master prompt §3 flow #2: derivar al número específico del despacho.
 *
 * Robustness layers — bot used to loop redirecting "incapacidad permanente"
 * because "deNIEguen" substring-matched the "nie" keyword, and the user's
 * follow-up "no es de extranjería" kept re-matching the literal word.
 *
 *   1. Unicode word-boundary regex — "nie" no longer matches "denieguen".
 *   2. Clause-aware negation guard — "no estoy hablando de temas de
 *      extranjería" is NOT a hit even when the negator and keyword are
 *      separated by several tokens within the same clause.
 *   3. Prior-redirect rejection — if the bot's previous turn WAS the
 *      extranjería redirect and the user opens with a Spanish negator,
 *      suppress; the LLM owns the real intent from there (system.txt §extranjería
 *      still covers genuine queries that fall through).
 *
 * Keywords live in bot.config.yaml (single source of truth, §4.1).
 */

import { botConfig } from '../../config/bot-config.js'

const NEGATORS = new Set([
  'no', 'nunca', 'jamás', 'jamas', 'tampoco', 'sin', 'ni', 'nada',
])

const CLAUSE_BOUNDARIES = ['.', ',', ';', '!', '?', '\n']
const REJECTION_WINDOW_TOKENS = 6

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function negatedInClauseBefore(text: string, matchIndex: number): boolean {
  const slice = text.slice(0, matchIndex)
  let clauseStart = 0
  for (const b of CLAUSE_BOUNDARIES) {
    const idx = slice.lastIndexOf(b)
    if (idx + 1 > clauseStart) clauseStart = idx + 1
  }
  const tokens = text.slice(clauseStart, matchIndex).match(/\p{L}+/gu) ?? []
  return tokens.some((t) => NEGATORS.has(t.toLowerCase()))
}

function matchesKeyword(text: string, kw: string): boolean {
  const lower = text.toLowerCase()
  const kwLower = kw.toLowerCase()
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegex(kwLower)}(?![\\p{L}\\p{N}])`,
    'gu',
  )
  for (const m of lower.matchAll(re)) {
    if (m.index === undefined) continue
    if (!negatedInClauseBefore(lower, m.index)) return true
  }
  return false
}

function userIsRejectingPriorRedirect(
  message: string,
  lastBotMessage?: string,
): boolean {
  if (!lastBotMessage) return false
  const lastBotLower = lastBotMessage.toLowerCase()
  const redirectDigits = botConfig.extranjeria.redirectPhone.replace(/\D/g, '')
  const lastBotDigits = lastBotLower.replace(/\D/g, '')
  const wasRedirect =
    redirectDigits.length > 0 &&
    lastBotDigits.includes(redirectDigits) &&
    lastBotLower.includes('extranjer')
  if (!wasRedirect) return false
  const tokens = message.toLowerCase().match(/\p{L}+/gu) ?? []
  return tokens.slice(0, REJECTION_WINDOW_TOKENS).some((t) => NEGATORS.has(t))
}

export function isExtranjeriaQuery(
  message: string,
  lastBotMessage?: string,
): boolean {
  if (userIsRejectingPriorRedirect(message, lastBotMessage)) return false
  return botConfig.extranjeria.keywords.some((kw) => matchesKeyword(message, kw))
}
