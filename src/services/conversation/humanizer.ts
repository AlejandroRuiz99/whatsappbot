/**
 * Servicio de Humanización
 * Añade delays realistas, simula escritura y divide mensajes para hacer el bot más natural
 */

import { logger } from '../../utils/logger.js'

/**
 * Calcula un delay realista de escritura basado en el texto
 * @param text - Texto a enviar
 * @returns Delay en milisegundos
 */
export function calculateTypingDelay(text: string): number {
  // Parámetros de simulación
  const MIN_DELAY = 2000  // Mínimo 2 segundos
  const MAX_DELAY = 8000  // Máximo 8 segundos
  const CHARS_PER_SECOND = 65  // Velocidad de escritura promedio (ajustada para ser natural)
  
  // Calcular delay base según longitud del texto
  const baseDelay = (text.length / CHARS_PER_SECOND) * 1000
  
  // Añadir pausas por puntuación (más natural)
  const sentences = text.split(/[.!?]+/).length
  const commas = (text.match(/,/g) || []).length
  const pauseDelay = (sentences * 300) + (commas * 150)
  
  // Delay total con variación aleatoria (±20%)
  const totalDelay = baseDelay + pauseDelay
  const randomVariation = 0.8 + (Math.random() * 0.4) // Entre 0.8 y 1.2
  const finalDelay = totalDelay * randomVariation
  
  // Aplicar límites
  return Math.max(MIN_DELAY, Math.min(MAX_DELAY, finalDelay))
}

/**
 * Divide un texto largo en múltiples mensajes naturales
 * Split inteligente en puntos lógicos (párrafos, preguntas, puntos)
 * @param text - Texto a dividir
 * @returns Array de mensajes
 */
export function splitIntoNaturalMessages(text: string): string[] {
  const MAX_LENGTH = 300  // Longitud ideal para un mensaje (no muy largo)
  
  // Si el texto es corto, devolver como está
  if (text.length <= MAX_LENGTH) {
    return [text.trim()]
  }
  
  const messages: string[] = []
  
  // Intentar dividir por párrafos primero (doble salto de línea)
  const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0)
  
  if (paragraphs.length > 1) {
    // Hay párrafos claros - agrupar si son cortos
    let currentMessage = ''
    
    for (const paragraph of paragraphs) {
      if (currentMessage.length === 0) {
        currentMessage = paragraph.trim()
      } else if (currentMessage.length + paragraph.length < MAX_LENGTH) {
        currentMessage += '\n\n' + paragraph.trim()
      } else {
        messages.push(currentMessage)
        currentMessage = paragraph.trim()
      }
    }
    
    if (currentMessage.length > 0) {
      messages.push(currentMessage)
    }
    
    return messages
  }
  
  // Si no hay párrafos, dividir por oraciones
  const sentences = text.split(/(?<=[.!?])\s+/)
  let currentMessage = ''
  
  for (const sentence of sentences) {
    if (currentMessage.length === 0) {
      currentMessage = sentence
    } else if (currentMessage.length + sentence.length < MAX_LENGTH) {
      currentMessage += ' ' + sentence
    } else {
      messages.push(currentMessage.trim())
      currentMessage = sentence
    }
  }
  
  if (currentMessage.length > 0) {
    messages.push(currentMessage.trim())
  }
  
  // Si aún no se dividió bien (oraciones muy largas), dividir por longitud
  if (messages.length === 0 || messages.some(m => m.length > MAX_LENGTH * 1.5)) {
    return [text.trim()]
  }
  
  return messages
}

/**
 * Simula typing indicator y envía mensaje después del delay
 * @param chat - Chat de WhatsApp (con métodos sendStateTyping y sendMessage)
 * @param text - Texto a enviar
 * @returns Promise que se resuelve cuando se envía el mensaje
 */
export async function simulateTypingAndSend(
  chat: any,
  text: string
): Promise<void> {
  const delay = calculateTypingDelay(text)
  
  logger.debug(`[HUMANIZER] Simulando escritura: ${Math.round(delay / 1000)}s para ${text.length} caracteres`)
  
  // Mostrar indicador de "escribiendo..." si está disponible
  if (chat.sendStateTyping) {
    await chat.sendStateTyping()
  }
  
  // Esperar el delay calculado
  await sleep(delay)
  
  // Enviar mensaje
  if (chat.sendMessage) {
    await chat.sendMessage(text)
  }
  
  logger.debug(`[HUMANIZER] Mensaje enviado`)
}

