-- 0001_initial.sql — initial schema for conversations.
-- Master prompt §4.4: phone PK, messages JSON, created_at, last_activity,
-- flow, escalated, resolution. Adds rag_cache as JSON blob (kept here
-- rather than its own table because TTL is per-conversation).

CREATE TABLE IF NOT EXISTS conversations (
  phone           TEXT PRIMARY KEY,
  messages        TEXT NOT NULL DEFAULT '[]',
  created_at      INTEGER NOT NULL,
  last_activity   INTEGER NOT NULL,
  flow            TEXT,
  escalated       INTEGER NOT NULL DEFAULT 0,
  resolution      TEXT,
  rag_cache       TEXT
);

CREATE INDEX IF NOT EXISTS idx_conversations_last_activity
  ON conversations(last_activity DESC);
