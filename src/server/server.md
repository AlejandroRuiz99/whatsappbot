# Módulo Server

Servidor HTTP del bot de WhatsApp con soporte para modo sandbox (desarrollo) y producción.

## Estructura

```
server/
├── http.ts              # Servidor base + estado de conexión
├── websocket.ts         # Conexiones WebSocket
└── sandbox/             # Solo se carga si BOT_MODE=sandbox
    ├── index.ts         # Rutas y lógica del sandbox
    ├── handler.ts       # Procesa mensajes simulados
    ├── phone-filter.ts  # Filtra mensajes según modo
    ├── sandbox.html     # Interfaz de chat
    ├── sandbox.js       # JavaScript del cliente
    ├── styles.css       # Estilos del chat
    └── qr.html          # Página de autenticación QR
```

## Modos de Operación

Controlado por `BOT_MODE` en `.env`:

| Modo | Descripción |
|------|-------------|
| `sandbox` | UI completa + chat de pruebas + APIs de simulación |
| `production` | Solo `/health` y `/api/status` |

```bash
# .env
BOT_MODE=sandbox      # Desarrollo (por defecto)
BOT_MODE=production   # Producción
```

---

## Archivos

### `http.ts`

Servidor HTTP base. **Siempre se carga** (producción y sandbox).

**Estado de conexión:**
- `currentQR` - Código QR actual para vincular WhatsApp
- `connectionStatus` - Estado de la conexión

**Rutas base:**
| Endpoint | Descripción |
|----------|-------------|
| `GET /health` | Health check |
| `GET /api/status` | Estado de conexión y modo |

**Funciones exportadas:**

| Función | Descripción |
|---------|-------------|
| `startServer()` | Inicia el servidor |
| `setQRCode(qr)` | Establece código QR |
| `getQRCode()` | Obtiene código QR actual |
| `setConnectionStatus(status)` | Actualiza estado |
| `getConnectionStatus()` | Obtiene estado actual |

**Carga condicional del sandbox:**
```typescript
if (config.BOT_MODE === 'sandbox') {
  const { registerSandboxRoutes } = await import('./sandbox/index.js')
  await registerSandboxRoutes(fastify)
}
```

### `websocket.ts`

Gestión de conexiones WebSocket para comunicación en tiempo real.

| Función | Descripción |
|---------|-------------|
| `addClient(ws)` | Registra conexión |
| `removeClient(ws)` | Elimina conexión |
| `broadcast(data)` | Envía a todos los clientes |
| `getClientCount()` | Número de clientes conectados |

---

## Sandbox (solo `BOT_MODE=sandbox`)

### `sandbox/index.ts`

Rutas y lógica del modo sandbox.

**Páginas Web:**

| Ruta | Descripción |
|------|-------------|
| `/` | Página de autenticación con QR |
| `/sandbox` | Chat de pruebas |

**APIs:**

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/conversation` | Historial de mensajes |
| `POST` | `/api/simulate` | Simular mensaje de usuario |
| `GET/POST` | `/api/sandbox/client-mode` | Modo cliente (nuevo/existente) |
| `GET/POST` | `/api/sandbox/debug-mode` | Modo debug (on/off) |
| `POST` | `/api/conversation/clear` | Limpiar historial |

**Funciones exportadas:**

| Función | Descripción |
|---------|-------------|
| `registerSandboxRoutes(fastify)` | Registra rutas del sandbox |
| `addToConversation(from, message, flow?)` | Agrega mensaje al historial |
| `setMessageHandler(handler)` | Handler para mensajes simulados |
| `getSandboxClientMode()` | ¿Simula cliente existente? |
| `setSandboxClientMode(isExisting)` | Configura modo cliente |
| `getSandboxDebugMode()` | ¿Modo debug activo? |
| `setSandboxDebugMode(debug)` | Activa/desactiva debug |

### `sandbox/handler.ts`

Procesa mensajes simulados del sandbox.

```typescript
handleSandboxMessage(message, isExistingClient, debugMode) → BotResponse[]
```

### `sandbox/phone-filter.ts`

Filtra mensajes según el modo de operación.

```typescript
shouldProcessMessage(from) → { allowed: boolean, reason: string }
```

- `production`: permite todos los mensajes
- `sandbox`: solo permite mensajes de `TEST_PHONE_NUMBER`

---

## Estados de Conexión

```typescript
type ConnectionStatus = 
  | 'disconnected'   // Sin conexión
  | 'connecting'     // Conectando
  | 'connected'      // Conectado
  | 'reconnecting'   // Reconectando
  | 'logged_out'     // Sesión cerrada
```

---

## Arquitectura

```
┌─────────────────────────────────────────────────┐
│                   http.ts                       │
│  Estado: QR, connectionStatus                   │
│  Rutas: /health, /api/status                    │
│  Carga sandbox si BOT_MODE=sandbox              │
└────────────────────┬────────────────────────────┘
                     │
      ┌──────────────┴──────────────┐
      │                             │
      ▼                             ▼
┌───────────────┐         ┌─────────────────────┐
│ websocket.ts  │         │ sandbox/ (opcional) │
│ (real-time)   │         │                     │
└───────────────┘         │ /                   │
                          │ /sandbox            │
                          │ /api/simulate       │
                          │ /api/conversation   │
                          │ /api/sandbox/*      │
                          └─────────────────────┘
```

## Dependencias

- `fastify` - Framework HTTP
- `qrcode` - Generación de códigos QR (solo sandbox)
- `ws` - WebSockets (tipos)
