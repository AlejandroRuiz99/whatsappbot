/**
 * Knowledgebase - Fuentes de conocimiento del bot
 * 
 * Re-exporta todos los servicios de conocimiento:
 * - RAG: Búsqueda semántica en Pinecone
 * - LLM: Generación de respuestas con Groq/OpenAI
 * - Services Catalog: Lista de servicios legales
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
  getAIResponse,
  getLLMStatus,
  buscarServicios,
  SERVICIOS,
  CATEGORIAS
} from './llm/llm.service.js'

// Services Catalog
export {
  buscarServicios as searchServices,
  obtenerServiciosPorCategoria,
  obtenerServicioPorId,
  type Servicio
} from './services-catalog/catalog.data.js'
