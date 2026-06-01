/**
 * WhatsApp channel — Baileys connection, debounce, presence, humanized send.
 * Thin adapter: translates channel events to MessageInput, delegates to
 * the injected MessageRouter, applies the RoutedResponse.
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion,
} from 'baileys'
import { Boom } from '@hapi/boom'
import * as QRCode from 'qrcode'
import pino from 'pino'
import { config } from '../../config/env.js'
import { botConfig } from '../../config/bot-config.js'
import { logger } from '../../observability/logger.js'
import { shouldProcessMessage } from '../sandbox/phone-filter.js'
import { setQRCode, setConnectionStatus } from '../../server/http.js'
import { MESSAGES } from '../../pipeline/templates.js'
import { isClosureMessage } from '../../pipeline/handlers/closure.js'
import type { MessageRouter } from '../../pipeline/router.contract.js'
import {
  calculateReadingDelay,
  calculateTypingDelay,
  pauseBetweenMessages,
  splitIntoNaturalMessages,
} from '../../conversation/humanizer/index.js'
import { sleep, pickRandom, randomBetween } from '../../utils/helpers.js'
import { botEvents } from '../../observability/event-bus.js'
import { recordMetric } from '../../observability/metrics.js'

let sock: WASocket | null = null

interface PendingMessage {
  timer: NodeJS.Timeout
}
const pendingMessages = new Map<string, PendingMessage>()

const MAX_SUBSCRIBED_PRESENCES = 1000
const subscribedPresences = new Set<string>()

const DEBOUNCE_MS = botConfig.whatsapp.debounceMs

const MEDIA_TYPES = [
  'imageMessage',
  'documentMessage',
  'videoMessage',
  'audioMessage',
  'stickerMessage',
]

// Media stays at the channel for now (not yet a §3 router flow).
// Folding into the router is deferred to a later phase.
const mediaResponses = [
  'Lo he recibido. Para poder revisarlo bien tendríamos que verlo en consulta. ¿Quiere que le pase el enlace para agendar cita?',
  'Lo veo, pero para analizar documentos necesitaría hacerlo en consulta. Si le interesa podemos agendar una',
  'He recibido el archivo. Para poder revisarlo con calma sería mejor hacerlo en una consulta. Le puedo pasar el enlace si quiere',
]

export function getSocket(): WASocket | null {
  return sock
}

export function getWhatsAppUser(): { id: string; name: string } | null {
  if (!sock?.user) return null
  return {
    id: sock.user.id.replace('@s.whatsapp.net', '').replace(/:\d+/, ''),
    name: sock.user.name || '',
  }
}

export function getPendingMessageCount(): number {
  return pendingMessages.size
}

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  if (!sock) {
    throw new Error('WhatsApp no conectado')
  }
  await sock.sendMessage(to, { text })
}

export async function connectToWhatsApp(router: MessageRouter): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')
  const { version, isLatest } = await fetchLatestBaileysVersion()

  logger.info(`Usando Baileys v${version.join('.')}, isLatest: ${isLatest}`)

  sock = makeWASocket({
    auth: state,
    version,
    logger: pino({ level: 'silent' }) as any,
    browser: ['Chrome (Linux)', '', ''],
    syncFullHistory: false,
  })

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    logger.debug(`Connection update: ${JSON.stringify({ connection, hasQR: !!qr })}`)

    if (qr) {
      setQRCode(qr)
      logger.info('========================================')
      logger.info('QR Code generado - Escanea con WhatsApp')
      logger.info(`Abre http://localhost:${config.PORT} en tu navegador`)
      logger.info('========================================')

      try {
        const qrTerminal = await QRCode.toString(qr, { type: 'terminal', small: true })
        console.log(qrTerminal)
      } catch (e) {
        logger.error('Error generando QR terminal:', e)
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut

      logger.warn(`Conexión cerrada. Status: ${statusCode}. Reconectando: ${shouldReconnect}`)
      const newStatus = shouldReconnect ? 'reconnecting' : 'logged_out'
      botEvents.publish({ type: 'connection', status: newStatus, timestamp: Date.now() })

      if (shouldReconnect) {
        setConnectionStatus('reconnecting')
        setTimeout(() => connectToWhatsApp(router), botConfig.whatsapp.reconnectDelayMs)
      } else {
        setConnectionStatus('logged_out')
        logger.info('Sesión cerrada. Elimina la carpeta auth_info y reinicia.')
      }
    } else if (connection === 'open') {
      setQRCode(null)
      setConnectionStatus('connected')
      botEvents.publish({ type: 'connection', status: 'connected', timestamp: Date.now() })
      logger.info('========================================')
      logger.info('✅ Conectado a WhatsApp correctamente!')
      logger.info('========================================')
    }
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0]
    if (!msg.message || msg.key.fromMe) return

    const from = msg.key.remoteJid!
    const messageType = Object.keys(msg.message)[0]

    const filter = shouldProcessMessage(from)
    if (!filter.allowed) {
      logger.warn(`[IGNORADO] ${from}: mensaje filtrado`)
      return
    }

    if (MEDIA_TYPES.includes(messageType)) {
      logger.info(`[MENSAJE] ${from}: [${messageType}]`)
      try {
        const md = botConfig.whatsapp.mediaDelay
        await sleep(randomBetween(md[0], md[1]))
        await startTyping(from)
        const response = pickRandom(mediaResponses)
        await sleep(calculateTypingDelay(response))
        await sendWhatsAppMessage(from, response)
        await stopTyping(from)
      } catch (error) {
        logger.error('Error procesando mensaje multimedia:', error)
      }
      return
    }

    const body =
      messageType === 'conversation'
        ? msg.message.conversation
        : messageType === 'extendedTextMessage'
          ? msg.message.extendedTextMessage?.text
          : ''

    if (!body) return

    logger.info(`[MENSAJE] ${from}: ${body}`)
    recordMetric('message:received')
    const incomingPhone = from.replace('@s.whatsapp.net', '')
    botEvents.publish({
      type: 'message:incoming',
      phone: incomingPhone,
      body,
      timestamp: Date.now(),
    })

    const existing = pendingMessages.get(from)
    if (existing) {
      clearTimeout(existing.timer)
      logger.debug(`[DEBOUNCE] ${from}: mensaje anterior cancelado, procesando el nuevo`)
    }

    const pushName = (msg as any).pushName as string | undefined

    const timer = setTimeout(async () => {
      pendingMessages.delete(from)
      await handleIncomingMessage(router, from, body, pushName, msg.key)
    }, DEBOUNCE_MS)

    pendingMessages.set(from, { timer })
  })

  return sock
}

async function handleIncomingMessage(
  router: MessageRouter,
  from: string,
  body: string,
  pushName: string | undefined,
  msgKey: any
): Promise<void> {
  const phone = from.replace('@s.whatsapp.net', '')

  try {
    if (!subscribedPresences.has(from) && sock) {
      if (subscribedPresences.size >= MAX_SUBSCRIBED_PRESENCES) {
        subscribedPresences.clear()
        logger.debug('[PRESENCE] Reset subscribedPresences (límite alcanzado)')
      }
      try {
        await sock.presenceSubscribe(from)
        subscribedPresences.add(from)
      } catch {
        /* no crítico */
      }
    }

    // Closure peek to preserve today's timing: closure flow uses only
    // closureReactionDelay (no readingDelay). Router still decides flow;
    // both call the same `isClosureMessage` predicate.
    if (isClosureMessage(body)) {
      const response = await router.route({ from, body, pushName })
      if (response.reaction) {
        const crd = botConfig.whatsapp.closureReactionDelay
        await sleep(randomBetween(crd[0], crd[1]))
        try {
          await sock?.sendMessage(from, { react: { text: response.reaction, key: msgKey } })
          logger.info(`[CHANNEL] ${phone} → reaction ${response.reaction} (flow: ${response.flow})`)
        } catch (error) {
          logger.error('Error enviando reacción:', error)
        }
      }
      return
    }

    // Non-closure: parallelize router (may include LLM call) with reading delay.
    const readDelay = calculateReadingDelay(body.length)
    const [response] = await Promise.all([
      router.route({ from, body, pushName }),
      sleep(readDelay),
    ])

    if (response.silent || !response.messages || response.messages.length === 0) {
      return
    }

    const allMessages: { text: string; flow: string }[] = []
    for (const text of response.messages) {
      for (const part of splitIntoNaturalMessages(text)) {
        allMessages.push({ text: part, flow: response.flow })
      }
    }

    for (let i = 0; i < allMessages.length; i++) {
      const { text, flow } = allMessages[i]

      await startTyping(from)
      await sleep(calculateTypingDelay(text))
      await sendWhatsAppMessage(from, text)
      await stopTyping(from)

      recordMetric('message:sent')
      botEvents.publish({
        type: 'message:outgoing',
        phone,
        text,
        flow,
        timestamp: Date.now(),
      })

      if (i < allMessages.length - 1) {
        const nextLen = allMessages[i + 1].text.length
        const pause = pauseBetweenMessages(i, allMessages.length, nextLen)
        logger.debug(
          `[HUMANIZER] Pausa entre mensajes: ${Math.round(pause / 1000)}s (siguiente: ${nextLen} chars)`
        )
        await sleep(pause)
      }
    }
  } catch (error) {
    logger.error('Error procesando mensaje:', error)
    recordMetric('error')
    botEvents.publish({
      type: 'error',
      context: `handleIncomingMessage:${phone}`,
      error: String(error),
      timestamp: Date.now(),
    })
    try {
      await sendWhatsAppMessage(from, MESSAGES.error)
    } catch {
      /* nada */
    }
  }
}

async function startTyping(jid: string): Promise<void> {
  try {
    await sock?.sendPresenceUpdate('composing', jid)
  } catch {
    /* no crítico */
  }
}

async function stopTyping(jid: string): Promise<void> {
  try {
    await sock?.sendPresenceUpdate('paused', jid)
  } catch {
    /* no crítico */
  }
}
