/**
 * Handlers de mensajes - Lógica de negocio
 * Esta lógica es compartida entre producción y sandbox
 */

import { logger } from '../utils/logger.js'
import { isExistingClient } from '../services/conversation/classifier.js'
import { getAIResponse } from '../services/knowledgebase/llm/llm.service.js'
import { shouldEscalate, notifyHuman } from '../services/conversation/escalate.js'
import { MESSAGES } from './messages.js'
import { splitIntoNaturalMessages, calculateTypingDelay } from '../services/conversation/humanizer.js'

// Tipo para las respuestas del handler
export interface BotResponse {
  text: string
  flow: string
}

// Función para enviar mensajes (inyectada según el modo)
type SendMessageFn = (to: string, text: string) => Promise<void>

/**
 * Procesa un mensaje y devuelve las respuestas
 * @param from - Número de teléfono del remitente (con @s.whatsapp.net)
 * @param body - Contenido del mensaje
 * @param sendMessage - Función para enviar mensajes (opcional, para producción)
 * @returns Array de respuestas generadas
 */
export async function processMessage(
  from: string,
  body: string,
  sendMessage?: SendMessageFn
): Promise<BotResponse[]> {
  const phone = from.replace('@s.whatsapp.net', '')
  const responses: BotResponse[] = []

  // Clasificar usuario
  if (isExistingClient(phone)) {
    logger.info(`[HANDLER] ${phone} -> Cliente EXISTENTE`)
    const response = await handleExistingClient(from, sendMessage)
    responses.push(response)
  } else {
    logger.info(`[HANDLER] ${phone} -> Cliente POTENCIAL`)
    const potentialResponses = await handlePotentialClient(from, body, sendMessage)
    responses.push(...potentialResponses)
  }

  return responses
}

/**
 * Maneja un cliente existente
 */
async function handleExistingClient(
  to: string,
  sendMessage?: SendMessageFn
): Promise<BotResponse> {
  const response = MESSAGES.existingClient

  if (sendMessage) {
    await sendMessage(to, response)
  }

  logger.bot(`[HANDLER] Cliente existente -> Redirigido a Telegram`)
  return { text: response, flow: 'cliente_existente' }
}

/**
 * Maneja un cliente potencial
 */
async function handlePotentialClient(
  to: string,
  userMessage: string,
  sendMessage?: SendMessageFn,
  debugMode?: boolean
): Promise<BotResponse[]> {
  const responses: BotResponse[] = []
  const phone = to.replace('@s.whatsapp.net', '')

  // Verificar si necesita escalado
  const escalado = shouldEscalate(userMessage, phone)
  if (escalado.escalate) {
    await notifyHuman({ from: to, body: userMessage })
    const response = MESSAGES.escalation

    if (sendMessage) {
      await sendMessage(to, response)
    }

    logger.bot(`[HANDLER] Escalado -> Motivo: ${escalado.reason}`)
    responses.push({ text: response, flow: `escalado_${escalado.reason}` })
    return responses
  }

  // Obtener respuesta de IA
  const aiResponse = await getAIResponse(userMessage, phone, { debugMode })
  logger.bot(`[HANDLER] IA -> Respuesta generada`)

  // Dividir respuesta en mensajes naturales si es muy larga
  const messages = splitIntoNaturalMessages(aiResponse)
  
  if (sendMessage) {
    // Enviar con delays humanizados entre mensajes
    for (let i = 0; i < messages.length; i++) {
      const delay = calculateTypingDelay(messages[i])
      logger.debug(`[HANDLER] Simulando delay de escritura: ${Math.round(delay / 1000)}s`)
      
      await sleep(delay)
      await sendMessage(to, messages[i])
      
      // Pausa entre mensajes si hay más de uno
      if (i < messages.length - 1) {
        const pauseBetween = 2000 + Math.random() * 2000 // 2-4 segundos
        logger.debug(`[HANDLER] Pausa entre mensajes: ${Math.round(pauseBetween / 1000)}s`)
        await sleep(pauseBetween)
      }
    }
  }

  // Retornar todos los mensajes como respuestas individuales
  messages.forEach(msg => {
    responses.push({ text: msg, flow: 'ia_response' })
  })
  
  return responses
}

/**
 * Procesa un mensaje en modo sandbox (sin envío real)
 * @param message - Mensaje del usuario
 * @param isExisting - Si el usuario es cliente existente (toggle del sandbox)
 * @param debugMode - Si se deben mostrar marcas de debug con fuentes
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
    // Simular cliente existente
    logger.info(`[SANDBOX] → Redirigiendo a Telegram`)
    return [{ text: MESSAGES.existingClient, flow: 'cliente_existente' }]
  }

  // Simular cliente potencial con modo debug
  logger.info(`[SANDBOX] → Respondiendo con IA`)
  const responses: BotResponse[] = []
  const phone = fakePhone.replace('@s.whatsapp.net', '')

  // Verificar si necesita escalado
  const escalado = shouldEscalate(message, phone)
  if (escalado.escalate) {
    await notifyHuman({ from: fakePhone, body: message })
    responses.push({ text: MESSAGES.escalation, flow: `escalado_${escalado.reason}` })
    return responses
  }

  // Obtener respuesta de IA con modo debug
  const aiResponse = await getAIResponse(message, phone, { debugMode })
  
  // Dividir en mensajes naturales (para sandbox el delay se simula en el frontend)
  const messages = splitIntoNaturalMessages(aiResponse)
  
  messages.forEach(msg => {
    responses.push({ text: msg, flow: 'ia_response' })
  })
  
  return responses
}

// Utility: sleep helper
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
