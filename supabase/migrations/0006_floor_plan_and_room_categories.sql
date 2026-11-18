-- =============================================================================
-- MIGRATION 0006: INTERACTIVE FLOOR PLAN & ROOM CATEGORIES
-- =============================================================================
-- Safe to run multiple times (idempotent).
-- Implements:
--   1. public.room_categories (broad room grouping: Quartos, Banheiros, Áreas Sociais, etc.)
--   2. Adds room_category_id to public.rooms
--   3. public.floor_plan_shapes (geometric layout, coordinates, dimensions, vertices, nesting)
--   4. Row Level Security policies
--   5. Seed initial room categories & auto-categorization of existing rooms
--   6. Auto-generate initial floor plan shapes for existing rooms
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ROOM CATEGORIES TABLE
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

-- 2. ADD room_category_id TO ROOMS TABLE
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS room_category_id UUID NULL REFERENCES public.room_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rooms_room_category_id
  ON public.rooms (room_category_id);

-- 3. FLOOR PLAN SHAPES TABLE
CREATE TABLE IF NOT EXISTS public.floor_plan_shapes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  shape_type TEXT NOT NULL DEFAULT 'rectangle', -- 'rectangle' | 'square' | 'l_shape' | 't_shape' | 'polygon'
  x DOUBLE PRECISION NOT NULL DEFAULT 100,
  y DOUBLE PRECISION NOT NULL DEFAULT 100,
  width DOUBLE PRECISION NOT NULL DEFAULT 180,
  height DOUBLE PRECISION NOT NULL DEFAULT 130,
  points JSONB NULL, -- Array of {x: number, y: number} for custom polygon vertices
  parent_room_id UUID NULL REFERENCES public.rooms(id) ON DELETE SET NULL, -- For nested spaces (e.g. bathroom inside bedroom)
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

-- 4. SEED DEFAULT ROOM CATEGORIES
INSERT INTO public.room_categories (name, color, icon, display_order)
VALUES
  ('Quartos', '#8b5cf6', 'BedDouble', 1),
  ('Banheiros', '#06b6d4', 'Bath', 2),
  ('Áreas Sociais', '#3b82f6', 'Users', 3),
  ('Área Gourmet', '#f59e0b', 'Utensils', 4),
  ('Áreas Externas', '#10b981', 'Trees', 5)
ON CONFLICT (LOWER(TRIM(name))) DO NOTHING;

-- 5. AUTO-CATEGORIZE EXISTING ROOMS BASED ON COMMON KEYWORDS
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

  -- Banheiros first (so 'Banheiro Suíte 1' doesn't match 'suíte' as quarto)
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

  -- Quartos
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

  -- Área Gourmet
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

  -- Áreas Sociais
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

  -- Áreas Externas
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

-- 6. AUTO-INITIALIZE DEFAULT FLOOR PLAN SHAPES FOR EXISTING ROOMS
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
