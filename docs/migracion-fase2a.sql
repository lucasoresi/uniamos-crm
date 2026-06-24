-- ============================================================
-- Uniamos CRM — Migración Fase 2a
-- Automatizaciones (reglas de workflow)
-- Ejecutar en: Supabase Dashboard > SQL Editor > New Query
-- Proyecto: llleoqfeluptmmbqluab
-- IDEMPOTENTE: segura de correr aunque ya exista.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.automations (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
-- Campos en data (JSONB):
--   name      TEXT
--   enabled   BOOL
--   trigger   { type: 'days_no_contact'|'score_below'|'score_above',
--               stage?: 'cierre'|'propuesta'|'activa'|'ghost'|'frio'|'sininfo'|'any',
--               days?: INT, value?: INT }
--   action    { type: 'move_stage'|'set_priority'|'add_note',
--               value: <etapa|prioridad|texto> }
--   lastRun   TIMESTAMPTZ (ISO)
--   lastCount INT  (cuántos leads afectó la última corrida)

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automations_owner" ON public.automations;
CREATE POLICY "automations_owner" ON public.automations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_automations_user ON public.automations(user_id);

-- Listo. La vista Automatizaciones ya puede crear/ejecutar reglas.
