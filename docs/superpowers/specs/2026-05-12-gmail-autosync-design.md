# Gmail Auto-Sync → CRM Pipeline

**Fecha**: 2026-05-12  
**Estado**: Aprobado

## Objetivo

Al hacer login con Google, la app escanea Gmail automáticamente (SENT + INBOX), extrae contactos reales de negocio, los analiza con Claude IA, y popula el CRM Pipeline con leads reales. En cada login posterior, actualiza leads existentes si detecta nueva actividad.

---

## Flujo general

```
Login con Google OAuth
       ↓
 app.html: crm_load() + prm_load()
       ↓
 gmailSync_run()  ← reemplaza autoSetupData()
       ↓
 Gmail API (client-side via getGoogleToken())
 ├── SENT: últimos 50 mensajes  (labelIds=SENT)
 └── INBOX: últimos 30 mensajes (labelIds=INBOX)
       ↓
 gmailSync_extractContacts()
 - extrae From/To/CC headers
 - agrupa por email address
 - filtra ruido (noreply, newsletters, notificaciones)
 - dominos personales (gmail.com, hotmail.com, yahoo.com) solo si 3+ intercambios
       ↓
 Edge Function: enrich-gmail-contacts (nuevo)
 - recibe hasta 40 contactos en batch
 - una sola llamada a Claude Haiku
 - devuelve array de lead objects
       ↓
 app.html: gmailSync_upsertLeads()
 - compara con leads existentes por email
 - inserta nuevos / actualiza existentes si hay cambio de señal
       ↓
 crm_renderBoard() + home_render()
```

---

## Componentes

### 1. `gmailSync_run()` — función principal (app.html)

Orquesta todo el sync. Se llama al inicio de sesión, después de `crm_load()` y `prm_load()`. Reemplaza la lógica de `autoSetupData()`.

**Pasos:**
1. Verifica que haya token de Gmail (`getGoogleToken()`). Si no hay, sale silenciosamente.
2. Muestra loading state en el panel de emails del Home: "Sincronizando Gmail con IA…"
3. Llama `gmailSync_fetchContacts()` → array de contactos únicos
4. Si 0 contactos, sale.
5. Llama Edge Function `enrich-gmail-contacts` con el batch
6. Llama `gmailSync_upsertLeads()` con los resultados
7. Re-renderiza board y home
8. Muestra toast: "X leads nuevos, Y actualizados desde Gmail"

### 2. `gmailSync_fetchContacts()` — extracción de contactos (app.html)

Llama Gmail API dos veces en paralelo:
- `GET /messages?labelIds=SENT&maxResults=50&format=metadata`
- `GET /messages?labelIds=INBOX&maxResults=30&format=metadata`

Headers a extraer: `From`, `To`, `Cc`, `Subject`, `Date`

Extrae y agrupa por email único:
```js
{
  email: "contact@company.com",
  name: "Nombre Apellido",          // del header From/To
  domain: "company.com",
  subjects: ["asunto1", "asunto2"], // hasta 3 asuntos más recientes
  sent_count: 3,                     // cuántos emails enviaste a este contacto
  received_count: 2                  // cuántos emails recibiste de este contacto
}
```

**Filtros de ruido** (excluir antes de mandar a IA):
- Emails que contienen: `noreply`, `no-reply`, `mailer-daemon`, `newsletter`, `notifications`, `donotreply`, `bounce`, `unsubscribe`
- Dominio propio del usuario (no auto-incluirse)
- Dominios personales (`gmail.com`, `hotmail.com`, `yahoo.com`, `outlook.com`) con menos de 3 intercambios totales

Máximo 40 contactos por batch (los de mayor `sent_count + received_count`).

### 3. Edge Function `enrich-gmail-contacts` (nuevo Supabase Edge Function)

**Endpoint**: `POST /functions/v1/enrich-gmail-contacts`  
**Auth**: Bearer JWT (Supabase auth, igual que `classify-email-lead`)

**Input:**
```json
{
  "contacts": [
    {
      "email": "ahmed@gabor.com.mx",
      "name": "Ahmed Becerril",
      "domain": "gabor.com.mx",
      "subjects": ["Propuesta CRM", "Seguimiento reunión"],
      "sent_count": 3,
      "received_count": 2
    }
  ]
}
```

