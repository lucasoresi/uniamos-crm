# Gmail Reply + Home All Emails — Design Spec

**Fecha**: 2026-05-13  
**Estado**: Aprobado

## Objetivo

Dos mejoras al módulo Gmail del CRM:

1. **Reply desde la app**: poder responder emails directamente desde el panel Gmail del CRM sin abrir Gmail en el browser.
2. **Home — todos los emails**: el dashboard Inicio muestra todos los emails del inbox, no solo los de leads conocidos.

---

## Feature 1: Reply desde Gmail en el CRM

### UX

Al seleccionar un email en el panel derecho del módulo Gmail, el preview muestra:

```
┌─────────────────────────────────────────┐
│ De: remitente@empresa.com               │
│ Asunto: Re: Web                         │
│ 12 mayo 2026, 10:21                     │
├─────────────────────────────────────────┤
│                                         │
│  [cuerpo del email / snippet]           │
│                                         │
│  [Abrir en Gmail ↗]  ← se mantiene     │
│                                         │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │ Escribe aquí...                 │    │
│  └─────────────────────────────────┘    │
│                              [Enviar →] │
└─────────────────────────────────────────┘
```

- Textarea simple, sin barra de herramientas ni formato rich text
- Placeholder: `"Responder a [Nombre del remitente]…"`
- Botón "Enviar" a la derecha (alineado al fondo del textarea)
- Al enviar: textarea se vacía, toast "Email enviado", botón deshabilitado durante el envío
- Si falla: toast de error, textarea conserva el texto para no perder el borrador

### OAuth

Agregar `https://www.googleapis.com/auth/gmail.send` al scope en `login.html`:

```javascript
scopes: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.readonly'
```

El usuario re-autoriza **una sola vez** la próxima vez que hace login con Google.

### Implementación — `gmail_sendReply(originalMsg, replyText)`

La función construye un email RFC 2822 y lo envía via Gmail API:

**Headers del reply:**
- `From`: email del usuario autenticado (de `currentUser.email`)
- `To`: valor del header `From` del email original (el remitente)
- `Subject`: `Re: {asunto original}` (si ya tiene "Re:" no se duplica)
- `In-Reply-To`: valor del header `Message-ID` del email original
- `References`: valor del header `Message-ID` del email original
- `Content-Type`: `text/plain; charset=utf-8`

**Endpoint Gmail API:**
```
POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send
Authorization: Bearer {token}
Content-Type: application/json

{
  "raw": "{base64url del email RFC 2822}",
  "threadId": "{threadId del email original}"
}
```

El `threadId` agrupa el reply en el mismo hilo en Gmail.

**Encoding:** El email completo se convierte a base64url (btoa → replace +/= con url-safe chars).

### Para obtener el body completo del email

Actualmente los mensajes se fetchan con `format=metadata` (solo headers + snippet). Para mostrar el body completo al seleccionar un email, cambiar el fetch de `gmail_selectMessage` a `format=full` o `format=raw` al hacer click.

Alternativa más simple: mostrar el snippet (como ahora) y en el reply usar solo el texto que el usuario escribe. El body completo **no es necesario** para enviar la respuesta — solo se necesita para quoted text, que es opcional.

**Decisión**: mostrar snippet en el preview (sin cambio), el reply es texto plano simple. Sin quoted text en esta fase.

### Fetch del body en `gmail_selectMessage`

Para mejorar el preview más allá del snippet, al seleccionar un mensaje hacer un fetch adicional con `format=full` para obtener el body real del email:

```
GET /gmail/v1/users/me/messages/{id}?format=full
```

Extraer el cuerpo del `payload.parts` (buscar `text/plain` primero, fallback a `text/html` → strip tags). Mostrar en el panel derecho en lugar del snippet.

---

## Feature 2: Home "Emails recientes" — feed de actividad de comunicaciones

### Concepto

La sección "Emails recientes" del Inicio se convierte en un **feed de actividad de comunicaciones**, similar a HubSpot/Pipedrive. Muestra todos los emails recientes (recibidos + enviados) sin filtrar por leads del CRM.

