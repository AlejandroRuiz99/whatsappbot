/**
 * Extranjería handler — detects immigration-related queries.
 * Master prompt §3 flow #3: derivar a número específico del despacho.
 *
 * KEYWORDS list duplicates bot.config.yaml:extranjeria.keywords today.
 * Dedup (yaml as single source) lands in PR 2.2 — explicit divergence
 * noted there.
 */

const KEYWORDS: readonly string[] = [
  'residencia',
  'permiso de residencia',
  'permiso de trabajo',
  'nacionalidad',
  'nacionalidad española',
  'ciudadanía',
  'nie',
  'tarjeta de residencia',
  'tarjeta comunitaria',
  'arraigo',
  'arraigo social',
  'arraigo laboral',
  'arraigo familiar',
  'reagrupación',
  'reagrupacion',
  'reagrupación familiar',
  'regularizar',
  'regularización',
  'regularizacion',
  'papeles',
  'asilo',
  'refugiado',
  'protección internacional',
  'expulsión',
  'expulsion',
  'deportación',
  'deportacion',
  'extranjería',
  'extranjeria',
  'inmigrante',
  'immigrante',
  'visado',
  'visa',
  'entrada en españa',
  'permiso de estancia',
]

export function isExtranjeriaQuery(message: string): boolean {
  const lower = message.toLowerCase()
  return KEYWORDS.some((kw) => lower.includes(kw))
}
