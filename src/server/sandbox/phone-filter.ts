import { config } from '../../config/env.js'

interface FilterResult {
  allowed: boolean
  reason: string
}

export function shouldProcessMessage(from: string): FilterResult {
  // Nunca procesar mensajes de grupos ni broadcasts (solo chats directos)
  if (from.endsWith('@g.us') || from.endsWith('@broadcast') || from === 'status@broadcast') {
    return { allowed: false, reason: 'group_or_broadcast' }
  }

  // En modo produccion, procesar todos los mensajes directos
  if (config.BOT_MODE === 'production') {
    return { allowed: true, reason: 'production_mode' }
  }
  
  // En modo sandbox, solo procesar mensajes del numero de test
  const normalizedFrom = from.replace('@s.whatsapp.net', '').replace(/\D/g, '')
  const normalizedTest = config.TEST_PHONE_NUMBER.replace(/\D/g, '')
  
  if (!normalizedTest) {
    return { allowed: false, reason: 'no_test_number_configured' }
  }
  
  // Comparación exacta (no includes) para evitar falsos positivos
  if (normalizedFrom === normalizedTest) {
    return { allowed: true, reason: 'test_number_match' }
  }
  
  return { allowed: false, reason: 'sandbox_mode_filtered' }
}
