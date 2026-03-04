/**
 * Inicialización de proveedores de LLM (Groq, OpenAI)
 */

import OpenAI from 'openai'
import Groq from 'groq-sdk'
import { config } from '../../../config/env.js'
import { botConfig } from '../../../config/bot-config.js'
import { logger } from '../../../utils/logger.js'

const groqConfig = botConfig.llm.groq
const openaiConfig = botConfig.llm.openai

export const hasGroqKey = config.GROQ_API_KEY && 
  config.GROQ_API_KEY !== 'gsk_your-groq-key-here' && 
  config.GROQ_API_KEY.startsWith('gsk_')

export const hasOpenAIKey = config.OPENAI_API_KEY && 
  config.OPENAI_API_KEY !== 'sk-your-key-here' && 
  config.OPENAI_API_KEY.startsWith('sk-')

export const groq = hasGroqKey ? new Groq({ apiKey: config.GROQ_API_KEY }) : null
export const openai = hasOpenAIKey ? new OpenAI({ apiKey: config.OPENAI_API_KEY }) : null

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function generateWithGroq(
  messages: ChatMessage[]
): Promise<string | null> {
  if (!groq) return null
  
  try {
    const completion = await groq.chat.completions.create({
      model: groqConfig.model,
      messages,
      max_tokens: groqConfig.maxTokens,
      temperature: groqConfig.temperature,
      top_p: groqConfig.topP,
      presence_penalty: groqConfig.presencePenalty,
      frequency_penalty: groqConfig.frequencyPenalty,
    })

    return completion.choices[0]?.message?.content || null
  } catch (error) {
    logger.error('[LLM] Error con Groq:', error)
    return null
  }
}

export async function generateWithOpenAI(
  messages: ChatMessage[]
): Promise<string | null> {
  if (!openai) return null
  
  try {
    const completion = await openai.chat.completions.create({
      model: openaiConfig.model,
      messages,
      max_tokens: openaiConfig.maxTokens,
      temperature: openaiConfig.temperature,
      top_p: openaiConfig.topP,
      presence_penalty: openaiConfig.presencePenalty,
      frequency_penalty: openaiConfig.frequencyPenalty,
    })

    return completion.choices[0].message.content || null
  } catch (error) {
    logger.error('[LLM] Error con OpenAI:', error)
    return null
  }
}

export function getLLMStatus(): { provider: string; configured: boolean } {
  if (hasGroqKey) return { provider: `Groq (${groqConfig.model})`, configured: true }
  if (hasOpenAIKey) return { provider: `OpenAI (${openaiConfig.model})`, configured: true }
  return { provider: 'Sistema Local', configured: false }
}
