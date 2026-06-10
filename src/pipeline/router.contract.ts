/**
 * MessageRouter — contract (master prompt §3, §4.3).
 *
 * Single source of truth for the 6-flow order:
 *   1. structural filter (silent ignore)
 *   2. existing_client
 *   3. extranjeria
 *   4. escalation
 *   5. closure
 *   6. ai
 *
 * Flows are mutually exclusive per turn; first match wins.
 * The real router implementation lands in PR 1.3 (current flow dispatch
 * is split between whatsapp/connection.ts and whatsapp/handlers.ts).
 * This file declares the contract so Phase 2 can implement against it
 * and channels (whatsapp, sandbox) can call a single seam.
 */

export type Flow =
  | 'structural_ignore'
  | 'existing_client'
  | 'extranjeria'
  | 'escalation'
  | 'closure'
  | 'ai'
  /** Bot silenciado para este número: hay una alerta pendiente y el caso lo lleva un humano. */
  | 'paused'

export interface MessageInput {
  /** Sender identifier (phone with or without JID suffix). */
  from: string
  /** Plain-text body. Empty when only media was sent. */
  body: string
  /** Present when the message was non-text (audio, image, video, document, sticker). */
  mediaType?: 'audio' | 'image' | 'video' | 'document' | 'sticker'
  /** Optional WhatsApp pushName for personalization / escalation. */
  pushName?: string
  /** Channel-specific hints (e.g. sandbox `debugMode`). */
  meta?: Record<string, unknown>
}

export interface RoutedResponse {
  flow: Flow
  /** Text messages to deliver (already split into WhatsApp-sized chunks). */
  messages?: string[]
  /** Emoji reaction instead of text (used by the closure flow). */
  reaction?: string
  /** True when the router decided to do nothing (structural ignore). */
  silent?: boolean
  /** Free-form metadata for observability (e.g. escalation reason, RAG hit count). */
  meta?: Record<string, unknown>
}

export interface MessageRouter {
  route(input: MessageInput): Promise<RoutedResponse>
}
