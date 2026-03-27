-- Uniamos CRM - Supabase Schema
-- Ejecutar en: Supabase Dashboard > SQL Editor > New Query

-- 1. Tabla de LEADS (CRM Pipeline)
CREATE TABLE IF NOT EXISTS leads (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de PROSPECTOS (PRM)
CREATE TABLE IF NOT EXISTS prospects (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ROW LEVEL SECURITY
-- Cada usuario solo puede ver y modificar SUS PROPIOS datos

ALTER TABLE leads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

-- Leads: acceso completo solo al dueno
CREATE POLICY "leads_owner" ON leads
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Prospects: acceso completo solo al dueno
CREATE POLICY "prospects_owner" ON prospects
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- INDICES
CREATE INDEX IF NOT EXISTS idx_leads_user    ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_prospects_user ON prospects(user_id);

-- LISTO
-- Ahora ve a Authentication > Settings y activa Email confirmations si quieres.
-- Para permitir login con Google, activa el provider en Authentication > Providers.
