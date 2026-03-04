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
import { config } from '../config/env.js'
import { botConfig } from '../config/bot-config.js'
import { logger } from '../utils/logger.js'
import { shouldProcessMessage } from '../server/sandbox/phone-filter.js'
import { setQRCode, setConnectionStatus } from '../server/http.js'
import { processMessage, isClosureMessage } from './handlers.js'
import {
  calculateReadingDelay,
  calculateTypingDelay,
  pauseBetweenMessages,
  splitIntoNaturalMessages
} from '../services/conversation/humanizer.js'
import { addUserMessage, addBotMessage } from '../services/conversation/memory.js'

let sock: WASocket | null = null

// Debounce: espera a que el cliente deje de escribir antes de responder
interface PendingMessage {
  timer: NodeJS.Timeout
  body: string
  msgKey: any
}

const pendingMessages = new Map<string, PendingMessage>()
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

    pendingMessages.set(from, { timer, body, msgKey: msg.key })
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
    // Suscribir presencia (una vez por contacto)
    if (!subscribedPresences.has(from) && sock) {
      try {
        await sock.presenceSubscribe(from)
        subscribedPresences.add(from)
      } catch { /* no crítico */ }
    }

    // ─── Closure: reaccionar con emoji y no responder ───
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

    // Re-split por seguridad (existingClient y escalation no se splitean en handlers)
    const allMessages: { text: string; flow: string }[] = []
    for (const response of responses) {
      const parts = splitIntoNaturalMessages(response.text)
      parts.forEach(part => allMessages.push({ text: part, flow: response.flow }))
    }

    // ─── Enviar con typing indicators (composing → pause → composing) ───
    for (let i = 0; i < allMessages.length; i++) {
      const text = allMessages[i].text

      // Typing indicator ON
      await startTyping(from)

      // Delay de escritura
      await sleep(calculateTypingDelay(text))

      // Enviar mensaje
      await sendWhatsAppMessage(from, text)

      // Typing indicator OFF
      await stopTyping(from)

      // Pausa entre mensajes (gap sin typing → parece que piensa y vuelve a escribir)
      if (i < allMessages.length - 1) {
        const nextLen = allMessages[i + 1].text.length
        const pause = pauseBetweenMessages(i, allMessages.length, nextLen)
        logger.debug(`[HUMANIZER] Pausa entre mensajes: ${Math.round(pause / 1000)}s (siguiente: ${nextLen} chars)`)
        await sleep(pause)
      }
    }
  } catch (error) {
    logger.error('Error procesando mensaje:', error)
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

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
