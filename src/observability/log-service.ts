/**
 * Servicio de logging centralizado con:
 * - Ring buffer en memoria (últimas BUFFER_SIZE entradas)
 * - Archivo rotativo en logs/bot.log (máx. 5MB, 3 archivos)
 * - Toggle debug en caliente
 * - Emisión de eventos al EventBus para SSE
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { botEvents } from './event-bus.js'
import { config } from '../config/env.js'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'bot'

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: number
  args?: string
}

const BUFFER_SIZE = 500
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const LOG_DIR = join(process.cwd(), 'logs')
const LOG_FILE = join(LOG_DIR, 'bot.log')

const logBuffer: LogEntry[] = []
let debugEnabled = config.LOG_LEVEL === 'debug'
let bytesWritten = 0

// Crear directorio de logs si no existe
try {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })
  if (existsSync(LOG_FILE)) bytesWritten = statSync(LOG_FILE).size
} catch { /* non-critical */ }

function serializeArgs(args: unknown[]): string | undefined {
  if (args.length === 0) return undefined
  try {
    return args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
  } catch {
    return String(args)
  }
}

function rotateIfNeeded(): void {
  if (bytesWritten < MAX_FILE_SIZE) return
  try {
    const f2 = join(LOG_DIR, 'bot.log.2')
    const f1 = join(LOG_DIR, 'bot.log.1')
    if (existsSync(f2)) unlinkSync(f2)
    if (existsSync(f1)) renameSync(f1, f2)
    if (existsSync(LOG_FILE)) renameSync(LOG_FILE, f1)
    bytesWritten = 0
  } catch { /* non-critical */ }
}

function writeToFile(line: string): void {
  try {
    rotateIfNeeded()
    appendFileSync(LOG_FILE, line + '\n', 'utf8')
    bytesWritten += Buffer.byteLength(line + '\n')
  } catch { /* non-critical */ }
}

function addEntry(level: LogLevel, message: string, args: unknown[]): void {
  if (level === 'debug' && !debugEnabled) return

  const entry: LogEntry = {
    level,
    message,
    timestamp: Date.now(),
    args: serializeArgs(args),
  }

  // Ring buffer
  logBuffer.push(entry)
  if (logBuffer.length > BUFFER_SIZE) logBuffer.shift()

  // File
  const ts = new Date(entry.timestamp).toISOString().replace('T', ' ').substring(0, 19)
  const argsStr = entry.args ? ` ${entry.args}` : ''
  writeToFile(`${ts} ${level.toUpperCase().padEnd(5)} ${message}${argsStr}`)

  // EventBus (para SSE)
  botEvents.publish({ type: 'log', level, message, timestamp: entry.timestamp })
}

export const logService = {
  info: (message: string, ...args: unknown[]) => addEntry('info', message, args),
  warn: (message: string, ...args: unknown[]) => addEntry('warn', message, args),
  error: (message: string, ...args: unknown[]) => addEntry('error', message, args),
  debug: (message: string, ...args: unknown[]) => addEntry('debug', message, args),
  bot: (message: string, ...args: unknown[]) => addEntry('bot', message, args),
}

export function getLogBuffer(levelFilter?: string[]): LogEntry[] {
  if (!levelFilter || levelFilter.length === 0) return [...logBuffer]
  const levels = levelFilter.map(l => l.toLowerCase())
  return logBuffer.filter(e => levels.includes(e.level))
}

export function isDebugEnabled(): boolean {
  return debugEnabled
}

export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled
}
