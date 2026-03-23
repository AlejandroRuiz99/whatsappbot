# Módulo Server

Servidor HTTP del bot de WhatsApp con soporte para modo sandbox (desarrollo) y producción.

## Estructura

```
server/
├── http.ts              # Servidor base + estado de conexión + QR
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
| `production` | Solo APIs mínimas + QR endpoint |

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
- `connectionStatus` - Estado de la conexión (`disconnected | connecting | connected | reconnecting | logged_out`)

**Rutas (disponibles en todos los modos):**

| Endpoint | Descripción |
|----------|-------------|
| `GET /health` | Health check con estado y modo |
| `GET /api/status` | Estado de conexión y modo |
| `GET /qr` | Página HTML con QR para escanear (auto-refresh 15s) |
| `GET /api/qr` | JSON con estado y QR string |
| `POST /api/restart` | Borra `auth_info` y reinicia el proceso |

> **Seguridad pendiente:** Los endpoints `/api/restart` y `/api/qr` no tienen autenticación.
> Añadir API key antes de exponer a internet público.

**Funciones exportadas:**

| Función | Descripción |
|---------|-------------|
| `startServer()` | Inicia el servidor |
| `setQRCode(qr)` | Establece código QR (llamado desde connection.ts) |
| `getQRCode()` | Obtiene código QR actual |
| `setConnectionStatus(status)` | Actualiza estado (llamado desde connection.ts) |
| `getConnectionStatus()` | Obtiene estado actual |

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

- `production`: permite todos los mensajes excepto grupos/broadcast
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
│  Rutas: /health, /api/status, /qr, /api/qr     │
│         /api/restart                            │
│  Carga sandbox si BOT_MODE=sandbox              │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
              ┌──────────────────────┐
              │ sandbox/ (opcional)  │
              │                      │
              │ /                    │
              │ /sandbox             │
              │ /api/simulate        │
              │ /api/conversation    │
              │ /api/sandbox/*       │
              └──────────────────────┘
```

## Dependencias

- `fastify` - Framework HTTP
- `qrcode` - Generación de códigos QR
