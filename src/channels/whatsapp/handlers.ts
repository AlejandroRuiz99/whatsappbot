/**
 * Handlers de mensajes - Lógica de negocio
 * Esta lógica es compartida entre producción y sandbox
 *
 * Responsabilidad: decidir QUÉ responder y en qué flujo.
 * El CÓMO enviarlo (delays, typing, split) lo gestiona connection.ts.
 */

import { logger } from '../../observability/logger.js'
import { isExistingClient } from '../../conversation/classifier/static-list.js'
import { getAIResponse } from '../../knowledge/llm/llm.service.js'
import { shouldEscalate, notifyHuman } from '../../conversation/escalation/escalate.js'
import { addUserMessage, addBotMessage } from '../../conversation/store/memory.js'
import { splitIntoNaturalMessages } from '../../conversation/humanizer/index.js'
import { MESSAGES } from './messages.js'
import { botEvents } from '../../observability/event-bus.js'
import { recordMetric } from '../../observability/metrics.js'

// Tipo para las respuestas del handler
export interface BotResponse {
  text: string
  flow: string
}

/**
 * Procesa un mensaje y devuelve las respuestas.
 * Devuelve texto sin splitear — connection.ts se encarga del splitting y envío.
 */
export async function processMessage(
  from: string,
  body: string,
): Promise<BotResponse[]> {
  const phone = from.replace('@s.whatsapp.net', '')

  if (isExistingClient(phone)) {
    logger.info(`[HANDLER] ${phone} -> Cliente EXISTENTE`)
    recordMetric('flow', 'cliente_existente')
    return [await handleExistingClient(phone, body)]
  }

  logger.info(`[HANDLER] ${phone} -> Cliente POTENCIAL`)
  return handlePotentialClient(from, body)
}

/**
 * Maneja un cliente existente (ya tiene Telegram, se le redirige ahí)
 */
async function handleExistingClient(phone: string, userMessage: string): Promise<BotResponse> {
  const response = MESSAGES.existingClient
  addUserMessage(phone, userMessage)
  addBotMessage(phone, response)
  logger.bot(`[HANDLER] Cliente existente -> Redirigido a Telegram`)
  return { text: response, flow: 'cliente_existente' }
}

/**
 * Detecta si el mensaje es sobre extranjería (residencia, nacionalidad, NIE, arraigo...)
 * En ese caso el bot debe derivar al número específico de extranjería del despacho.
 */
export function isExtranjeriaQuery(message: string): boolean {
  const lower = message.toLowerCase()
  const keywords = [
    'residencia', 'permiso de residencia', 'permiso de trabajo',
    'nacionalidad', 'nacionalidad española', 'ciudadanía',
    'nie', 'tarjeta de residencia', 'tarjeta comunitaria',
    'arraigo', 'arraigo social', 'arraigo laboral', 'arraigo familiar',
    'reagrupación', 'reagrupacion', 'reagrupación familiar',
    'regularizar', 'regularización', 'regularizacion', 'papeles',
    'asilo', 'refugiado', 'protección internacional',
    'expulsión', 'expulsion', 'deportación', 'deportacion',
    'extranjería', 'extranjeria', 'inmigrante', 'immigrante',
    'visado', 'visa', 'entrada en españa', 'permiso de estancia',
  ]
  return keywords.some(kw => lower.includes(kw))
}

/**
 * Maneja un cliente potencial (flujo principal con IA)
 */
async function handlePotentialClient(
  to: string,
  userMessage: string,
): Promise<BotResponse[]> {
  const phone = to.replace('@s.whatsapp.net', '')

  // Detectar consultas de extranjería → derivar al número específico
  if (isExtranjeriaQuery(userMessage)) {
    logger.info(`[HANDLER] ${phone} → Extranjería detectada, derivando al 640 56 95 37`)
    const response = MESSAGES.extranjeria
    addUserMessage(phone, userMessage)
    addBotMessage(phone, response)
    recordMetric('flow', 'extranjeria_redirect')
    return [{ text: response, flow: 'extranjeria_redirect' }]
  }

  // Verificar si necesita escalado a humano
  const escalado = shouldEscalate(userMessage, phone)
  if (escalado.escalate) {
    await notifyHuman({ from: to, body: userMessage })
    const response = MESSAGES.escalation
    addUserMessage(phone, userMessage)
    addBotMessage(phone, response)
    logger.bot(`[HANDLER] Escalado -> Motivo: ${escalado.reason}`)
    recordMetric('escalation')
    recordMetric('flow', `escalado_${escalado.reason}`)
    botEvents.publish({
      type: 'escalation',
      phone,
      reason: escalado.reason ?? 'desconocido',
      message: userMessage,
      timestamp: Date.now(),
    })
    return [{ text: response, flow: `escalado_${escalado.reason}` }]
  }

  // Flujo IA — getAIResponse gestiona la memoria internamente
  const aiResponse = await getAIResponse(userMessage, phone)
  logger.bot(`[HANDLER] IA -> Respuesta generada`)
  recordMetric('flow', 'ia_response')
  return [{ text: aiResponse, flow: 'ia_response' }]
}

/**
 * Procesa un mensaje en modo sandbox (sin envío real a WhatsApp).
 * Aquí sí se hace el split porque el sandbox renderiza burbujas individuales.
 */
export async function processSandboxMessage(
  message: string,
  isExisting: boolean,
  debugMode?: boolean
): Promise<BotResponse[]> {
  const fakePhone = 'sandbox_user@s.whatsapp.net'

  logger.info(`[SANDBOX] Mensaje: "${message}"`)
  logger.info(`[SANDBOX] Modo: ${isExisting ? 'CONTACTO GUARDADO' : 'CONTACTO NUEVO'}`)
  logger.info(`[SANDBOX] Debug: ${debugMode ? 'ACTIVADO (mostrará fuentes)' : 'DESACTIVADO'}`)

  if (isExisting) {
    logger.info(`[SANDBOX] → Redirigiendo a Telegram`)
    return [{ text: MESSAGES.existingClient, flow: 'cliente_existente' }]
  }

  logger.info(`[SANDBOX] → Respondiendo con IA`)
  const phone = fakePhone.replace('@s.whatsapp.net', '')

  if (isExtranjeriaQuery(message)) {
    logger.info(`[SANDBOX] → Extranjería detectada, derivando al 640 56 95 37`)
    return [{ text: MESSAGES.extranjeria, flow: 'extranjeria_redirect' }]
  }

  const escalado = shouldEscalate(message, phone)
  if (escalado.escalate) {
    await notifyHuman({ from: fakePhone, body: message })
    return [{ text: MESSAGES.escalation, flow: `escalado_${escalado.reason}` }]
  }

  const aiResponse = await getAIResponse(message, phone, { debugMode })

  // En sandbox sí split para renderizar burbujas individuales en el frontend
  const messages = splitIntoNaturalMessages(aiResponse)
  return messages.map(msg => ({ text: msg, flow: 'ia_response' }))
}

/**
 * Detecta si un mensaje es de cierre/despedida que no necesita respuesta de texto.
 * Solo detecta mensajes cortos que son claramente de cierre, no frases más largas.
 */
export function isClosureMessage(text: string): boolean {
  const cleaned = text.trim().toLowerCase()
    .replace(/[.!,;¡¿?…]+/g, '')
    .trim()

  const closurePatterns = [
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

  return closurePatterns.some(p => p.test(cleaned))
}
