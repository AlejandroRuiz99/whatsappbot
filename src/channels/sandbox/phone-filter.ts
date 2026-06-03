interface FilterResult {
  allowed: boolean
  reason: string
}

export function shouldProcessMessage(from: string): FilterResult {
  // Nunca procesar mensajes de grupos ni broadcasts (solo chats directos)
  if (from.endsWith('@g.us') || from.endsWith('@broadcast') || from === 'status@broadcast') {
    return { allowed: false, reason: 'group_or_broadcast' }
  }

  return { allowed: true, reason: 'direct_message' }
}
