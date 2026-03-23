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
    studyPrice: string
    subscriptionLabel: string
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
  extranjeria: {
    redirectPhone: string
    keywords: string[]
  }
  timeGreeting: {
    morningStart: number
    afternoonStart: number
    nightStart: number
  }
}

// ─── Validación ───

const REQUIRED_SECTIONS = [
  'conversation', 'humanizer', 'whatsapp', 'escalation',
  'llm', 'softLimits', 'rag', 'extranjeria', 'timeGreeting'
] as const

function validateConfig(cfg: unknown): BotConfig {
  if (!cfg || typeof cfg !== 'object') {
    throw new Error('[CONFIG] bot.config.yaml está vacío o malformado')
  }

  const c = cfg as Record<string, unknown>

  for (const section of REQUIRED_SECTIONS) {
    if (!(section in c)) {
      throw new Error(`[CONFIG] bot.config.yaml: falta la sección requerida "${section}"`)
    }
  }

  return cfg as BotConfig
}

// ─── Carga ───

function loadBotConfig(): BotConfig {
  const configPath = join(process.cwd(), 'bot.config.yaml')
  const raw = readFileSync(configPath, 'utf-8')
  const parsed = yaml.load(raw)
  return validateConfig(parsed)
}

export const botConfig = loadBotConfig()