/**
 * Envía múltiples mensajes con delays naturales entre ellos
 * @param chat - Chat de WhatsApp (con métodos sendStateTyping y sendMessage)
 * @param text - Texto completo a enviar
 * @returns Promise que se resuelve cuando se envían todos los mensajes
 */
export async function sendHumanizedMessage(
  chat: any,
  text: string
): Promise<void> {
  const messages = splitIntoNaturalMessages(text)
  
  if (messages.length === 1) {
    // Un solo mensaje - enviar con typing normal
    await simulateTypingAndSend(chat, messages[0])
    return
  }
  
  // Múltiples mensajes - enviar con pausas entre ellos
  logger.debug(`[HUMANIZER] Enviando ${messages.length} mensajes separados`)
  
  for (let i = 0; i < messages.length; i++) {
    await simulateTypingAndSend(chat, messages[i])
    
    // Pausa entre mensajes (excepto después del último)
    if (i < messages.length - 1) {
      const pauseBetweenMessages = randomBetween(2000, 4000)
      logger.debug(`[HUMANIZER] Pausa entre mensajes: ${Math.round(pauseBetweenMessages / 1000)}s`)
      await sleep(pauseBetweenMessages)
    }
  }
}

/**
 * Versión simplificada para sandbox (sin WhatsApp real)
 * Envía mensaje con delay pero sin API de WhatsApp
 * @param to - Destinatario
 * @param text - Texto a enviar
 * @param sendMessage - Función de envío
 */
export async function sendHumanizedMessageSandbox(
  to: string,
  text: string,
  sendMessage: (to: string, text: string) => Promise<void>
): Promise<void> {
  const messages = splitIntoNaturalMessages(text)
  
  for (let i = 0; i < messages.length; i++) {
    const delay = calculateTypingDelay(messages[i])
    
    logger.debug(`[HUMANIZER] [SANDBOX] Simulando escritura: ${Math.round(delay / 1000)}s`)
    
    // Simular delay de escritura (en sandbox no hay typing indicator real)
    await sleep(delay)
    
    // Enviar mensaje
    await sendMessage(to, messages[i])
    
    // Pausa entre mensajes si hay más
    if (i < messages.length - 1) {
      const pauseBetweenMessages = randomBetween(2000, 4000)
      logger.debug(`[HUMANIZER] [SANDBOX] Pausa entre mensajes: ${Math.round(pauseBetweenMessages / 1000)}s`)
      await sleep(pauseBetweenMessages)
    }
  }
}

/**
 * Añade variación humana ocasional (OPCIONAL - actualmente deshabilitado)
 * Podría añadir correcciones simuladas, pero mejor mantenerlo simple y profesional
 * @param text - Texto original
 * @param probability - Probabilidad de añadir variación (0-1)
 * @returns Texto con o sin variación
 */
export function addHumanVariation(text: string, probability: number = 0.05): string {
  // Por ahora retornamos el texto sin cambios para mantener profesionalismo
  // En el futuro se podría implementar variaciones muy sutiles si se requiere
  return text
}

// Utilidades

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Número aleatorio entre min y max
 */
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Obtener estadísticas de humanización (para debugging)
 */
export function getHumanizationStats(text: string): {
  messageCount: number
  averageDelay: number
  totalDelay: number
  characterCount: number
} {
  const messages = splitIntoNaturalMessages(text)
  const delays = messages.map(m => calculateTypingDelay(m))
  const totalDelay = delays.reduce((sum, d) => sum + d, 0)
  const averageDelay = totalDelay / delays.length
  
  // Añadir pausas entre mensajes
  const pauseDelay = (messages.length - 1) * 3000 // promedio de 3s entre mensajes
  
  return {
    messageCount: messages.length,
    averageDelay: Math.round(averageDelay),
    totalDelay: Math.round(totalDelay + pauseDelay),
    characterCount: text.length
  }
}
