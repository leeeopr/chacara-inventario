-- =============================================================================
-- MIGRATION 0009: STAFF PERSONAL SERVICES & GOOGLE-CALENDAR STYLE AGENDA
-- =============================================================================
-- Allows staff (Faxineira, Piscineiro) and Admin to manage their own personal,
-- external day-to-day clients, services, schedules, and earnings.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.staff_personal_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  staff_role TEXT NOT NULL CHECK (staff_role IN ('admin', 'faxineira', 'piscineiro')),
  title TEXT NOT NULL,
  client_name TEXT NULL,
  client_phone TEXT NULL,
  address TEXT NULL,
  service_date DATE NOT NULL,
  start_time TIME NULL DEFAULT '08:00:00',
  end_time TIME NULL DEFAULT '12:00:00',
  category TEXT NOT NULL DEFAULT 'geral',
  color TEXT NULL,
  price NUMERIC(10, 2) NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'canceled')),
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_personal_services_email
  ON public.staff_personal_services (LOWER(user_email));

CREATE INDEX IF NOT EXISTS idx_staff_personal_services_date
  ON public.staff_personal_services (service_date);

CREATE INDEX IF NOT EXISTS idx_staff_personal_services_email_date
  ON public.staff_personal_services (LOWER(user_email), service_date);

ALTER TABLE public.staff_personal_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access staff_personal_services" ON public.staff_personal_services;
CREATE POLICY "Public access staff_personal_services" ON public.staff_personal_services
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
