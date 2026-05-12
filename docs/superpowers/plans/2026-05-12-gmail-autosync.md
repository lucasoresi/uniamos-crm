# Gmail Auto-Sync → CRM Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al hacer login con Google, escanear Gmail (SENT + INBOX) automáticamente, analizar contactos con Claude IA, y popular el CRM Pipeline con leads reales — sin intervención manual.

**Architecture:** El cliente fetcha Gmail directamente usando el token OAuth existente, extrae contactos únicos, llama a una nueva Edge Function `enrich-gmail-contacts` que usa Claude Haiku para clasificarlos como leads B2B, y los hace upsert en Supabase. En primer login espera el sync; en logins posteriores corre en background.

**Tech Stack:** Vanilla JS, Supabase Edge Functions (Deno/TypeScript), Claude Haiku API, Gmail REST API v1

---

## Archivos a crear/modificar

| Acción | Archivo | Qué hace |
|---|---|---|
| Crear | `supabase/functions/enrich-gmail-contacts/index.ts` | Edge Function: recibe batch de contactos, llama Claude, devuelve lead objects |
| Modificar | `app.html` líneas 1484-1487 | Reemplaza `autoSetupData()` con `gmailSync_run()` |
| Modificar | `app.html` líneas 1498-1619 | Eliminar función `autoSetupData()` completa |
| Modificar | `app.html` después línea 4135 | Agregar `gmailSync_parseEmails()`, `gmailSync_fetchContacts()`, `gmailSync_upsertLeads()`, `gmailSync_run()` |

---

## Task 1: Edge Function `enrich-gmail-contacts`

**Files:**
- Create: `supabase/functions/enrich-gmail-contacts/index.ts`

- [ ] **Step 1: Crear el archivo de la Edge Function**

```typescript
// supabase/functions/enrich-gmail-contacts/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'

interface Contact {
  email: string
  name: string
  domain: string
  subjects: string[]
  sent_count: number
  received_count: number
}

interface Lead {
  email: string
  empresa: string
  lead: string
  domain: string
  estado: string
  prioridad: string
  notas: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  })
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  let contacts: Contact[] = []
  try {
    const body = await req.json()
    contacts = (body.contacts || []).slice(0, 40)
  } catch {
    return new Response(JSON.stringify({ leads: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (!contacts.length) {
    return new Response(JSON.stringify({ leads: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const contactLines = contacts.map((c, i) =>
    `${i + 1}. Email: ${c.email} | Nombre: ${c.name || '?'} | Dominio: ${c.domain} | Enviados: ${c.sent_count} | Recibidos: ${c.received_count} | Asuntos: ${c.subjects.slice(0, 3).join(' / ') || 'sin asuntos'}`
  ).join('\n')

  const prompt = `Sos un asistente de CRM experto en ventas B2B.

Analizá estos ${contacts.length} contactos extraídos de Gmail de un vendedor. Para cada uno determiná si es un prospecto/cliente B2B real.

Contactos:
${contactLines}

Devolvé SOLO un array JSON con los contactos que SÍ son leads B2B de ventas. Ignorá completamente:
- Newsletters, notificaciones automáticas, servicios (Slack, GitHub, Jira, Google, etc.)
- Emails de soporte técnico, facturación automática, alertas de sistema
- Contactos sin contexto de negocio claro

Para cada lead B2B incluí exactamente este formato:
{
  "email": "email exacto del contacto",
  "empresa": "nombre de la empresa (inferir del dominio si es necesario, ej: gabor.com.mx → Gabor)",
  "lead": "nombre del contacto",
  "domain": "dominio del email",
  "estado": "activa|propuesta|sininfo|frio",
  "prioridad": "urgente|alta|media|baja",
  "notas": "1 oración corta de contexto basada en los asuntos detectados"
}

Criterios de estado:
- "propuesta": asuntos mencionan propuesta, cotización, presupuesto, contrato
- "activa": sent_count + received_count >= 3, conversación bidireccional en curso
- "frio": solo 1 email, sin intercambio bidireccional real
- "sininfo": poco contexto, asuntos vagos o insuficientes

Criterios de prioridad:
- "urgente": 6+ intercambios totales o asuntos con urgencia explícita
- "alta": 3-5 intercambios o asuntos con propuesta/reunión
- "media": 2 intercambios
- "baja": 1 solo email

