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

## Feature 2: Home — mostrar todos los emails del inbox

### Cambio de lógica

**Antes**: `home_matchEmailsToLeads()` filtra y solo devuelve emails cuyo remitente existe como lead en el CRM.

**Después**: `home_render()` muestra **todos** los emails del inbox (hasta 30). Para cada email:
- Si el remitente coincide con un lead → muestra el badge de etapa CRM + resultado de clasificación IA (lógica actual)
- Si no coincide → muestra igualmente el email sin badge, con label "Nuevo contacto"

### Cambio en `home_load()`

La clasificación IA (`home_classifyOne`) solo se llama para emails que tienen match con un lead existente. Los demás se muestran sin clasificar (no tiene sentido gastar tokens en clasificar emails de desconocidos).

```
gmailInboxMessages (30 emails)
       ↓
┌─ Tiene match con lead ─────────────────┐
│  → classifyOne() → badge stage + IA   │
└────────────────────────────────────────┘
┌─ No tiene match ───────────────────────┐
│  → mostrar sin badge, label "Nuevo"   │
└────────────────────────────────────────┘
       ↓
home_render() → muestra todos
```

### UI del email sin match en Home

```
┌──────────────────────────────────────────────────────┐
│  [AV]  Ana Velázquez                        10:21 AM │
│        Re: Reunión del jueves                        │
│        ● Nuevo contacto                              │
└──────────────────────────────────────────────────────┘
```

- Badge gris/neutral: `● Nuevo contacto`
- Sin borde coloreado de etapa CRM
- Al hacer click: igual abre el email en Gmail (mismo comportamiento actual)

### Stat "Emails nuevos" en Home

El contador `home-stat-emails` ya muestra emails no leídos. No cambia.

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `login.html` | Agregar `gmail.send` al scope OAuth |
| `app.html` — `gmail_selectMessage()` | Agregar textarea + botón de reply + fetch de body completo |
| `app.html` — nueva función `gmail_sendReply()` | Enviar reply via Gmail API |
| `app.html` — `home_load()` | Eliminar filtro exclusivo de leads conocidos |
| `app.html` — `home_render()` | Renderizar todos los emails, badge diferenciado para no-leads |

---

## Lo que NO hace este feature

- No soporta adjuntos
- No tiene editor rich text (solo texto plano)
- No guarda borradores en Supabase
- No muestra emails enviados en el inbox (solo recibidos, como ahora)
- No integra LinkedIn ni otras plataformas (en roadmap futuro)
- No compone emails nuevos desde cero (solo responde a uno existente)
