-- ============================================================
-- Uniamos CRM — Migración Fase 2b
-- Mis Tareas
-- Ejecutar en: Supabase Dashboard > SQL Editor > New Query
-- Proyecto: llleoqfeluptmmbqluab
-- IDEMPOTENTE: segura de correr aunque ya exista.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tasks (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
-- Campos en data (JSONB):
--   title      TEXT
--   notes      TEXT
--   due        TEXT (YYYY-MM-DD) | null
--   done       BOOL
--   priority   'urg'|'alta'|'media'|'baja'
--   leadId     TEXT | null   (lead vinculado)
--   leadName   TEXT | null
--   createdAt  TEXT (ISO)

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_owner" ON public.tasks;
CREATE POLICY "tasks_owner" ON public.tasks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON public.tasks(user_id);

-- Listo. Las vistas Mis Tareas y Calendario ya pueden leer/escribir tareas.
