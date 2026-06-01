/**
 * Conversation - Servicios del flujo conversacional
 *
 * Re-exporta los servicios activamente usados por el resto del proyecto.
 */

// Memory Service
export {
  addUserMessage,
  addBotMessage,
  getConversationHistory,
  getConversationContext,
  startMemoryCleanup,
  cacheRAGChunks,
  getCachedRAGChunks,
  getUserMessageCount,
  getUserTotalChars
} from './store/memory.js'

// Classifier Service
export {
  isExistingClient
} from './classifier/static-list.js'

// Escalate Service
export {
  shouldEscalate,
  notifyHuman
} from './escalation/escalate.js'

// Humanizer Service
export {
  calculateReadingDelay,
  calculateTypingDelay,
  splitIntoNaturalMessages,
  pauseBetweenMessages
} from './humanizer/index.js'
