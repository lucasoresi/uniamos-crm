-- ============================================================
-- Uniamos CRM — Schema completo
-- Ejecutar en: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- 1. LEADS (CRM Pipeline)
-- Cada fila es un lead comercial del usuario.
-- Todos los campos del negocio van en la columna JSONB "data".
CREATE TABLE IF NOT EXISTS leads (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Campos esperados dentro de data (JSONB):
-- empresa, lead, email, tel, domain, gmailUrl,
-- estado (cierre|propuesta|activa|ghost|frio|sininfo),
-- prioridad (urgente|alta|media|baja),
-- valor, resumen, accion,
-- primerContacto, ultimoContacto (formato YYYY-MM-DD o "DD Mon YYYY")

-- 2. PROSPECTS (PRM — Prospect Relationship Management)
-- Cada fila es un prospecto en etapa de calentamiento/seguimiento.
CREATE TABLE IF NOT EXISTS prospects (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Campos esperados dentro de data (JSONB):
-- empresa, contacto, email, linkedin, cargo, domain,
-- canal (LinkedIn|Email frío|Referido|Inbound|Evento|Base de datos|WhatsApp),
-- sector, pais, prioridad (alta|media|baja),
-- estado (nuevo|contactado|fu1|fu2|fu3|positivo|negativo),
-- contexto, respuesta, accion,
-- ultimoContacto (formato YYYY-MM-DD),
-- fuLog (array de {type, text, date}),
-- historial (array de eventos)

-- 3. ACTIVITIES (Timeline de actividad)
-- Registro de eventos por lead/prospecto (cambios de etapa, notas, emails, etc.)
CREATE TABLE IF NOT EXISTS activities (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT        NOT NULL,   -- 'lead' o 'prospect'
  entity_id   TEXT        NOT NULL,   -- id del lead o prospecto
  type        TEXT        NOT NULL,   -- 'stage_change' | 'field_change' | 'note' | 'email' | 'created' | 'deleted' | 'automation' | 'prm'
  data        JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Cada usuario solo accede a sus propios datos.
-- ============================================================

ALTER TABLE leads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_owner" ON leads
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "prospects_owner" ON prospects
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "activities_owner" ON activities
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. GOOGLE TOKENS (Gmail OAuth refresh tokens)
-- Almacena el refresh token de Google OAuth por usuario para
-- poder renovar el access token sin re-autenticar.
CREATE TABLE IF NOT EXISTS google_tokens (
  user_id       UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token TEXT        NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own token"
  ON google_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert their own token"
  ON google_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own token"
  ON google_tokens FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own token"
  ON google_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- 5. USER SERVICES (Catálogo de servicios del usuario)
-- Almacena los servicios que el usuario ofrece, con precio y moneda.
-- Usado por la IA para emparejar servicios con leads.
CREATE TABLE IF NOT EXISTS public.user_services (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  price       NUMERIC(10,2) NOT NULL,
  currency    TEXT        NOT NULL DEFAULT 'USD',
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_services_select" ON public.user_services
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_services_insert" ON public.user_services
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_services_update" ON public.user_services
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_services_delete" ON public.user_services
  FOR DELETE USING (auth.uid() = user_id);

-- 6. IGNORED SENDERS (Remitentes ignorados)
-- Almacena identificadores (email, dominio, LinkedIn, Instagram)
-- que el sistema debe ignorar al procesar contactos y leads.
CREATE TABLE IF NOT EXISTS public.ignored_senders (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform   TEXT        NOT NULL DEFAULT 'email',
  identifier TEXT        NOT NULL,
  source     TEXT        NOT NULL DEFAULT 'manual',
  reason     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, identifier)
);

ALTER TABLE public.ignored_senders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ignored_senders_select" ON public.ignored_senders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ignored_senders_insert" ON public.ignored_senders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ignored_senders_delete" ON public.ignored_senders
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_leads_user        ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_prospects_user    ON prospects(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activities_user   ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_date   ON activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_services_user   ON public.user_services(user_id);
CREATE INDEX IF NOT EXISTS idx_ignored_senders_user ON public.ignored_senders(user_id);
