/**
 * Mensajes predefinidos del bot con variación para sonar natural.
 * Basados en los patrones reales de comunicación del despacho (119 chats analizados).
 */

import { config } from '../config/env.js'
import { botConfig } from '../config/bot-config.js'
import { pickRandom, formatSpanishMobile } from '../utils/helpers.js'

const extranjeriaPhone = formatSpanishMobile(botConfig.extranjeria.redirectPhone)

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

// Extranjería: redirect directo al equipo especializado.
// Sin re-saludo (el bot ya saludó al abrir conversación). Cada variante < 160 chars
// para que el humanizer no lo parta en múltiples burbujas.
const extranjeriaVariants = [
  `Para temas de extranjería tenemos un equipo especializado del despacho. El número es ${extranjeriaPhone}, ahí te van a atender mejor.`,

  `Estos temas (papeles, residencia, nacionalidad) los lleva nuestro equipo de extranjería. Escríbeles al ${extranjeriaPhone}, te ayudarán mejor.`,

  `Los temas de extranjería los lleva un equipo del despacho con su propio número: ${extranjeriaPhone}. Mismo despacho, especializados en eso.`,

  `Para estos temas tenemos un equipo de extranjería en el ${extranjeriaPhone}. Es el mismo despacho, le atenderán mejor desde ahí.`,
]

export const MESSAGES = {
  get existingClient() { return pickRandom(existingClientVariants) },
  get escalation() { return pickRandom(escalationVariants) },
  get error() { return pickRandom(errorVariants) },
  get extranjeria() { return pickRandom(extranjeriaVariants) },
}
