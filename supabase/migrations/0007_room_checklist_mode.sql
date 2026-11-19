-- =============================================================================
-- MIGRATION 0007: ROOM CHECKLIST MODE (STANDARD VS QUICK)
-- =============================================================================
-- Safe to run multiple times (idempotent).
-- Adds checklist_mode column to public.rooms table:
--   'standard': Default 1-by-1 guided inspection with large questions
--   'quick': Fast 3x3 grid inspection with single tap to approve, double tap for details

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS checklist_mode TEXT NOT NULL DEFAULT 'standard';

CREATE INDEX IF NOT EXISTS idx_rooms_checklist_mode
  ON public.rooms (checklist_mode);
