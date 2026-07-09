-- Audit trail migration — run in Supabase SQL editor for project yxaebxkkclbjezffmerw
-- Generated 09/07/2026

-- 1. Plan lock audit log — one row per shift per lock operation
--    Append-only. Never delete. Rows accumulate across every re-lock.
CREATE TABLE IF NOT EXISTS production_plan_audit_log (
  id           bigserial PRIMARY KEY,
  locked_at    timestamptz NOT NULL,
  week_start   text        NOT NULL,
  plan_date    text        NOT NULL,
  line         text        NOT NULL,
  sku          text        NOT NULL,
  shift        text        NOT NULL,
  new_pallets  numeric,
  prev_pallets numeric       -- null = first time this shift was ever locked
);

-- Index for the common query: "show me all changes to w/c 14/07/2026"
CREATE INDEX IF NOT EXISTS idx_plan_audit_week ON production_plan_audit_log (week_start, locked_at DESC);

-- 2. Add sender_email to upload_log so forecast email sender is captured
--    Column is nullable — manual drag-drop uploads have no sender.
ALTER TABLE upload_log ADD COLUMN IF NOT EXISTS sender_email text;