Respondé SOLO con el array JSON, sin texto adicional, sin markdown.`

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!anthropicRes.ok) {
      console.error('Anthropic error:', await anthropicRes.text())
      return new Response(JSON.stringify({ leads: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await anthropicRes.json()
    const text = data.content?.[0]?.text?.trim() || '[]'

    let leads: Lead[] = []
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      leads = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    } catch {
      leads = []
    }

    const VALID_STAGES = ['cierre', 'propuesta', 'activa', 'ghost', 'frio', 'sininfo']
    const VALID_PRIORITIES = ['urgente', 'alta', 'media', 'baja']

    leads = leads
      .filter((l): l is Lead => l !== null && typeof l === 'object' && typeof l.email === 'string' && l.email.includes('@'))
      .map(l => ({
        email: String(l.email).toLowerCase().trim().slice(0, 200),
        empresa: String(l.empresa || '').trim().slice(0, 200),
        lead: String(l.lead || '').trim().slice(0, 200),
        domain: String(l.domain || l.email.split('@')[1] || '').trim().slice(0, 200),
        estado: VALID_STAGES.includes(l.estado) ? l.estado : 'sininfo',
        prioridad: VALID_PRIORITIES.includes(l.prioridad) ? l.prioridad : 'media',
        notas: String(l.notas || '').trim().slice(0, 500),
      }))

    return new Response(JSON.stringify({ leads }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Unhandled error:', err)
    return new Response(JSON.stringify({ leads: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

- [ ] **Step 2: Deploy la Edge Function**

```bash
cd /mnt/c/Users/lucas/Desktop/uniamos-crm/uniamos-crm
npx supabase functions deploy enrich-gmail-contacts --project-ref llleoqfeluptmmbqluab
```

Resultado esperado: `Deployed Function enrich-gmail-contacts`

- [ ] **Step 3: Verificar que la función está disponible**

```bash
npx supabase functions list --project-ref llleoqfeluptmmbqluab
```

Resultado esperado: aparece `enrich-gmail-contacts` en la lista.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/enrich-gmail-contacts/index.ts
git commit -m "feat: add enrich-gmail-contacts Edge Function"
```

---

## Task 2: Helper `parseEmailAddresses()` en app.html

**Files:**
- Modify: `app.html` — agregar después de la línea 4135 (después de `gmail_fetchInbox()`)

Esta función convierte un header `To` o `From` como `"Nombre Apellido <email@domain.com>, Otro <otro@domain.com>"` en un array de objetos `{ email, name }`.

- [ ] **Step 1: Agregar `parseEmailAddresses()` después del cierre de `gmail_fetchInbox()` (después de la línea que dice `}` a continuación de `return { token, messages: [], error: true };`)**

Localizar en app.html el bloque:
```javascript
async function gmail_fetchInbox() {
```
...y al final de esa función, después del `}` de cierre, agregar:

```javascript

// ── GMAIL SYNC ────────────────────────────────────────────────────────────────
function gmailSync_parseEmails(headerValue) {
  if (!headerValue) return [];
  const results = [];
  headerValue.split(',').forEach(part => {
    part = part.trim();
    const bracketMatch = part.match(/<([^>]+)>/);
    const nameMatch = part.match(/^([^<]+)</) ;
    if (bracketMatch) {
      results.push({
        email: bracketMatch[1].toLowerCase().trim(),
        name: nameMatch ? nameMatch[1].trim().replace(/^"|"$/g, '') : ''
      });
    } else {
      const plain = part.match(/([^\s<>"]+@[^\s<>"]+)/);
      if (plain) results.push({ email: plain[1].toLowerCase().trim(), name: '' });
    }
  });
  return results;
}
```

- [ ] **Step 2: Verificar en browser console que la función existe**

Abrir `http://localhost:3000/app.html`, abrir DevTools → Console y ejecutar:
```javascript
gmailSync_parseEmails('"Ahmed Becerril" <ahmed@gabor.com.mx>, otro@empresa.com')
```
Resultado esperado:
```javascript
[
  { email: 'ahmed@gabor.com.mx', name: 'Ahmed Becerril' },
  { email: 'otro@empresa.com', name: '' }
]
```

