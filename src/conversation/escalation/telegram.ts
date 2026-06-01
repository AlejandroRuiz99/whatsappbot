/**
 * Telegram-based EscalationNotifier (master prompt §4.3, §5.2).
 *
 * Posts the escalation payload to a Telegram chat via the bot HTTP API.
 * If the request fails (network, 4xx/5xx, timeout) the notifier falls
 * back to a wrapped log-only impl so the alert is never silently dropped.
 *
 * The notifier never throws upstream — the router/channel must not fail
 * because of a notification transport issue.
 */

import { logger } from '../../observability/logger.js'
import type { EscalationNotifier, EscalationPayload } from './contract.js'

const TELEGRAM_API = 'https://api.telegram.org'
const REQUEST_TIMEOUT_MS = 5_000
const MAX_BODY_CHARS = 4000 // Telegram per-message limit is 4096

export interface TelegramConfig {
  botToken: string
  chatId: string
}

export class TelegramEscalationNotifier implements EscalationNotifier {
  constructor(
    private readonly cfg: TelegramConfig,
    private readonly fallback: EscalationNotifier
  ) {}

  async notify(payload: EscalationPayload): Promise<void> {
    const text = formatPayload(payload)
    const url = `${TELEGRAM_API}/bot${this.cfg.botToken}/sendMessage`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.cfg.chatId,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      })

      if (!resp.ok) {
        const body = await safeReadBody(resp)
        logger.error(
          `[TELEGRAM] notify failed: ${resp.status} ${resp.statusText} — ${body}`
        )
        await this.fallback.notify(payload)
        return
      }

      logger.info(
        `[TELEGRAM] notified ${maskPhone(payload.phone)} → reason=${payload.reason}`
      )
    } catch (e) {
      const reason = controller.signal.aborted ? 'timeout' : String(e)
      logger.error(`[TELEGRAM] notify exception (${reason}) — using fallback`)
      try {
        await this.fallback.notify(payload)
      } catch (fallbackError) {
        logger.error('[TELEGRAM] fallback notifier also failed:', fallbackError)
      }
    } finally {
      clearTimeout(timeout)
    }
  }
}

function formatPayload(p: EscalationPayload): string {
  const lines: string[] = [
    '🚨 *Escalado del bot*',
    `*Teléfono:* \`${escapeMd(p.phone)}\``,
  ]
  if (p.name) lines.push(`*Nombre:* ${escapeMd(p.name)}`)
  lines.push(`*Motivo:* ${escapeMd(String(p.reason))}`)
  lines.push(`*Hora:* ${new Date().toISOString()}`)
  lines.push('')
  lines.push('*Últimos mensajes:*')
  for (const m of p.lastMessages) {
    const who = m.role === 'user' ? '👤' : '🤖'
    lines.push(`${who} ${escapeMd(m.content)}`)
  }
  if (p.conversationUrl) {
    lines.push('')
    lines.push(`[Ver conversación](${p.conversationUrl})`)
  }
  const full = lines.join('\n')
  return full.length > MAX_BODY_CHARS
    ? full.slice(0, MAX_BODY_CHARS - 20) + '\n…[truncado]'
    : full
}

function escapeMd(s: string): string {
  // Minimal escape — covers the Markdown V1 chars Telegram is strict about.
  return s.replace(/([_*`\[\]])/g, '\\$1')
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 3) return digits
  return `***${digits.slice(-3)}`
}

async function safeReadBody(resp: Response): Promise<string> {
  try {
    return (await resp.text()).slice(0, 200)
  } catch {
    return '<unreadable>'
  }
}

export function createTelegramNotifier(
  cfg: TelegramConfig,
  fallback: EscalationNotifier
): EscalationNotifier {
  return new TelegramEscalationNotifier(cfg, fallback)
}
