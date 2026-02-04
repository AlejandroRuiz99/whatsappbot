/**
 * Inicialización de proveedores de LLM (Groq, OpenAI)
 */

import OpenAI from 'openai'
import Groq from 'groq-sdk'
import { config } from '../../../config/env.js'
import { logger } from '../../../utils/logger.js'

// Verificar si hay API keys válidas
export const hasGroqKey = config.GROQ_API_KEY && 
  config.GROQ_API_KEY !== 'gsk_your-groq-key-here' && 
  config.GROQ_API_KEY.startsWith('gsk_')

export const hasOpenAIKey = config.OPENAI_API_KEY && 
  config.OPENAI_API_KEY !== 'sk-your-key-here' && 
  config.OPENAI_API_KEY.startsWith('sk-')

// Inicializar clientes
export const groq = hasGroqKey ? new Groq({ apiKey: config.GROQ_API_KEY }) : null
export const openai = hasOpenAIKey ? new OpenAI({ apiKey: config.OPENAI_API_KEY }) : null

// Modelo de Groq a usar
export const GROQ_MODEL = 'llama-3.3-70b-versatile'

// Tipo para mensajes del chat
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Generar respuesta con Groq (Llama 3)
 */
export async function generateWithGroq(
  messages: ChatMessage[]
): Promise<string | null> {
  if (!groq) return null
  
  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      max_tokens: 600,
      temperature: 0.85,
      top_p: 0.92,
      presence_penalty: 0.3,
      frequency_penalty: 0.3,
    })

    return completion.choices[0]?.message?.content || null
  } catch (error) {
    logger.error('[LLM] Error con Groq:', error)
    return null
  }
}

/**
 * Generar respuesta con OpenAI (fallback)
 */
export async function generateWithOpenAI(
  messages: ChatMessage[]
): Promise<string | null> {
  if (!openai) return null
  
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      max_tokens: 550,
      temperature: 0.85,
      top_p: 0.92,
      presence_penalty: 0.3,
      frequency_penalty: 0.3,
    })

    return completion.choices[0].message.content || null
  } catch (error) {
    logger.error('[LLM] Error con OpenAI:', error)
    return null
  }
}

/**
 * Obtener estado del LLM configurado
 */
export function getLLMStatus(): { provider: string; configured: boolean } {
  if (hasGroqKey) return { provider: 'Groq (Llama 3)', configured: true }
  if (hasOpenAIKey) return { provider: 'OpenAI (GPT-3.5)', configured: true }
  return { provider: 'Sistema Local', configured: false }
}
