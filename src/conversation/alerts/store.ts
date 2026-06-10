/**
 * Alertas de intervención humana + pausa de bot por número.
 *
 * Cuando el router escala (urgencia, frustración, solicitud de llamada,
 * mensaje repetido), se crea una alerta. Mientras un teléfono tenga alertas
 * pendientes "vivas" (más recientes que alerts.pauseHours), el bot NO
 * responde a ese número: el caso lo lleva un humano. Los mensajes entrantes
 * se siguen guardando en el historial para que el panel los muestre.
 *
 * Resolver la alerta desde /admin reactiva el bot. La caducidad por horas es
 * la red de seguridad para que un olvido humano no deje a un cliente mudo.
 *
 * Misma política de persistencia que followups: SQLite en producción
 * (migrations/0003_alerts.sql), memoria en sandbox.
 */

import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { config } from '../../config/env.js'
import { botConfig } from '../../config/bot-config.js'
import { logger } from '../../observability/logger.js'

export interface AlertRecord {
  id: number
  phone: string
  reason: string
  message: string
  name: string | null
  createdAt: number
  status: 'pending' | 'resolved'
  resolvedAt: number | null
}

export interface NewAlert {
  phone: string
  reason: string
  message: string
  name?: string
}

interface AlertStore {
  add(alert: NewAlert): AlertRecord
  list(limit: number): AlertRecord[]
  pendingCount(): number
  resolve(id: number): AlertRecord | null
  resolvePhone(phone: string): number
  hasPendingSince(phone: string, since: number): boolean
}

class InMemoryAlertStore implements AlertStore {
  private readonly alerts: AlertRecord[] = []
  private nextId = 1

  add(alert: NewAlert): AlertRecord {
    const record: AlertRecord = {
      id: this.nextId++,
      phone: alert.phone,
      reason: alert.reason,
      message: alert.message,
      name: alert.name ?? null,
      createdAt: Date.now(),
      status: 'pending',
      resolvedAt: null,
    }
    this.alerts.push(record)
    return record
  }

  list(limit: number): AlertRecord[] {
    return [...this.alerts]
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1
        return b.createdAt - a.createdAt
      })
      .slice(0, limit)
  }

  pendingCount(): number {
    return this.alerts.filter((a) => a.status === 'pending').length
  }

  resolve(id: number): AlertRecord | null {
    const alert = this.alerts.find((a) => a.id === id)
    if (!alert || alert.status === 'resolved') return alert ?? null
    alert.status = 'resolved'
    alert.resolvedAt = Date.now()
    return alert
  }

  resolvePhone(phone: string): number {
    let count = 0
    for (const alert of this.alerts) {
      if (alert.phone === phone && alert.status === 'pending') {
        alert.status = 'resolved'
        alert.resolvedAt = Date.now()
        count++
      }
    }
    return count
  }

  hasPendingSince(phone: string, since: number): boolean {
    return this.alerts.some(
      (a) => a.phone === phone && a.status === 'pending' && a.createdAt >= since
    )
  }
}

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  reason TEXT NOT NULL,
  message TEXT,
  name TEXT,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts (status, created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_phone ON alerts (phone, status);
`

interface AlertRow {
  id: number
  phone: string
  reason: string
  message: string | null
  name: string | null
  created_at: number
  status: string
  resolved_at: number | null
}

function rowToRecord(r: AlertRow): AlertRecord {
  return {
    id: r.id,
    phone: r.phone,
    reason: r.reason,
    message: r.message ?? '',
    name: r.name,
    createdAt: r.created_at,
    status: r.status === 'resolved' ? 'resolved' : 'pending',
    resolvedAt: r.resolved_at,
  }
}

class SqliteAlertStore implements AlertStore {
  private readonly db: DatabaseSync

  constructor(dbPath: string) {
    const dir = dirname(dbPath)
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new DatabaseSync(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA busy_timeout = 5000')
    this.db.exec(CREATE_SQL)
    logger.info(`[ALERTS] SQLite store ready at ${dbPath}`)
  }

  add(alert: NewAlert): AlertRecord {
    const now = Date.now()
    const result = this.db
      .prepare(
        `INSERT INTO alerts (phone, reason, message, name, created_at, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`
      )
      .run(alert.phone, alert.reason, alert.message, alert.name ?? null, now)
    return {
      id: Number(result.lastInsertRowid),
      phone: alert.phone,
      reason: alert.reason,
      message: alert.message,
      name: alert.name ?? null,
      createdAt: now,
      status: 'pending',
      resolvedAt: null,
    }
  }

  list(limit: number): AlertRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM alerts
         ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
         LIMIT ?`
      )
      .all(limit) as unknown as AlertRow[]
    return rows.map(rowToRecord)
  }

  pendingCount(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM alerts WHERE status = 'pending'`)
      .get() as { n: number }
    return Number(row.n)
  }

  resolve(id: number): AlertRecord | null {
    this.db
      .prepare(`UPDATE alerts SET status = 'resolved', resolved_at = ? WHERE id = ? AND status = 'pending'`)
      .run(Date.now(), id)
    const row = this.db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as
      | AlertRow
      | undefined
    return row ? rowToRecord(row) : null
  }

  resolvePhone(phone: string): number {
    const result = this.db
      .prepare(`UPDATE alerts SET status = 'resolved', resolved_at = ? WHERE phone = ? AND status = 'pending'`)
      .run(Date.now(), phone)
    return Number(result.changes ?? 0)
  }

  hasPendingSince(phone: string, since: number): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 AS hit FROM alerts WHERE phone = ? AND status = 'pending' AND created_at >= ? LIMIT 1`
      )
      .get(phone, since) as { hit: number } | undefined
    return Boolean(row)
  }
}

