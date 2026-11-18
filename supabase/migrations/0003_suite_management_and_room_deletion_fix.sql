-- =============================================================================
-- MIGRATION 0003: SUITE MANAGEMENT & ROOM DELETION FIX
-- =============================================================================
-- Safe to run multiple times (idempotent).
-- Implements:
--   1. public.suites (logical grouping for bedroom + bathroom)
--   2. Adds suite_id and room_type to public.rooms
--   3. Fixes Foreign Key constraints in checklist tables (ON DELETE SET NULL)
--      so that deleting a room with 0 inventory items does NOT fail with FK 23503
--   4. Preserves room_name_snapshot on checklist_room_progress,
--      checklist_item_results, and checklist_occurrences for historical audits
--   5. Row Level Security policies for suites
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. SUITES TABLE
CREATE TABLE IF NOT EXISTS public.suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT suites_name_not_empty CHECK (char_length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suites_name_unique
  ON public.suites (LOWER(TRIM(name)));

ALTER TABLE public.suites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suites_all" ON public.suites;
CREATE POLICY "suites_all" ON public.suites
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 2. ADAPT ROOMS TABLE WITH SUITE RELATIONSHIP & ROOM_TYPE
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS suite_id UUID NULL REFERENCES public.suites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_type TEXT NOT NULL DEFAULT 'individual';

CREATE INDEX IF NOT EXISTS idx_rooms_suite_id ON public.rooms (suite_id);
CREATE INDEX IF NOT EXISTS idx_rooms_room_type ON public.rooms (room_type);

-- 3. FIX FOREIGN KEYS IN CHECKLIST TABLES (ALLOW SAFE DELETION WITH HISTORICAL SNAPSHOTS)

-- A. checklist_room_progress
ALTER TABLE public.checklist_room_progress
  ADD COLUMN IF NOT EXISTS room_name_snapshot TEXT NOT NULL DEFAULT '';

-- Populate snapshot from existing room records
UPDATE public.checklist_room_progress crp
SET room_name_snapshot = r.name
FROM public.rooms r
WHERE crp.room_id = r.id AND (crp.room_name_snapshot = '' OR crp.room_name_snapshot IS NULL);

ALTER TABLE public.checklist_room_progress
  ALTER COLUMN room_id DROP NOT NULL;

DO $$
DECLARE
  fk_rec record;
BEGIN
  FOR fk_rec IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.checklist_room_progress'::regclass
      AND confrelid = 'public.rooms'::regclass
  ) LOOP
    EXECUTE 'ALTER TABLE public.checklist_room_progress DROP CONSTRAINT ' || quote_ident(fk_rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.checklist_room_progress
  ADD CONSTRAINT checklist_room_progress_room_id_fkey
  FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE SET NULL;


-- B. checklist_item_results
ALTER TABLE public.checklist_item_results
  ADD COLUMN IF NOT EXISTS room_name_snapshot TEXT NOT NULL DEFAULT '';

UPDATE public.checklist_item_results cir
SET room_name_snapshot = r.name
FROM public.rooms r
WHERE cir.room_id = r.id AND (cir.room_name_snapshot = '' OR cir.room_name_snapshot IS NULL);

ALTER TABLE public.checklist_item_results
  ALTER COLUMN room_id DROP NOT NULL;

DO $$
DECLARE
  fk_rec record;
BEGIN
  FOR fk_rec IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.checklist_item_results'::regclass
      AND confrelid = 'public.rooms'::regclass
  ) LOOP
    EXECUTE 'ALTER TABLE public.checklist_item_results DROP CONSTRAINT ' || quote_ident(fk_rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.checklist_item_results
  ADD CONSTRAINT checklist_item_results_room_id_fkey
  FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE SET NULL;


-- C. checklist_occurrences
ALTER TABLE public.checklist_occurrences
  ADD COLUMN IF NOT EXISTS room_name_snapshot TEXT NOT NULL DEFAULT '';

UPDATE public.checklist_occurrences co
SET room_name_snapshot = r.name
FROM public.rooms r
WHERE co.room_id = r.id AND (co.room_name_snapshot = '' OR co.room_name_snapshot IS NULL);

ALTER TABLE public.checklist_occurrences
  ALTER COLUMN room_id DROP NOT NULL;

DO $$
DECLARE
  fk_rec record;
BEGIN
  FOR fk_rec IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.checklist_occurrences'::regclass
      AND confrelid = 'public.rooms'::regclass
  ) LOOP
    EXECUTE 'ALTER TABLE public.checklist_occurrences DROP CONSTRAINT ' || quote_ident(fk_rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.checklist_occurrences
  ADD CONSTRAINT checklist_occurrences_room_id_fkey
  FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE SET NULL;
