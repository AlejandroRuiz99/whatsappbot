# Módulo Knowledgebase

Fuentes de conocimiento del bot: RAG, LLM y catálogo de servicios.

## Estructura

```
knowledgebase/
├── index.ts                    # Re-exporta todos los servicios
├── llm/
│   ├── llm.service.ts          # Orquestador principal
│   ├── providers.ts            # Clientes Groq/OpenAI
│   ├── local.ts                # Respuestas sin IA
│   ├── prompt-builder.ts       # Construcción del system prompt
│   ├── rag-cache.ts            # Caché inteligente de RAG
│   └── prompts/                # External prompt templates
│       ├── system.txt
│       ├── video-instructions.txt
│       └── services-context.txt
├── rag/
│   ├── rag.service.ts          # Búsqueda semántica
│   ├── rag.config.ts           # Configuración de Pinecone
│   ├── tiktok/
│   │   ├── chunking.ts         # Procesamiento de transcripciones
│   │   ├── scripts/            # Scripts de procesamiento TikTok
│   │   └── data/               # Datos fuente (source.csv)
│   └── scripts/                # Scripts de indexación RAG
└── services-catalog/
    └── catalog.data.ts         # Catálogo de servicios legales
```

---

## LLM (`llm/`)

Sistema modular para generación de respuestas con IA.

### `llm.service.ts` - Orquestador

Función principal que coordina proveedores, RAG y memoria.

| Función | Descripción |
|---------|-------------|
| `getAIResponse(message, phone?, options?)` | Genera respuesta con IA |

### `providers.ts` - Proveedores

Inicialización y llamadas a APIs de LLM.

| Proveedor | Modelo | Prioridad |
|-----------|--------|-----------|
| Groq | llama-3.3-70b-versatile | 1 (principal, gratis) |
| OpenAI | gpt-3.5-turbo | 2 (fallback) |

| Función | Descripción |
|---------|-------------|
| `generateWithGroq(messages)` | Llama a Groq API |
| `generateWithOpenAI(messages)` | Llama a OpenAI API |
| `getLLMStatus()` | Estado del proveedor activo |

### `local.ts` - Sistema sin IA

Fallback cuando no hay API keys. Detecta intención y responde:

| Intención | Respuesta |
|-----------|-----------|
| `saludo` | Bienvenida |
| `agradecimiento` | Despedida |
| `precio` | Info consulta (69€) |
| `contacto` | Web y horario |
| `consulta` | Orientación basada en servicios |

### `prompt-builder.ts` - System Prompt Builder

Builds system prompts from external template files in `llm/prompts/`.

| Function | Description |
|----------|-------------|
| `buildSystemPrompt(message, phone?, ragContext?)` | Full prompt with RAG and services |
| `clearPromptCache()` | Reload prompts from disk (dev) |

**Prompt files:**
- `system.txt` - Main lawyer persona prompt
- `video-instructions.txt` - TikTok video mention guidelines
- `services-context.txt` - Services list template

**Interpolation:** `{{VAR}}` syntax (e.g. `{{BOOKING_URL}}`, `{{SERVICES_LIST}}`)

### `rag-cache.ts` - Caché RAG

Optimiza búsquedas RAG para preguntas de seguimiento.

| Función | Descripción |
|---------|-------------|
| `isFollowUpQuery(query)` | Detecta si es pregunta de seguimiento |
| `getRAGContextWithCache(message, phone?)` | Contexto RAG con caché inteligente |

**Parámetros LLM:**
```typescript
{
  max_tokens: 600,
  temperature: 0.85,
  top_p: 0.92,
  presence_penalty: 0.3,
  frequency_penalty: 0.3
}
```

---

## RAG Service (`rag/rag.service.ts`)

Búsqueda semántica en base de conocimiento (videos de TikTok indexados en Pinecone).

**Interfaces:**

```typescript
interface RetrievedChunk {
  content: string       // Texto del chunk
  video_url: string     // URL del video
  video_id: string      // ID único
  similarity: number    // 0-1, similitud con query
  chunk_index: number   // Posición en el video
  total_chunks: number  // Total de chunks del video
  topics: string[]      // Temas detectados
}

interface RAGResult {
  chunks: RetrievedChunk[]
  videos: VideoReference[]
  context: string             // Formateado para LLM
  shouldIncludeVideoLinks: boolean
}
```

**Funciones:**

