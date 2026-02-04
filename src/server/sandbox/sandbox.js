// Sandbox JavaScript - Chat de pruebas
const messagesContainer = document.getElementById('messages');
const chatContainer = document.getElementById('chat');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const typing = document.getElementById('typing');
const status = document.getElementById('status');
const toggleClient = document.getElementById('toggleClient');
const toggleDebug = document.getElementById('toggleDebug');
const clearChat = document.getElementById('clearChat');
const debugIndicator = document.getElementById('debugIndicator');

let isExistingClient = false;
let debugMode = false;

// Cargar historial
async function loadHistory() {
  try {
    const res = await fetch('/api/conversation');
    const data = await res.json();
    data.forEach(msg => addMessage(msg.from, msg.message, msg.timestamp, msg.flow, false));
    scrollToBottom();
  } catch (e) {
    console.error('Error cargando historial:', e);
  }
}

// Toggle cliente existente/potencial
async function toggleClientMode() {
  isExistingClient = !isExistingClient;
  toggleClient.className = 'toggle-btn ' + (isExistingClient ? 'existing' : 'potential');
  toggleClient.querySelector('.toggle-text').textContent = isExistingClient ? 'Contacto Guardado' : 'Contacto Nuevo';
  
  await fetch('/api/sandbox/client-mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isExisting: isExistingClient })
  });
  
  const systemMsg = document.createElement('div');
  systemMsg.style.cssText = 'text-align: center; padding: 10px; color: #8696a0; font-size: 12px;';
  systemMsg.textContent = isExistingClient 
    ? '📋 Modo: CONTACTO GUARDADO → Redirige a Telegram' 
    : '🆕 Modo: CONTACTO NUEVO → Responde con IA';
  messagesContainer.appendChild(systemMsg);
  scrollToBottom();
}

// Toggle modo debug
async function toggleDebugMode() {
  debugMode = !debugMode;
  toggleDebug.className = 'toggle-btn ' + (debugMode ? 'debug-on' : 'debug-off');
  toggleDebug.querySelector('.debug-text').textContent = debugMode ? 'ON' : 'OFF';
  
  if (debugIndicator) {
    debugIndicator.style.display = debugMode ? 'inline-block' : 'none';
  }
  
  await fetch('/api/sandbox/debug-mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ debugMode: debugMode })
  });
  
  const systemMsg = document.createElement('div');
  systemMsg.style.cssText = 'text-align: center; padding: 10px; color: #ff9800; font-size: 12px; font-weight: bold;';
  systemMsg.textContent = debugMode 
    ? '🔍 MODO DEBUG ACTIVADO: Las respuestas mostrarán las fuentes de los videos en un cuadro naranja' 
    : '🔍 Modo Debug desactivado: Respuestas normales';
  messagesContainer.appendChild(systemMsg);
  scrollToBottom();
}

// Limpiar chat
async function clearChatHistory() {
  await fetch('/api/conversation/clear', { method: 'POST' });
  messagesContainer.innerHTML = '';
  
  const systemMsg = document.createElement('div');
  systemMsg.style.cssText = 'text-align: center; padding: 10px; color: #8696a0; font-size: 12px;';
  systemMsg.textContent = '🗑️ Chat limpiado';
  messagesContainer.appendChild(systemMsg);
}

// Cargar estado inicial del modo cliente
async function loadClientMode() {
  try {
    const res = await fetch('/api/sandbox/client-mode');
    const data = await res.json();
    isExistingClient = data.isExisting;
    toggleClient.className = 'toggle-btn ' + (isExistingClient ? 'existing' : 'potential');
    toggleClient.querySelector('.toggle-text').textContent = isExistingClient ? 'Contacto Guardado' : 'Contacto Nuevo';
  } catch (e) {
    console.error('Error cargando modo cliente:', e);
  }
}

