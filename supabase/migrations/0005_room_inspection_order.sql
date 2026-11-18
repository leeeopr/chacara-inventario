-- =============================================================================
-- MIGRATION 0005: ADMINISTRATIVE CHECKLIST ROOM INSPECTION ORDER
-- =============================================================================
-- Safe to run multiple times (idempotent).
-- Implements:
--   1. inspection_order INTEGER column in public.rooms.
--   2. Sequential ordering initialization for existing rooms.
--   3. Index on inspection_order for high-performance sorting.
--   4. inspection_order column in public.checklist_room_progress for historical sequence tracking.
-- =============================================================================

-- 1. ADD inspection_order TO rooms TABLE
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS inspection_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_rooms_inspection_order
  ON public.rooms (inspection_order ASC);

-- 2. INITIALIZE SEQUENTIAL ORDER FOR EXISTING ROOMS
-- Assign clean sequential numbers (1, 2, 3...) based on current order or created_at
DO $$
DECLARE
  r RECORD;
  i INTEGER := 1;
BEGIN
  FOR r IN (
    SELECT id FROM public.rooms
    ORDER BY
      CASE WHEN inspection_order > 0 THEN inspection_order ELSE 999999 END ASC,
      created_at ASC
  ) LOOP
    UPDATE public.rooms
    SET inspection_order = i
    WHERE id = r.id;
    i := i + 1;
  END LOOP;
END $$;

-- 3. ADD inspection_order SNAPSHOT TO checklist_room_progress TABLE FOR HISTORICAL TRACKING
ALTER TABLE public.checklist_room_progress
  ADD COLUMN IF NOT EXISTS inspection_order INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_room_progress_order
  ON public.checklist_room_progress (inspection_order ASC);
