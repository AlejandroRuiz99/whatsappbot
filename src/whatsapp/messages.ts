/**
 * Mensajes predefinidos del bot con variación para sonar natural
 */

import { config } from '../config/env.js'

const existingClientVariants = [
  `Hola, qué tal! Le escribimos desde Compromiso Legal. Para clientes como usted tenemos un canal en Telegram que es más directo y cómodo para gestionar consultas\n\nLe dejo el enlace: ${config.TELEGRAM_LINK}`,

  `Buenos días! Veo que ya es cliente del despacho. Las consultas de clientes las gestionamos por Telegram, que es más ágil\n\nAquí tiene el acceso: ${config.TELEGRAM_LINK}`,

  `Hola! Desde el despacho gestionamos las consultas de clientes por Telegram, que nos permite atenderle mejor\n\nEscríbanos por aquí: ${config.TELEGRAM_LINK}`,

  `Qué tal! Como ya es cliente nuestro, le recomiendo que nos escriba por Telegram, que es por donde atendemos consultas de clientes de forma más directa\n\n${config.TELEGRAM_LINK}`,

  `Hola! Para clientes usamos Telegram, nos resulta más cómodo para dar un seguimiento adecuado a cada caso\n\nLe paso el enlace: ${config.TELEGRAM_LINK}`,
]

const escalationVariants = [
  'Mire, esto prefiero que se lo vea directamente uno de nuestros abogados. Le paso su consulta para que le contacten lo antes posible.',
  'Entendido. Voy a trasladar su consulta a un compañero del despacho para que le atienda personalmente. Le contactaremos pronto.',
  'Verá, creo que esto es mejor tratarlo directamente con un abogado del equipo. Le paso su caso ahora mismo.',
  'Esto merece una atención más detallada. Deje que lo derive a un compañero del despacho, le contactarán en breve.',
]

const errorVariants = [
  'Disculpe, ha habido un problema técnico. ¿Puede repetirme su consulta?',
  'Perdone, algo ha fallado por nuestro lado. ¿Me lo puede decir de nuevo?',
  'Lo siento, ha ocurrido un error. Si me repite la consulta se lo intento resolver.',
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export const MESSAGES = {
  get existingClient() { return pickRandom(existingClientVariants) },
  get escalation() { return pickRandom(escalationVariants) },
  get error() { return pickRandom(errorVariants) },
}

export type MessageKey = keyof typeof MESSAGES
