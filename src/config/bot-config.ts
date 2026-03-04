/**
 * Carga y tipado del archivo bot.config.yaml
 * Fuente única de verdad para todas las constantes de comportamiento del bot.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'

// ─── Tipos ───

interface Range {
  0: number
  1: number
}

interface BotConfig {
  conversation: {
    maxMessagesPerConversation: number
    maxConversations: number
    ttlHours: number
    ragCacheTtlMinutes: number
    cleanupIntervalMinutes: number
  }
  humanizer: {
    whatsappMaxLength: number
    cohesiveBlock: {
      maxSentences: number
      maxLength: number
      probability: number
    }
    readingDelay: {
      veryShort: Range
      short: Range
      medium: Range
      long: Range
    }
    typingDelay: {
      veryShort: Range
      short: Range
      medium: { charsPerSecond: number; min: number; max: number }
      long: { charsPerSecond: number; min: number; max: number }
    }
    pauseBetweenMessages: {
      shortNext: Range
      mediumNext: Range
      longNext: Range
      firstMessageFactor: number
      lastMessageExtra: Range
    }
  }
  whatsapp: {
    debounceMs: number
    reconnectDelayMs: number
    mediaDelay: Range
    closureReactionDelay: Range
  }
  escalation: {
    repeatMessageThreshold: number
  }
  llm: {
    groq: {
      model: string
      maxTokens: number
      temperature: number
      topP: number
      presencePenalty: number
      frequencyPenalty: number
    }
    openai: {
      model: string
      maxTokens: number
      temperature: number
      topP: number
      presencePenalty: number
      frequencyPenalty: number
    }
  }
  softLimits: {
    phase1: { maxChars: number; maxMessages: number }
    phase2: { maxChars: number; maxMessages: number }
    phase3: { maxChars: number; maxMessages: number }
    consultationPrice: string
  }
  rag: {
    maxVideoRecommendations: number
    snippetLength: number
    pinecone: {
      dimension: number
      indexCheckMaxAttempts: number
      indexCheckIntervalMs: number
    }
  }
  timeGreeting: {
    morningStart: number
    afternoonStart: number
    nightStart: number
  }
}

// ─── Carga ───

function loadBotConfig(): BotConfig {
  const configPath = join(process.cwd(), 'bot.config.yaml')
  const raw = readFileSync(configPath, 'utf-8')
  return yaml.load(raw) as BotConfig
}

export const botConfig = loadBotConfig()
export type { BotConfig, Range }