| Función | Descripción |
|---------|-------------|
| `getRAGContext(query)` | Obtiene contexto RAG completo |
| `retrieveRelevantChunks(query, topK?, minSimilarity?)` | Busca chunks en Pinecone |
| `formatContextForLLM(chunks)` | Formatea contexto para prompt |
| `formatVideosForLLM(videos)` | Formatea lista de videos |
| `shouldIncludeVideoLinks(chunks, threshold?)` | ¿Incluir enlaces? |
| `extractUniqueVideos(chunks, minSimilarity?)` | Videos únicos top 3 |

**Configuración (`.env`):**
```bash
RAG_TOP_K=5              # Número de chunks a recuperar
RAG_MIN_SIMILARITY=0.7   # Similitud mínima (70%)
RAG_VIDEO_THRESHOLD=0.75 # Umbral para incluir videos (75%)
```

---

## Chunking (`rag/tiktok/chunking.ts`)

Procesa transcripciones de videos en chunks para indexar en Pinecone.

**Estrategia adaptativa:**

| Tamaño video | Tokens | Estrategia |
|--------------|--------|------------|
| Corto | < 600 | 1 chunk completo |
| Medio | 600-1500 | 2-3 chunks |
| Largo | > 1500 | Chunks de ~400 tokens con overlap de 50 |

**Funciones:**

| Función | Descripción |
|---------|-------------|
| `chunkVideo(video)` | Divide un video en chunks |
| `chunkVideos(videos)` | Procesa múltiples videos en batch |
| `getChunkingStats(chunks)` | Estadísticas de chunking |

**Detección automática de topics:**
jubilacion, autonomos, incapacidad, desempleo, cotizacion, seguridad_social, viudedad, complementos, ere, extranjeria

---

## RAG Config (`rag/rag.config.ts`)

Configuración y conexión con Pinecone.

**Funciones:**

| Función | Descripción |
|---------|-------------|
| `initPinecone()` | Inicializa cliente Pinecone |
| `getPineconeIndex()` | Obtiene índice configurado |
| `checkIndexExists()` | Verifica si existe el índice |
| `createIndexIfNotExists()` | Crea índice si no existe |
| `getIndexStats()` | Estadísticas del índice |
| `deleteAllVectors()` | Elimina todos los vectores |

---

## Services Catalog (`services-catalog/catalog.data.ts`)

Catálogo de servicios legales del despacho.

**Categorías:**
- Derecho Civil
- Derecho de Familia
- Derecho Laboral
- Derecho Penal
- Derecho Mercantil
- Derecho Administrativo
- Derecho Inmobiliario
- Extranjería
- Derecho del Consumidor
- Herencias y Sucesiones

**Interface:**
```typescript
interface Servicio {
  id: string
  nombre: string
  categoria: string
  descripcion: string
  keywords: string[]
  precioOrientativo?: string
}
```

**Funciones:**

| Función | Descripción |
|---------|-------------|
| `buscarServicios(consulta)` | Busca por keywords (max 5 resultados) |
| `obtenerServiciosPorCategoria(cat)` | Servicios de una categoría |
| `obtenerServicioPorId(id)` | Servicio por ID |

---

## Scripts de RAG

### Procesamiento de datos (`rag/data/tiktok/scripts/`)

| Script | Descripción |
|--------|-------------|
| `clean-tiktok-data.ts` | Limpia CSV de transcripciones |
| `process-chunks.ts` | Divide transcripciones en chunks |
| `analyze-transcripts.ts` | Análisis de transcripciones |

### Indexación (`rag/scripts/`)

| Script | Descripción |
|--------|-------------|
| `generate-embeddings.ts` | Genera embeddings con OpenAI |
| `index-to-pinecone.ts` | Sube vectores a Pinecone |
| `check-pinecone-index.ts` | Verifica estado del índice |
| `recreate-index.ts` | Recrea el índice completo |
| `update-rag.ts` | Actualiza RAG (todo el proceso) |
| `rag-health-check.ts` | Health check del sistema RAG |

---

## Flujo de respuesta

```
Usuario envía mensaje
        │
        ▼
┌───────────────────┐
│  RAG: Buscar      │
│  chunks relevantes│
│  en Pinecone      │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Servicios:       │
│  Buscar servicios │
│  por keywords     │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  LLM: Generar     │
│  respuesta con    │
│  contexto         │
└─────────┬─────────┘
          │
          ▼
    Respuesta
```

---

## Uso típico

```typescript
import { 
  getAIResponse,
  getRAGContext,
  buscarServicios 
} from './services/knowledgebase/index.js'

// Obtener respuesta completa (RAG + LLM)
const response = await getAIResponse(userMessage, phone, { debugMode: false })

// Solo RAG
const ragContext = await getRAGContext(userMessage)

// Solo catálogo
const servicios = buscarServicios('divorcio custodia')
```
