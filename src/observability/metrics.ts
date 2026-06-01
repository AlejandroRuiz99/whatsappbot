/**
 * Métricas en memoria (se pierden al reiniciar, comportamiento esperado).
 * Registra contadores, latencias LLM y mensajes por hora.
 */

const MAX_LATENCY_SAMPLES = 50

interface HourlyBucket {
  hour: number  // timestamp inicio de hora (ms)
  count: number
}

interface MetricsState {
  messagesReceived: number
  messagesSent: number
  byFlow: Record<string, number>
  escalations: number
  errors: number
  ragQueries: number
  startedAt: number
  llmLatencies: number[]
  hourlyMessages: HourlyBucket[]
}

const state: MetricsState = {
  messagesReceived: 0,
  messagesSent: 0,
  byFlow: {},
  escalations: 0,
  errors: 0,
  ragQueries: 0,
  startedAt: Date.now(),
  llmLatencies: [],
  hourlyMessages: [],
}

function recordHourlyMessage(): void {
  const hourMs = 60 * 60 * 1000
  const hourStart = Math.floor(Date.now() / hourMs) * hourMs
  const existing = state.hourlyMessages.find(b => b.hour === hourStart)
  if (existing) {
    existing.count++
  } else {
    state.hourlyMessages.push({ hour: hourStart, count: 1 })
    // Mantener solo las últimas 24 horas
    const cutoff = hourStart - 24 * hourMs
    const firstValid = state.hourlyMessages.findIndex(b => b.hour >= cutoff)
    if (firstValid > 0) state.hourlyMessages.splice(0, firstValid)
  }
}

export function recordMetric(
  type:
    | 'message:received'
    | 'message:sent'
    | 'flow'
    | 'escalation'
    | 'error'
    | 'rag:query'
    | 'llm:latency',
  data?: string | number
): void {
  switch (type) {
    case 'message:received':
      state.messagesReceived++
      recordHourlyMessage()
      break
    case 'message:sent':
      state.messagesSent++
      break
    case 'flow':
      if (typeof data === 'string') {
        state.byFlow[data] = (state.byFlow[data] || 0) + 1
      }
      break
    case 'escalation':
      state.escalations++
      break
    case 'error':
      state.errors++
      break
    case 'rag:query':
      state.ragQueries++
      break
    case 'llm:latency':
      if (typeof data === 'number') {
        state.llmLatencies.push(data)
        if (state.llmLatencies.length > MAX_LATENCY_SAMPLES) state.llmLatencies.shift()
      }
      break
  }
}

export function getMetricsSnapshot() {
  const avgLatency =
    state.llmLatencies.length > 0
      ? Math.round(state.llmLatencies.reduce((a, b) => a + b, 0) / state.llmLatencies.length)
      : 0

  const p95Latency =
    state.llmLatencies.length > 0
      ? (() => {
          const sorted = [...state.llmLatencies].sort((a, b) => a - b)
          return sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1]
        })()
      : 0

  return {
    messagesReceived: state.messagesReceived,
    messagesSent: state.messagesSent,
    byFlow: { ...state.byFlow },
    escalations: state.escalations,
    errors: state.errors,
    ragQueries: state.ragQueries,
    startedAt: state.startedAt,
    uptime: Date.now() - state.startedAt,
    avgLatency,
    p95Latency,
    hourlyMessages: state.hourlyMessages.map(b => ({ hour: b.hour, count: b.count })),
  }
}