---

## Task 3: `gmailSync_fetchContacts(token)` en app.html

**Files:**
- Modify: `app.html` — agregar después de `gmailSync_parseEmails()` (Task 2)

Fetcha SENT (50) + INBOX (30) desde Gmail API, extrae contactos únicos con metadata, filtra ruido.

- [ ] **Step 1: Agregar `gmailSync_fetchContacts()` inmediatamente después de `gmailSync_parseEmails()`**

```javascript
async function gmailSync_fetchContacts(token) {
  const NOISE = /noreply|no-reply|mailer-daemon|newsletter|notifications|donotreply|bounce|unsubscribe|postmaster|accounts-noreply|info@google|@googlegroups/i;
  const PERSONAL_DOMAINS = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'live.com', 'me.com'];
  const myEmail = (currentUser?.email || '').toLowerCase();

  // Step 1: fetch message ID lists in parallel
  const [sentData, inboxData] = await Promise.all([
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=SENT&maxResults=50',
      { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({})),
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=30',
      { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({}))
  ]);

  const allRefs = [
    ...(sentData.messages || []).map(m => ({ id: m.id, source: 'sent' })),
    ...(inboxData.messages || []).map(m => ({ id: m.id, source: 'inbox' }))
  ];

  if (!allRefs.length) return [];

  // Step 2: fetch metadata for each message in parallel
  const msgResults = await Promise.allSettled(
    allRefs.map(({ id, source }) =>
      fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata` +
        `&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then(r => r.json()).then(msg => ({ ...msg, _source: source }))
    )
  );

  const messages = msgResults
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  // Step 3: build contact map
  const contactMap = new Map();

  messages.forEach(msg => {
    const headers = msg.payload?.headers || [];
    const get = name => headers.find(h => h.name === name)?.value || '';
    const subject = get('Subject');
    const source = msg._source;

    const rawAddresses = source === 'sent'
      ? get('To') + (get('Cc') ? ',' + get('Cc') : '')
      : get('From');

    gmailSync_parseEmails(rawAddresses).forEach(({ email, name }) => {
      if (!email || email === myEmail) return;
      if (NOISE.test(email)) return;

      const domain = email.split('@')[1] || '';

      if (!contactMap.has(email)) {
        contactMap.set(email, { email, name: name || '', domain, subjects: [], sent_count: 0, received_count: 0 });
      }

      const c = contactMap.get(email);
      if (source === 'sent') c.sent_count++;
      else c.received_count++;
      if (subject && c.subjects.length < 3 && !c.subjects.includes(subject)) c.subjects.push(subject);
      if (!c.name && name) c.name = name;
    });
  });

  // Step 4: filter and rank — top 40 by total interactions
  return Array.from(contactMap.values())
    .filter(c => {
      const total = c.sent_count + c.received_count;
      if (PERSONAL_DOMAINS.includes(c.domain) && total < 3) return false;
      return true;
    })
    .sort((a, b) => (b.sent_count + b.received_count) - (a.sent_count + a.received_count))
    .slice(0, 40);
}
```

- [ ] **Step 2: Verificar en browser que fetcha contactos reales**

En DevTools Console (con la sesión de Gmail activa):
```javascript
const token = await getGoogleToken();
const contacts = await gmailSync_fetchContacts(token);
console.table(contacts);
```
Resultado esperado: tabla con contactos reales extraídos de SENT + INBOX, sin noreply ni newsletters.

---

## Task 4: `gmailSync_upsertLeads(enrichedLeads)` en app.html

**Files:**
- Modify: `app.html` — agregar después de `gmailSync_fetchContacts()`

Toma el array de leads devuelto por la Edge Function y hace upsert en Supabase. Nuevos se insertan, existentes se actualizan si hay cambio de `estado` o `prioridad`.

- [ ] **Step 1: Agregar `gmailSync_upsertLeads()` inmediatamente después de `gmailSync_fetchContacts()`**

