-- Recontacto programado (MEJORAS BOT 2026-06).
-- Un follow-up pendiente por teléfono; se cancela si el cliente vuelve a
-- escribir y se borra al enviarse o al agotar reintentos.
CREATE TABLE IF NOT EXISTS followups (
  phone TEXT PRIMARY KEY,
  due_at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  context TEXT,
  created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_followups_due_at ON followups (due_at);
