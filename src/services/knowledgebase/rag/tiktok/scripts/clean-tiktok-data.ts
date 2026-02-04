/**
 * Script de limpieza del CSV de videos de TikTok
 * 
 * Tareas:
 * 1. Filtrar videos con status: "OK"
 * 2. Eliminar videos sin transcripción o con transcripción vacía
 * 3. Detectar y eliminar duplicados (mismo video_id o transcripción idéntica)
 * 4. Generar CSV limpio y reporte de estadísticas
 */

import fs from 'fs'
import path from 'path'
import csv from 'csv-parser'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface TikTokVideo {
  ingested_at: string
  video_url: string
  video_id: string
  lang: string
  transcript: string
  status: string
  error_code?: string
  error_message?: string
  batch_id?: string
}

interface CleaningStats {
  total_videos: number
  status_ok: number
  status_error: number
  status_duplicate: number
  no_transcript: number
  duplicates_by_id: number
  duplicates_by_content: number
  valid_videos: number
}

async function cleanTikTokData(): Promise<void> {
  const inputPath = path.join(__dirname, '../data/source.csv')
  const outputPath = path.join(__dirname, '../data/cleaned_videos.csv')
  const reportPath = path.join(__dirname, '../data/cleaning_report.json')

  console.log('🧹 Iniciando limpieza del CSV de videos de TikTok...\n')
  console.log(`📂 Input: ${inputPath}`)
  console.log(`📂 Output: ${outputPath}\n`)

  const videos: TikTokVideo[] = []
  const stats: CleaningStats = {
    total_videos: 0,
    status_ok: 0,
    status_error: 0,
    status_duplicate: 0,
    no_transcript: 0,
    duplicates_by_id: 0,
    duplicates_by_content: 0,
    valid_videos: 0
  }

  // Leer CSV
  console.log('📖 Leyendo CSV...')
  
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(inputPath)
      .pipe(csv())
      .on('data', (row: any) => {
        stats.total_videos++
        
        const video: TikTokVideo = {
          ingested_at: row.ingested_at || '',
          video_url: row.video_url || '',
          video_id: row.video_id || '',
          lang: row.lang || 'es',
          transcript: row.transcript || '',
          status: row.status || '',
          error_code: row.error_code || '',
          error_message: row.error_message || '',
          batch_id: row.batch_id || ''
        }

        videos.push(video)
      })
      .on('end', resolve)
      .on('error', reject)
  })

  console.log(`✅ Total de videos leídos: ${stats.total_videos}\n`)

  // Filtrar por status
  console.log('🔍 Filtrando por status...')
  
  const statusOkVideos = videos.filter(v => {
    if (v.status === 'OK') {
      stats.status_ok++
      return true
    } else if (v.status === 'ERROR') {
      stats.status_error++
      return false
    } else if (v.status === 'DUPLICATE') {
      stats.status_duplicate++
      return false
    }
    return false
  })

  console.log(`  ✓ Status OK: ${stats.status_ok}`)
  console.log(`  ✗ Status ERROR: ${stats.status_error}`)
  console.log(`  ✗ Status DUPLICATE: ${stats.status_duplicate}\n`)

  // Filtrar videos sin transcripción o vacía
  console.log('🔍 Filtrando videos sin transcripción...')
  
  const videosWithTranscript = statusOkVideos.filter(v => {
    const hasTranscript = v.transcript && v.transcript.trim().length > 0
    if (!hasTranscript) {
      stats.no_transcript++
    }
    return hasTranscript
  })

  console.log(`  ✗ Sin transcripción: ${stats.no_transcript}`)
  console.log(`  ✓ Con transcripción: ${videosWithTranscript.length}\n`)

  // Detectar duplicados por video_id
  console.log('🔍 Detectando duplicados por video_id...')
  
  const seenIds = new Set<string>()
  const uniqueByIdVideos = videosWithTranscript.filter(v => {
    if (seenIds.has(v.video_id)) {
      stats.duplicates_by_id++
      return false
    }
    seenIds.add(v.video_id)
    return true
  })

  console.log(`  ✗ Duplicados por ID: ${stats.duplicates_by_id}`)
  console.log(`  ✓ Únicos por ID: ${uniqueByIdVideos.length}\n`)

  // Detectar duplicados por contenido de transcripción
  console.log('🔍 Detectando duplicados por contenido...')
  
  const seenTranscripts = new Map<string, string>() // transcript hash -> video_id
  const cleanVideos = uniqueByIdVideos.filter(v => {
    // Normalizar transcripción para comparación
    const normalizedTranscript = v.transcript.trim().toLowerCase()
    
    if (seenTranscripts.has(normalizedTranscript)) {
      stats.duplicates_by_content++
      console.log(`  ⚠️  Contenido duplicado: ${v.video_id} (igual a ${seenTranscripts.get(normalizedTranscript)})`)
      return false
    }
    
    seenTranscripts.set(normalizedTranscript, v.video_id)
    return true
  })

  stats.valid_videos = cleanVideos.length

  console.log(`  ✗ Duplicados por contenido: ${stats.duplicates_by_content}`)
  console.log(`  ✓ Videos únicos finales: ${stats.valid_videos}\n`)

  // Generar CSV limpio
  console.log('💾 Generando CSV limpio...')
  
  const csvHeader = 'video_id,video_url,transcript,lang,ingested_at\n'
  const csvRows = cleanVideos.map(v => {
    // Escapar campos con comas o comillas
    const escapeCSV = (field: string) => {
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`
      }
      return field
    }

    return [
      escapeCSV(v.video_id),
      escapeCSV(v.video_url),
      escapeCSV(v.transcript),
      escapeCSV(v.lang),
      escapeCSV(v.ingested_at)
    ].join(',')
  }).join('\n')

  fs.writeFileSync(outputPath, csvHeader + csvRows, 'utf-8')
  console.log(`✅ CSV limpio guardado: ${outputPath}\n`)

  // Generar reporte JSON
  console.log('📊 Generando reporte de estadísticas...')
  
  const report = {
    timestamp: new Date().toISOString(),
    input_file: inputPath,
    output_file: outputPath,
    statistics: stats,
    quality_metrics: {
      success_rate: ((stats.status_ok / stats.total_videos) * 100).toFixed(2) + '%',
      valid_rate: ((stats.valid_videos / stats.total_videos) * 100).toFixed(2) + '%',
      duplicate_rate: (((stats.status_duplicate + stats.duplicates_by_id + stats.duplicates_by_content) / stats.total_videos) * 100).toFixed(2) + '%',
      error_rate: ((stats.status_error / stats.total_videos) * 100).toFixed(2) + '%'
    },
    sample_videos: cleanVideos.slice(0, 3).map(v => ({
      video_id: v.video_id,
      video_url: v.video_url,
      transcript_length: v.transcript.length,
      transcript_preview: v.transcript.substring(0, 200) + '...'
    }))
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`✅ Reporte guardado: ${reportPath}\n`)

  // Resumen final
  console.log('═══════════════════════════════════════════════')
  console.log('📊 RESUMEN DE LIMPIEZA')
  console.log('═══════════════════════════════════════════════')
  console.log(`Total de videos procesados: ${stats.total_videos}`)
  console.log(`Videos válidos finales: ${stats.valid_videos}`)
  console.log(`Tasa de éxito: ${report.quality_metrics.valid_rate}`)
  console.log('\nEliminados:')
  console.log(`  - Errores: ${stats.status_error}`)
  console.log(`  - Duplicados por status: ${stats.status_duplicate}`)
  console.log(`  - Sin transcripción: ${stats.no_transcript}`)
  console.log(`  - Duplicados por ID: ${stats.duplicates_by_id}`)
  console.log(`  - Duplicados por contenido: ${stats.duplicates_by_content}`)
  console.log('═══════════════════════════════════════════════\n')

  if (stats.valid_videos < 500) {
    console.warn('⚠️  ADVERTENCIA: Menos de 500 videos válidos. Revisar calidad del dataset.')
  } else {
    console.log('✨ Dataset limpio y listo para procesamiento!')
  }
}

// Ejecutar script
cleanTikTokData()
  .then(() => {
    console.log('\n✅ Limpieza completada exitosamente!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Error durante la limpieza:', error)
    process.exit(1)
  })
