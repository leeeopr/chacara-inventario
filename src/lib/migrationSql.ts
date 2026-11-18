export const INVENTORY_MIGRATION_SQL = `-- =============================================================================
-- MIGRATION 0001: DYNAMIC PROPERTY INVENTORY MANAGEMENT (CHÁCARA INVENTÁRIO)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ROOMS TABLE
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rooms_name_not_empty CHECK (char_length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_name_unique
  ON public.rooms (LOWER(TRIM(name)));

-- 2. INVENTORY CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_categories_name_not_empty CHECK (char_length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_categories_name_unique
  ON public.inventory_categories (LOWER(TRIM(name)));

-- 3. INVENTORY ITEMS TABLE
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_type_enum') THEN
    CREATE TYPE public.inventory_type_enum AS ENUM ('individual', 'quantity');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  identification_code TEXT NULL,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  category_id UUID NULL REFERENCES public.inventory_categories(id) ON DELETE SET NULL,
  inventory_type public.inventory_type_enum NOT NULL DEFAULT 'quantity',
  expected_quantity INTEGER NOT NULL DEFAULT 1,
  image_path TEXT NULL,
  description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_name_not_empty CHECK (char_length(trim(name)) > 0),
  CONSTRAINT inventory_items_expected_quantity_positive CHECK (expected_quantity > 0)
);

-- Enforce unique identification_code (case-insensitive) when present
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_identification_code_unique
  ON public.inventory_items (UPPER(TRIM(identification_code)))
  WHERE identification_code IS NOT NULL AND TRIM(identification_code) <> '';

CREATE INDEX IF NOT EXISTS idx_inventory_items_room_id ON public.inventory_items (room_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category_id ON public.inventory_items (category_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_inventory_type ON public.inventory_items (inventory_type);
CREATE INDEX IF NOT EXISTS idx_inventory_items_name_search ON public.inventory_items (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_inventory_items_created_at ON public.inventory_items (created_at DESC);

-- 4. AUTOMATIC UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION public.handle_inventory_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.identification_code IS NOT NULL THEN
    NEW.identification_code = NULLIF(UPPER(TRIM(NEW.identification_code)), '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE INSERT OR UPDATE ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_inventory_updated_at();

-- 5. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rooms_select_policy" ON public.rooms;
CREATE POLICY "rooms_select_policy" ON public.rooms FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "rooms_insert_policy" ON public.rooms;
CREATE POLICY "rooms_insert_policy" ON public.rooms FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "rooms_update_policy" ON public.rooms;
CREATE POLICY "rooms_update_policy" ON public.rooms FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "rooms_delete_policy" ON public.rooms;
CREATE POLICY "rooms_delete_policy" ON public.rooms FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "inventory_categories_select_policy" ON public.inventory_categories;
CREATE POLICY "inventory_categories_select_policy" ON public.inventory_categories FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "inventory_categories_insert_policy" ON public.inventory_categories;
CREATE POLICY "inventory_categories_insert_policy" ON public.inventory_categories FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "inventory_categories_update_policy" ON public.inventory_categories;
CREATE POLICY "inventory_categories_update_policy" ON public.inventory_categories FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "inventory_categories_delete_policy" ON public.inventory_categories;
CREATE POLICY "inventory_categories_delete_policy" ON public.inventory_categories FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "inventory_items_select_policy" ON public.inventory_items;
CREATE POLICY "inventory_items_select_policy" ON public.inventory_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "inventory_items_insert_policy" ON public.inventory_items;
CREATE POLICY "inventory_items_insert_policy" ON public.inventory_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "inventory_items_update_policy" ON public.inventory_items;
CREATE POLICY "inventory_items_update_policy" ON public.inventory_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "inventory_items_delete_policy" ON public.inventory_items;
CREATE POLICY "inventory_items_delete_policy" ON public.inventory_items FOR DELETE TO anon, authenticated USING (true);

-- 6. SUPABASE STORAGE BUCKET & POLICIES ('inventory-photos')
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inventory-photos',
  'inventory-photos',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "inventory_photos_public_read" ON storage.objects;
CREATE POLICY "inventory_photos_public_read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'inventory-photos');

DROP POLICY IF EXISTS "inventory_photos_insert" ON storage.objects;
CREATE POLICY "inventory_photos_insert" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'inventory-photos');

DROP POLICY IF EXISTS "inventory_photos_update" ON storage.objects;
CREATE POLICY "inventory_photos_update" ON storage.objects
  FOR UPDATE TO anon, authenticated USING (bucket_id = 'inventory-photos') WITH CHECK (bucket_id = 'inventory-photos');

DROP POLICY IF EXISTS "inventory_photos_delete" ON storage.objects;
CREATE POLICY "inventory_photos_delete" ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'inventory-photos');

-- =============================================================================
-- MIGRATION 0002: SENIOR-FRIENDLY PROPERTY INSPECTION CHECKLIST
-- =============================================================================

-- 7. CHECKLIST SESSIONS
CREATE TABLE IF NOT EXISTS public.checklist_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,
  inspector_name TEXT NULL DEFAULT 'Responsável',
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_sessions_status CHECK (status IN ('in_progress', 'completed', 'canceled'))
);

CREATE INDEX IF NOT EXISTS idx_checklist_sessions_status ON public.checklist_sessions (status);
CREATE INDEX IF NOT EXISTS idx_checklist_sessions_started_at ON public.checklist_sessions (started_at DESC);

-- 8. CHECKLIST ROOM PROGRESS
CREATE TABLE IF NOT EXISTS public.checklist_room_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_session_id UUID NOT NULL REFERENCES public.checklist_sessions(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_room_progress_status CHECK (status IN ('pending', 'in_progress', 'completed')),
  CONSTRAINT uq_session_room UNIQUE (checklist_session_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_checklist_room_progress_session ON public.checklist_room_progress (checklist_session_id);
CREATE INDEX IF NOT EXISTS idx_checklist_room_progress_room ON public.checklist_room_progress (room_id);

-- 9. CHECKLIST ITEM RESULTS
CREATE TABLE IF NOT EXISTS public.checklist_item_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_session_id UUID NOT NULL REFERENCES public.checklist_sessions(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  inventory_item_id UUID NULL REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  item_name_snapshot TEXT NOT NULL,
  identification_code_snapshot TEXT NULL,
  inventory_type TEXT NOT NULL DEFAULT 'quantity',
  expected_quantity INTEGER NOT NULL DEFAULT 1,
  found_quantity INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'found',
  notes TEXT NULL,
  inspected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_item_results_status CHECK (status IN ('found', 'missing', 'damaged')),
  CONSTRAINT uq_session_item UNIQUE (checklist_session_id, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS idx_checklist_item_results_session ON public.checklist_item_results (checklist_session_id);
CREATE INDEX IF NOT EXISTS idx_checklist_item_results_room ON public.checklist_item_results (room_id);
CREATE INDEX IF NOT EXISTS idx_checklist_item_results_status ON public.checklist_item_results (status);

-- 10. CHECKLIST OCCURRENCES
CREATE TABLE IF NOT EXISTS public.checklist_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_session_id UUID NOT NULL REFERENCES public.checklist_sessions(id) ON DELETE CASCADE,
  inventory_item_id UUID NULL REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  occurrence_type TEXT NOT NULL,
  missing_quantity INTEGER NOT NULL DEFAULT 1,
  description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_occurrences_type CHECK (occurrence_type IN ('missing', 'damaged'))
);

CREATE INDEX IF NOT EXISTS idx_checklist_occurrences_session ON public.checklist_occurrences (checklist_session_id);
CREATE INDEX IF NOT EXISTS idx_checklist_occurrences_type ON public.checklist_occurrences (occurrence_type);

-- 11. CHECKLIST RLS POLICIES
ALTER TABLE public.checklist_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_room_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_item_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_sessions_all" ON public.checklist_sessions;
CREATE POLICY "checklist_sessions_all" ON public.checklist_sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "checklist_room_progress_all" ON public.checklist_room_progress;
CREATE POLICY "checklist_room_progress_all" ON public.checklist_room_progress FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "checklist_item_results_all" ON public.checklist_item_results;
CREATE POLICY "checklist_item_results_all" ON public.checklist_item_results FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "checklist_occurrences_all" ON public.checklist_occurrences;
CREATE POLICY "checklist_occurrences_all" ON public.checklist_occurrences FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- MIGRATION 0003: SUITE MANAGEMENT & ROOM DELETION FIX
-- =============================================================================

-- 12. SUITES TABLE
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

-- 13. ADAPT ROOMS TABLE WITH SUITE RELATIONSHIP & ROOM_TYPE
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS suite_id UUID NULL REFERENCES public.suites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_type TEXT NOT NULL DEFAULT 'individual';

CREATE INDEX IF NOT EXISTS idx_rooms_suite_id ON public.rooms (suite_id);
CREATE INDEX IF NOT EXISTS idx_rooms_room_type ON public.rooms (room_type);

-- 14. FIX FOREIGN KEYS IN CHECKLIST TABLES (ALLOW SAFE DELETION WITH HISTORICAL SNAPSHOTS)
ALTER TABLE public.checklist_room_progress
  ADD COLUMN IF NOT EXISTS room_name_snapshot TEXT NOT NULL DEFAULT '';

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

-- =============================================================================
-- MIGRATION 0004: GLOBAL INVENTORY ITEMS, MULTI-ROOM DISTRIBUTION & CONDITION
-- =============================================================================

-- 15. GLOBAL ITEMS: room_id in inventory_items is NULLABLE
ALTER TABLE public.inventory_items
  ALTER COLUMN room_id DROP NOT NULL;

-- Allow expected_quantity to be 0 for global items without room distribution yet
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_expected_quantity_positive;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_expected_quantity_non_negative CHECK (expected_quantity >= 0);

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

-- 16. INVENTORY ROOM ASSIGNMENTS TABLE
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

ALTER TABLE public.inventory_room_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_room_assignments_all" ON public.inventory_room_assignments;
CREATE POLICY "inventory_room_assignments_all" ON public.inventory_room_assignments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 17. MIGRATE EXISTING INVENTORY RECORDS
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

-- =============================================================================
-- MIGRATION 0005: ADMINISTRATIVE CHECKLIST ROOM INSPECTION ORDER
-- =============================================================================

-- 18. ADD inspection_order TO rooms TABLE
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS inspection_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_rooms_inspection_order
  ON public.rooms (inspection_order ASC);

-- 19. INITIALIZE SEQUENTIAL ORDER FOR EXISTING ROOMS
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

-- 20. ADD inspection_order TO checklist_room_progress TABLE FOR HISTORICAL AUDITING
ALTER TABLE public.checklist_room_progress
  ADD COLUMN IF NOT EXISTS inspection_order INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_room_progress_order
  ON public.checklist_room_progress (inspection_order ASC);

-- =============================================================================
-- MIGRATION 0006: INTERACTIVE FLOOR PLAN & ROOM CATEGORIES
-- =============================================================================

-- 21. ROOM CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.room_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#10b981',
  icon TEXT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_room_category_name CHECK (char_length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_room_categories_name_unique
  ON public.room_categories (LOWER(TRIM(name)));

CREATE INDEX IF NOT EXISTS idx_room_categories_display_order
  ON public.room_categories (display_order ASC);

ALTER TABLE public.room_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_categories_all" ON public.room_categories;
CREATE POLICY "room_categories_all" ON public.room_categories
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 22. ADD room_category_id TO ROOMS TABLE
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS room_category_id UUID NULL REFERENCES public.room_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rooms_room_category_id
  ON public.rooms (room_category_id);

-- 23. FLOOR PLAN SHAPES TABLE
CREATE TABLE IF NOT EXISTS public.floor_plan_shapes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  shape_type TEXT NOT NULL DEFAULT 'rectangle',
  x DOUBLE PRECISION NOT NULL DEFAULT 100,
  y DOUBLE PRECISION NOT NULL DEFAULT 100,
  width DOUBLE PRECISION NOT NULL DEFAULT 180,
  height DOUBLE PRECISION NOT NULL DEFAULT 130,
  points JSONB NULL,
  parent_room_id UUID NULL REFERENCES public.rooms(id) ON DELETE SET NULL,
  color TEXT NULL,
  label_custom TEXT NULL,
  z_index INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_floor_plan_room UNIQUE (room_id)
);

CREATE INDEX IF NOT EXISTS idx_floor_plan_shapes_room_id
  ON public.floor_plan_shapes (room_id);

CREATE INDEX IF NOT EXISTS idx_floor_plan_shapes_parent_room
  ON public.floor_plan_shapes (parent_room_id);

ALTER TABLE public.floor_plan_shapes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "floor_plan_shapes_all" ON public.floor_plan_shapes;
CREATE POLICY "floor_plan_shapes_all" ON public.floor_plan_shapes
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 24. SEED DEFAULT ROOM CATEGORIES
INSERT INTO public.room_categories (name, color, icon, display_order)
VALUES
  ('Quartos', '#8b5cf6', 'BedDouble', 1),
  ('Banheiros', '#06b6d4', 'Bath', 2),
  ('Áreas Sociais', '#3b82f6', 'Users', 3),
  ('Área Gourmet', '#f59e0b', 'Utensils', 4),
  ('Áreas Externas', '#10b981', 'Trees', 5)
ON CONFLICT (LOWER(TRIM(name))) DO NOTHING;

-- 25. AUTO-CATEGORIZE EXISTING ROOMS
DO $$
DECLARE
  cat_quartos UUID;
  cat_banheiros UUID;
  cat_sociais UUID;
  cat_gourmet UUID;
  cat_externas UUID;
BEGIN
  SELECT id INTO cat_quartos FROM public.room_categories WHERE LOWER(TRIM(name)) = 'quartos' LIMIT 1;
  SELECT id INTO cat_banheiros FROM public.room_categories WHERE LOWER(TRIM(name)) = 'banheiros' LIMIT 1;
  SELECT id INTO cat_sociais FROM public.room_categories WHERE LOWER(TRIM(name)) = 'áreas sociais' LIMIT 1;
  SELECT id INTO cat_gourmet FROM public.room_categories WHERE LOWER(TRIM(name)) = 'área gourmet' LIMIT 1;
  SELECT id INTO cat_externas FROM public.room_categories WHERE LOWER(TRIM(name)) = 'áreas externas' LIMIT 1;

  IF cat_banheiros IS NOT NULL THEN
    UPDATE public.rooms
    SET room_category_id = cat_banheiros
    WHERE room_category_id IS NULL
      AND (
        LOWER(name) LIKE '%banheiro%'
        OR LOWER(name) LIKE '%lavabo%'
        OR LOWER(name) LIKE '%wc%'
        OR room_type = 'suite_bathroom'
      );
  END IF;

  IF cat_quartos IS NOT NULL THEN
    UPDATE public.rooms
    SET room_category_id = cat_quartos
    WHERE room_category_id IS NULL
      AND (
        LOWER(name) LIKE '%quarto%'
        OR LOWER(name) LIKE '%suíte%'
        OR LOWER(name) LIKE '%suite%'
        OR LOWER(name) LIKE '%dormitório%'
        OR room_type = 'suite_bedroom'
      );
  END IF;

  IF cat_gourmet IS NOT NULL THEN
    UPDATE public.rooms
    SET room_category_id = cat_gourmet
    WHERE room_category_id IS NULL
      AND (
        LOWER(name) LIKE '%gourmet%'
        OR LOWER(name) LIKE '%churrasqueira%'
        OR LOWER(name) LIKE '%cozinha%'
        OR LOWER(name) LIKE '%forno%'
      );
  END IF;

  IF cat_sociais IS NOT NULL THEN
    UPDATE public.rooms
    SET room_category_id = cat_sociais
    WHERE room_category_id IS NULL
      AND (
        LOWER(name) LIKE '%sala%'
        OR LOWER(name) LIKE '%estar%'
        OR LOWER(name) LIKE '%jantar%'
        OR LOWER(name) LIKE '%jogos%'
        OR LOWER(name) LIKE '%tv%'
      );
  END IF;

  IF cat_externas IS NOT NULL THEN
    UPDATE public.rooms
    SET room_category_id = cat_externas
    WHERE room_category_id IS NULL
      AND (
        LOWER(name) LIKE '%piscina%'
        OR LOWER(name) LIKE '%jardim%'
        OR LOWER(name) LIKE '%externa%'
        OR LOWER(name) LIKE '%varanda%'
        OR LOWER(name) LIKE '%deck%'
        OR LOWER(name) LIKE '%garagem%'
        OR LOWER(name) LIKE '%campo%'
        OR LOWER(name) LIKE '%pomar%'
      );
  END IF;
END $$;

-- 26. AUTO-INITIALIZE DEFAULT FLOOR PLAN SHAPES FOR EXISTING ROOMS
DO $$
DECLARE
  room_rec RECORD;
  bed_shape RECORD;
  col_idx INTEGER := 0;
  row_idx INTEGER := 0;
  pos_x DOUBLE PRECISION;
  pos_y DOUBLE PRECISION;
  w DOUBLE PRECISION := 180;
  h DOUBLE PRECISION := 130;
  gap DOUBLE PRECISION := 24;
  start_x DOUBLE PRECISION := 60;
  start_y DOUBLE PRECISION := 60;
  max_cols INTEGER := 3;
BEGIN
  FOR room_rec IN (
    SELECT rm.id, rm.name, rm.room_type, rm.suite_id
    FROM public.rooms rm
    LEFT JOIN public.floor_plan_shapes fps ON fps.room_id = rm.id
    WHERE fps.id IS NULL
    ORDER BY rm.inspection_order ASC, rm.created_at ASC
  ) LOOP
    pos_x := start_x + (col_idx * (w + gap));
    pos_y := start_y + (row_idx * (h + gap));

    -- Check if it's a suite bathroom with a paired bedroom
    IF room_rec.room_type = 'suite_bathroom' AND room_rec.suite_id IS NOT NULL THEN
      bed_shape := NULL;
      SELECT fps.id, fps.room_id, fps.x, fps.y, fps.width, fps.height
      INTO bed_shape
      FROM public.rooms br
      JOIN public.floor_plan_shapes fps ON fps.room_id = br.id
      WHERE br.suite_id = room_rec.suite_id AND br.room_type = 'suite_bedroom'
      LIMIT 1;

      IF FOUND AND bed_shape.id IS NOT NULL THEN
        -- Place bathroom visually nested in top-right corner of bedroom
        INSERT INTO public.floor_plan_shapes (
          room_id,
          shape_type,
          x,
          y,
          width,
          height,
          parent_room_id,
          z_index
        ) VALUES (
          room_rec.id,
          'rectangle',
          bed_shape.x + bed_shape.width - 80,
          bed_shape.y + 10,
          70,
          60,
          bed_shape.room_id,
          2
        ) ON CONFLICT (room_id) DO NOTHING;
        CONTINUE;
      END IF;
    END IF;

    -- Standard room placement
    INSERT INTO public.floor_plan_shapes (
      room_id,
      shape_type,
      x,
      y,
      width,
      height,
      parent_room_id,
      z_index
    ) VALUES (
      room_rec.id,
      'rectangle',
      pos_x,
      pos_y,
      w,
      h,
      NULL,
      1
    ) ON CONFLICT (room_id) DO NOTHING;

    col_idx := col_idx + 1;
    IF col_idx >= max_cols THEN
      col_idx := 0;
      row_idx := row_idx + 1;
    END IF;
  END LOOP;
END $$;
`;