```javascript
async function gmailSync_upsertLeads(enrichedLeads) {
  let created = 0, updated = 0;

  // Build email → existing lead lookup
  const existingByEmail = {};
  leads.forEach(l => {
    (l.data.email || '').toLowerCase().split(/[,;\s]+/).map(e => e.trim()).filter(Boolean)
      .forEach(e => { existingByEmail[e] = l; });
  });

  const toInsert = [];
  const toUpdate = [];

  enrichedLeads.forEach(newLead => {
    const key = (newLead.email || '').toLowerCase().trim();
    const existing = existingByEmail[key];

    if (!existing) {
      toInsert.push({
        id: uid(),
        user_id: currentUser.id,
        data: newLead,
        updated_at: new Date().toISOString()
      });
    } else {
      const stateChanged = existing.data.estado !== newLead.estado;
      const priorityChanged = existing.data.prioridad !== newLead.prioridad;
      if (stateChanged || priorityChanged) {
        const updatedRow = {
          id: existing.id,
          user_id: currentUser.id,
          data: {
            ...existing.data,
            estado: newLead.estado,
            prioridad: newLead.prioridad,
            notas: existing.data.notas || newLead.notas
          },
          updated_at: new Date().toISOString()
        };
        toUpdate.push(updatedRow);
      }
    }
  });

  if (toInsert.length) {
    const { error } = await supabase.from('leads').insert(toInsert);
    if (!error) {
      leads.push(...toInsert);
      created = toInsert.length;
    } else {
      console.error('gmailSync insert error:', error);
    }
  }

  if (toUpdate.length) {
    await Promise.allSettled(toUpdate.map(row => supabase.from('leads').upsert(row)));
    toUpdate.forEach(row => {
      const idx = leads.findIndex(l => l.id === row.id);
      if (idx >= 0) leads[idx] = row;
    });
    updated = toUpdate.length;
  }

  return { created, updated };
}
```

---

## Task 5: `gmailSync_run()` orchestrador en app.html

**Files:**
- Modify: `app.html` — agregar después de `gmailSync_upsertLeads()`

Orquesta el sync completo. Muestra loading en el panel de emails durante la operación.

- [ ] **Step 1: Agregar variable de estado y `gmailSync_run()` después de `gmailSync_upsertLeads()`**

```javascript
let gmailSyncRunning = false;

async function gmailSync_run() {
  if (gmailSyncRunning) return;
  gmailSyncRunning = true;

  const emailsEl = document.getElementById('home-emails-panel');

  try {
    const token = await getGoogleToken();
    if (!token) { gmailSyncRunning = false; return; }

    if (emailsEl) emailsEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3);font-size:.82rem">⏳ Escaneando Gmail…</div>';

    const contacts = await gmailSync_fetchContacts(token);
    if (!contacts.length) { gmailSyncRunning = false; return; }

    if (emailsEl) emailsEl.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-3);font-size:.82rem">⏳ Analizando ${contacts.length} contactos con IA…</div>`;

    const { data: { session } } = await supabase.auth.getSession();
    const jwt = session?.access_token;
    if (!jwt) { gmailSyncRunning = false; return; }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/enrich-gmail-contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
      body: JSON.stringify({ contacts })
    });

    if (!res.ok) {
      console.error('enrich-gmail-contacts error:', res.status);
      gmailSyncRunning = false;
      return;
    }

    const { leads: enrichedLeads } = await res.json();
    if (!enrichedLeads?.length) { gmailSyncRunning = false; return; }

    const { created, updated } = await gmailSync_upsertLeads(enrichedLeads);

    crm_renderBoard();

    if (created > 0 || updated > 0) {
      const parts = [];
      if (created > 0) parts.push(`${created} leads nuevos`);
      if (updated > 0) parts.push(`${updated} actualizados`);
      showToast(`Gmail sincronizado: ${parts.join(', ')}`);
    }

  } catch (e) {
    console.error('Gmail sync error:', e);
  }

  gmailSyncRunning = false;
}
```

---

## Task 6: Modificar el bloque init en app.html

**Files:**
- Modify: `app.html` líneas 1484–1487

Reemplaza la lógica de `autoSetupData()` con `gmailSync_run()`. En primer login (CRM vacío) espera el sync. En logins posteriores, lo lanza en background para no bloquear la UI.

- [ ] **Step 1: Reemplazar bloque líneas 1484-1487**

Localizar este bloque exacto:
```javascript
    // Check if database is empty and run auto-setup
    if(leads.length===0&&prospects.length===0){
      await autoSetupData();
    }
