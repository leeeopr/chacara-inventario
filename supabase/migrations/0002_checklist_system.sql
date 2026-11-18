-- =============================================================================
-- MIGRATION 0002: SENIOR-FRIENDLY PROPERTY INSPECTION CHECKLIST
-- =============================================================================
-- Safe to run multiple times (idempotent).
-- Implements:
--   1. public.checklist_sessions
--   2. public.checklist_room_progress
--   3. public.checklist_item_results
--   4. public.checklist_occurrences
--   5. Indexes, constraints, and Row Level Security (RLS) policies
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. CHECKLIST SESSIONS
CREATE TABLE IF NOT EXISTS public.checklist_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'canceled'
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,
  inspector_name TEXT NULL DEFAULT 'Responsável',
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_sessions_status CHECK (status IN ('in_progress', 'completed', 'canceled'))
);

CREATE INDEX IF NOT EXISTS idx_checklist_sessions_status
  ON public.checklist_sessions (status);

CREATE INDEX IF NOT EXISTS idx_checklist_sessions_started_at
  ON public.checklist_sessions (started_at DESC);

-- 2. CHECKLIST ROOM PROGRESS
CREATE TABLE IF NOT EXISTS public.checklist_room_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_session_id UUID NOT NULL REFERENCES public.checklist_sessions(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed'
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_room_progress_status CHECK (status IN ('pending', 'in_progress', 'completed')),
  CONSTRAINT uq_session_room UNIQUE (checklist_session_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_checklist_room_progress_session
  ON public.checklist_room_progress (checklist_session_id);

CREATE INDEX IF NOT EXISTS idx_checklist_room_progress_room
  ON public.checklist_room_progress (room_id);

-- 3. CHECKLIST ITEM RESULTS
-- Preserves historical snapshot values (name, code, quantity) so future edits to inventory_items
-- do not distort or corrupt past inspection records.
CREATE TABLE IF NOT EXISTS public.checklist_item_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_session_id UUID NOT NULL REFERENCES public.checklist_sessions(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  inventory_item_id UUID NULL REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  item_name_snapshot TEXT NOT NULL,
  identification_code_snapshot TEXT NULL,
  inventory_type TEXT NOT NULL DEFAULT 'quantity', -- 'individual', 'quantity'
  expected_quantity INTEGER NOT NULL DEFAULT 1,
  found_quantity INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'found', -- 'found', 'missing', 'damaged'
  notes TEXT NULL,
  inspected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_item_results_status CHECK (status IN ('found', 'missing', 'damaged')),
  CONSTRAINT uq_session_item UNIQUE (checklist_session_id, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS idx_checklist_item_results_session
  ON public.checklist_item_results (checklist_session_id);

CREATE INDEX IF NOT EXISTS idx_checklist_item_results_room
  ON public.checklist_item_results (room_id);

CREATE INDEX IF NOT EXISTS idx_checklist_item_results_status
  ON public.checklist_item_results (status);

-- 4. CHECKLIST OCCURRENCES (MISSING OR DAMAGED INCIDENTS)
CREATE TABLE IF NOT EXISTS public.checklist_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_session_id UUID NOT NULL REFERENCES public.checklist_sessions(id) ON DELETE CASCADE,
  inventory_item_id UUID NULL REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  occurrence_type TEXT NOT NULL, -- 'missing', 'damaged'
  missing_quantity INTEGER NOT NULL DEFAULT 1,
  description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_occurrences_type CHECK (occurrence_type IN ('missing', 'damaged'))
);

CREATE INDEX IF NOT EXISTS idx_checklist_occurrences_session
  ON public.checklist_occurrences (checklist_session_id);

CREATE INDEX IF NOT EXISTS idx_checklist_occurrences_type
  ON public.checklist_occurrences (occurrence_type);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.checklist_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_room_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_item_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_sessions_all" ON public.checklist_sessions;
CREATE POLICY "checklist_sessions_all" ON public.checklist_sessions
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "checklist_room_progress_all" ON public.checklist_room_progress;
CREATE POLICY "checklist_room_progress_all" ON public.checklist_room_progress
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "checklist_item_results_all" ON public.checklist_item_results;
CREATE POLICY "checklist_item_results_all" ON public.checklist_item_results
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "checklist_occurrences_all" ON public.checklist_occurrences;
CREATE POLICY "checklist_occurrences_all" ON public.checklist_occurrences
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