**Proceso:**
1. Valida JWT → obtiene `user_id`
2. Construye un único prompt para Claude Haiku con todos los contactos en batch
3. Pide a Claude que para cada contacto determine:
   - ¿Es un lead de ventas B2B? (booleano)
   - `empresa`: nombre de la empresa (inferir del dominio si no está en el nombre)
   - `lead`: nombre del contacto
   - `estado`: `activa | propuesta | sininfo | frio` (basado en subjects y frecuencia)
   - `prioridad`: `urgente | alta | media | baja`
   - `notas`: 1 oración de contexto basada en los asuntos detectados
4. Devuelve solo los contactos clasificados como leads B2B

**Output:**
```json
{
  "leads": [
    {
      "empresa": "Gabor",
      "lead": "Ahmed Becerril",
      "email": "ahmed@gabor.com.mx",
      "domain": "gabor.com.mx",
      "estado": "activa",
      "prioridad": "alta",
      "notas": "Conversaciones sobre propuesta CRM detectadas"
    }
  ]
}
```

**Modelo**: Claude Haiku 4.5 (igual que `classify-email-lead`, rápido y barato)  
**Una sola llamada a la API** para todo el batch (máx 40 contactos).

### 4. `gmailSync_upsertLeads()` — deduplicación y guardado (app.html)

```
Para cada lead devuelto por la Edge Function:
  - Busca en array local `leads` si ya existe un lead con mismo email
  - Si NO existe → crea nuevo lead en Supabase (INSERT)
  - Si SÍ existe → compara estado/prioridad:
      - Si cambió → upsert con nuevos valores
      - Si igual → skip (no toca)
```

La búsqueda por email es case-insensitive. El campo `email` en `data JSONB` puede tener múltiples emails separados por comas/espacios — se parsea con split y trim.

---

## Cambios en app.html

### Eliminar `autoSetupData()`
La función de demo data se elimina. Si el usuario quiere datos de prueba, puede importar manualmente vía JSON en la sección API.

### Lógica de init modificada (línea ~1484)
```js
// Antes:
if(leads.length===0&&prospects.length===0){
  await autoSetupData();
}

// Después:
await gmailSync_run();
```

`gmailSync_run()` internamente maneja el caso de leads vacío vs. leads existentes.

### Loading state en Home
Mientras corre el sync, `home-emails-panel` muestra:
```
⏳ Sincronizando Gmail con IA… analizando contactos
```

---

## UX

- **Primer login**: "Encontramos X leads en tu Gmail" → pipeline poblado con datos reales
- **Logins posteriores**: sync silencioso, solo toast si hay cambios ("Y leads actualizados")
- **Sin token Gmail**: fallback al estado actual (mensaje "Gmail no conectado")
- **Error en Edge Function**: falla gracefully, pipeline queda con lo que había, sin mensaje de error visible al usuario (log en console)

---

## Lo que NO hace este feature

- No lee el contenido/body completo de los emails (solo metadata: From, To, Subject, Date)
- No crea prospectos en PRM (solo leads en CRM Pipeline)
- No maneja el Agent SDK (tarea futura para análisis profundo de threads)
- No importa contactos de Google Contacts/People API

---

## Cambios de infraestructura

| Qué | Acción |
|---|---|
| `supabase/functions/enrich-gmail-contacts/index.ts` | Crear nuevo |
| `app.html` — función `gmailSync_run()` | Agregar |
| `app.html` — función `gmailSync_fetchContacts()` | Agregar |
| `app.html` — función `gmailSync_upsertLeads()` | Agregar |
| `app.html` — `autoSetupData()` | Eliminar |
| `app.html` — bloque init (línea ~1484) | Modificar |
| Deploy Edge Function en Supabase | Ejecutar `supabase functions deploy` |

---

## Preguntas resueltas

- **¿Agent SDK?** No para esta fase. Claude API directo en batch es más simple, rápido y adecuado. El Agent SDK entraría en una fase futura de análisis profundo de threads completos.
- **¿Sync automático?** Sí, en cada login.
- **¿Fuentes?** SENT + INBOX.
- **¿Deduplicación?** Upsert por email — actualiza si hay cambio de señal.
