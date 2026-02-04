# Módulo Conversation

Servicios para gestionar el flujo conversacional del bot.

## Estructura

```
conversation/
├── index.ts         # Re-exporta todos los servicios
├── memory.ts        # Historial y caché de conversaciones
├── classifier.ts    # Clasificación de clientes
├── escalate.ts      # Detección de escalado a humano
└── humanizer.ts     # Simulación de escritura natural
```

---

## Archivos

### `memory.ts`

Almacena el historial de mensajes por usuario para dar contexto al LLM.

**Configuración:**
- `MAX_MESSAGES_PER_CONVERSATION`: 10 mensajes
- `MAX_CONVERSATIONS`: 1000 conversaciones en memoria
- `CONVERSATION_TTL`: 24 horas de inactividad
- `RAG_CACHE_TTL`: 10 minutos de caché para chunks RAG

**Funciones:**

| Función | Descripción |
|---------|-------------|
| `addUserMessage(phone, content)` | Añade mensaje del usuario |
| `addBotMessage(phone, content)` | Añade respuesta del bot |
| `getConversationHistory(phone)` | Obtiene historial para el LLM |
| `getConversationContext(phone)` | Resumen de contexto para prompt |
| `setClientMetadata(phone, metadata)` | Guarda metadata del cliente |
| `getClientMetadata(phone)` | Obtiene metadata |
| `clearConversation(phone)` | Limpia una conversación |
| `startMemoryCleanup()` | Inicia limpieza automática (cada hora) |
| `stopMemoryCleanup()` | Detiene limpieza |
| `cacheRAGChunks(phone, chunks, query)` | Cachea chunks RAG |
| `getCachedRAGChunks(phone)` | Recupera chunks cacheados |
| `clearRAGCache(phone)` | Limpia caché RAG |
| `getMemoryStats()` | Estadísticas de memoria |

---

### `classifier.ts`

Clasifica si un número de teléfono es cliente existente o potencial.

**Funciones:**

| Función | Descripción |
|---------|-------------|
| `isExistingClient(phone)` | Verifica si es cliente existente |
| `addExistingClient(phone)` | Añade a lista de clientes |
| `removeExistingClient(phone)` | Elimina de la lista |

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
| Repetición | Mismo mensaje 3+ veces |

**Funciones:**

| Función | Descripción |
|---------|-------------|
| `shouldEscalate(message, phone?)` | `{ escalate: boolean, reason?: string }` |
| `notifyHuman(ctx)` | Notifica escalado (logs, futuro: Telegram) |

---

### `humanizer.ts`

Hace que el bot parezca más humano con delays de escritura y mensajes naturales.

**Parámetros:**
- `MIN_DELAY`: 2 segundos
- `MAX_DELAY`: 8 segundos
- `CHARS_PER_SECOND`: 65 caracteres
- `MAX_LENGTH`: 300 caracteres por mensaje

**Funciones:**

| Función | Descripción |
|---------|-------------|
| `calculateTypingDelay(text)` | Calcula delay realista en ms |
| `splitIntoNaturalMessages(text)` | Divide texto en mensajes naturales |
| `simulateTypingAndSend(chat, text)` | Envía con typing indicator |
| `sendHumanizedMessage(chat, text)` | Envía múltiples mensajes con pausas |
| `sendHumanizedMessageSandbox(to, text, sendFn)` | Versión para sandbox |
| `addHumanVariation(text, probability)` | Variación humana (deshabilitado) |
| `getHumanizationStats(text)` | Estadísticas de humanización |

---

## Uso típico

```typescript
import { 
  addUserMessage, 
  getConversationHistory,
  shouldEscalate,
  sendHumanizedMessage 
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

// Enviar respuesta humanizada
await sendHumanizedMessage(chat, botResponse)
```
