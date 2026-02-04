import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as QRCode from 'qrcode'
import { logger } from '../../utils/logger.js'
import { getQRCode, getConnectionStatus } from '../http.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Estado específico del sandbox
let sandboxIsExistingClient = false
let sandboxDebugMode = false

// Historial de conversación para la UI
const conversationHistory: Array<{
  id: string
  from: 'user' | 'bot'
  message: string
  timestamp: string
  flow?: string
}> = []

// Callback para procesar mensajes simulados
let onSimulatedMessage: ((message: string, isExistingClient: boolean, debugMode: boolean) => Promise<Array<{ text: string; flow: string }>>) | null = null

// ============= Funciones del sandbox =============

export function getSandboxClientMode(): boolean {
  return sandboxIsExistingClient
}

export function setSandboxClientMode(isExisting: boolean) {
  sandboxIsExistingClient = isExisting
}

export function getSandboxDebugMode(): boolean {
  return sandboxDebugMode
}

export function setSandboxDebugMode(debug: boolean) {
  sandboxDebugMode = debug
}

export function addToConversation(from: 'user' | 'bot', message: string, flow?: string) {
  conversationHistory.push({
    id: Date.now().toString(),
    from,
    message,
    timestamp: new Date().toISOString(),
    flow
  })
  if (conversationHistory.length > 100) {
    conversationHistory.shift()
  }
}

export function setMessageHandler(handler: (message: string, isExistingClient: boolean, debugMode: boolean) => Promise<Array<{ text: string; flow: string }>>) {
  onSimulatedMessage = handler
}

// ============= Helpers para templates =============

function loadTemplate(name: string): string {
  const templatePath = join(__dirname, `${name}.html`)
  return readFileSync(templatePath, 'utf8')
}

function renderQRPage(): string {
  const template = loadTemplate('qr')
  const currentQR = getQRCode()
  const connectionStatus = getConnectionStatus()
  
  let content = ''
  let statusClass = ''
  let statusText = ''
  let refreshMeta = '5'
  
  if (connectionStatus === 'connected') {
    refreshMeta = '0;url=/sandbox'
    content = `
      <div style="font-size: 80px; margin: 30px 0;">✅</div>
      <p style="font-size: 24px; color: #25D366;">¡Conectado!</p>
      <p style="margin-top: 15px; color: #aaa;">Redirigiendo al sandbox...</p>
      <a href="/sandbox" class="btn">Ir al Sandbox</a>
    `
    statusClass = 'connected'
    statusText = '🟢 Conectado'
  } else if (currentQR) {
    content = `{{QR_CONTENT}}`
    statusClass = 'connecting'
    statusText = '🟡 Esperando escaneo...'
  } else {
    content = `
      <div style="font-size: 50px; margin: 30px 0;">⏳</div>
      <p>Generando código QR...</p>
      <p style="margin-top: 10px; color: #aaa;">Esta página se actualiza automáticamente</p>
    `
    statusClass = connectionStatus === 'connecting' || connectionStatus === 'reconnecting' ? 'connecting' : 'disconnected'
    statusText = connectionStatus === 'connecting' ? '🟡 Conectando...' :
                 connectionStatus === 'reconnecting' ? '🟡 Reconectando...' :
                 connectionStatus === 'logged_out' ? '🔴 Sesión cerrada' :
                 '🟡 Esperando QR...'
  }
  
  return template
    .replace('{{REFRESH_META}}', refreshMeta)
    .replace('{{CONTENT}}', content)
    .replace('{{STATUS_CLASS}}', statusClass)
    .replace('{{STATUS_TEXT}}', statusText)
}

// ============= Registro de rutas =============

