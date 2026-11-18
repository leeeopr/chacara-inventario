-- =============================================================================
-- MIGRATION 0004: GLOBAL INVENTORY ITEMS, MULTI-ROOM DISTRIBUTION & CONDITION
-- =============================================================================
-- Safe to run multiple times (idempotent).
-- Implements:
--   1. Global items: room_id in public.inventory_items is made NULLABLE.
--   2. public.inventory_room_assignments: distribution of items across rooms
--      with room-specific quantity, condition status and condition notes.
--   3. Row Level Security policies for inventory_room_assignments.
--   4. Migration of existing inventory records into inventory_room_assignments.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. MAKE room_id IN inventory_items OPTIONAL (GLOBAL ITEM CONCEPT)
ALTER TABLE public.inventory_items
  ALTER COLUMN room_id DROP NOT NULL;

-- Allow expected_quantity to be 0 for global items without room distribution yet
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_expected_quantity_positive;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_expected_quantity_non_negative CHECK (expected_quantity >= 0);

-- Ensure foreign key allows ON DELETE SET NULL on room_id if room is deleted
DO $$
DECLARE
  fk_rec record;
BEGIN
  FOR fk_rec IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.inventory_items'::regclass
      AND confrelid = 'public.rooms'::regclass
  ) LOOP
    EXECUTE 'ALTER TABLE public.inventory_items DROP CONSTRAINT ' || quote_ident(fk_rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_room_id_fkey
  FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE SET NULL;


-- 2. CREATE INVENTORY ROOM ASSIGNMENTS TABLE
CREATE TABLE IF NOT EXISTS public.inventory_room_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  condition_status TEXT NOT NULL DEFAULT 'good',
  condition_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_ira_quantity_positive CHECK (quantity > 0),
  CONSTRAINT chk_ira_condition_status CHECK (
    condition_status IN ('good', 'attention', 'concerning', 'replacement_required')
  ),
  CONSTRAINT uq_inventory_item_room UNIQUE (inventory_item_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_ira_item_id
  ON public.inventory_room_assignments (inventory_item_id);

CREATE INDEX IF NOT EXISTS idx_ira_room_id
  ON public.inventory_room_assignments (room_id);

CREATE INDEX IF NOT EXISTS idx_ira_condition
  ON public.inventory_room_assignments (condition_status);


-- 3. ROW LEVEL SECURITY
ALTER TABLE public.inventory_room_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_room_assignments_all" ON public.inventory_room_assignments;
CREATE POLICY "inventory_room_assignments_all" ON public.inventory_room_assignments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- 4. MIGRATE EXISTING INVENTORY RECORDS SAFELY
INSERT INTO public.inventory_room_assignments (
  inventory_item_id,
  room_id,
  quantity,
  condition_status,
  condition_notes
)
SELECT
  id AS inventory_item_id,
  room_id,
  GREATEST(COALESCE(expected_quantity, 1), 1) AS quantity,
  'good' AS condition_status,
  NULL AS condition_notes
FROM public.inventory_items
WHERE room_id IS NOT NULL
ON CONFLICT (inventory_item_id, room_id) DO NOTHING;
