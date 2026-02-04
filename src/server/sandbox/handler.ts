/**
 * Handler del Sandbox
 * Procesa mensajes simulados sin enviar por WhatsApp real
 */

import { processSandboxMessage, BotResponse } from '../../whatsapp/handlers.js'
import { addToConversation } from './index.js'

/**
 * Maneja un mensaje simulado del sandbox
 * @param message - Mensaje del usuario
 * @param isExistingClient - Si está en modo "contacto guardado"
 * @param debugMode - Si se deben mostrar marcas de debug con fuentes
 */
export async function handleSandboxMessage(
  message: string,
  isExistingClient: boolean,
  debugMode: boolean
): Promise<BotResponse[]> {
  // Procesar mensaje usando el handler compartido con modo debug
  const responses = await processSandboxMessage(message, isExistingClient, debugMode)

  // Guardar respuestas en el historial del sandbox
  for (const response of responses) {
    addToConversation('bot', response.text, response.flow)
  }

  return responses
}
