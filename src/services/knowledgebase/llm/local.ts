/**
 * Sistema de respuestas sin IA
 * Fallback cuando no hay API keys configuradas
 */

import { logger } from '../../../utils/logger.js'
import { buscarServicios, type Servicio } from '../services-catalog/catalog.data.js'

// Patrones de detección
const SALUDOS = ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'hi', 'hello']
const AGRADECIMIENTOS = ['gracias', 'muchas gracias', 'te agradezco', 'genial', 'perfecto', 'ok', 'vale']
const PREGUNTAS_PRECIO = ['precio', 'coste', 'cuesta', 'cobran', 'tarifa', 'cuanto', 'cuánto', 'honorarios']
const PREGUNTAS_CONTACTO = ['contacto', 'llamar', 'telefono', 'email', 'dirección', 'donde', 'ubicación', 'horario']

type Intencion = 'saludo' | 'precio' | 'contacto' | 'agradecimiento' | 'consulta'

/**
 * Detectar intención del mensaje
 */
function detectarIntencion(mensaje: string): Intencion {
  const lower = mensaje.toLowerCase()
  
  if (SALUDOS.some(s => lower.includes(s)) && mensaje.length < 30) return 'saludo'
  if (AGRADECIMIENTOS.some(a => lower.includes(a)) && mensaje.length < 50) return 'agradecimiento'
  if (PREGUNTAS_PRECIO.some(p => lower.includes(p))) return 'precio'
  if (PREGUNTAS_CONTACTO.some(c => lower.includes(c))) return 'contacto'
  
  return 'consulta'
}

function generarRespuestaSaludo(): string {
  const respuestas = [
    '¡Hola! 👋 Bienvenido a Compromiso Legal. ¿En qué puedo ayudarle?',
    'Buenos días. ¿En qué podemos ayudarle?',
    '¡Hola! Cuénteme, ¿qué necesita?',
  ]
  return respuestas[Math.floor(Math.random() * respuestas.length)]
}

function generarRespuestaAgradecimiento(): string {
  const respuestas = [
    'De nada. Si tiene cualquier otra duda, aquí estamos.',
    'Un placer. No dude en contactarnos si necesita algo más.',
    'Para eso estamos. ¡Que le vaya bien!',
  ]
  return respuestas[Math.floor(Math.random() * respuestas.length)]
}

function generarRespuestaContacto(): string {
  return `Puede contactarnos por este mismo chat o a través de nuestra web: compromisolegal.es

Nuestro horario de atención es de lunes a viernes, de 9:00 a 19:00.`
}

function generarRespuestaPrecio(_servicios: Servicio[]): string {
  return `El precio de una consulta online es de 69€.

Para otros servicios, el precio depende del caso concreto. Si me cuenta su situación, podemos darle un presupuesto sin compromiso.`
}

function generarRespuestaConsulta(mensaje: string, servicios: Servicio[]): string {
  if (servicios.length === 0) {
    return `Para poder orientarle mejor, ¿podría darme más detalles sobre su situación?`
  }
  
  const servicio = servicios[0]
  
  let respuesta = `Entiendo. Por lo que me cuenta, esto entraría dentro de ${servicio.nombre.toLowerCase()}.

${servicio.descripcion}`
  
  respuesta += `\n\n¿Podría darme más detalles de su caso?`
  
  return respuesta
}

/**
 * Generar respuesta sin IA (sistema local)
 */
export function generarRespuestaLocal(mensaje: string): string {
  const intencion = detectarIntencion(mensaje)
  const serviciosRelevantes = buscarServicios(mensaje)
  
  logger.info(`[LLM] Sistema local - Intención: ${intencion}, Servicios: ${serviciosRelevantes.length}`)
  
  switch (intencion) {
    case 'saludo':
      return generarRespuestaSaludo()
    case 'agradecimiento':
      return generarRespuestaAgradecimiento()
    case 'contacto':
      return generarRespuestaContacto()
    case 'precio':
      return generarRespuestaPrecio(serviciosRelevantes)
    case 'consulta':
    default:
      return generarRespuestaConsulta(mensaje, serviciosRelevantes)
  }
}