```

Reemplazarlo con:
```javascript
    // Sync leads from Gmail — await on first login, background on subsequent
    if (leads.length === 0) {
      await gmailSync_run();
    } else {
      gmailSync_run();
    }
```

- [ ] **Step 2: Verificar en browser (primer login con CRM vacío)**

1. En Supabase Table Editor, borrar todos los rows de `leads` y `prospects` para tu `user_id`
2. Recargar `http://localhost:3000/app.html`
3. Resultado esperado:
   - Panel de emails muestra "⏳ Escaneando Gmail…" → "⏳ Analizando X contactos con IA…"
   - CRM Pipeline se puebla con contactos reales
   - Toast: "Gmail sincronizado: X leads nuevos"

- [ ] **Step 3: Verificar en browser (login con CRM ya poblado)**

Recargar la app sin borrar leads. Resultado esperado:
   - CRM Pipeline muestra inmediatamente los leads existentes
   - En background se corre el sync (si hay cambios, toast aparece unos segundos después)

---

## Task 7: Eliminar `autoSetupData()` de app.html

**Files:**
- Modify: `app.html` líneas 1498–1619

La función ya no se usa. Eliminarla completa.

- [ ] **Step 1: Eliminar la función `autoSetupData()` completa**

Localizar y eliminar desde:
```javascript
async function autoSetupData(){
```
hasta el `}` de cierre de esa función (aproximadamente líneas 1498–1619, incluyendo la línea en blanco antes).

- [ ] **Step 2: Verificar que no queden referencias a `autoSetupData`**

```bash
grep -n "autoSetupData" /mnt/c/Users/lucas/Desktop/uniamos-crm/uniamos-crm/app.html
```

Resultado esperado: sin resultados.

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "feat: replace autoSetupData with Gmail auto-sync on login"
```

---

## Task 8: Verificación end-to-end en browser

- [ ] **Step 1: Arrancar el servidor local**

```bash
cd /mnt/c/Users/lucas/Desktop/uniamos-crm/uniamos-crm
python3 -m http.server 3000
```

- [ ] **Step 2: Test flujo completo — primer login**

1. Borrar leads/prospects de Supabase para el usuario de prueba
2. Abrir `http://localhost:3000/app.html` con sesión de Google activa
3. Verificar en DevTools Network tab:
   - Request a `gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=SENT`
   - Request a `gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX`
   - Request a `llleoqfeluptmmbqluab.supabase.co/functions/v1/enrich-gmail-contacts`
4. Verificar respuesta de la Edge Function (status 200, body con array `leads`)
5. Verificar que el CRM Pipeline tiene cards con empresas/contactos reales
6. Verificar que Supabase Table Editor muestra los nuevos rows en `leads`

- [ ] **Step 3: Test flujo — login con datos existentes**

1. Recargar la app (sin borrar leads)
2. Verificar que el pipeline carga inmediatamente
3. Verificar en console que `gmailSync_run()` corrió en background

- [ ] **Step 4: Test fallback — sin token Gmail**

1. En DevTools Application → Session Storage → borrar `gtoken` y `gtoken_expires`
2. Borrar la row de `google_tokens` en Supabase para el usuario
3. Recargar app
4. Resultado esperado: pipeline carga con datos existentes, sin error visible, sin crash

- [ ] **Step 5: Commit final**

```bash
git add .
git commit -m "feat: gmail auto-sync populates CRM pipeline on login"
```

---

## Notas de implementación

- La Edge Function usa `ANTHROPIC_API_KEY` ya configurado en el proyecto Supabase (usado por `classify-email-lead`). No requiere variables de entorno adicionales.
- `gmailSync_fetchContacts` hace hasta 80 requests paralelas a Gmail API (50 SENT + 30 INBOX). Gmail permite hasta 250 quota units por segundo — esto está dentro del límite.
- El filtro de ruido (`NOISE` regex) puede ajustarse si se cuelan dominios de servicios automáticos.
- Si `enrich-gmail-contacts` devuelve `[]` (todos filtrados por Claude como no-B2B), la función sale silenciosamente sin afectar los leads existentes.
