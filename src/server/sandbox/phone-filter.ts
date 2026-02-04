import { config } from '../../config/env.js'

interface FilterResult {
  allowed: boolean
  reason: string
}

export function shouldProcessMessage(from: string): FilterResult {
  // En modo produccion, procesar todos los mensajes
  if (config.BOT_MODE === 'production') {
    return { allowed: true, reason: 'production_mode' }
  }
  
  // En modo sandbox, solo procesar mensajes del numero de test
  const normalizedFrom = from.replace(/\D/g, '')
  const normalizedTest = config.TEST_PHONE_NUMBER.replace(/\D/g, '')
  
  if (!normalizedTest) {
    return { allowed: false, reason: 'no_test_number_configured' }
  }
  
  if (normalizedFrom.includes(normalizedTest) || normalizedTest.includes(normalizedFrom)) {
    return { allowed: true, reason: 'test_number_match' }
  }
  
  return { allowed: false, reason: 'sandbox_mode_filtered' }
}
