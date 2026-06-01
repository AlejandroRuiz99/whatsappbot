# Módulo Knowledgebase

Fuentes de conocimiento del bot: RAG, LLM y catálogo de servicios.

## Estructura

```
knowledgebase/
├── index.ts                    # Re-exporta los servicios activos
├── llm/
│   ├── llm.service.ts          # Orquestador principal (Groq → OpenAI → local)
│   ├── providers.ts            # Clientes Groq/OpenAI
│   ├── local.ts                # Respuestas sin IA (fallback)
│   ├── prompt-builder.ts       # Construcción del system prompt
│   ├── rag-cache.ts            # Caché inteligente de RAG
│   └── prompts/                # Plantillas de prompts
│       ├── system.txt          # Persona del abogado + reglas
│       ├── legal-knowledge.txt # Conocimiento legal Seguridad Social
│       ├── video-instructions.txt
│       └── services-context.txt
├── rag/
│   ├── rag.service.ts          # Búsqueda semántica en Pinecone
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

### `llm.service.ts` — Orquestador

Función principal que coordina proveedores, RAG y memoria.
Usa un helper `tryProvider()` interno para evitar duplicar el flujo Groq/OpenAI.

| Función | Descripción |
|---------|-------------|
| `getAIResponse(message, phone?, options?)` | Genera respuesta con IA |

**Flujo:**
1. Guarda `addUserMessage` en memoria
2. Obtiene contexto RAG (con caché inteligente)
3. Intenta Groq → OpenAI → sistema local
4. Guarda `addBotMessage` y devuelve la respuesta limpia de markdown

### `providers.ts` — Proveedores

| Proveedor | Modelo | Prioridad |
|-----------|--------|-----------|
| Groq | llama-3.3-70b-versatile | 1 (principal, gratis) |
| OpenAI | gpt-3.5-turbo | 2 (fallback) |

| Función | Descripción |
|---------|-------------|
| `generateWithGroq(messages)` | Llama a Groq API |
| `generateWithOpenAI(messages)` | Llama a OpenAI API |

### `local.ts` — Sistema sin IA

Fallback cuando no hay API keys. Detecta intención y responde:

| Intención | Respuesta |
|-----------|-----------|
| `saludo` | Bienvenida |
| `agradecimiento` | Despedida |
| `precio` | Info consulta (69€) |
| `contacto` | Web y horario |
| `consulta` | Orientación basada en servicios |

### `prompt-builder.ts` — System Prompt Builder

Ensambla el system prompt desde plantillas externas con inyección condicional de conocimiento.

| Función | Descripción |
|---------|-------------|
| `buildSystemPrompt(message, phone?, ragContext?)` | Prompt completo con RAG, servicios y contexto |

**Inyección selectiva de `legal-knowledge.txt`:**
Solo se inyectan las secciones relevantes al mensaje detectado, reduciendo el uso de tokens:

| Sección | Keywords que la activan |
|---------|------------------------|
| JUBILACIÓN ORDINARIA | jubila, pension, cotiza... |
| JUBILACIÓN ANTICIPADA | mismo que ordinaria |
| TOTALIZACIÓN INTERNACIONALES | jubilación + convenio, extranjero |
| JUBILACIÓN CON DISCAPACIDAD | discapacidad, minusvalia, 45%, 65% |
| SECTORES ESPECIALES | minero, marinero, carbon |
| CLASES PASIVAS | clases pasivas, funcionario |
| INCAPACIDAD PERMANENTE | incapacidad, invalidez, baja, inss... |
| LOS 545 DÍAS | 545, baja, pago directo... |
| SUBSIDIO MAYORES 52 | subsidio, mayores 52, paro |
| ESTRATEGIA DE VENTA | siempre incluida con cualquier tema de SS |

**Soft limits:** `buildSoftLimitHint` inyecta instrucciones de venta progresivas
según `getUserTotalChars` y `getUserMessageCount`, diferenciando por tipo de caso:
- Jubilación → estudio personalizado (120€)
- Incapacidad → consulta (69€) / suscripción mensual
- General → consulta estándar (69€)

**Zona horaria:** usa `Intl.DateTimeFormat` para la hora de Madrid (fiable en todos los entornos).

### `rag-cache.ts` — Caché RAG

Optimiza búsquedas RAG para preguntas de seguimiento.

| Función | Descripción |
|---------|-------------|
| `getRAGContextWithCache(message, phone?)` | Contexto RAG con caché inteligente |

**Para seguimientos** (`isFollowUpQuery`): usa `topK=3` (reducido) en lugar del default de `.env`, ahorrando latencia y tokens.

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
| `getRAGContext(query, topK?)` | Obtiene contexto RAG completo (topK opcional) |
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

---

## RAG Config (`rag/rag.config.ts`)

Configuración y conexión con Pinecone.

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
| `buscarServicios(consulta)` | Busca por keywords (max 5 resultados). Devuelve `[]` si consulta vacía |

---

## Scripts de RAG

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
│  chunks relevantes│   ← topK reducido si es follow-up
│  en Pinecone      │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Prompt Builder:  │
│  system.txt +     │   ← legal-knowledge.txt (secciones selectivas)
│  servicios +      │   ← soft limit hint (por tipo de caso)
│  conversación     │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  LLM:             │
│  Groq → OpenAI    │   ← mismo flujo via tryProvider()
│  → Sistema local  │
└─────────┬─────────┘
          │
          ▼
    Respuesta (sin markdown)
```
