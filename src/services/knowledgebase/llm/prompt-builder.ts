/**
 * Constructor de System Prompt
 * Carga y ensambla prompts desde archivos externos
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from '../../../config/env.js'
import { buscarServicios } from '../services-catalog/catalog.data.js'
import { getConversationContext } from '../../conversation/memory.js'
import { formatVideosForLLM, type RAGResult } from '../rag/rag.service.js'

// Ruta al directorio de prompts
const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPTS_DIR = join(__dirname, 'prompts')

// Caché de prompts
const cache: Map<string, string> = new Map()

/**
 * Carga un prompt desde archivo (con caché)
 */
function loadPrompt(filename: string): string {
  if (cache.has(filename)) {
    return cache.get(filename)!
  }
  
  const filepath = join(PROMPTS_DIR, filename)
  const content = readFileSync(filepath, 'utf-8')
  cache.set(filename, content)
  return content
}

/**
 * Interpola placeholders {{VAR}} en el template
 */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')
}

/**
 * Construye la sección de contexto de servicios
 */
function buildServicesContext(userMessage: string): string {
  const services = buscarServicios(userMessage)
  
  if (services.length === 0) {
    return ''
  }
  
  const servicesList = services.map(s => {
    const price = s.precioOrientativo ? ` (${s.precioOrientativo})` : ''
    return `- ${s.nombre} [${s.categoria}]: ${s.descripcion}${price}`
  }).join('\n')
  
  const template = loadPrompt('services-context.txt')
  return '\n' + interpolate(template, { SERVICES_LIST: servicesList })
}

/**
 * Construye la sección de contexto RAG
 */
function buildRAGContext(ragContext: RAGResult): string {
  let section = `\n\n${ragContext.context}\n`
  
  if (ragContext.shouldIncludeVideoLinks && ragContext.videos.length > 0) {
    section += `\n${formatVideosForLLM(ragContext.videos)}\n`
    section += `\n${loadPrompt('video-instructions.txt')}\n`
  }
  
  return section
}

/**
 * Construye el system prompt completo
 */
export function buildSystemPrompt(
  userMessage: string, 
  phone?: string, 
  ragContext?: RAGResult
): string {
  const basePrompt = loadPrompt('system.txt')
  const prompt = interpolate(basePrompt, {
    BOOKING_URL: config.BOOKING_URL
  })
  
  const servicesContext = buildServicesContext(userMessage)
  const conversationContext = phone ? getConversationContext(phone) : ''
  const ragSection = ragContext?.context ? buildRAGContext(ragContext) : ''
  
  return `${prompt}${ragSection}${servicesContext}${conversationContext}`
}

/**
 * Limpia la caché de prompts (útil para desarrollo)
 */
export function clearPromptCache(): void {
  cache.clear()
}
