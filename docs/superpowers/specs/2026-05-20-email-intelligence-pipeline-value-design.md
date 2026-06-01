# Email Intelligence & Pipeline Value — Design Spec
**Fecha:** 2026-05-20  
**Estado:** Aprobado, pendiente de implementación

---

## Problema

El sistema actual tiene tres gaps:

1. **Filtrado de emails deficiente** — contactos B2C (supermercados, apps de pago, publicidad) entran al pipeline como leads, y emails de ruido aparecen en el dashboard de inicio aunque el lead sea real.
2. **Valor del pipeline sin base real** — `data.valor` es un campo manual, no hay catálogo de servicios ni asignación automática de valor económico.
3. **Movimiento de etapa por email aislado** — `classify-email-lead` solo recibe asunto + snippet, sin historial de conversación, lo que limita la precisión.

---

## Decisiones de diseño

| Decisión | Elección |
|---|---|
| Alcance del filtrado | Ambos lados: pipeline (sync) y dashboard (home load) |
| Enfoque de filtrado | Híbrido: IA automática + lista negra manual del usuario |
| Valor por lead | Múltiples servicios por lead, valor = suma de precios |
| Catálogo de servicios | Sección propia en el sidebar |
| Matching de servicios | IA analiza historial completo de conversación |
| Movimiento de etapa | Automático directo, sin confirmación del usuario |
| Arquitectura | Función unificada `analyze-lead` (un solo llamado Claude por análisis) |

---

## Arquitectura

### Flujo 1 — Login Sync (`gmailSync_run`)

```
Gmail API (SENT + INBOX)
  → Pre-filtro cliente: _NOISE regex + ignored_senders table
  → enrich-gmail-contacts (Edge Function existente, prompt mejorado)
  → Supabase: upsert leads (solo B2B reales)
```

El pre-filtro en el cliente bloquea contactos B2C antes de gastar tokens en la IA.

### Flujo 2 — Home Load (cada apertura del dashboard)

```
Gmail INBOX (30 emails)
  → gmail_matchEmailsToLeads (solo emails de leads existentes)
  → Por cada match:
      gmail_loadForContact (historial: últimos 15 emails con body)
      analyze-lead (Edge Function NUEVO)
        recibe: email actual + historial + catálogo de servicios + etapa actual
        devuelve: is_noise · new_stage · matched_services[] · signal · reason
      Si is_noise=true → descartar, no mostrar en dashboard
      Si new_stage ≠ actual → update lead en Supabase
      Si matched_services cambió → update lead.data.services y recalcular valor
  → Renderizar "Actividades recientes" con emails no-noise
```

---

## Nuevas tablas Supabase

