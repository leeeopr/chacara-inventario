-- =============================================================================
-- MIGRATION 0008: AUTH STAFF PROFILES (ROLES) & CLEANING / POOL TASKS
-- =============================================================================

-- 1. STAFF PROFILES TABLE (LINKED TO SUPABASE AUTH)
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'faxineira', 'piscineiro')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_profiles_user_id ON public.staff_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_email ON public.staff_profiles (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_staff_profiles_role ON public.staff_profiles (role);

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access staff_profiles" ON public.staff_profiles;
CREATE POLICY "Public access staff_profiles" ON public.staff_profiles
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 2. TRIGGER FUNCTION TO SYNC NEW AUTH USERS INTO STAFF_PROFILES
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.staff_profiles (user_id, email, full_name, role)
  VALUES (
    NEW.id,
    LOWER(NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('admin', 'faxineira', 'piscineiro') THEN NEW.raw_user_meta_data->>'role'
      WHEN LOWER(NEW.email) LIKE '%faxin%' THEN 'faxineira'
      WHEN LOWER(NEW.email) LIKE '%piscin%' THEN 'piscineiro'
      WHEN LOWER(NEW.email) LIKE '%admin%' THEN 'admin'
      ELSE 'faxineira'
    END
  )
  ON CONFLICT (email) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    full_name = COALESCE(EXCLUDED.full_name, public.staff_profiles.full_name),
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 3. EXTEND RESERVATIONS WITH CLEANING (FAXINA) & POOL (PISCINA) CONTROL
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS cleaning_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS cleaning_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleaning_completed_by text,
  ADD COLUMN IF NOT EXISTS cleaning_notes text,
  ADD COLUMN IF NOT EXISTS pool_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS pool_cleaned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pool_cleaned_by text,
  ADD COLUMN IF NOT EXISTS pool_notes text;

-- 4. ENSURE EXISTING OWNER ACCOUNT IS LINKED AS ADMIN
INSERT INTO public.staff_profiles (user_id, email, full_name, role)
SELECT id, LOWER(email), COALESCE(raw_user_meta_data->>'full_name', 'Proprietário / Admin'), 'admin'
FROM auth.users
WHERE LOWER(email) = 'lpr1000lpr07@gmail.com'
ON CONFLICT (email) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  role = 'admin',
  updated_at = now();
