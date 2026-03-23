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
import { getConversationContext, getConversationHistory, getUserMessageCount, getUserTotalChars } from '../../conversation/memory.js'
import { formatVideosForLLM, type RAGResult } from '../rag/rag.service.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPTS_DIR = join(__dirname, 'prompts')

// Caché de prompts en texto plano
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

// ─── Keywords de Seguridad Social ───
// Usadas para detectar el tema y seleccionar las secciones de conocimiento legal apropiadas

const JUBILACION_KEYWORDS = [
  'jubila', 'pension', 'pensión', 'cotiza', 'cotizado', 'cotizacion', 'cotización',
  'anticipad', 'edad de jubilacion', 'edad de jubilación',
  'años cotizados', 'anos cotizados', 'me puedo jubilar', 'cuando me jubilo',
  'cuanto cobro', 'cuánto cobro', 'escenarios jubilacion',
]

const INCAPACIDAD_KEYWORDS = [
  'incapacidad', 'invalidez', 'baja laboral', 'inss', 'mutua',
  'resolucion', 'resolución', 'denegad', 'tribunal medico', 'tribunal médico', '545',
]

// Superset para detectar cualquier tema de seguridad social
const SEGURIDAD_SOCIAL_KEYWORDS = [
  ...JUBILACION_KEYWORDS,
  ...INCAPACIDAD_KEYWORDS,
  'clases pasivas', 'discapacidad', 'minusvalia', 'minusvalía',
  'subsidio', 'desempleo', 'paro', 'erte',
  'reconocimiento', 'impugnar',
  'convenio', 'totalizar', 'extranjero cotiz', 'cotizar en espa', 'volver a cotizar',
  'pago directo', 'marinero', 'mineria', 'minería', 'carbon', 'carbón',
  'segunda oportunidad', 'segunda opinión',
]

function isSegSocialTopic(userMessage: string): boolean {
  const lower = userMessage.toLowerCase()
  return SEGURIDAD_SOCIAL_KEYWORDS.some(kw => lower.includes(kw))
}

// ─── Inyección selectiva de legal-knowledge.txt ───

interface ParsedLegalKnowledge {
  header: string
  sections: Map<string, string>
  estrategia: string
}

let parsedLegalKnowledge: ParsedLegalKnowledge | null = null

function getLegalKnowledgeParsed(): ParsedLegalKnowledge {
  if (parsedLegalKnowledge) return parsedLegalKnowledge

  const raw = loadPrompt('legal-knowledge.txt')
  const sections = new Map<string, string>()
  let header = ''
  let estrategia = ''

  // Dividir en partes por marcadores de sección ━━━ NAME ━━━
  const parts = raw.split(/\n(?=━━━)/)

  header = parts[0].trim()

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]
    const match = part.match(/^━━━\s+(.+?)\s+━━━\n?([\s\S]*)$/)
    if (!match) continue

    const sectionName = match[1].trim()
    const sectionContent = match[2].trim()
    const formatted = `\n━━━ ${sectionName} ━━━\n${sectionContent}`

    if (sectionName === 'ESTRATEGIA DE VENTA POR TIPO DE CASO') {
      estrategia = formatted
    } else {
      sections.set(sectionName, formatted)
    }
  }

  parsedLegalKnowledge = { header, sections, estrategia }
  return parsedLegalKnowledge
}

// Mapeo sección → keywords que la activan
const SECTION_SELECTORS: { section: string; keywords: string[] }[] = [
  { section: 'JUBILACIÓN ORDINARIA', keywords: JUBILACION_KEYWORDS },
  { section: 'JUBILACIÓN ANTICIPADA', keywords: JUBILACION_KEYWORDS },
  {
    section: 'TOTALIZACIÓN DE PERIODOS INTERNACIONALES',
    keywords: [...JUBILACION_KEYWORDS, 'convenio', 'extranjero', 'totalizar', 'cotizar en espa', 'periodos internacionales'],
  },
  {
    section: 'JUBILACIÓN CON DISCAPACIDAD',
    keywords: ['discapacidad', 'minusvalia', 'minusvalía', '45%', '65%', 'gran invalidez'],
  },
  {
    section: 'SECTORES CON COEFICIENTES REDUCTORES ESPECIALES',
    keywords: ['minero', 'marinero', 'carbon', 'carbón', 'coeficiente reductor', 'sector especial'],
  },
  {
    section: 'CLASES PASIVAS',
    keywords: ['clases pasivas', 'funcionario', 'funcion publica', 'función pública', 'pasivo'],
  },
  { section: 'INCAPACIDAD PERMANENTE', keywords: INCAPACIDAD_KEYWORDS },
  {
    section: 'LOS 545 DÍAS DE BAJA',
    keywords: ['545', 'baja', 'inss', 'mutua', 'pago directo', 'tribunal médico', 'tribunal medico', ...INCAPACIDAD_KEYWORDS],
  },
  {
    section: 'SUBSIDIO PARA MAYORES DE 52 AÑOS',
    keywords: ['subsidio', 'mayor 52', 'mayores 52', 'paro', 'desempleo', 'erte'],
  },
]

/**
 * Construye la sección de conocimiento legal de Seguridad Social (selectiva).
 * Solo inyecta las secciones relevantes al mensaje, más la estrategia de venta.
 */
