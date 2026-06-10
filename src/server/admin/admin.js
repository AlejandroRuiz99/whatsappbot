/* ══════════════════════════════════════════════════
   Admin Panel — Compromiso Legal Bot
   Lógica del cliente: SSE, secciones, gráficas
══════════════════════════════════════════════════ */

// ─── Estado global ───────────────────────────────
const state = {
  activeSection: 'chats',
  selectedChat: null,        // phone de la conv. abierta
  logFilters: new Set(['info', 'warn', 'error', 'bot']),
  logSearch: '',
  logEntries: [],            // buffer local de logs
  conversations: [],         // listado de conversaciones
  newChatsBadge: 0,          // mensajes nuevos no vistos
  newErrorsBadge: 0,
  charts: { flows: null, hourly: null },
  sseSource: null,
}

// ─── Utilidades ──────────────────────────────────
function formatTime(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatRelative(ts) {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'ahora'
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)}min`
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)}h`
  return `hace ${Math.floor(diff / 86_400_000)}d`
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;')
}

function getFlowClass(flow) {
  if (!flow) return ''
  if (flow.startsWith('escalado')) return 'flow-escalado'
  return `flow-${flow}`
}

function getFlowLabel(flow) {
  const map = {
    ia_response: 'IA',
    cliente_existente: 'Existente',
    extranjeria_redirect: 'Extranjería',
  }
  if (flow && flow.startsWith('escalado')) return 'Escalado'
  return map[flow] || flow || 'Desconocido'
}

