# Activities Table — Schema para Supabase

## Tabla `activities`

```sql
-- 3. Tabla de ACTIVIDADES (Timeline)
CREATE TABLE IF NOT EXISTS activities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT        NOT NULL,  -- 'lead' | 'prospect'
  entity_id   TEXT        NOT NULL,  -- FK al lead o prospect
  type        TEXT        NOT NULL,  -- tipo de actividad (ver abajo)
  data        JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ROW LEVEL SECURITY
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activities_owner" ON activities
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- INDICES
CREATE INDEX IF NOT EXISTS idx_activities_user ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at DESC);
```

## Tipos de actividad (`type`)

| type | Descripcion | Auto/Manual | Fase |
|---|---|---|---|
| `created` | Lead/prospecto creado | Auto | 1 |
| `deleted` | Lead/prospecto eliminado | Auto | 1 |
| `stage_change` | Movimiento entre etapas del pipeline | Auto | 1 |
| `note` | Nota manual del usuario | Manual | 1 |
| `email_sent` | Email enviado via Gmail link | Auto | 2 |
| `calendar_event` | Evento creado en Google Calendar | Auto | 2 |
| `prm_to_crm` | Prospecto promovido a lead CRM | Auto | 2 |
| `field_change` | Cambio de campo importante | Auto | 3 |
| `automation` | Regla automatica modifico el lead | Auto | 3 |

## Estructura del campo `data` (JSONB) por tipo

```jsonc
// stage_change
{ "from": "activa", "to": "propuesta" }

// note
{ "text": "Llamada con el director...", "subtype": "llamada" }
// subtype: "llamada" | "reunion" | "nota" | "tarea"

// email_sent
{ "to": "juan@empresa.com", "subject": "Follow-up: Acme Corp" }

// calendar_event
{ "title": "Follow-up: Acme Corp", "date": "2026-04-01" }

// field_change
{ "field": "prioridad", "from": "media", "to": "urgente" }

// prm_to_crm
{ "prospect_empresa": "Acme Corp", "new_lead_id": "abc123" }

// automation
{ "rule": "ghost_rule", "description": "Auto-movido a Ghost por 14 dias sin contacto" }

// created
{ "empresa": "Acme Corp", "lead": "Juan Perez" }

// deleted
{ "empresa": "Acme Corp", "lead": "Juan Perez" }
```

## Instrucciones

1. Ir a **Supabase Dashboard > SQL Editor > New Query**
2. Pegar el bloque SQL de arriba
3. Ejecutar
4. Verificar que la tabla aparezca en **Table Editor**
5. Verificar que la policy `activities_owner` aparezca en **Authentication > Policies**
