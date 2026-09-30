-- Trigram index for typo-tolerant food search (SYS-DB-02). The operator class is resolved from whichever
-- schema pg_trgm lives in (public locally, "extensions" on Supabase).
DO $$
DECLARE s text;
BEGIN
  SELECT n.nspname INTO s FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm';
  EXECUTE format('CREATE INDEX IF NOT EXISTS food_items_search_trgm ON food_items USING gin (search_text %I.gin_trgm_ops)', s);
END $$;
--> statement-breakpoint
-- The audit log is append-only regardless of application bugs (ADM-AUD-01).
CREATE OR REPLACE FUNCTION clubhouse_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION clubhouse_audit_append_only();
