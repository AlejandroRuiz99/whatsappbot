-- Alertas de intervención humana (panel admin).
-- Una alerta pendiente pausa las respuestas del bot para ese teléfono
-- hasta que alguien la marca como atendida (o caduca alerts.pauseHours).
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
