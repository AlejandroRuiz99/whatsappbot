/**
 * ConversationStore — contract (master prompt §4.3).
 *
 * Storage interface for conversation history and per-conversation RAG cache.
 * The current default implementation is an in-process Map (see memory.ts).
 * A SQLite-backed implementation lands in Phase 6.
 *
 * This file is additive: existing consumers keep importing free functions
 * from memory.ts. The contract is wired through DI in PR 1.3.
 */

import * as memory from './memory.js'
import type { RetrievedChunk } from '../../knowledge/rag/rag.service.js'

export type Role = 'user' | 'assistant'

export interface StoredMessage {
  role: Role
  content: string
  timestamp: number
}

export interface ConversationSummary {
  phone: string
  messageCount: number
  userMessageCount: number
  userChars: number
  lastActivity: number
  latestMessage: StoredMessage | null
}

export interface ConversationStore {
  addUserMessage(phone: string, content: string): void
  addBotMessage(phone: string, content: string): void

  /** History flattened to {role, content} pairs — what the LLM consumes. */
  getHistory(phone: string): Array<{ role: Role; content: string }>

  /** Full message records with timestamps — what the admin UI consumes. */
  getHistoryWithTimestamps(phone: string): StoredMessage[] | null

  getUserMessageCount(phone: string): number
  getUserTotalChars(phone: string): number

  cacheRAGChunks(phone: string, chunks: RetrievedChunk[], query: string): void
  getCachedRAGChunks(phone: string): RetrievedChunk[] | null

  list(): ConversationSummary[]
  delete(phone: string): boolean
}

/**
 * Default in-memory implementation — thin adapter over memory.ts free functions.
 * Behavior is byte-identical to the current code path.
 */
export const defaultConversationStore: ConversationStore = {
  addUserMessage: memory.addUserMessage,
  addBotMessage: memory.addBotMessage,
  getHistory: memory.getConversationHistory,
  getHistoryWithTimestamps: memory.getConversationWithTimestamps,
  getUserMessageCount: memory.getUserMessageCount,
  getUserTotalChars: memory.getUserTotalChars,
  cacheRAGChunks: memory.cacheRAGChunks,
  getCachedRAGChunks: memory.getCachedRAGChunks,
  list: memory.listActiveConversations,
  delete: memory.deleteConversation,
}