### `user_services`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id     UUID REFERENCES auth.users NOT NULL
name        TEXT NOT NULL
price       DECIMAL(10,2) NOT NULL
currency    TEXT NOT NULL DEFAULT 'USD'
description TEXT
created_at  TIMESTAMPTZ DEFAULT now()
```
RLS: usuario solo accede a sus propios servicios.

### `ignored_senders`
```sql
id         UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id    UUID REFERENCES auth.users NOT NULL
platform   TEXT NOT NULL DEFAULT 'email'  -- 'email' | 'domain' | 'linkedin' | 'instagram' | 'other'
identifier TEXT NOT NULL  -- email completo, dominio, @usuario o URL de perfil
source     TEXT NOT NULL DEFAULT 'manual'  -- 'ai' | 'manual'
reason     TEXT
created_at TIMESTAMPTZ DEFAULT now()
```
RLS: usuario solo accede a sus propios bloqueados.

**Lógica de matching en `_fetchContacts`:**
- `platform='email'`: ignorar si `contact.email === identifier`
- `platform='domain'`: ignorar si `contact.domain === identifier`
- `platform='linkedin'` / `'instagram'`: solo relevante para la sección "Bloqueados" en UI (no aplica al sync de Gmail)

### Extensión de `leads.data` (JSONB)
```json
{
  "...campos actuales...",
  "services": [
    { "id": "uuid", "name": "Creación de sitio web", "price": 100, "currency": "USD" }
  ],
  "valor": 150
}
```
`valor` es siempre la suma de `services[].price`. Se recalcula en cada actualización.

---

## Edge Function: `analyze-lead` (nuevo)

### Input
```json
{
  "email": {
    "subject": "string",
    "from": "string",
    "snippet": "string"
  },
  "conversation_history": [
    {
      "subject": "string",
      "body": "string",
      "date": "string",
      "direction": "sent | received"
    }
  ],
  "current_stage": "cierre | propuesta | activa | ghost | frio | sininfo",
  "lead_name": "string",
  "user_services": [
    { "id": "uuid", "name": "string", "price": 100 }
  ]
}
```

### Output
```json
{
  "is_noise": false,
  "new_stage": "propuesta",
  "matched_services": ["uuid1"],
  "signal": "hot | warm | cold | neutral",
  "reason": "string (1 oración en español)"
}
```

### Criterios de etapa (prompt a Claude Haiku)

| Etapa | Criterio |
|---|---|
| `cierre` | Mencionan contrato, firma, "cerramos", "cuándo empezamos" |
| `propuesta` | Piden presupuesto, cotización, reunión para evaluar |
| `activa` | Conversación bidireccional activa, preguntas concretas sobre el servicio |
| `ghost` | Sin respuesta del lead en 14+ días (verificado en historial de fechas) |
| `frio` | Desinterés explícito o silencio muy prolongado (30+ días) |
| `sininfo` | Primer email, contexto insuficiente |

**Regla conservadora:** si hay duda, devolver la etapa actual sin cambios.

### `is_noise: true` cuando el email es
- Notificación automática de pago o transacción
- Recibo de compra o factura electrónica
- Newsletter o marketing masivo
- Alerta de sistema o app
- Confirmación de suscripción / delivery

Aplica incluso si el remitente existe como lead en el CRM.

### Detección de servicios
La IA recibe el historial completo y el catálogo del usuario. Infiere qué servicios se mencionan según el contenido de la conversación, sin necesidad de keywords predefinidas. Devuelve solo los IDs de servicios que el historial menciona claramente.

---

## Edge Function: `enrich-gmail-contacts` (modificación)

Mejorar el prompt para reforzar el filtro B2C:
- Agregar ejemplos explícitos de contactos a descartar: tiendas de retail, supermercados, apps de pago (MercadoPago, PayPal), delivery, suscripciones de consumo.
- Antes de llamar al Edge Function, el cliente verifica `ignored_senders` y excluye esos contactos del batch.

---

## UI: Nuevas secciones en el sidebar

### Sección "Servicios"
- Lista de servicios: nombre, precio, moneda, descripción opcional
- Acciones: agregar, editar, borrar
- No requiere keywords — la IA infiere del contexto

### Sección "Bloqueados"
- Tabla de contactos ignorados con columnas: plataforma, identificador, origen (IA / Manual), fecha
- Filtros: Todos / IA / Manual / Email / LinkedIn / Instagram
- Punto verde = manual, punto gris = IA
- Acción "Desbloquear" por fila
- Formulario inline para agregar: selector de plataforma + campo identificador
- Plataformas soportadas: Email, Dominio completo, LinkedIn, Instagram

### Panel de detalle del lead (modificación)
- Nueva sección "Servicios detectados" con lista de servicios y precios
- Valor total del lead visible arriba a la derecha
- El usuario puede agregar o quitar servicios manualmente (override de la IA)

---

## Cambios en `gmail-layer.jsx`

- **`_fetchContacts`**: al inicio, cargar `ignored_senders` del usuario desde Supabase. Filtrar contactos cuyo `email` o `domain` coincida con un registro `platform='email'` o `platform='domain'` antes de armar el batch para `enrich-gmail-contacts`.
- **`gmail_loadForContact`**: modificar para usar `format=minimal` (en lugar de `format=metadata`) e incluir el body de texto plano de cada mensaje. Retorna `messages` con campo `body` extraído del part `text/plain` del payload.
- **`gmail_fetchForHome`**: después de `matchEmailsToLeads`, por cada match: (1) llamar a `gmail_loadForContact` para obtener historial con bodies, (2) llamar a `analyze-lead` pasando historial + catálogo de servicios del usuario + etapa actual, (3) si `is_noise=true` descartar, (4) aplicar cambios de etapa y servicios en Supabase.
- **`analyze-lead` con `user_services` vacío**: si el usuario no configuró servicios aún, enviar `user_services: []`. La función devuelve `matched_services: []` y solo clasifica etapa y ruido.
- **`leads.data.services`**: siempre sobreescribir con el resultado de `analyze-lead`. `valor` = suma de `matched_services.map(id => catalog[id].price)`, o `0` si no hay servicios.

---

## Fuera de scope

- Integración con LinkedIn o Instagram para importar conversaciones (la sección "Bloqueados" solo guarda identificadores para ignorarlos, no sincroniza mensajes).
- Notificaciones push de movimientos de etapa.
- Historial de cambios de valor del pipeline.
