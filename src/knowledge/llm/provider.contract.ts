/**
 * LLMProvider — contract (master prompt §4.3).
 *
 * A provider produces a chat completion or returns null on failure.
 * Consumers iterate over a provider list in priority order; the first
 * non-null result wins (current fallback semantics: Groq → OpenAI).
 *
 * PR 1.3 wires the actual selection through this interface.
 */

import {
  generateWithGroq,
  generateWithOpenAI,
  hasGroqKey,
  hasOpenAIKey,
  type ChatMessage,
} from './providers.js'

export type { ChatMessage } from './providers.js'

export interface LLMProvider {
  readonly name: string
  readonly available: boolean
  complete(messages: ChatMessage[]): Promise<string | null>
}

export const groqProvider: LLMProvider = {
  name: 'groq',
  available: Boolean(hasGroqKey),
  complete: generateWithGroq,
}

export const openaiProvider: LLMProvider = {
  name: 'openai',
  available: Boolean(hasOpenAIKey),
  complete: generateWithOpenAI,
}

/**
 * Default provider list — priority order matches current code path
 * (llm.service.ts tries Groq first, falls back to OpenAI).
 */
export const defaultProviders: readonly LLMProvider[] = [groqProvider, openaiProvider]
