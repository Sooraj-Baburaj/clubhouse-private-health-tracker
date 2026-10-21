-- Supabase exposes the public schema through PostgREST, and the anon key ships to the browser for realtime, so any
-- table without RLS is readable and writable at /rest/v1/. The app reaches Postgres directly as the table owner, which
-- RLS does not apply to (no FORCE), so enabling it with no policies locks out only the anon/authenticated API roles.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
