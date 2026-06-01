/**
 * Carga y validación profunda de bot.config.yaml.
 * Fuente única de verdad para las constantes de comportamiento.
 *
 * Reglas (master prompt §4.1):
 *  - Validación al arranque, fail-fast con path del campo inválido.
 *  - Los rangos [min, max] se validan como tuplas y min <= max.
 *  - El código no inventa valores: si falta, se aborta.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import { z } from 'zod'

// ─── Reusable building blocks ───

const Range = z
  .tuple([z.number(), z.number()])
  .refine(([a, b]) => a <= b, 'range must be [min, max] with min <= max')

const TypingProfile = z
  .object({
    charsPerSecond: z.number().positive(),
    min: z.number().nonnegative(),
    max: z.number().positive(),
  })
  .refine((p) => p.min <= p.max, 'typing profile min must be <= max')

const LLMProfile = z.object({
  model: z.string().min(1),
  maxTokens: z.number().int().positive(),
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1),
  presencePenalty: z.number().min(-2).max(2),
  frequencyPenalty: z.number().min(-2).max(2),
})

const SoftLimitPhase = z.object({
  maxChars: z.number().positive(),
  maxMessages: z.number().int().positive(),
})

// ─── Full schema ───

const BotConfigSchema = z.object({
  conversation: z.object({
    maxMessagesPerConversation: z.number().int().positive(),
    maxConversations: z.number().int().positive(),
    ttlHours: z.number().positive(),
    ragCacheTtlMinutes: z.number().positive(),
    cleanupIntervalMinutes: z.number().positive(),
  }),
  humanizer: z.object({
    whatsappMaxLength: z.number().int().positive(),
    cohesiveBlock: z.object({
      maxSentences: z.number().int().positive(),
      maxLength: z.number().int().positive(),
      probability: z.number().min(0).max(1),
    }),
    readingDelay: z.object({
      veryShort: Range,
      short: Range,
      medium: Range,
      long: Range,
    }),
    typingDelay: z.object({
      veryShort: Range,
      short: Range,
      medium: TypingProfile,
      long: TypingProfile,
    }),
    pauseBetweenMessages: z.object({
      shortNext: Range,
      mediumNext: Range,
      longNext: Range,
      firstMessageFactor: z.number().positive(),
      lastMessageExtra: Range,
    }),
  }),
  whatsapp: z.object({
    debounceMs: z.number().int().nonnegative(),
    reconnectDelayMs: z.number().int().nonnegative(),
    mediaDelay: Range,
    closureReactionDelay: Range,
  }),
  escalation: z.object({
    repeatMessageThreshold: z.number().int().positive(),
    urgencyKeywords: z.array(z.string().min(1)).min(1),
    negativeKeywords: z.array(z.string().min(1)).min(1),
    complexityKeywords: z.array(z.string().min(1)).min(1),
  }),
  llm: z.object({
    groq: LLMProfile,
    openai: LLMProfile,
  }),
  softLimits: z.object({
    phase1: SoftLimitPhase,
    phase2: SoftLimitPhase,
    phase3: SoftLimitPhase,
    consultationPrice: z.string().min(1),
    studyPrice: z.string().min(1),
    subscriptionLabel: z.string().min(1),
  }),
  rag: z.object({
    maxVideoRecommendations: z.number().int().positive(),
    snippetLength: z.number().int().positive(),
    pinecone: z.object({
      dimension: z.number().int().positive(),
      indexCheckMaxAttempts: z.number().int().positive(),
      indexCheckIntervalMs: z.number().int().nonnegative(),
    }),
  }),
  extranjeria: z.object({
    redirectPhone: z.string().regex(/^\d+$/, 'must be digits only'),
    keywords: z.array(z.string().min(1)).min(1),
  }),
  timeGreeting: z.object({
    morningStart: z.number().int().min(0).max(23),
    afternoonStart: z.number().int().min(0).max(23),
    nightStart: z.number().int().min(0).max(23),
  }),
})

export type BotConfig = z.infer<typeof BotConfigSchema>

// ─── Load ───

function loadBotConfig(): BotConfig {
  const configPath = join(process.cwd(), 'bot.config.yaml')
  const raw = readFileSync(configPath, 'utf-8')
  const parsed = yaml.load(raw)

  const result = BotConfigSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    console.error('[BOOT] Invalid bot.config.yaml:\n' + issues)
    process.exit(1)
  }
  return result.data
}

export const botConfig = loadBotConfig()
