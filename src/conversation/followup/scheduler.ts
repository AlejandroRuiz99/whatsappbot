/**
 * Scheduler de recontacto (MEJORAS BOT 2026-06).
 *
 * Flujo:
 *  1. El router llama a cancelFollowUp() cuando el cliente escribe (se ha
 *     re-enganchado solo) y a maybeScheduleFollowUp() en los flujos ai/closure
 *     para detectar aplazamientos en el mensaje entrante.
 *  2. Un tick periódico envía los follow-ups vencidos, solo dentro de la
 *     ventana horaria de España (no escribir de madrugada).
 *  3. El mensaje enviado se guarda en el historial para que, cuando el
 *     cliente responda, el LLM tenga el contexto del recontacto.
 *
 * Los textos son plantillas (no LLM): el recontacto es un mensaje corto y
 * predecible; la conversación que arranque después ya la lleva la IA.
 */

import { botConfig } from '../../config/bot-config.js'
import { logger } from '../../observability/logger.js'
import { recordMetric } from '../../observability/metrics.js'
import { botEvents } from '../../observability/event-bus.js'
import { pickRandom } from '../../utils/helpers.js'
import type { ConversationStore } from '../store/contract.js'
import { isBotPausedFor } from '../alerts/store.js'
import { detectFollowUp, spainHourOf } from './detector.js'
import { getFollowUpStore } from './store.js'

const MAX_SEND_ATTEMPTS = 5

const FOLLOWUP_MESSAGES: Record<string, string[]> = {
  cita_medica: [
    'Buenas, soy Clara de Compromiso Legal. ¿Qué tal le fue la cita médica? Cuando quiera me cuenta cómo salió y vemos la mejor forma de enfocar su caso.',
    'Hola, soy Clara de Compromiso Legal. ¿Cómo fue la cita médica? Si quiere me cuenta y miramos los siguientes pasos con la especialista.',
  ],
  aplazamiento: [
    'Hola, soy Clara de Compromiso Legal. Hace unos días estuvimos hablando de su caso y quedó en contactarnos más adelante. ¿Cómo lo lleva? Si quiere lo retomamos.',
    'Buenas, soy Clara de Compromiso Legal. Le escribo por si quiere que retomemos su consulta, sin compromiso. La especialista puede ver su caso cuando usted quiera.',
  ],
}

/**
 * Detecta un aplazamiento en el mensaje del cliente y programa el recontacto.
 * Un follow-up por teléfono: el último aplazamiento gana.
 */
export function maybeScheduleFollowUp(phone: string, message: string): void {
  try {
    const detection = detectFollowUp(message)
    if (!detection) return
    getFollowUpStore().upsert({
      phone,
      dueAt: detection.dueAt,
      kind: detection.kind,
      context: detection.context,
      createdAt: Date.now(),
      attempts: 0,
    })
    recordMetric('flow', 'followup_scheduled')
    logger.info(
      `[FOLLOWUP] ${phone} → ${detection.kind} programado para ${new Date(detection.dueAt).toISOString()}`
    )
  } catch (error) {
    logger.error('[FOLLOWUP] Error programando recontacto:', error)
  }
}

/** El cliente ha vuelto a escribir: el recontacto pendiente ya no procede. */
export function cancelFollowUp(phone: string): void {
  try {
    getFollowUpStore().cancel(phone)
  } catch (error) {
    logger.error('[FOLLOWUP] Error cancelando recontacto:', error)
  }
}

export interface FollowUpSchedulerDeps {
  /** Envía un mensaje saliente al teléfono (sin sufijo de jid). */
  send: (phone: string, text: string) => Promise<void>
  /** Canal listo para enviar (socket conectado). */
  ready: () => boolean
  store: ConversationStore
}

export function startFollowUpScheduler(deps: FollowUpSchedulerDeps): NodeJS.Timeout {
  const fu = botConfig.followUp
  const intervalMs = fu.checkIntervalMinutes * 60_000

  const tick = async (): Promise<void> => {
    if (!fu.enabled || !deps.ready()) return

    const hour = spainHourOf(new Date())
    if (hour < fu.sendWindowStartHour || hour >= fu.sendWindowEndHour) return

    for (const followUp of getFollowUpStore().listDue(Date.now())) {
      // Número en manos de un humano (alerta pendiente): el recontacto
      // automático sobra — se descarta para no pisar la conversación.
      if (isBotPausedFor(followUp.phone)) {
        getFollowUpStore().remove(followUp.phone)
        continue
      }
      const variants = FOLLOWUP_MESSAGES[followUp.kind] ?? FOLLOWUP_MESSAGES.aplazamiento
      const text = pickRandom(variants)
      try {
        await deps.send(followUp.phone, text)
        deps.store.addBotMessage(followUp.phone, text)
        getFollowUpStore().remove(followUp.phone)
        recordMetric('flow', 'followup_sent')
        recordMetric('message:sent')
        botEvents.publish({
          type: 'message:outgoing',
          phone: followUp.phone,
          text,
          flow: 'followup',
          timestamp: Date.now(),
        })
        logger.bot(`[FOLLOWUP] ${followUp.phone} → recontacto enviado (${followUp.kind})`)
      } catch (error) {
        const attempts = getFollowUpStore().bumpAttempts(followUp.phone)
        logger.error(
          `[FOLLOWUP] Error enviando recontacto a ${followUp.phone} (intento ${attempts}):`,
          error
        )
        if (attempts >= MAX_SEND_ATTEMPTS) {
          getFollowUpStore().remove(followUp.phone)
          logger.warn(`[FOLLOWUP] ${followUp.phone} → descartado tras ${attempts} intentos`)
        }
      }
    }
  }

  const timer = setInterval(() => {
    void tick()
  }, intervalMs)
  logger.info(`[FOLLOWUP] Scheduler activo (cada ${fu.checkIntervalMinutes} min)`)
  return timer
}
