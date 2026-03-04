/**
 * Constructor de System Prompt
 * Carga y ensambla prompts desde archivos externos
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from '../../../config/env.js'
import { botConfig } from '../../../config/bot-config.js'
import { buscarServicios } from '../services-catalog/catalog.data.js'
import { getConversationContext, getUserMessageCount, getUserTotalChars } from '../../conversation/memory.js'
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
 * Genera un saludo contextual según la hora en España (Europe/Madrid)
 */
function getTimeGreeting(): string {
  const now = new Date()
  const spainTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }))
  const hour = spainTime.getHours()
  const dayOfWeek = spainTime.getDay()
  const tg = botConfig.timeGreeting
  
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  
  let greeting: string
  if (hour >= tg.morningStart && hour < tg.afternoonStart) {
    greeting = 'Es por la mañana en España.'
  } else if (hour >= tg.afternoonStart && hour < tg.nightStart) {
    greeting = 'Es por la tarde en España.'
  } else {
    greeting = 'Es de noche en España, fuera de horario habitual.'
  }
  
  if (isWeekend) {
    greeting += ' Hoy es fin de semana.'
  }
  
  return `${greeting} Adapta tu saludo de forma natural (buenos días/buenas tardes/buenas noches) solo si es la primera interacción. No lo fuerces en cada mensaje.`
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
    BOOKING_URL: config.BOOKING_URL,
    TIME_GREETING: getTimeGreeting()
  })
  
  const servicesContext = buildServicesContext(userMessage)
  const conversationContext = phone ? getConversationContext(phone) : ''
  const ragSection = ragContext?.context ? buildRAGContext(ragContext) : ''
  
  const softLimitHint = phone ? buildSoftLimitHint(phone) : ''

  return `${prompt}${ragSection}${servicesContext}${conversationContext}${softLimitHint}`
}

/**
 * Escala la presión para derivar a consulta según cuánto ha contado el cliente.
 * Usa caracteres totales (mejor que contar mensajes: 3 mensajes cortos de "hola" no son lo mismo
 * que 3 mensajes largos explicando un despido).
 * También usa mensaje count como tope: aunque digan poco, si llevan muchos mensajes hay que derivar.
 */
function buildSoftLimitHint(phone: string): string {
  const msgCount = getUserMessageCount(phone)
  const totalChars = getUserTotalChars(phone)
  const sl = botConfig.softLimits

  if (totalChars < sl.phase1.maxChars && msgCount <= sl.phase1.maxMessages) return ''

  if (totalChars < sl.phase2.maxChars && msgCount <= sl.phase2.maxMessages) {
    return '\n\nNOTA INTERNA: Ya tienes contexto suficiente del problema. Si no lo has hecho aún, busca un momento natural para mencionar que esto convendría verlo en consulta. No lo fuerces, pero si surge la oportunidad menciónalo como algo lógico para su caso.'
  }

  if (totalChars < sl.phase3.maxChars && msgCount <= sl.phase3.maxMessages) {
    return '\n\nNOTA INTERNA: Ya tienes bastante información del cliente. Deberías haber sugerido la consulta. Si no lo has hecho, hazlo ahora. No des más info detallada gratis. Incluye el enlace de citas en tu respuesta.'
  }

  return `\n\nNOTA INTERNA: Llevas demasiado tiempo dando orientación gratis. Deja de dar información nueva. Responde brevemente y redirige a consulta con enlace y precio (${sl.consultationPrice}). Si el cliente sigue preguntando, responde algo como "Para esto necesitaría ver su caso en detalle en consulta" y punto.`
}

/**
 * Limpia la caché de prompts (útil para desarrollo)
 */
export function clearPromptCache(): void {
  cache.clear()
}
