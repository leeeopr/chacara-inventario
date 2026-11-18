-- =============================================================================
-- MIGRATION 0001: DYNAMIC PROPERTY INVENTORY MANAGEMENT (CHÁCARA INVENTÁRIO)
-- =============================================================================
-- Safe to run multiple times (idempotent).
-- Implements:
--   1. public.rooms
--   2. public.inventory_categories
--   3. public.inventory_items
--   4. Unique identification_code enforcement, quantity validation, indexes, triggers
--   5. Row Level Security (RLS) policies
--   6. Supabase Storage bucket 'inventory-photos' and Storage RLS policies
--   7. Architectural compatibility for future post-checkout inspection checklists
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

-- Performance indexes for filtering, searching, and future checklist generation
CREATE INDEX IF NOT EXISTS idx_inventory_items_room_id
  ON public.inventory_items (room_id);

CREATE INDEX IF NOT EXISTS idx_inventory_items_category_id
  ON public.inventory_items (category_id);

CREATE INDEX IF NOT EXISTS idx_inventory_items_inventory_type
  ON public.inventory_items (inventory_type);

CREATE INDEX IF NOT EXISTS idx_inventory_items_name_search
  ON public.inventory_items (LOWER(name));

CREATE INDEX IF NOT EXISTS idx_inventory_items_created_at
  ON public.inventory_items (created_at DESC);

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

-- Policies allowing access for authenticated property owners & anon client key
DROP POLICY IF EXISTS "rooms_select_policy" ON public.rooms;
CREATE POLICY "rooms_select_policy" ON public.rooms
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "rooms_insert_policy" ON public.rooms;
CREATE POLICY "rooms_insert_policy" ON public.rooms
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "rooms_update_policy" ON public.rooms;
CREATE POLICY "rooms_update_policy" ON public.rooms
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "rooms_delete_policy" ON public.rooms;
CREATE POLICY "rooms_delete_policy" ON public.rooms
  FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "inventory_categories_select_policy" ON public.inventory_categories;
CREATE POLICY "inventory_categories_select_policy" ON public.inventory_categories
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "inventory_categories_insert_policy" ON public.inventory_categories;
CREATE POLICY "inventory_categories_insert_policy" ON public.inventory_categories
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "inventory_categories_update_policy" ON public.inventory_categories;
CREATE POLICY "inventory_categories_update_policy" ON public.inventory_categories
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "inventory_categories_delete_policy" ON public.inventory_categories;
CREATE POLICY "inventory_categories_delete_policy" ON public.inventory_categories
  FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "inventory_items_select_policy" ON public.inventory_items;
CREATE POLICY "inventory_items_select_policy" ON public.inventory_items
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "inventory_items_insert_policy" ON public.inventory_items;
CREATE POLICY "inventory_items_insert_policy" ON public.inventory_items
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "inventory_items_update_policy" ON public.inventory_items;
CREATE POLICY "inventory_items_update_policy" ON public.inventory_items
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "inventory_items_delete_policy" ON public.inventory_items;
CREATE POLICY "inventory_items_delete_policy" ON public.inventory_items
  FOR DELETE TO anon, authenticated USING (true);

-- 6. SUPABASE STORAGE BUCKET & POLICIES ('inventory-photos')
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inventory-photos',
  'inventory-photos',
  true,
  10485760, -- 10 MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "inventory_photos_public_read" ON storage.objects;
CREATE POLICY "inventory_photos_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'inventory-photos');

DROP POLICY IF EXISTS "inventory_photos_insert" ON storage.objects;
CREATE POLICY "inventory_photos_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'inventory-photos');

DROP POLICY IF EXISTS "inventory_photos_update" ON storage.objects;
CREATE POLICY "inventory_photos_update" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'inventory-photos')
  WITH CHECK (bucket_id = 'inventory-photos');

DROP POLICY IF EXISTS "inventory_photos_delete" ON storage.objects;
CREATE POLICY "inventory_photos_delete" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'inventory-photos');