let activeStore: AlertStore | null = null

function shouldUseSqlite(): boolean {
  if (process.env.SQLITE_PATH) return true
  return config.BOT_MODE === 'production'
}

function resolveDbPath(): string {
  if (process.env.SQLITE_PATH) return process.env.SQLITE_PATH
  return join(process.cwd(), 'data', 'conversations.db')
}

export function initAlertStore(): void {
  if (activeStore) return
  if (shouldUseSqlite()) {
    activeStore = new SqliteAlertStore(resolveDbPath())
  } else {
    activeStore = new InMemoryAlertStore()
    logger.info('[ALERTS] In-memory store (sandbox default)')
  }
}

function getStore(): AlertStore {
  if (!activeStore) initAlertStore()
  return activeStore!
}

// ─── API de servicio ───

/** Crea una alerta pendiente (pausa el bot para ese teléfono). */
export function raiseAlert(alert: NewAlert): AlertRecord {
  const record = getStore().add(alert)
  logger.warn(`[ALERTS] #${record.id} ${alert.phone} → ${alert.reason} (bot en pausa para este número)`)
  return record
}

/**
 * El bot está en pausa para un teléfono si tiene alertas pendientes más
 * recientes que la ventana alerts.pauseHours (red de seguridad anti-olvidos).
 */
export function isBotPausedFor(phone: string): boolean {
  const since = Date.now() - botConfig.alerts.pauseHours * 3_600_000
  return getStore().hasPendingSince(phone, since)
}

export function listAlerts(limit = 100): AlertRecord[] {
  return getStore().list(limit)
}

export function pendingAlertCount(): number {
  return getStore().pendingCount()
}

/** Marca una alerta como atendida. Si el teléfono queda sin pendientes, el bot se reactiva. */
export function resolveAlert(id: number): AlertRecord | null {
  return getStore().resolve(id)
}

/** Resuelve todas las pendientes de un teléfono (reactiva el bot sí o sí). */
export function resolveAlertsForPhone(phone: string): number {
  return getStore().resolvePhone(phone)
}
