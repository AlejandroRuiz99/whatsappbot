/**
 * Detección de aplazamientos para recontacto programado (MEJORAS BOT 2026-06).
 *
 * El cliente que dice "el jueves tengo cita médica, luego os escribo" no debe
 * perderse: se programa un follow-up para ese día. Las señales viven en
 * bot.config.yaml (followUp.signals / followUp.citaMedicaSignals); aquí solo
 * está la extracción de la fecha objetivo.
 *
 * Reglas de fecha (huso Europe/Madrid):
 *  - Día de la semana mencionado → próxima ocurrencia, a weekdaySendHour
 *    (por la tarde, después de la cita). "hoy" → hoy, "mañana" → +1 día.
 *  - "la semana que viene" → +7 días. "el mes que viene"/"a final de mes" → +30.
 *  - "en N días/semanas" → +N.
 *  - Sin referencia temporal → defaultDelayDays, a defaultSendHour.
 */

import { botConfig } from '../../config/bot-config.js'

export interface FollowUpDetection {
  kind: 'cita_medica' | 'aplazamiento'
  dueAt: number
  context: string
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miércoles: 3,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sábado: 6,
  sabado: 6,
}

const EN_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function spainHourOf(date: Date): number {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    hour: 'numeric',
    hour12: false,
  }).format(date)
  return parseInt(hourStr, 10) % 24
}

function spainWeekdayOf(date: Date): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
  }).format(date)
  return EN_WEEKDAYS.indexOf(name)
}

/**
 * Timestamp a `daysAhead` días vista, ajustado a la hora `hour` de España
 * (aproximado al minuto actual — suficiente para un recontacto comercial).
 * Si el resultado cae en el pasado (p.ej. "hoy" cuando ya pasó la hora de
 * envío), se empuja al día siguiente para no disparar un recontacto inmediato.
 */
function atSpainHour(now: Date, daysAhead: number, hour: number): number {
  const base = now.getTime() + daysAhead * 86_400_000
  const currentSpainHour = spainHourOf(new Date(base))
  let target = base + (hour - currentSpainHour) * 3_600_000
  while (target <= now.getTime()) target += 86_400_000
  return target
}

export function detectFollowUp(message: string, now: Date = new Date()): FollowUpDetection | null {
  const fu = botConfig.followUp
  if (!fu.enabled) return null

  const lower = message.toLowerCase()
  const isCita = fu.citaMedicaSignals.some((s) => lower.includes(s))
  const isGeneric = fu.signals.some((s) => lower.includes(s))
  if (!isCita && !isGeneric) return null

  let daysAhead = fu.defaultDelayDays
  let hour = fu.defaultSendHour

  const wd = lower.match(/\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/)
  const enDias = lower.match(/\ben (\d{1,2}) d[ií]as\b/)
  const enSemanas = lower.match(/\ben (\d{1,2}) semanas?\b/)

  if (wd) {
    const target = WEEKDAYS[wd[1]]
    const today = spainWeekdayOf(now)
    daysAhead = (target - today + 7) % 7
    // Mismo día de la semana sin más contexto → la semana siguiente,
    // salvo que la cita sea hoy (lo cubre el caso "hoy" de abajo).
    if (daysAhead === 0) daysAhead = 7
    hour = fu.weekdaySendHour
  } else if (/\bhoy\b/.test(lower) && isCita) {
    daysAhead = 0
    hour = fu.weekdaySendHour
  } else if (/\bmañana\b/.test(lower) && !/\b(por|de) la mañana\b/.test(lower) && isCita) {
    daysAhead = 1
    hour = fu.weekdaySendHour
  } else if (/semana que viene/.test(lower)) {
    daysAhead = 7
  } else if (/mes que viene|final de mes|fin de mes/.test(lower)) {
    daysAhead = 30
  } else if (enDias) {
    daysAhead = parseInt(enDias[1], 10)
  } else if (enSemanas) {
    daysAhead = parseInt(enSemanas[1], 10) * 7
  }

  return {
    kind: isCita ? 'cita_medica' : 'aplazamiento',
    dueAt: atSpainHour(now, daysAhead, hour),
    context: message.slice(0, 200),
  }
}
