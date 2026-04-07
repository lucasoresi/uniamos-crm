# Timeline de Actividades — Design Spec

## Resumen

Agregar un sistema de timeline de actividades al CRM que registre automaticamente todas las interacciones con leads y prospectos, mas notas manuales. Inspirado en Clientify, HubSpot y Pipedrive.

**Enfoque:** Hibrido progresivo (Enfoque C)
- Fase 1: Timeline en panel de detalle + auto-logging basico
- Fase 2: Badge de actividad reciente en cards del kanban
- Fase 3: Vista global de actividad (si se necesita)

## Base de datos

Nueva tabla `activities` en Supabase. Schema completo en `docs/superpowers/specs/2026-03-31-activities-schema.md`.

Resumen:
- `id` UUID PK
- `user_id` UUID FK auth.users
- `entity_type` TEXT ('lead' | 'prospect')
- `entity_id` TEXT (FK al lead/prospect)
- `type` TEXT (tipo de actividad)
- `data` JSONB (detalles variables)
- `created_at` TIMESTAMPTZ
- RLS: solo el owner ve sus actividades
- Indices en (entity_type, entity_id), user_id, created_at DESC

## Tipos de actividad

### Fase 1 (core)
| Tipo | Trigger | Auto/Manual |
|---|---|---|
| `created` | Se crea un lead/prospecto | Auto |
| `deleted` | Se elimina un lead/prospecto | Auto |
| `stage_change` | Se mueve entre columnas del kanban (drag & drop o edicion) | Auto |
| `note` | Usuario escribe nota con subtipo (llamada/reunion/nota/tarea) | Manual |

### Fase 2 (comunicacion)
| Tipo | Trigger | Auto/Manual |
|---|---|---|
| `email_sent` | Se usa boton Gmail/email del CRM | Auto |
| `calendar_event` | Se crea evento de Google Calendar desde el CRM | Auto |
| `prm_to_crm` | Se promueve prospecto a lead CRM | Auto |

### Fase 3 (avanzado)
| Tipo | Trigger | Auto/Manual |
|---|---|---|
| `field_change` | Se editan campos: prioridad, valor, contacto, estado | Auto |
| `automation` | Regla automatica modifica el lead (ghost, escalado) | Auto |

## UI — Panel de Detalle

El panel lateral slide-in (580px) existente se modifica para tener tabs.

### Tabs
- **Datos**: contenido actual del panel (campos, badges, acciones)
- **Actividad**: nuevo timeline

### Timeline (tab Actividad)
- Lista cronologica descendente (mas reciente arriba)
- Cada entry:
  - Icono circular coloreado por tipo (28x28px)
  - Titulo en negrita (ej: "Movido a Propuesta")
  - Subtitulo gris (ej: "desde Activa . Auto")
  - Timestamp relativo a la derecha ("hace 2h", "ayer", "28 mar")
  - Separador 1px entre entries
- Colores de iconos por tipo:
  - Stage change: lime/verde (#C4E538) con icono flecha
  - Email: azul con icono sobre
  - Nota/llamada: naranja con icono segun subtipo
  - Field change: gris con icono lapiz
  - Created: verde con icono +
  - Deleted: rojo con icono x
  - Automation: amarillo con icono engranaje
  - PRM to CRM: lime con icono promocion

### Filtros
- Pills horizontales arriba del timeline
- Opciones: Todos | Notas | Emails | Cambios
- "Todos" activo por default (highlight lime)
- Click en pill filtra el timeline en memoria (no recarga de DB)

### Input de nota manual
- Fijo en la parte inferior del panel (sticky bottom)
- Selector de subtipo: pills (Llamada / Reunion / Nota / Tarea)
- Input de texto + boton "Enviar"
- Al enviar: inserta en tabla activities + actualiza timeline en vivo
- Subtipo activo tiene fondo naranja, los demas gris

## UI — Badge en Cards del Kanban (Fase 2)

- Chip pequeno en el footer de cada card
- Muestra ultima actividad: "hace 3h: email" o "ayer: llamada"
- Color sutil, no compite con badges de prioridad/pais existentes
- Se calcula al renderizar el board consultando la actividad mas reciente por entity_id

## Funciones JS a modificar en app.html

### Nuevas funciones
- `activity_log(entityType, entityId, type, data)` — funcion central para insertar actividad en Supabase
- `activity_loadTimeline(entityType, entityId, filter)` — carga actividades de un lead/prospecto
- `activity_renderTimeline(activities)` — renderiza la lista en el panel
- `activity_addNote(entityType, entityId)` — handler del input de nota manual
- `activity_formatTime(date)` — formato relativo ("hace 2h", "ayer", "25 mar")

### Funciones existentes a modificar (para auto-logging)

**Fase 1:**
- `crm_saveNewLead()` — agregar `activity_log('lead', id, 'created', {...})`
- `prm_saveNewProspect()` — agregar `activity_log('prospect', id, 'created', {...})`
- `crm_deleteLead()` — agregar `activity_log` antes del delete
- `prm_deleteProspect()` — agregar `activity_log` antes del delete
- `crm_dropCard()` — agregar `activity_log('lead', id, 'stage_change', {from, to})`
- `crm_saveDetail()` — detectar cambio de estado, loguear stage_change
- `prm_saveDetail()` — idem para prospectos
- `crm_openDetail()` — agregar tabs Datos/Actividad, cargar timeline
- `prm_openDetail()` — idem

**Fase 2:**
- `crm_sendEmail()` — agregar `activity_log('lead', id, 'email_sent', {to, subject})`
- `crm_quickEmail()` — idem
- `crm_quickCalendar()` — agregar `activity_log('lead', id, 'calendar_event', {title, date})`
- `prm_moverAlCRM()` / `prm_confirmarMoverAlCRM()` — agregar `activity_log` para prm_to_crm

**Fase 3:**
- `crm_saveDetail()` — comparar campos antes/despues, loguear field_change por cada campo modificado
- `prm_saveDetail()` — idem
- `automation_runAll()` — loguear cada cambio automatico con tipo automation

### HTML a modificar
- Panel de detalle CRM (`crm_detailOverlay`): agregar tabs + contenedor timeline + input nota
- Panel de detalle PRM (`prm_detailOverlay`): idem
- Cards del kanban (Fase 2): agregar badge de ultima actividad en `.card-foot`

## Patron de auto-logging

Todas las funciones que modifican datos llaman a `activity_log()` de forma fire-and-forget (no bloquea la operacion principal):

```javascript
// Ejemplo: al mover un lead de etapa
async function crm_dropCard(e, stageId) {
  // ... logica existente de mover el lead ...

  // Auto-log (fire and forget)
  activity_log('lead', leadId, 'stage_change', {
    from: oldStage,
    to: stageId
  });
}
```

`activity_log` hace el insert en Supabase y si el panel de detalle esta abierto para ese lead, actualiza el timeline en vivo. Si el insert falla, se ignora silenciosamente (console.warn) — las actividades son auxiliares y no deben bloquear operaciones del CRM.

## Restricciones

- No se agregan dependencias externas (ni librerias de charts, ni moment.js)
- Todo el codigo va inline en app.html siguiendo el patron existente
- La variable del cliente Supabase es `supabase` (no `sb`)
- Los timestamps relativos se calculan con JS nativo
- El timeline se carga con query a Supabase cada vez que se abre el panel (no cache local)
- Las actividades de leads eliminados se mantienen en la DB (soft reference)

## Mockup de referencia

El mockup visual aprobado esta en `.superpowers/brainstorm/7764-1774914718/content/03-timeline-mockup.html`
