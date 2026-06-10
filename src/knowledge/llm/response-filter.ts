/**
 * Response filter (master prompt §5.4).
 *
 * Validates the LLM's text BEFORE it leaves tryProvider.
 * If a violation is found, the caller (llm.service.ts) runs a corrective
 * retry with a system addon built from buildCorrectionAddon().
 *
 * Authorized prices are derived from softLimits.consultationPrice and
 * softLimits.studyPrice so they cannot drift from the bot's single source
 * of truth.
 */

import { botConfig } from '../../config/bot-config.js'
import { SERVICIOS } from '../catalog/catalog.data.js'

export type FilterViolation =
  | { kind: 'banned_phrase'; phrase: string }
  | { kind: 'unauthorized_price'; match: string }
  | { kind: 'too_long'; chars: number; max: number }
  | { kind: 'too_many_paragraphs'; count: number; max: number }
  | { kind: 'markdown_header'; line: string }

export interface FilterResult {
  ok: boolean
  violations: FilterViolation[]
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

let authorizedCache: Set<string> | null = null

function authorizedPriceDigits(): Set<string> {
  if (authorizedCache) return authorizedCache
  const set = new Set<string>()
  for (const label of [botConfig.softLimits.consultationPrice, botConfig.softLimits.studyPrice]) {
    const digits = label.replace(/\D/g, '')
    if (digits) set.add(digits)
  }
  // Tarifario oficial (MEJORAS BOT 2026-06): trámites con IVA aparte.
  for (const p of botConfig.responseFilter.authorizedPrices) set.add(p)
  // Precios orientativos del catálogo: el bot puede citarlos al recomendar
  // un servicio, así que no deben dispararse como no autorizados.
  for (const s of SERVICIOS) {
    for (const m of (s.precioOrientativo ?? '').match(/\d+/g) ?? []) set.add(m)
  }
  authorizedCache = set
  return set
}

export function evaluateResponse(text: string): FilterResult {
  const cfg = botConfig.responseFilter
  const violations: FilterViolation[] = []

  for (const phrase of cfg.bannedPhrases) {
    const re = new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'iu')
    if (re.test(text)) {
      violations.push({ kind: 'banned_phrase', phrase })
    }
  }

  const authorized = authorizedPriceDigits()
  const priceRe = /(\d{1,4})\s*(€|euros?)/giu
  let m: RegExpExecArray | null
  while ((m = priceRe.exec(text)) !== null) {
    if (!authorized.has(m[1])) {
      violations.push({ kind: 'unauthorized_price', match: m[0] })
    }
  }

  if (text.length > cfg.maxLength) {
    violations.push({ kind: 'too_long', chars: text.length, max: cfg.maxLength })
  }

  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 0)
  if (paragraphs.length > cfg.maxParagraphs) {
    violations.push({ kind: 'too_many_paragraphs', count: paragraphs.length, max: cfg.maxParagraphs })
  }

  for (const line of text.split('\n')) {
    if (/^#{1,6}\s+/.test(line)) {
      violations.push({ kind: 'markdown_header', line: line.trim().substring(0, 60) })
      break
    }
  }

  return { ok: violations.length === 0, violations }
}

export function buildCorrectionAddon(violations: FilterViolation[]): string {
  const reasons = violations.map(v => {
    switch (v.kind) {
      case 'banned_phrase':
        return `usaste la frase prohibida "${v.phrase}"`
      case 'unauthorized_price':
        return `mencionaste un precio no autorizado (${v.match}); solo son válidos los precios oficiales del despacho`
      case 'too_long':
        return `tu respuesta tuvo ${v.chars} caracteres (máximo ${v.max})`
      case 'too_many_paragraphs':
        return `usaste ${v.count} párrafos (máximo ${v.max})`
      case 'markdown_header':
        return `usaste markdown ("${v.line}")`
    }
  })
  return (
    `Tu respuesta anterior incumplió las reglas del despacho: ${reasons.join('; ')}. ` +
    `Reformúlala respetando esas reglas y mantén el tono natural de Clara (administrativa, no abogada).`
  )
}

export function summarizeViolations(violations: FilterViolation[]): string {
  return violations.map(v => v.kind).join(',')
}
