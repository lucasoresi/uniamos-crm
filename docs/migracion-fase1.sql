-- ============================================================
-- Uniamos CRM — Migración Fase 1
-- Capa de edición manual + PRM Prospectos
-- Ejecutar en: Supabase Dashboard > SQL Editor > New Query
-- Proyecto: llleoqfeluptmmbqluab
--
-- Estas tablas ya están definidas en schema.sql. Esta migración
-- es IDEMPOTENTE: podés correrla aunque ya existan, sin romper nada.
-- ============================================================

-- 1. ACTIVITIES — timeline real de leads (notas, cambios de etapa, creación)
CREATE TABLE IF NOT EXISTS public.activities (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT        NOT NULL,                 -- 'lead' | 'prospect'
  entity_id   TEXT        NOT NULL,                 -- id del lead/prospecto
  type        TEXT        NOT NULL,                 -- 'note'|'stage_change'|'created'|'email'|'field_change'|'automation'
  data        JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activities_owner" ON public.activities;
CREATE POLICY "activities_owner" ON public.activities
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_activities_entity ON public.activities(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activities_user   ON public.activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_date   ON public.activities(created_at DESC);

-- 2. PROSPECTS — PRM (prospectos en calentamiento/seguimiento)
CREATE TABLE IF NOT EXISTS public.prospects (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
-- Campos en data (JSONB): empresa, contacto, email, linkedin, cargo,
-- canal, sector, pais, prioridad (alta|media|baja),
-- estado (nuevo|contactado|fu1|fu2|fu3|positivo|negativo),
-- contexto, accion, ultimoContacto (YYYY-MM-DD), convertedToLead

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prospects_owner" ON public.prospects;
CREATE POLICY "prospects_owner" ON public.prospects
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_prospects_user ON public.prospects(user_id);

-- Listo. La capa de edición manual y el PRM ya pueden leer/escribir.