// Cargar estado inicial del modo debug
async function loadDebugMode() {
  try {
    const res = await fetch('/api/sandbox/debug-mode');
    const data = await res.json();
    debugMode = data.debugMode;
    toggleDebug.className = 'toggle-btn ' + (debugMode ? 'debug-on' : 'debug-off');
    toggleDebug.querySelector('.debug-text').textContent = debugMode ? 'ON' : 'OFF';
    
    if (debugIndicator) {
      debugIndicator.style.display = debugMode ? 'inline-block' : 'none';
    }
  } catch (e) {
    console.error('Error cargando modo debug:', e);
  }
}

function addMessage(from, text, timestamp, flow, animate = true) {
  const msg = document.createElement('div');
  msg.className = 'message ' + from;
  
  const time = new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  
  // Separar el texto principal de las marcas de debug
  let mainText = text;
  let debugInfo = '';
  
  if (text.includes('---\n🔍 DEBUG - Fuentes de información:')) {
    const parts = text.split('---\n🔍 DEBUG - Fuentes de información:');
    mainText = parts[0].trim();
    debugInfo = parts[1].trim();
  }
  
  // Formatear debug info como HTML
  let debugHtml = '';
  if (debugInfo) {
    const lines = debugInfo.split('\n');
    debugHtml = '<div class="debug-info"><strong>🔍 Fuentes de información:</strong><br>';
    
    for (const line of lines) {
      if (line.includes('http')) {
        const match = line.match(/(https?:\/\/[^\s]+)/);
        if (match) {
          const url = match[1];
          const label = line.replace(url, '').trim();
          debugHtml += '<a href="' + url + '" target="_blank">' + escapeHtml(label || url) + '</a>';
        }
      } else if (line.trim()) {
        debugHtml += '<div>' + escapeHtml(line) + '</div>';
      }
    }
    debugHtml += '</div>';
  }
  
  msg.innerHTML = 
    '<div class="text">' + escapeHtml(mainText) + '</div>' +
    debugHtml +
    '<div class="meta">' +
      '<span>' + time + '</span>' +
    '</div>' +
    (flow ? '<span class="flow-tag">' + flow + '</span>' : '');
  
  if (animate) {
    msg.style.opacity = '0';
    msg.style.transform = 'translateY(10px)';
  }
  
  messagesContainer.appendChild(msg);
  
  if (animate) {
    requestAnimationFrame(() => {
      msg.style.transition = 'all 0.2s ease';
      msg.style.opacity = '1';
      msg.style.transform = 'translateY(0)';
    });
  }
  
  scrollToBottom();
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;
  
  input.value = '';
  sendBtn.disabled = true;
  
  addMessage('user', text, new Date().toISOString());
  
  typing.classList.add('active');
  scrollToBottom();
  
  try {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    
    const data = await res.json().catch(() => ({}));
    
    typing.classList.remove('active');
    
    if (!res.ok) {
      const errMsg = data.error || ('Error ' + res.status);
      addMessage('bot', '❌ ' + errMsg, new Date().toISOString(), 'error');
      return;
    }
    
    const responses = data.responses || [];
    for (let i = 0; i < responses.length; i++) {
      await new Promise(r => setTimeout(r, 500));
      addMessage('bot', responses[i].text, new Date().toISOString(), responses[i].flow);
    }
  } catch (e) {
    typing.classList.remove('active');
    addMessage('bot', '❌ Error al procesar el mensaje', new Date().toISOString(), 'error');
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

// Event listeners
sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});
toggleClient.addEventListener('click', toggleClientMode);
toggleDebug.addEventListener('click', toggleDebugMode);
clearChat.addEventListener('click', clearChatHistory);

// Verificar estado de conexión
async function checkStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    status.textContent = data.status === 'connected' ? 'Conectado' : 'Desconectado';
    status.className = 'status-badge ' + (data.status === 'connected' ? 'connected' : 'disconnected');
  } catch (e) {
    status.textContent = 'Error';
    status.className = 'status-badge disconnected';
  }
}

// Inicializar
loadHistory();
loadClientMode();
loadDebugMode();
checkStatus();
setInterval(checkStatus, 10000);
input.focus();
