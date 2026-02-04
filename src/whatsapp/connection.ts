/**
 * Conexión con WhatsApp usando Baileys
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
import { logger } from '../utils/logger.js'
import { shouldProcessMessage } from '../server/sandbox/phone-filter.js'
import { setQRCode, setConnectionStatus } from '../server/http.js'
import { processMessage } from './handlers.js'

let sock: WASocket | null = null

/**
 * Obtiene la instancia actual del socket
 */
export function getSocket(): WASocket | null {
  return sock
}

/**
 * Envía un mensaje por WhatsApp
 */
export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  if (!sock) {
    throw new Error('WhatsApp no conectado')
  }
  await sock.sendMessage(to, { text })
}

/**
 * Conecta a WhatsApp
 */
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

  // Manejar actualizaciones de conexión
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    logger.debug(`Connection update: ${JSON.stringify({ connection, hasQR: !!qr })}`)

    if (qr) {
      setQRCode(qr)
      logger.info('========================================')
      logger.info('QR Code generado - Escanea con WhatsApp')
      logger.info(`Abre http://localhost:${config.PORT} en tu navegador`)
      logger.info('========================================')

      // Mostrar QR en terminal
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
        setTimeout(connectToWhatsApp, 5000)
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

  // Guardar credenciales cuando se actualicen
  sock.ev.on('creds.update', saveCreds)

  // Manejar mensajes entrantes
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0]
    if (!msg.message || msg.key.fromMe) return

    const from = msg.key.remoteJid!
    const messageType = Object.keys(msg.message)[0]
    const body = messageType === 'conversation'
      ? msg.message.conversation
      : messageType === 'extendedTextMessage'
        ? msg.message.extendedTextMessage?.text
        : ''

    if (!body) return

    // Aplicar filtro de test en modo sandbox
    const filter = shouldProcessMessage(from)
    if (!filter.allowed) {
      logger.warn(`[IGNORADO] ${from}: ${body.substring(0, 50)}...`)
      return
    }

    logger.info(`[MENSAJE] ${from}: ${body}`)

    try {
      // Procesar mensaje con la función de envío real
      await processMessage(from, body, sendWhatsAppMessage)
    } catch (error) {
      logger.error('Error procesando mensaje:', error)
    }
  })

  return sock
}