**Por qué también los enviados**: en los CRM reales el Home muestra toda la actividad reciente — enviar un email es una acción comercial igual de importante que recibirlo. Da contexto completo de qué está pasando.

**Diseñado para escalar**: la arquitectura del feed acepta futuras fuentes (LinkedIn recibidos, Instagram enviados/recibidos) agregando un nuevo tipo de ítem sin cambiar la estructura base.

### Cambio de lógica en `home_load()`

**Antes**:
1. Fetch inbox (30 mensajes)
2. Filtrar solo los que matchean leads del CRM
3. Clasificar con IA los matches
4. Mostrar solo los clasificados

**Después**:
1. Fetch inbox (30 recibidos) + fetch sent (20 enviados) en paralelo
2. Combinar, ordenar por fecha descendente
3. Para recibidos que matchean un lead: clasificar con IA (lógica existente, opcional)
4. Mostrar todos — sin filtro

```
INBOX (30) + SENT (20)
       ↓
Ordenar por fecha desc → top 30
       ↓
Para cada item:
  ├─ Si recibido y match lead → badge etapa CRM (opcional IA)
  ├─ Si recibido y no match  → badge "📧 Recibido"
  └─ Si enviado              → badge "📤 Enviado"
       ↓
home_render() → muestra todos
```

### UI de cada ítem en el feed

```
┌──────────────────────────────────────────────────────┐
│ [MA]  María Alejandro (recibido)            10:21 AM │
│       Re: Reunión del jueves                         │
│       📧 Recibido                                    │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ [→]   Para: cliente@empresa.com (enviado)   09:45 AM │
│       Propuesta comercial Q2                         │
│       📤 Enviado                                     │
└──────────────────────────────────────────────────────┘
```

- Recibidos: avatar del remitente (iniciales)
- Enviados: avatar con flecha `→`, muestra el destinatario
- Badge simple: `📧 Recibido` / `📤 Enviado` (sin clasificación IA para no-leads)
- Al hacer click: abre el email en Gmail (comportamiento actual)

### Eliminación de `home_classifyOne` del flujo principal

La clasificación IA (mover leads de etapa automáticamente) fue diseñada para el flujo "clasificar emails de leads existentes". Con el nuevo enfoque de mostrar todos los emails, esta clasificación automática se convierte en una función opcional que se puede invocar manualmente, no en el flujo de carga del Home.

**Razón**: clasificar con IA hasta 50 emails (30 inbox + 20 sent) sería costoso e innecesario. La auto-clasificación de etapas ya ocurre en `gmailSync_run()` al login.

### Stat "Emails nuevos" en Home

El contador `home-stat-emails` sigue mostrando emails no leídos del inbox. No cambia.

### Extensibilidad futura

Cuando se integre LinkedIn/Instagram, cada mensaje nuevo se agrega al mismo feed con su propio badge (`💼 LinkedIn` / `📸 Instagram`). La función `home_render()` recibe un array genérico de items con `{ type, from, to, subject, date, isRead }` — no está acoplada a Gmail.

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `login.html` | Agregar `gmail.send` al scope OAuth |
| `app.html` — `gmail_selectMessage()` | Agregar textarea + botón de reply + fetch de body completo |
| `app.html` — nueva función `gmail_sendReply()` | Enviar reply via Gmail API |
| `app.html` — `home_load()` | Fetch inbox + sent, combinar, ordenar por fecha, eliminar filtro de leads |
| `app.html` — `home_render()` | Feed genérico de comunicaciones: badge Recibido/Enviado, sin clasificación IA forzada |

---

## Lo que NO hace este feature

- No soporta adjuntos
- No tiene editor rich text (solo texto plano)
- No guarda borradores en Supabase
- No muestra emails enviados en el inbox (solo recibidos, como ahora)
- No integra LinkedIn ni otras plataformas (en roadmap futuro)
- No compone emails nuevos desde cero (solo responde a uno existente)
