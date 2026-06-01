# Módulo Conversation

Servicios para gestionar el flujo conversacional del bot.

## Estructura

```
conversation/
├── index.ts         # Re-exporta los servicios activos
├── memory.ts        # Historial y caché de conversaciones
├── classifier.ts    # Clasificación de clientes
├── escalate.ts      # Detección de escalado a humano
└── humanizer.ts     # Simulación de escritura natural
```

---

## Archivos

### `memory.ts`

Almacena el historial de mensajes por usuario para dar contexto al LLM.
La configuración se lee de `bot.config.yaml` (sección `conversation`).

**Funciones:**

| Función | Descripción |
|---------|-------------|
| `addUserMessage(phone, content)` | Añade mensaje del usuario |
| `addBotMessage(phone, content)` | Añade respuesta del bot |
| `getConversationHistory(phone)` | Historial completo para el LLM |
| `getConversationContext(phone)` | Resumen legible para el system prompt |
| `startMemoryCleanup()` | Inicia limpieza automática (interval) |
| `cacheRAGChunks(phone, chunks, query)` | Cachea chunks RAG recientes |
| `getCachedRAGChunks(phone)` | Recupera chunks cacheados (con TTL) |
| `getUserMessageCount(phone)` | Número de mensajes del usuario |
| `getUserTotalChars(phone)` | Total de caracteres escritos por el usuario |

> **Importante:** `addUserMessage`/`addBotMessage` se llaman desde `handlers.ts`
> (flujos existente, extranjería, escalado) y desde `llm.service.ts` (flujo IA).
> Todos los flujos quedan registrados en memoria.

---

### `classifier.ts`

Clasifica si un número de teléfono es cliente existente o potencial.

**Funciones:**

| Función | Descripción |
|---------|-------------|
| `isExistingClient(phone)` | Verifica si es cliente existente |

> **Nota:** Actualmente usa lista en memoria. Futuro: integrar con CRM/BD.

---

### `escalate.ts`

Detecta cuándo escalar la conversación a un humano.

**Criterios de escalado:**

| Categoría | Keywords |
|-----------|----------|
| Urgencia | urgente, emergencia, plazo, mañana, hoy, inmediato |
| Frustración | no entiendo, queja, enfadado, estafa, inútil |
| Complejidad | no lo entiendo, es complicado, situación difícil |
| Repetición | Mismo mensaje N+ veces (configurable en `bot.config.yaml`) |

Las entradas del Map de mensajes repetidos tienen TTL de 24h para evitar fugas de memoria.

**Funciones:**

| Función | Descripción |
|---------|-------------|
| `shouldEscalate(message, phone?)` | `{ escalate: boolean, reason?: string }` |
| `notifyHuman(ctx)` | Notifica escalado (logs, futuro: Telegram) |

---

### `humanizer.ts`

Hace que el bot parezca más humano con delays de escritura y mensajes naturales.
La configuración se lee de `bot.config.yaml` (sección `humanizer`).

**Funciones:**

| Función | Descripción |
|---------|-------------|
| `calculateReadingDelay(length)` | Delay antes de empezar a escribir |
| `calculateTypingDelay(text)` | Delay de escritura realista en ms |
| `splitIntoNaturalMessages(text)` | Divide texto en burbujas naturales |
| `pauseBetweenMessages(i, total, nextLen)` | Pausa entre burbujas consecutivas |

> **Diseño:** Las funciones de envío con typing indicator están en `connection.ts`,
> que es el único responsable de gestionar el ciclo composing→send→paused.

---

## Uso típico

```typescript
import { 
  addUserMessage, 
  getConversationHistory,
  shouldEscalate,
  splitIntoNaturalMessages
} from './services/conversation/index.js'

// Guardar mensaje
addUserMessage(phone, userMessage)

// Verificar escalado
const { escalate, reason } = shouldEscalate(userMessage, phone)
if (escalate) {
  await notifyHuman({ from: phone, body: userMessage })
}

// Obtener contexto para LLM
const history = getConversationHistory(phone)

// Dividir respuesta en burbujas (usado en sandbox)
const messages = splitIntoNaturalMessages(botResponse)
```
