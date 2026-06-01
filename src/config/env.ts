/**
 * Environment validation — fail-fast at boot.
 * Single source of truth for all process.env values.
 *
 * Rules (master prompt §4.1):
 *  - Every required value is typed and validated at module load.
 *  - Invalid environment exits the process with a readable error.
 *  - At least one LLM provider key must be present.
 *  - TEST_PHONE_NUMBER is mandatory when BOT_MODE=sandbox.
 *  - TELEGRAM_LINK must not be the placeholder in production.
 */

import 'dotenv/config'
import { z } from 'zod'

const PLACEHOLDER_GROQ = 'gsk_your-groq-key-here'
const PLACEHOLDER_OPENAI = 'sk-your-key-here'
const PLACEHOLDER_TELEGRAM = 'https://t.me/+XXXXX'

const GroqKey = z
  .string()
  .startsWith('gsk_', 'GROQ_API_KEY must start with "gsk_"')
  .refine((v) => v !== PLACEHOLDER_GROQ, 'GROQ_API_KEY is still the placeholder')

const OpenAIKey = z
  .string()
  .startsWith('sk-', 'OPENAI_API_KEY must start with "sk-"')
  .refine((v) => v !== PLACEHOLDER_OPENAI, 'OPENAI_API_KEY is still the placeholder')

const EnvSchema = z
  .object({
    BOT_MODE: z.enum(['sandbox', 'production']).default('sandbox'),
    TEST_PHONE_NUMBER: z.string().default(''),

    GROQ_API_KEY: z.union([z.literal(''), GroqKey]).default(''),
    OPENAI_API_KEY: z.union([z.literal(''), OpenAIKey]).default(''),

    TELEGRAM_LINK: z.string().url().default(PLACEHOLDER_TELEGRAM),
    BOOKING_URL: z.string().url().default('https://compromisolegal.es/reserva/'),

    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    NODE_ENV: z.string().default('development'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'bot']).default('info'),

    PINECONE_API_KEY: z.string().default(''),
    PINECONE_INDEX_NAME: z.string().min(1).default('tiktok-despacho'),

    RAG_TOP_K: z.coerce.number().int().positive().default(5),
    RAG_MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.7),
    RAG_VIDEO_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),

    // Real human notification (master prompt §4.3, §5.2). Both must be
    // set together to enable the Telegram transport; otherwise the
    // notifier falls back to console logging.
    TELEGRAM_BOT_TOKEN: z
      .union([
        z.literal(''),
        z.string().regex(/^\d+:[A-Za-z0-9_-]+$/, 'must be <bot_id>:<secret>'),
      ])
      .default(''),
    TELEGRAM_NOTIFICATION_CHAT_ID: z
      .union([z.literal(''), z.string().regex(/^-?\d+$/, 'must be numeric')])
      .default(''),
  })
  .superRefine((env, ctx) => {
    if (env.BOT_MODE === 'sandbox' && !env.TEST_PHONE_NUMBER.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'TEST_PHONE_NUMBER is required when BOT_MODE=sandbox',
        path: ['TEST_PHONE_NUMBER'],
      })
    }
    if (!env.GROQ_API_KEY && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        message: 'At least one of GROQ_API_KEY or OPENAI_API_KEY must be set',
        path: ['GROQ_API_KEY'],
      })
    }
    if (env.BOT_MODE === 'production' && env.TELEGRAM_LINK === PLACEHOLDER_TELEGRAM) {
      ctx.addIssue({
        code: 'custom',
        message: 'TELEGRAM_LINK must be a real Telegram URL in production (currently placeholder)',
        path: ['TELEGRAM_LINK'],
      })
    }
    const hasToken = env.TELEGRAM_BOT_TOKEN !== ''
    const hasChat = env.TELEGRAM_NOTIFICATION_CHAT_ID !== ''
    if (hasToken !== hasChat) {
      ctx.addIssue({
        code: 'custom',
        message:
          'TELEGRAM_BOT_TOKEN and TELEGRAM_NOTIFICATION_CHAT_ID must be set together',
        path: ['TELEGRAM_BOT_TOKEN'],
      })
    }
  })

export type AppEnv = z.infer<typeof EnvSchema>

function parseEnv(): AppEnv {
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    console.error('[BOOT] Invalid environment configuration:\n' + issues)
    process.exit(1)
  }
  return parsed.data
}

export const config: AppEnv = parseEnv()

/**
 * Provider availability derived once at boot. Use these instead of
 * re-checking process.env or string prefixes elsewhere.
 */
export const providerStatus = {
  groq: config.GROQ_API_KEY !== '',
  openai: config.OPENAI_API_KEY !== '',
} as const

/**
 * RAG requires BOTH an OpenAI key (for embeddings) and a Pinecone key
 * (vector DB). Master prompt §6 mandates an explicit boot log when
 * RAG is disabled — see src/index.ts.
 */
export const ragStatus: { enabled: boolean; reason: string | null } = (() => {
  const reasons: string[] = []
  if (config.OPENAI_API_KEY === '') reasons.push('OPENAI_API_KEY missing (required for embeddings)')
  if (config.PINECONE_API_KEY === '') reasons.push('PINECONE_API_KEY missing (vector DB)')
  return reasons.length === 0
    ? { enabled: true, reason: null }
    : { enabled: false, reason: reasons.join('; ') }
})()

/**
 * Escalation transport selected at boot. `telegram` requires both env
 * keys; otherwise the bot falls back to `log` (console only). Logged
 * explicitly at startup so operators can spot a misconfigured deploy.
 */
export const escalationStatus: {
  transport: 'telegram' | 'log'
  reason: string | null
} = config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_NOTIFICATION_CHAT_ID
  ? { transport: 'telegram', reason: null }
  : { transport: 'log', reason: 'TELEGRAM_BOT_TOKEN/CHAT_ID not set — console fallback only' }
