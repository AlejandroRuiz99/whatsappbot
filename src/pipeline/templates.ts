/**
 * Mensajes predefinidos del bot con variación para sonar natural
 * Basados en los patrones reales de comunicación del despacho (119 chats analizados)
 */

import { config } from '../config/env.js'
import { pickRandom } from '../utils/helpers.js'

const existingClientVariants = [
  `Hola, qué tal! Soy Inmaculada de Compromiso Legal. Para clientes tenemos un canal en Telegram que es más directo y cómodo para gestionar consultas\n\nLe dejo el enlace: ${config.TELEGRAM_LINK}`,

  `Buenos días! Soy Inmaculada, administrativa de Compromiso Legal. Hemos hecho cambios organizativos para poder daros más rapidez en las respuestas, las consultas de clientes ahora las gestionamos por Telegram\n\nAquí tiene el acceso: ${config.TELEGRAM_LINK}`,

  `Hola! Soy Inmaculada de Compromiso Legal. Las consultas de clientes las gestionamos por Telegram, que nos permite atenderle mejor y más rápido\n\nEscríbanos por aquí: ${config.TELEGRAM_LINK}`,

  `Buenas! Soy Inmaculada de Compromiso Legal. Como ya es cliente nuestro, le recomiendo que nos escriba por Telegram, es por donde atendemos las consultas de clientes de forma más directa\n\n${config.TELEGRAM_LINK}`,
]

const escalationVariants = [
  'Mire, esto prefiero que se lo vea directamente una de nuestras abogadas. Le paso su consulta para que le contacten lo antes posible.',
  'Entendido. Voy a trasladar su consulta a la especialista del despacho para que le atienda personalmente. Le contactaremos en breve.',
  'Esto es mejor tratarlo directamente con la especialista. Le paso su caso ahora mismo.',
  'De acuerdo, esto merece una atención más detallada. Deje que se lo pase a la abogada, le contactará en breve.',
]

const errorVariants = [
  'Disculpe, ha habido un problema técnico. ¿Puede repetirme su consulta?',
  'Perdone, algo ha fallado por nuestro lado. ¿Me lo puede decir de nuevo?',
  'Lo siento, ha ocurrido un error. Si me repite la consulta se lo intento resolver.',
]

const extranjeriaVariants = [
  'Hola! Soy Inmaculada de Compromiso Legal. Para temas de extranjería, permisos de residencia y nacionalidad tenemos un equipo especializado. Nuestro número para temas de extranjería es el 640 56 95 37, es el mismo despacho pero ahí te van a poder atender mucho mejor.',

  'Buenas! Soy Inmaculada, administrativa de Compromiso Legal. Los temas de residencia, nacionalidad y arraigo los lleva un equipo especializado del despacho desde el número 640 56 95 37. Escríbeles ahí que te atenderán mejor.',

  'Hola! Soy Inmaculada de Compromiso Legal. Para lo que me comentas te paso el número del equipo de extranjería del despacho: 640 56 95 37. Es el mismo despacho, trabajamos juntos, pero ellos están especializados en estos temas y te darán una atención más directa.',

  'Para temas de permisos, residencia o nacionalidad le recomiendo que contacte con nuestro equipo de extranjería en el 640 56 95 37. Es Compromiso Legal, el mismo despacho, pero ese número es el que tienen habilitado para estos temas concretos.',
]

export const MESSAGES = {
  get existingClient() { return pickRandom(existingClientVariants) },
  get escalation() { return pickRandom(escalationVariants) },
  get error() { return pickRandom(errorVariants) },
  get extranjeria() { return pickRandom(extranjeriaVariants) },
}
