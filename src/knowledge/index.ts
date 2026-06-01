/**
 * Knowledgebase - Fuentes de conocimiento del bot
 *
 * Re-exporta los servicios activamente usados por el resto del proyecto.
 */

// RAG Service
export {
  getRAGContext,
  retrieveRelevantChunks,
  formatContextForLLM,
  formatVideosForLLM,
  shouldIncludeVideoLinks,
  extractUniqueVideos,
  type RAGResult,
  type RetrievedChunk,
  type VideoReference
} from './rag/rag.service.js'

// RAG Config (Pinecone)
export {
  initPinecone,
  getPineconeIndex,
  checkIndexExists,
  createIndexIfNotExists,
  getIndexStats,
  deleteAllVectors
} from './rag/rag.config.js'

// LLM Service
export {
  getAIResponse
} from './llm/llm.service.js'

// Services Catalog
export {
  buscarServicios,
  type Servicio
} from './catalog/catalog.data.js'