function buildLegalKnowledgeContext(userMessage: string): string {
  if (!isSegSocialTopic(userMessage)) return ''

  const lower = userMessage.toLowerCase()
  const { header, sections, estrategia } = getLegalKnowledgeParsed()
  const selectedSections: string[] = []

  for (const { section, keywords } of SECTION_SELECTORS) {
    if (keywords.some(kw => lower.includes(kw))) {
      const content = sections.get(section)
      if (content) selectedSections.push(content)
    }
  }

  // Fallback: si no encajó ninguna sección específica pero hay tema de seguridad social,
  // incluir las dos más genéricas para que el bot no quede sin contexto
  if (selectedSections.length === 0) {
    for (const name of ['JUBILACIÓN ORDINARIA', 'INCAPACIDAD PERMANENTE']) {
      const content = sections.get(name)
      if (content) selectedSections.push(content)
    }
  }

  return `\n\n${header}${selectedSections.join('')}${estrategia}`
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
 * Genera un saludo contextual según la hora en España (Europe/Madrid).
 * Usa Intl.DateTimeFormat para evitar el patrón frágil de toLocaleString+parse.
 */
function getTimeGreeting(): string {
  const now = new Date()

  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    hour: 'numeric',
    hour12: false,
  }).format(now)

  const dayStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    weekday: 'long',
  }).format(now)

  const hour = parseInt(hourStr, 10)
  const tg = botConfig.timeGreeting
  const isWeekend = dayStr === 'Saturday' || dayStr === 'Sunday'

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
  const legalKnowledge = buildLegalKnowledgeContext(userMessage)
  const softLimitHint = phone ? buildSoftLimitHint(phone) : ''

  // Señal explícita de primer mensaje para que la presentación sea fiable
  const isFirstMessage = !phone || getUserMessageCount(phone) === 0
  const firstMessageNote = isFirstMessage
    ? '\n\nCONTEXTO: Este es el PRIMER mensaje de esta persona. Preséntate como atención de Compromiso Legal siguiendo las instrucciones de PRIMER MENSAJE.'
    : ''

  return `${prompt}${firstMessageNote}${ragSection}${legalKnowledge}${servicesContext}${conversationContext}${softLimitHint}`
}

function detectCaseType(phone: string): 'jubilacion' | 'incapacidad' | 'general' {
  const history = getConversationHistory(phone)
  const allText = history.map(m => m.content).join(' ').toLowerCase()
  if (JUBILACION_KEYWORDS.some(kw => allText.includes(kw))) return 'jubilacion'
  if (INCAPACIDAD_KEYWORDS.some(kw => allText.includes(kw))) return 'incapacidad'
  return 'general'
}

/**
 * Escala la presión para derivar a consulta según cuánto ha contado el cliente.
 * Usa el tipo de caso detectado para recomendar el producto correcto:
 * - Jubilación → estudio personalizado (120€)
 * - Incapacidad → consulta (69€) o suscripción mensual si aún no hay resolución
 * - General → consulta estándar (69€)
 */
function buildSoftLimitHint(phone: string): string {
  const msgCount = getUserMessageCount(phone)
  const totalChars = getUserTotalChars(phone)
  const sl = botConfig.softLimits

  if (totalChars < sl.phase1.maxChars && msgCount <= sl.phase1.maxMessages) return ''

  const caseType = detectCaseType(phone)

  if (totalChars < sl.phase2.maxChars && msgCount <= sl.phase2.maxMessages) {
    return '\n\nNOTA INTERNA: Ya tienes contexto suficiente del problema. Si no lo has hecho aún, busca un momento natural para mencionar el servicio que encaja. No lo fuerces, pero si surge la oportunidad menciónalo como algo lógico para su caso.'
  }

  if (totalChars < sl.phase3.maxChars && msgCount <= sl.phase3.maxMessages) {
    if (caseType === 'jubilacion') {
      return `\n\nNOTA INTERNA: Ya tienes bastante información. Deberías haber sugerido el estudio personalizado de jubilación (${sl.studyPrice}). Si no lo has hecho, hazlo ahora. No des más cálculos ni detalles gratis. Incluye el enlace de citas.`
    }
    if (caseType === 'incapacidad') {
      return `\n\nNOTA INTERNA: Ya tienes bastante información. Si hay una resolución denegatoria, deriva urgente a consulta (${sl.consultationPrice}) por el plazo. Si aún no hay resolución, ofrece la ${sl.subscriptionLabel} como acompañamiento durante el proceso. Incluye el enlace.`
    }
    return `\n\nNOTA INTERNA: Ya tienes bastante información del cliente. Deberías haber sugerido la consulta. Si no lo has hecho, hazlo ahora. No des más info detallada gratis. Incluye el enlace de citas en tu respuesta.`
  }

  // Fase 4: demasiado tiempo sin derivar
  if (caseType === 'jubilacion') {
    return `\n\nNOTA INTERNA: Llevas demasiado tiempo orientando gratis sobre jubilación. Para ya de dar cálculos. Responde brevemente y ofrece el estudio personalizado (${sl.studyPrice}): "Para darte una respuesta exacta lo que haría es un estudio donde analizamos todos tus escenarios y te digo cuál te conviene más." Incluye el enlace de citas.`
  }
  if (caseType === 'incapacidad') {
    return `\n\nNOTA INTERNA: Llevas demasiado tiempo. Para de dar orientación. Responde brevemente y deriva: si hay resolución denegatoria → consulta urgente (${sl.consultationPrice}); si no hay aún → ${sl.subscriptionLabel} para acompañamiento. Incluye el enlace.`
  }
  return `\n\nNOTA INTERNA: Llevas demasiado tiempo dando orientación gratis. Deja de dar información nueva. Responde brevemente y redirige a consulta con enlace y precio (${sl.consultationPrice}). Si el cliente sigue preguntando, responde algo como "Para esto necesitaría ver su caso en detalle en consulta" y punto.`
}
