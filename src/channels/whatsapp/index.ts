/**
 * Módulo WhatsApp
 * Exporta todas las funcionalidades relacionadas con WhatsApp
 */

export { connectToWhatsApp, getSocket, sendWhatsAppMessage } from './connection.js'
export { processMessage, processSandboxMessage, isClosureMessage, type BotResponse } from './handlers.js'
export { MESSAGES } from './messages.js'
