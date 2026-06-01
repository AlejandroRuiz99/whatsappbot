import { logger } from '../../observability/logger.js'
import { botConfig } from '../../config/bot-config.js'

// Palabras clave de URGENCIA
// NOTA: "hoy" y "mañana" eliminados — generan falsos positivos masivos.
// Muchas consultas legales legítimas contienen estas palabras:
// "me despidieron hoy", "¿puedo jubilarme mañana?", "tengo cita mañana"
const URGENCIA_KEYWORDS = [
  'urgente', 'emergencia',
  'hablar con alguien', 'persona real', 'abogado real',
  'cuanto antes', 'ya mismo', 'inmediato'
]

// Palabras clave de FRUSTRACIÓN / SENTIMIENTO NEGATIVO
// Eliminado "denuncia" — muchos clientes preguntan sobre poner denuncias legítimas
const NEGATIVO_KEYWORDS = [
  'no entiendo', 'no me sirve', 'no me ayuda', 'queja',
  'enfadado', 'enfadada', 'harto', 'harta', 'indignado', 'indignada',
  'esto es una mierda', 'no sirve', 'inutil', 'inútil', 'vergüenza',
  'estafa', 'timo', 'engaño', 'mentira', 'ridiculo', 'ridículo'
]

// Palabras que indican CONFUSIÓN / CONSULTA COMPLEJA
// Eliminado "es complicado", "es complejo", "situación difícil" — los clientes
// describen así sus casos legales de forma legítima sin estar frustrados
const COMPLEJO_KEYWORDS = [
  'no lo entiendo', 'me he perdido', 'no me queda claro',
  'puedes repetir', 'puede repetir', 'no se que hacer', 'no sé qué hacer'
]

// TTL para limpiar entradas antiguas de mensajes repetidos (24h)
const MENSAJES_REPETIDOS_TTL_MS = 24 * 60 * 60 * 1000

// Contador de mensajes repetidos por usuario (con timestamp para TTL)
const mensajesRepetidos = new Map<string, { ultimo: string; contador: number; timestamp: number }>()

function detectarMensajeRepetido(phone: string, message: string): boolean {
  const lower = message.toLowerCase().trim()
  const now = Date.now()

  // Limpiar entradas expiradas en cada llamada (coste O(n) amortizado con el TTL)
  for (const [key, val] of mensajesRepetidos) {
    if (now - val.timestamp > MENSAJES_REPETIDOS_TTL_MS) {
      mensajesRepetidos.delete(key)
    }
  }

  const registro = mensajesRepetidos.get(phone)

  if (registro && registro.ultimo === lower) {
    registro.contador++
    registro.timestamp = now
    if (registro.contador >= botConfig.escalation.repeatMessageThreshold) {
      mensajesRepetidos.delete(phone) // Resetear después de escalar
      return true
    }
  } else {
    mensajesRepetidos.set(phone, { ultimo: lower, contador: 1, timestamp: now })
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
