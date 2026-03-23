/**
 * Mensajes predefinidos del bot con variación para sonar natural
 */

import { config } from '../config/env.js'
import { pickRandom } from '../utils/helpers.js'

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

const extranjeriaVariants = [
  'Hola! Para temas de extranjería, permisos de residencia y nacionalidad tenemos un número específico: 640 56 95 37. Es el mismo despacho, pero el equipo de extranjería trabaja desde ahí y le podrán atender mucho mejor.',

  'Buenas! Los temas de residencia, nacionalidad y arraigo los llevamos desde un número específico del despacho: 640 56 95 37. Escríbales ahí que es el equipo especializado en extranjería.',

  'Hola! Para lo que me comenta le voy a pasar el número del equipo de extranjería del despacho: 640 56 95 37. Es el mismo despacho, trabajamos juntos, pero ellos están especializados en estos temas y le darán una atención más directa.',

  'Para temas de permisos, residencia o nacionalidad le recomiendo que contacte con nuestro equipo de extranjería en el 640 56 95 37. Es el despacho Compromiso Legal, mismo equipo, pero ese número es el que tienen habilitado para estos casos.',

  'Hola! Ese tipo de consultas las gestiona el equipo de extranjería del despacho. Le paso su número: 640 56 95 37. Son los mismos, pero trabajan desde ahí para estos temas concretos.',
]

export const MESSAGES = {
  get existingClient() { return pickRandom(existingClientVariants) },
  get escalation() { return pickRandom(escalationVariants) },
  get error() { return pickRandom(errorVariants) },
  get extranjeria() { return pickRandom(extranjeriaVariants) },
}
