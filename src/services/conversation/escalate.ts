import { logger } from '../../utils/logger.js'
import { botConfig } from '../../config/bot-config.js'

// Palabras clave de URGENCIA
const URGENCIA_KEYWORDS = [
  'urgente', 'emergencia', 'plazo', 'manana', 'mañana', 'hoy',
  'hablar con alguien', 'persona real', 'abogado real',
  'cuanto antes', 'ya mismo', 'inmediato'
]

// Palabras clave de FRUSTRACIÓN / SENTIMIENTO NEGATIVO
const NEGATIVO_KEYWORDS = [
  'no entiendo', 'no me sirve', 'no me ayuda', 'queja', 'denuncia',
  'enfadado', 'enfadada', 'harto', 'harta', 'indignado', 'indignada',
  'esto es una mierda', 'no sirve', 'inutil', 'inútil', 'vergüenza',
  'estafa', 'timo', 'engaño', 'mentira', 'ridiculo', 'ridículo'
]

// Palabras que indican CONFUSIÓN / CONSULTA COMPLEJA
const COMPLEJO_KEYWORDS = [
  'no lo entiendo', 'me he perdido', 'no me queda claro',
  'puedes repetir', 'puede repetir', 'no se que hacer', 'no sé qué hacer',
  'es complicado', 'es complejo', 'situación difícil'
]

// Contador de mensajes repetidos por usuario
const mensajesRepetidos = new Map<string, { ultimo: string; contador: number }>()

function detectarMensajeRepetido(phone: string, message: string): boolean {
  const lower = message.toLowerCase().trim()
  const registro = mensajesRepetidos.get(phone)
  
  if (registro && registro.ultimo === lower) {
    registro.contador++
    if (registro.contador >= botConfig.escalation.repeatMessageThreshold) {
      mensajesRepetidos.delete(phone) // Resetear después de escalar
      return true
    }
  } else {
    mensajesRepetidos.set(phone, { ultimo: lower, contador: 1 })
  }
  
  return false
}

export function shouldEscalate(message: string, phone?: string): { escalate: boolean; reason?: string } {
  const lower = message.toLowerCase()
  
  // 1. Urgencia
  if (URGENCIA_KEYWORDS.some(kw => lower.includes(kw))) {
    return { escalate: true, reason: 'urgencia' }
  }
  
  // 2. Sentimiento negativo / frustración
  if (NEGATIVO_KEYWORDS.some(kw => lower.includes(kw))) {
    return { escalate: true, reason: 'frustración' }
  }
  
  // 3. Consulta compleja / confusión
  if (COMPLEJO_KEYWORDS.some(kw => lower.includes(kw))) {
    return { escalate: true, reason: 'consulta_compleja' }
  }
  
  // 4. Mensaje repetido 3+ veces
  if (phone && detectarMensajeRepetido(phone, message)) {
    return { escalate: true, reason: 'mensaje_repetido' }
  }
  
  return { escalate: false }
}

interface EscalateContext {
  from: string
  body: string
  name?: string
}

export async function notifyHuman(ctx: EscalateContext): Promise<void> {
  // MVP: Log en consola. Futuro: notificacion Telegram/email
  logger.warn('=== ESCALADO A HUMANO ===')
  logger.warn(`Numero: ${ctx.from}`)
  logger.warn(`Nombre: ${ctx.name || 'No disponible'}`)
  logger.warn(`Mensaje: ${ctx.body}`)
  logger.warn(`Timestamp: ${new Date().toISOString()}`)
  logger.warn('========================')
}
