/**
 * Conexión con WhatsApp usando Baileys
 * Gestiona la conexión, debounce de mensajes, typing indicators y envío humanizado
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion
} from 'baileys'
import { Boom } from '@hapi/boom'
import * as QRCode from 'qrcode'
import pino from 'pino'
import { config } from '../../config/env.js'
import { botConfig } from '../../config/bot-config.js'
import { logger } from '../../observability/logger.js'
import { shouldProcessMessage } from '../sandbox/phone-filter.js'
import { setQRCode, setConnectionStatus } from '../../server/http.js'
import { processMessage, isClosureMessage } from './handlers.js'
import { MESSAGES } from './messages.js'
import {
  calculateReadingDelay,
  calculateTypingDelay,
  pauseBetweenMessages,
  splitIntoNaturalMessages
} from '../../conversation/humanizer/index.js'
import { addUserMessage, addBotMessage } from '../../conversation/store/memory.js'
import { sleep, pickRandom, randomBetween } from '../../utils/helpers.js'
import { botEvents } from '../../observability/event-bus.js'
import { recordMetric } from '../../observability/metrics.js'

let sock: WASocket | null = null

// Debounce: espera a que el cliente deje de escribir antes de responder
interface PendingMessage {
  timer: NodeJS.Timeout
}

const pendingMessages = new Map<string, PendingMessage>()

// Presencias suscritas: Set con límite para evitar crecimiento ilimitado
const MAX_SUBSCRIBED_PRESENCES = 1000
const subscribedPresences = new Set<string>()

const DEBOUNCE_MS = botConfig.whatsapp.debounceMs

const MEDIA_TYPES = [
  'imageMessage', 'documentMessage', 'videoMessage',
  'audioMessage', 'stickerMessage'
]

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

export async function connectToWhatsApp(): Promise<WASocket> {
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
        setTimeout(connectToWhatsApp, botConfig.whatsapp.reconnectDelayMs)
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

  // ─── Handler de mensajes entrantes ───
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

    // ─── Media: acusar recibo y derivar a cita ───
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

    // ─── Extraer texto ───
    const body = messageType === 'conversation'
      ? msg.message.conversation
      : messageType === 'extendedTextMessage'
        ? msg.message.extendedTextMessage?.text
        : ''

    if (!body) return

    logger.info(`[MENSAJE] ${from}: ${body}`)
    recordMetric('message:received')
    const incomingPhone = from.replace('@s.whatsapp.net', '')
    botEvents.publish({ type: 'message:incoming', phone: incomingPhone, body, timestamp: Date.now() })

    // ─── Debounce: esperar a que pare de escribir ───
    const existing = pendingMessages.get(from)
    if (existing) {
      clearTimeout(existing.timer)
      logger.debug(`[DEBOUNCE] ${from}: mensaje anterior cancelado, procesando el nuevo`)
    }

    const timer = setTimeout(async () => {
      pendingMessages.delete(from)
      await handleIncomingMessage(from, body, msg.key)
    }, DEBOUNCE_MS)

    pendingMessages.set(from, { timer })
  })

  return sock
}

/**
 * Procesa un mensaje tras el debounce.
 * Gestiona closure detection, reading delay, LLM call,
 * typing indicators y envío humanizado.
 */
async function handleIncomingMessage(from: string, body: string, msgKey: any): Promise<void> {
  const phone = from.replace('@s.whatsapp.net', '')

  try {
    // Suscribir presencia (una vez por contacto, con límite de tamaño)
    if (!subscribedPresences.has(from) && sock) {
      if (subscribedPresences.size >= MAX_SUBSCRIBED_PRESENCES) {
        subscribedPresences.clear()
        logger.debug('[PRESENCE] Reset subscribedPresences (límite alcanzado)')
      }
      try {
        await sock.presenceSubscribe(from)
        subscribedPresences.add(from)
      } catch { /* no crítico */ }
    }

    // ─── Closure: reaccionar con emoji y no responder con texto ───
    if (isClosureMessage(body)) {
      addUserMessage(phone, body)
      addBotMessage(phone, '👍')
      const crd = botConfig.whatsapp.closureReactionDelay
      await sleep(randomBetween(crd[0], crd[1]))
      try {
        const emoji = getClosureEmoji(body)
        await sock?.sendMessage(from, { react: { text: emoji, key: msgKey } })
        logger.info(`[HANDLER] ${phone} → Cierre: reacción ${emoji}`)
      } catch (error) {
        logger.error('Error enviando reacción:', error)
      }
      return
    }

    // ─── Procesar mensaje y reading delay en paralelo ───
    const readDelay = calculateReadingDelay(body.length)
    const [responses] = await Promise.all([
      processMessage(from, body),
      sleep(readDelay)
    ])

    // Splitear todas las respuestas (el handler devuelve texto raw)
    const allMessages: { text: string; flow: string }[] = []
    for (const response of responses) {
      const parts = splitIntoNaturalMessages(response.text)
      parts.forEach(part => allMessages.push({ text: part, flow: response.flow }))
    }

    // ─── Enviar con typing indicators (composing → pause → composing) ───
    for (let i = 0; i < allMessages.length; i++) {
      const { text, flow } = allMessages[i]

      await startTyping(from)
      await sleep(calculateTypingDelay(text))
      await sendWhatsAppMessage(from, text)
      await stopTyping(from)

      recordMetric('message:sent')
      botEvents.publish({ type: 'message:outgoing', phone, text, flow, timestamp: Date.now() })

      if (i < allMessages.length - 1) {
        const nextLen = allMessages[i + 1].text.length
        const pause = pauseBetweenMessages(i, allMessages.length, nextLen)
        logger.debug(`[HUMANIZER] Pausa entre mensajes: ${Math.round(pause / 1000)}s (siguiente: ${nextLen} chars)`)
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
    // Notificar al usuario que algo ha fallado para que no se quede sin respuesta
    try {
      await sendWhatsAppMessage(from, MESSAGES.error)
    } catch { /* si ni esto funciona, ya no hay más que hacer */ }
  }
}

// ─── Typing indicator helpers ───

async function startTyping(jid: string): Promise<void> {
  try {
    await sock?.sendPresenceUpdate('composing', jid)
  } catch { /* no crítico */ }
}

async function stopTyping(jid: string): Promise<void> {
  try {
    await sock?.sendPresenceUpdate('paused', jid)
  } catch { /* no crítico */ }
}

// ─── Utilidades ───

function getClosureEmoji(text: string): string {
  const lower = text.toLowerCase()
  if (/gracia/.test(lower)) return pickRandom(['🙏', '😊'])
  if (/perfect|genial|estupendo|guay/.test(lower)) return pickRandom(['😊', '👌'])
  return '👍'
}
