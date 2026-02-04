/**
 * Mensajes predefinidos del bot
 */

import { config } from '../config/env.js'

export const MESSAGES = {
  // Cliente existente - redirigir a Telegram
  existingClient: `¡Hola! Veo que ya eres cliente nuestro.

Para darte una atención más personalizada, gestionamos las consultas de clientes a través de nuestra área de clientes en Telegram: ${config.TELEGRAM_LINK}

Escríbenos por ahí y te atendemos enseguida.`,

  // Escalado a humano
  escalation: 'Entendido. Voy a pasar su consulta a uno de nuestros abogados para que le atienda personalmente. Le contactaremos lo antes posible.',

  // Error genérico
  error: 'Disculpe, ha ocurrido un error. Por favor, inténtelo de nuevo o contacte con nosotros directamente.',
}

export type MessageKey = keyof typeof MESSAGES
