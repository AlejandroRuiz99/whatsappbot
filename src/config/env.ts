import 'dotenv/config'

export const config = {
  // Bot mode
  BOT_MODE: process.env.BOT_MODE || 'sandbox',
  TEST_PHONE_NUMBER: process.env.TEST_PHONE_NUMBER || '',
  
  // IA - Groq (recomendado, gratis) o OpenAI
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  
  // URLs
  TELEGRAM_LINK: process.env.TELEGRAM_LINK || 'https://t.me/+XXXXX',
  BOOKING_URL: process.env.BOOKING_URL || 'https://compromisolegal.es/reserva/',
  
  // Server
  PORT: parseInt(process.env.PORT || '3000', 10),
  
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // RAG / Vector Database
  PINECONE_API_KEY: process.env.PINECONE_API_KEY || '',
  PINECONE_INDEX_NAME: process.env.PINECONE_INDEX_NAME || 'tiktok-despacho',
  
  // RAG Configuration
  RAG_TOP_K: parseInt(process.env.RAG_TOP_K || '5', 10),
  RAG_MIN_SIMILARITY: parseFloat(process.env.RAG_MIN_SIMILARITY || '0.7'),
  RAG_VIDEO_THRESHOLD: parseFloat(process.env.RAG_VIDEO_THRESHOLD || '0.75'),
}
