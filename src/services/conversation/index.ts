/**
 * Conversation - Servicios del flujo conversacional
 * 
 * Re-exporta todos los servicios de conversación:
 * - Memory: Historial y caché de conversaciones
 * - Classifier: Clasificación de clientes
 * - Escalate: Detección de escalado a humano
 * - Humanizer: Simulación de escritura natural
 */

// Memory Service
export {
  addUserMessage,
  addBotMessage,
  getConversationHistory,
  getConversationContext,
  setClientMetadata,
  getClientMetadata,
  clearConversation,
  startMemoryCleanup,
  stopMemoryCleanup,
  cacheRAGChunks,
  getCachedRAGChunks,
  clearRAGCache,
  getMemoryStats
} from './memory.js'

// Classifier Service
export {
  isExistingClient,
  addExistingClient,
  removeExistingClient
} from './classifier.js'

// Escalate Service
export {
  shouldEscalate,
  notifyHuman
} from './escalate.js'

// Humanizer Service
export {
  calculateTypingDelay,
  splitIntoNaturalMessages,
  simulateTypingAndSend,
  sendHumanizedMessage,
  sendHumanizedMessageSandbox,
  addHumanVariation,
  getHumanizationStats
} from './humanizer.js'