export async function registerSandboxRoutes(fastify: FastifyInstance) {
  // Archivos estáticos
  fastify.get('/sandbox/sandbox.js', async (request, reply) => {
    try {
      const content = readFileSync(join(__dirname, 'sandbox.js'), 'utf8')
      reply.type('application/javascript').send(content)
    } catch (error) {
      logger.error('Error serving sandbox.js:', error)
      reply.status(404).send('File not found')
    }
  })
  
  fastify.get('/sandbox/styles.css', async (request, reply) => {
    try {
      const content = readFileSync(join(__dirname, 'styles.css'), 'utf8')
      reply.type('text/css').send(content)
    } catch (error) {
      logger.error('Error serving styles.css:', error)
      reply.status(404).send('File not found')
    }
  })
  
  // Página principal - QR
  fastify.get('/', async (request, reply) => {
    let html = renderQRPage()
    const currentQR = getQRCode()
    const connectionStatus = getConnectionStatus()
    
    if (currentQR && connectionStatus !== 'connected') {
      try {
        const qrImage = await QRCode.toDataURL(currentQR, { width: 300 })
        const qrContent = `
          <div class="qr-container">
            <img src="${qrImage}" alt="QR Code" width="250" height="250">
          </div>
          <p>Escanea el código QR con WhatsApp</p>
          <div class="instructions">
            <ol>
              <li>Abre WhatsApp en tu teléfono</li>
              <li>Toca <strong>Menú</strong> o <strong>Configuración</strong></li>
              <li>Toca <strong>Dispositivos vinculados</strong></li>
              <li>Toca <strong>Vincular un dispositivo</strong></li>
              <li>Escanea este código QR</li>
            </ol>
          </div>
        `
        html = html.replace('{{QR_CONTENT}}', qrContent)
      } catch (e) {
        html = html.replace('{{QR_CONTENT}}', '<p>Error generando QR</p>')
      }
    }
    
    reply.type('text/html').send(html)
  })
  
  // Página de Sandbox - Chat
  fastify.get('/sandbox', async (request, reply) => {
    try {
      const html = readFileSync(join(__dirname, 'sandbox.html'), 'utf8')
      reply.type('text/html').send(html)
    } catch (error) {
      logger.error('Error serving sandbox.html:', error)
      reply.status(500).send('Error loading sandbox')
    }
  })
  
  // API: Obtener historial
  fastify.get('/api/conversation', async () => {
    return conversationHistory
  })
  
  // API: Simular mensaje
  fastify.post('/api/simulate', async (request, reply) => {
    const { message } = request.body as { message: string }
    
    if (!message) {
      return reply.status(400).send({ error: 'Mensaje requerido' })
    }
    
    addToConversation('user', message)
    
    if (onSimulatedMessage) {
      try {
        const responses = await onSimulatedMessage(message, sandboxIsExistingClient, sandboxDebugMode)
        return { responses }
      } catch (error) {
        logger.error('Error procesando mensaje simulado:', error)
        return { responses: [{ text: 'Error al procesar el mensaje', flow: 'error' }] }
      }
    }
    
    return { responses: [{ text: 'Bot no configurado', flow: 'error' }] }
  })
  
  // API: Modo cliente
  fastify.get('/api/sandbox/client-mode', async () => {
    return { isExisting: sandboxIsExistingClient }
  })
  
  fastify.post('/api/sandbox/client-mode', async (request) => {
    const { isExisting } = request.body as { isExisting: boolean }
    sandboxIsExistingClient = isExisting
    logger.info(`[SANDBOX] Modo: ${isExisting ? 'CONTACTO GUARDADO' : 'CONTACTO NUEVO'}`)
    return { success: true, isExisting: sandboxIsExistingClient }
  })
  
  // API: Modo debug
  fastify.get('/api/sandbox/debug-mode', async () => {
    return { debugMode: sandboxDebugMode }
  })
  
  fastify.post('/api/sandbox/debug-mode', async (request) => {
    const { debugMode } = request.body as { debugMode: boolean }
    sandboxDebugMode = debugMode
    logger.info(`[SANDBOX] Debug: ${debugMode ? 'ON' : 'OFF'}`)
    return { success: true, debugMode: sandboxDebugMode }
  })
  
  // API: Limpiar historial
  fastify.post('/api/conversation/clear', async () => {
    conversationHistory.length = 0
    return { success: true }
  })
  
  logger.info('[SERVER] Rutas del sandbox registradas')
}
