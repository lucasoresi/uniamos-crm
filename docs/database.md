# Base de datos — Uniamos CRM

## Setup inicial

1. Abrí **Supabase Dashboard → SQL Editor → New Query**
2. Pegá el contenido de `schema.sql` y ejecutá
3. Listo — el app detecta BD vacía y siembra datos demo automáticamente al primer login

---

## Tablas

### `leads` — CRM Pipeline

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | TEXT PK | ID único generado en el cliente |
| `user_id` | UUID FK | Usuario dueño del registro |
| `data` | JSONB | Todos los campos del lead |
| `updated_at` | TIMESTAMPTZ | Última modificación |

**Campos dentro de `data`:**

| Campo | Tipo JS | Valores posibles |
|---|---|---|
| `empresa` | string | Nombre de la empresa |
| `lead` | string | Nombre del contacto |
| `email` | string | Email del contacto |
| `tel` | string | Teléfono |
| `domain` | string | Dominio para logo (ej: `empresa.com`) |
| `gmailUrl` | string | URL del hilo de Gmail |
| `estado` | string | `cierre` · `propuesta` · `activa` · `ghost` · `frio` · `sininfo` |
| `prioridad` | string | `urgente` · `alta` · `media` · `baja` |
| `valor` | string | Valor estimado (ej: `$5,000 USD`) |
| `resumen` | string | Resumen de la conversación |
| `accion` | string | Próxima acción a tomar |
| `primerContacto` | string | Fecha primer contacto |
| `ultimoContacto` | string | Fecha último contacto (`YYYY-MM-DD` o `DD Mon YYYY`) |

---

### `prospects` — PRM (Prospect Relationship Management)

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | TEXT PK | ID único generado en el cliente |
| `user_id` | UUID FK | Usuario dueño del registro |
| `data` | JSONB | Todos los campos del prospecto |
| `updated_at` | TIMESTAMPTZ | Última modificación |

**Campos dentro de `data`:**

| Campo | Tipo JS | Valores posibles |
|---|---|---|
| `empresa` | string | Nombre de la empresa |
| `contacto` | string | Nombre del contacto |
| `email` | string | Email |
| `linkedin` | string | URL LinkedIn o teléfono |
| `cargo` | string | Cargo del contacto |
| `domain` | string | Dominio para logo |
| `canal` | string | `LinkedIn` · `Email frío` · `Referido` · `Inbound` · `Evento` · `Base de datos` · `WhatsApp` |
| `sector` | string | Industria (ej: Retail, Logística) |
| `pais` | string | País o ciudad |
| `prioridad` | string | `alta` · `media` · `baja` |
| `estado` | string | `nuevo` · `contactado` · `fu1` · `fu2` · `fu3` · `positivo` · `negativo` |
| `contexto` | string | Por qué es buen prospecto |
| `respuesta` | string | Última respuesta/interacción |
| `accion` | string | Próxima acción |
| `ultimoContacto` | string | Fecha último contacto (`YYYY-MM-DD`) |
| `fuLog` | array | `[{ type, text, date }]` — log de follow-ups |
| `historial` | array | Historial de eventos |

---

### `activities` — Timeline de actividad

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | BIGSERIAL PK | Auto-incremental |
| `user_id` | UUID FK | Usuario dueño |
| `entity_type` | TEXT | `'lead'` o `'prospect'` |
| `entity_id` | TEXT | ID del lead o prospecto |
| `type` | TEXT | Tipo de evento (ver abajo) |
| `data` | JSONB | Datos del evento |
| `created_at` | TIMESTAMPTZ | Timestamp automático |

**Tipos de evento (`type`):**

| Valor | Cuándo se usa |
|---|---|
| `stage_change` | El lead/prospecto cambia de etapa |
| `field_change` | Se edita un campo (email, contacto, etc.) |
| `note` | Se agrega una nota manual |
| `email` | Se registra un email enviado |
| `created` | El registro fue creado |
| `deleted` | El registro fue eliminado |
| `automation` | Disparado por una automatización |
| `prm` | Prospecto movido al CRM |

---

## Row Level Security

Todas las tablas tienen RLS activado. Cada usuario **solo puede leer y escribir sus propios registros** (filtrado por `user_id = auth.uid()`).

---

## Notas de diseño

- **JSONB schemaless**: Los campos de negocio van todos en la columna `data`. Esto permite agregar campos sin migraciones.
- **Upsert pattern**: El app usa `supabase.from(...).upsert({...})` para crear o actualizar en una sola operación.
- **IDs en el cliente**: Los IDs se generan con `uid()` en el browser (`Date.now() + random`), no en la BD.
- **Auto-setup**: Si la BD está vacía al primer login, el app inserta datos demo automáticamente.