// ─── Toast notifications ──────────────────────────
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container')
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`
  toast.onclick = () => dismissToast(toast)
  container.appendChild(toast)

  setTimeout(() => dismissToast(toast), duration)
}

function dismissToast(toast) {
  toast.classList.add('hide')
  setTimeout(() => toast.remove(), 220)
}

// ─── Navegación entre secciones ──────────────────
function navigateTo(section) {
  state.activeSection = section

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.section === section)
  })
  document.querySelectorAll('.section').forEach(el => {
    el.classList.toggle('active', el.id === `section-${section}`)
  })

  // Limpiar badges al entrar a la sección
  if (section === 'chats') {
    state.newChatsBadge = 0
    updateBadge('chats', 0)
  }
  if (section === 'logs') {
    state.newErrorsBadge = 0
    updateBadge('logs', 0)
  }

  // Cargar datos al cambiar sección
  if (section === 'chats') loadChats()
  if (section === 'alerts') loadAlerts()
  if (section === 'metrics') loadMetrics()
  if (section === 'connection') loadConnection()
}

function updateBadge(name, count) {
  const el = document.getElementById(`badge-${name}`)
  if (!el) return
  if (count > 0) {
    el.textContent = count > 99 ? '99+' : count
    el.style.display = ''
  } else {
    el.style.display = 'none'
  }
}

// ─── SSE Connection ───────────────────────────────
function connectSSE() {
  if (state.sseSource) {
    state.sseSource.close()
  }

  const sse = new EventSource('/api/admin/events')
  state.sseSource = sse

  sse.onopen = () => {
    console.log('[Admin] SSE conectado')
  }

  sse.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data)
      handleSSEEvent(event)
    } catch { /* ignorar eventos malformados */ }
  }

  sse.onerror = () => {
    // EventSource reconecta automáticamente; solo actualizamos UI si llevamos tiempo sin conexión
    updateConnectionDot('disconnected')
  }
}

function handleSSEEvent(event) {
  switch (event.type) {
    case 'message:incoming':
    case 'message:outgoing':
      handleNewMessage(event)
      break

    case 'log':
      handleNewLog(event)
      break

    case 'escalation':
      handleEscalation(event)
      break

    case 'error':
      handleErrorEvent(event)
      break

    case 'connection':
      handleConnectionEvent(event)
      break

    case 'closure':
      // Notificación visual de cierre de conversación
      break

    case 'metrics':
      if (state.activeSection === 'metrics') updateMetricsDisplay(event)
      break
  }
}

function handleNewMessage(event) {
  const phone = event.phone

  // Actualizar lista de conversaciones en memoria
  const existing = state.conversations.find(c => c.phone === phone)
  if (existing) {
    existing.lastActivity = event.timestamp
    existing.latestMessage = {
      role: event.type === 'message:incoming' ? 'user' : 'assistant',
      content: event.type === 'message:incoming' ? event.body : event.text,
      timestamp: event.timestamp,
    }
    existing.messageCount = (existing.messageCount || 0) + 1
    // Actualizar flujo si es outgoing
    if (event.type === 'message:outgoing' && event.flow) {
      existing.lastFlow = event.flow
    }
  }

  // Re-renderizar lista si estamos en chats
  if (state.activeSection === 'chats') {
    renderChatList(state.conversations)
    // Si el chat está abierto y es un mensaje nuevo, añadirlo al detalle
    if (state.selectedChat === phone) {
      appendMessageToDetail({
        role: event.type === 'message:incoming' ? 'user' : 'assistant',
        content: event.type === 'message:incoming' ? event.body : event.text,
        timestamp: event.timestamp,
      })
    }
  } else {
    // Badge
    state.newChatsBadge++
    updateBadge('chats', state.newChatsBadge)
  }
}

function handleNewLog(event) {
  const entry = { level: event.level, message: event.message, timestamp: event.timestamp }
  state.logEntries.push(entry)
  if (state.logEntries.length > 1000) state.logEntries.shift()

  if (event.level === 'error') {
    state.newErrorsBadge++
    if (state.activeSection !== 'logs') updateBadge('logs', state.newErrorsBadge)
  }

  if (state.activeSection === 'logs') {
    appendLogEntry(entry)
  }
}

function handleEscalation(event) {
  showToast(`🚨 Alerta: ${event.phone} — ${event.reason}. Bot en pausa para ese número.`, 'warn', 8000)
  // Refrescar la sección si está abierta; si no, actualizar el badge desde la API
  if (state.activeSection === 'alerts') {
    loadAlerts()
  } else {
    refreshAlertsBadge()
  }
}

function handleErrorEvent(event) {
  showToast(`❌ Error: ${event.context}`, 'error', 5000)
}

function handleConnectionEvent(event) {
  updateConnectionDot(event.status)
  const msgs = {
    connected: '✅ WhatsApp conectado',
    reconnecting: '🔄 Reconectando...',
    logged_out: '🔴 Sesión cerrada',
    disconnected: '🔴 Desconectado',
  }
  const type = event.status === 'connected' ? 'success'
    : event.status === 'reconnecting' ? 'warn' : 'error'
  showToast(msgs[event.status] || event.status, type)

  if (state.activeSection === 'connection') loadConnection()
}

// ─── Status dot (sidebar) ─────────────────────────
function updateConnectionDot(status) {
  const dot = document.getElementById('status-dot')
  const text = document.getElementById('status-text')
  const badge = document.getElementById('badge-conn')

  if (dot) {
    dot.className = `status-dot ${status}`
  }
  if (text) {
    const labels = {
      connected: 'Conectado',
      reconnecting: 'Reconectando...',
      logged_out: 'Sesión cerrada',
      disconnected: 'Desconectado',
      connecting: 'Conectando...',
    }
    text.textContent = labels[status] || status
  }
  if (badge) {
    const isAlert = status === 'logged_out' || status === 'disconnected'
    badge.style.display = isAlert ? '' : 'none'
  }
}

// ─── SECCIÓN CHATS ────────────────────────────────
async function loadChats() {
  try {
    const res = await fetch('/api/admin/conversations')
    const data = await res.json()
    state.conversations = data
    renderChatList(data)
  } catch (e) {
    console.error('[Admin] Error cargando chats:', e)
    document.getElementById('chats-list').innerHTML =
      '<div class="empty-state"><span class="empty-icon">⚠️</span><p>Error cargando conversaciones</p></div>'
  }
}

function renderChatList(conversations) {
  const container = document.getElementById('chats-list')

  if (!conversations || conversations.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">💬</span><p>Sin conversaciones activas</p></div>'
    return
  }

  // Ordenar por última actividad
  const sorted = [...conversations].sort((a, b) => b.lastActivity - a.lastActivity)

  container.innerHTML = sorted.map(c => {
    const flow = c.latestMessage?.role === 'assistant' ? (c.lastFlow || 'ia_response') : ''
    const flowBadge = flow ? `<span class="flow-badge ${getFlowClass(flow)}">${getFlowLabel(flow)}</span>` : ''
    const pausedChip = c.paused ? '<span class="paused-chip">⏸ Bot en pausa</span>' : ''
    const preview = c.latestMessage
      ? escapeHtml((c.latestMessage.content || '').substring(0, 50))
      : '<em>Sin mensajes</em>'
    const isActive = state.selectedChat === c.phone ? ' active' : ''

    return `
      <div class="chat-item${isActive}" onclick="openChat('${escapeHtml(c.phone)}')">
        <div class="chat-item-header">
          <span class="chat-phone">${escapeHtml(c.phoneDisplay || c.phone)}</span>
          <span class="chat-time">${formatRelative(c.lastActivity)}</span>
        </div>
        <div class="chat-meta">
          ${flowBadge}
          ${pausedChip}
          <span style="font-size:11px;color:var(--text-dim)">${c.messageCount} msgs</span>
        </div>
        <div class="chat-preview">${preview}</div>
      </div>
    `
  }).join('')
}

async function openChat(phone) {
  state.selectedChat = phone
  // Re-render para resaltar el ítem activo
  renderChatList(state.conversations)

  const detail = document.getElementById('chat-detail')
  detail.innerHTML = '<div class="empty-state"><span class="empty-icon">⏳</span><p>Cargando...</p></div>'

  try {
    const res = await fetch(`/api/admin/conversations/${encodeURIComponent(phone)}`)
    if (!res.ok) throw new Error('Not found')
    const data = await res.json()
    renderChatDetail(data)
  } catch (e) {
    detail.innerHTML = '<div class="empty-state"><span class="empty-icon">⚠️</span><p>Error cargando conversación</p></div>'
  }
}

function renderChatDetail(data) {
  const detail = document.getElementById('chat-detail')
  detail.innerHTML = `
    <div class="chat-detail-header">
      <span class="chat-detail-phone">${escapeHtml(data.phoneDisplay || data.phone)}</span>
      <button class="btn btn-danger" onclick="deleteChat('${escapeHtml(data.phone)}')">🗑 Eliminar</button>
    </div>
    <div class="chat-messages" id="chat-messages-body">
      ${(data.messages || []).map(m => renderMessageBubble(m)).join('')}
    </div>
  `
  // Scroll al final
  const body = document.getElementById('chat-messages-body')
  if (body) body.scrollTop = body.scrollHeight
}

function renderMessageBubble(m) {
  const roleClass = m.role === 'user' ? 'user' : 'assistant'
  const roleLabel = m.role === 'user' ? '👤 Usuario' : '🤖 Bot'
  return `
    <div class="msg-bubble ${roleClass}">
      <span style="font-size:10px;color:var(--text-dim);display:block;margin-bottom:4px">${roleLabel}</span>
      ${escapeHtml(m.content)}
      <span class="msg-time">${formatTime(m.timestamp)}</span>
    </div>
  `
}

function appendMessageToDetail(message) {
  const body = document.getElementById('chat-messages-body')
  if (!body) return
  const div = document.createElement('div')
  div.innerHTML = renderMessageBubble(message)
  body.appendChild(div.firstElementChild)
  if (document.getElementById('autoscroll')?.checked) {
    body.scrollTop = body.scrollHeight
  }
}

async function deleteChat(phone) {
  if (!confirm('¿Eliminar esta conversación? Se borrará de la memoria del bot.')) return
  try {
    const res = await fetch(`/api/admin/conversations/${encodeURIComponent(phone)}`, { method: 'DELETE' })
    if (res.ok) {
      showToast('Conversación eliminada', 'success')
      state.selectedChat = null
      state.conversations = state.conversations.filter(c => c.phone !== phone)
      renderChatList(state.conversations)
      document.getElementById('chat-detail').innerHTML =
        '<div class="empty-state"><span class="empty-icon">🗑</span><p>Conversación eliminada</p></div>'
    }
  } catch (e) {
    showToast('Error al eliminar la conversación', 'error')
  }
}

// ─── SECCIÓN ALERTAS ──────────────────────────────
const REASON_LABELS = {
  urgencia: '⚡ Urgencia',
  frustración: '😤 Frustración',
  frustracion: '😤 Frustración',
  consulta_compleja: '🧩 Consulta compleja',
  mensaje_repetido: '🔁 Mensaje repetido',
  solicitud_llamada: '📞 Pide que le llamen',
}

async function loadAlerts() {
  try {
    const res = await fetch('/api/admin/alerts')
    const data = await res.json()
    renderAlerts(data.alerts || [])
    updateBadge('alerts', data.pending || 0)
  } catch (e) {
    console.error('[Admin] Error cargando alertas:', e)
    document.getElementById('alerts-list').innerHTML =
      '<div class="empty-state"><span class="empty-icon">⚠️</span><p>Error cargando alertas</p></div>'
  }
}

async function refreshAlertsBadge() {
  try {
    const res = await fetch('/api/admin/alerts?limit=1')
    const data = await res.json()
    updateBadge('alerts', data.pending || 0)
  } catch { /* no crítico */ }
}

function renderAlerts(alerts) {
  const container = document.getElementById('alerts-list')
  if (!container) return

  if (!alerts || alerts.length === 0) {
    container.innerHTML =
      '<div class="empty-state"><span class="empty-icon">✅</span><p>Sin alertas — el bot atiende todos los números</p></div>'
    return
  }

  container.innerHTML = alerts.map(a => {
    const pending = a.status === 'pending'
    const reason = REASON_LABELS[a.reason] || a.reason
    const action = pending
      ? `<button class="btn btn-primary" onclick="resolveAlertById(${a.id})">✓ Marcar atendida (reactivar bot)</button>`
      : `<span class="alert-resolved-label">Atendida ${a.resolvedAt ? formatRelative(a.resolvedAt) : ''}</span>`

    return `
      <div class="alert-item ${pending ? 'pending' : 'resolved'}">
        <div class="alert-main">
          <div class="alert-item-header">
            <span class="alert-reason">${reason}</span>
            <span class="chat-phone">${escapeHtml(a.phoneDisplay || a.phone)}</span>
            ${a.name ? `<span class="alert-name">${escapeHtml(a.name)}</span>` : ''}
            <span class="chat-time">${formatRelative(a.createdAt)}</span>
            ${pending ? '<span class="paused-chip">⏸ Bot en pausa</span>' : ''}
          </div>
          <div class="alert-message">${escapeHtml(a.message || '')}</div>
        </div>
        <div class="alert-actions">
          <button class="btn btn-ghost" onclick="openAlertChat('${escapeHtml(a.phone)}')">💬 Ver chat</button>
          ${action}
        </div>
      </div>
    `
  }).join('')
}

async function resolveAlertById(id) {
  try {
    const res = await fetch(`/api/admin/alerts/${id}/resolve`, { method: 'POST' })
    if (!res.ok) throw new Error('resolve failed')
    const data = await res.json()
    showToast(
      data.botPaused
        ? 'Alerta atendida. El número sigue en pausa (tiene otras alertas pendientes).'
        : 'Alerta atendida — bot reactivado para ese número',
      'success'
    )
    loadAlerts()
    loadChats()
  } catch (e) {
    showToast('Error al resolver la alerta', 'error')
  }
}

function openAlertChat(phone) {
  navigateTo('chats')
  openChat(phone)
}

// ─── SECCIÓN LOGS ─────────────────────────────────
async function loadLogs() {
  const levels = [...state.logFilters].join(',')
  try {
    const res = await fetch(`/api/admin/logs?level=${levels}&limit=300`)
    const data = await res.json()
    state.logEntries = data.logs || []

    // Sincronizar toggle debug
    const toggle = document.getElementById('debug-toggle')
    if (toggle) toggle.checked = data.debugEnabled

    renderLogConsole()
  } catch (e) {
    console.error('[Admin] Error cargando logs:', e)
  }
}

function renderLogConsole() {
  const console_ = document.getElementById('log-console')
  const filtered = getFilteredLogs()
  console_.innerHTML = filtered.map(entry => renderLogEntry(entry)).join('')

  if (document.getElementById('autoscroll')?.checked) {
    console_.scrollTop = console_.scrollHeight
  }
}

function getFilteredLogs() {
  return state.logEntries.filter(e => {
    if (!state.logFilters.has(e.level)) return false
    if (state.logSearch && !e.message.toLowerCase().includes(state.logSearch.toLowerCase())) return false
    return true
  })
}

function renderLogEntry(entry) {
  const ts = new Date(entry.timestamp).toISOString().replace('T', ' ').substring(0, 19)
  const args = entry.args ? ` <span style="color:var(--text-dim)">${escapeHtml(entry.args)}</span>` : ''
  return `
    <div class="log-entry">
      <span class="log-ts">${ts}</span>
      <span class="log-level log-level-${entry.level}">${entry.level.toUpperCase()}</span>
      <span class="log-msg">${escapeHtml(entry.message)}${args}</span>
    </div>
  `
}

function appendLogEntry(entry) {
  if (!state.logFilters.has(entry.level)) return
  if (state.logSearch && !entry.message.toLowerCase().includes(state.logSearch.toLowerCase())) return

  const container = document.getElementById('log-console')
  const div = document.createElement('div')
  div.innerHTML = renderLogEntry(entry)
  container.appendChild(div.firstElementChild)

  // Mantener buffer en ~1000 líneas
  while (container.children.length > 1000) {
    container.removeChild(container.firstChild)
  }

  const autoscroll = document.getElementById('autoscroll')
  if (autoscroll?.checked) container.scrollTop = container.scrollHeight
}

function clearLogConsole() {
  document.getElementById('log-console').innerHTML = ''
  state.logEntries = []
}

// ─── SECCIÓN MÉTRICAS ─────────────────────────────
async function loadMetrics() {
  try {
    const res = await fetch('/api/admin/metrics')
    const data = await res.json()
    updateMetricsDisplay(data)
  } catch (e) {
    console.error('[Admin] Error cargando métricas:', e)
  }
}

function updateMetricsDisplay(data) {
  const set = (id, val) => {
    const el = document.getElementById(id)
    if (el) el.textContent = val
  }

  set('m-received', data.messagesReceived ?? '—')
  set('m-sent', data.messagesSent ?? '—')
  set('m-escalations', data.escalations ?? '—')
  set('m-errors', data.errors ?? '—')
  set('m-latency', data.avgLatency ? `${data.avgLatency}ms` : '—')
  set('m-rag', data.ragQueries ?? '—')
  set('uptime-display', data.uptime ? `⏱ ${formatUptime(data.uptime)}` : '⏱ —')

  updateFlowsChart(data.byFlow || {})
  updateHourlyChart(data.hourlyMessages || [])
}

function updateFlowsChart(byFlow) {
  const canvas = document.getElementById('chart-flows')
  if (!canvas) return

  const labels = Object.keys(byFlow).map(k => getFlowLabel(k))
  const values = Object.values(byFlow)

  if (values.length === 0) return

  const colors = [
    'rgba(83,189,235,0.8)',
    'rgba(37,211,102,0.8)',
    'rgba(255,210,121,0.8)',
    'rgba(241,92,92,0.8)',
    'rgba(180,120,255,0.8)',
  ]

  if (state.charts.flows) {
    state.charts.flows.data.labels = labels
    state.charts.flows.data.datasets[0].data = values
    state.charts.flows.update()
    return
  }

  state.charts.flows = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, values.length),
        borderColor: '#0b141a',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#8696a0', font: { size: 11 }, padding: 12 },
        },
      },
    },
  })
}

function updateHourlyChart(hourlyMessages) {
  const canvas = document.getElementById('chart-hourly')
  if (!canvas) return

  if (hourlyMessages.length === 0) return

  const labels = hourlyMessages.map(b => {
    const d = new Date(b.hour)
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  })
  const values = hourlyMessages.map(b => b.count)

  if (state.charts.hourly) {
    state.charts.hourly.data.labels = labels
    state.charts.hourly.data.datasets[0].data = values
    state.charts.hourly.update()
    return
  }

  state.charts.hourly = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Mensajes',
        data: values,
        borderColor: 'rgba(37,211,102,0.9)',
        backgroundColor: 'rgba(37,211,102,0.1)',
        borderWidth: 2,
        pointRadius: 3,
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: '#8696a0', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#8696a0', font: { size: 10 }, stepSize: 1 },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
      },
    },
  })
}

// ─── SECCIÓN CONEXIÓN ─────────────────────────────
async function loadConnection() {
  try {
    const res = await fetch('/api/admin/connection')
    const data = await res.json()
    renderConnectionSection(data)
  } catch (e) {
    console.error('[Admin] Error cargando estado de conexión:', e)
  }
}

function renderConnectionSection(data) {
  const statusEl = document.getElementById('conn-status-text')
  const dotEl = document.getElementById('conn-dot-big')
  const userInfoEl = document.getElementById('conn-user-info')
  const uptimeEl = document.getElementById('conn-uptime')
  const pendingEl = document.getElementById('conn-pending')

  const labels = {
    connected: 'Conectado',
    reconnecting: 'Reconectando...',
    logged_out: 'Sesión cerrada',
    disconnected: 'Desconectado',
    connecting: 'Conectando...',
  }

  if (statusEl) statusEl.textContent = labels[data.status] || data.status
  if (dotEl) dotEl.className = `conn-dot big ${data.status}`
  if (userInfoEl) {
    userInfoEl.textContent = data.user
      ? `📱 ${data.user.id}${data.user.name ? ` (${data.user.name})` : ''}`
      : 'Sin número vinculado'
  }
  if (uptimeEl) uptimeEl.textContent = data.uptime ? formatUptime(data.uptime) : '—'
  if (pendingEl) pendingEl.textContent = data.pendingMessages ?? '0'

  // Sidebar status
  updateConnectionDot(data.status)

  // QR
  renderQRSection(data)

  // Historial
  renderConnectionHistory(data.history || [])
}

function renderQRSection(data) {
  const container = document.getElementById('qr-container')
  if (!container) return

  if (data.status === 'connected') {
    container.innerHTML = `
      <div class="qr-placeholder">
        <span style="font-size:48px">✅</span>
        <p>WhatsApp conectado correctamente</p>
      </div>
    `
    return
  }

  if (data.qr) {
    container.innerHTML = `
      <div class="qr-placeholder">
        <span style="font-size:48px">📲</span>
        <p>QR disponible — escanéalo desde la página dedicada</p>
        <p style="font-size:12px">
          Abre WhatsApp → Ajustes → Dispositivos vinculados → Vincular dispositivo
        </p>
        <div style="display:flex;gap:8px;margin-top:6px">
          <a class="btn btn-primary" href="/qr" target="_blank" rel="noopener">Abrir QR</a>
          <button class="btn btn-ghost" onclick="loadConnection()">↻ Actualizar</button>
        </div>
      </div>
    `
    return
  }

  container.innerHTML = `
    <div class="qr-placeholder">
      <span style="font-size:48px">⏳</span>
      <p>Esperando QR...</p>
      <div style="display:flex;gap:8px;margin-top:6px">
        <a class="btn btn-ghost" href="/qr" target="_blank" rel="noopener">Abrir QR</a>
        <button class="btn btn-ghost" onclick="loadConnection()">↻ Actualizar</button>
      </div>
    </div>
  `
}

function renderConnectionHistory(history) {
  const container = document.getElementById('conn-history')
  if (!container) return

  if (history.length === 0) {
    container.innerHTML = '<div class="empty-state small"><p>Sin eventos de conexión recientes</p></div>'
    return
  }

  const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp)
  container.innerHTML = sorted.map(item => `
    <div class="history-item">
      <span class="history-status ${item.status}">${item.status}</span>
      <span class="history-time">${formatTime(item.timestamp)}</span>
    </div>
  `).join('')
}

async function restartBot() {
  if (!confirm('¿Reiniciar sesión de WhatsApp? Se eliminará la sesión actual y habrá que escanear el QR de nuevo.')) return

  const btn = document.getElementById('restart-btn')
  if (btn) { btn.disabled = true; btn.textContent = 'Reiniciando...' }

  try {
    await fetch('/api/admin/restart', { method: 'POST' })
    showToast('Reiniciando bot... Escanea el QR en unos segundos', 'warn', 5000)
    setTimeout(() => {
      if (btn) { btn.disabled = false; btn.textContent = '⟳ Reiniciar sesión' }
      loadConnection()
    }, 4000)
  } catch (e) {
    showToast('Error al reiniciar', 'error')
    if (btn) { btn.disabled = false; btn.textContent = '⟳ Reiniciar sesión' }
  }
}

// ─── Debug toggle ─────────────────────────────────
async function setDebug(enabled) {
  try {
    const res = await fetch('/api/admin/debug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    const data = await res.json()
    showToast(`Debug logging ${data.debugEnabled ? 'activado' : 'desactivado'}`, 'info', 2000)
  } catch (e) {
    showToast('Error al cambiar debug', 'error')
  }
}

// ─── Inicialización ───────────────────────────────
function init() {
  // Navegación
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.section))
  })

  // Debug toggle
  const debugToggle = document.getElementById('debug-toggle')
  if (debugToggle) {
    debugToggle.addEventListener('change', (e) => setDebug(e.target.checked))
  }

  // Log filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const level = btn.dataset.level
      if (state.logFilters.has(level)) {
        state.logFilters.delete(level)
        btn.classList.remove('active')
      } else {
        state.logFilters.add(level)
        btn.classList.add('active')
      }
      renderLogConsole()
    })
  })

  // Log search
  const searchInput = document.getElementById('log-search')
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.logSearch = e.target.value
      renderLogConsole()
    })
  }

  // Cargar estado inicial
  fetch('/api/admin/connection')
    .then(r => r.json())
    .then(d => {
      updateConnectionDot(d.status)
      // El enlace al sandbox solo tiene sentido cuando el bot corre en ese modo
      if (d.mode === 'sandbox') {
        const link = document.getElementById('sandbox-link')
        if (link) link.style.display = ''
      }
    })
    .catch(() => {})

  // Badge de alertas pendientes al arrancar
  refreshAlertsBadge()

  // Cargar logs iniciales en background
  loadLogs()

  // Cargar sección inicial
  loadChats()

  // SSE
  connectSSE()

  // Actualizar conexión periódicamente
  setInterval(() => {
    if (state.activeSection === 'connection') loadConnection()
    // Actualizar timestamps relativos en la lista de chats
    if (state.activeSection === 'chats') renderChatList(state.conversations)
  }, 30_000)
}

document.addEventListener('DOMContentLoaded', init)
