-- ============================================================
-- FIX RLS — activa Row Level Security + policy de dueño
-- en todas las tablas de public que tengan columna user_id.
-- Idempotente: se puede correr varias veces sin romper nada.
-- Ejecutar en: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = 'public'
          AND col.table_name = c.relname
          AND col.column_name = 'user_id'
      )
  LOOP
    -- 1. Activar RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t.tablename);

    -- 2. Crear policy de dueño solo si no existe
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t.tablename
        AND policyname = t.tablename || '_owner'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);',
        t.tablename || '_owner', t.tablename
      );
    END IF;
  END LOOP;
END $$;

-- Verificación: todas deberían quedar en true
SELECT c.relname AS tabla, c.relrowsecurity AS rls_activado
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY rls_activado, tabla;
