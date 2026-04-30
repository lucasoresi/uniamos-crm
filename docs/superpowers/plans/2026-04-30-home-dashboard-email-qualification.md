# Home Dashboard + Email Auto-Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Home Dashboard as the default landing view with real-time stats, AI-classified emails, and automatic lead stage movements; plus an inbox drawer on the CRM kanban.

**Architecture:** Client fetches Gmail inbox + Supabase leads in parallel → matches by sender email → calls new Edge Function `classify-email-lead` (Claude Haiku API, server-side) for each match → upserts changed stages → renders Home Dashboard and CRM drawer. All logic lives in `app.html`; the Edge Function mirrors the existing `refresh-google-token` pattern.

**Tech Stack:** Vanilla JS (no build), Supabase Edge Functions (Deno), Anthropic Claude API (`claude-haiku-4-5-20251001`), Gmail API (existing), Supabase JS client (existing).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/functions/classify-email-lead/index.ts` | **Create** | Receives email metadata + current stage, calls Claude, returns new stage |
| `app.html` (CSS, lines 1–524) | **Modify** | Add `.home-stat-card`, `.crm-drawer-card` CSS rules |
| `app.html` (HTML, before line 583) | **Modify** | Add `#view-home` HTML block |
| `app.html` (HTML, lines 593–596) | **Modify** | Add drawer toggle button to CRM topbar |
| `app.html` (HTML, after line 596) | **Modify** | Add `#crm-inbox-drawer` HTML block |
| `app.html` (sidebar, around line 534) | **Modify** | Add `nav-home` sidebar item |
| `app.html` (JS, around line 3726) | **Modify** | Extract `gmail_fetchInbox()` from `gmail_loadInbox()` |
| `app.html` (JS, before line 1597) | **Modify** | Add `home_load()`, `home_matchEmailsToLeads()`, `home_classifyOne()`, `home_render()` |
| `app.html` (JS, lines 1597–1621) | **Modify** | Add `'home'` case to `switchView()`, change default to `switchView('home')` |
| `app.html` (JS, line 1662) | **Modify** | Add `crm_drawer_render()`, `crm_drawer_toggle()`, kanban badge |

---

## Task 1: Create Edge Function `classify-email-lead`

**Files:**
- Create: `supabase/functions/classify-email-lead/index.ts`

- [ ] **Step 1: Create the Edge Function file**

```typescript
// supabase/functions/classify-email-lead/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Verify JWT belongs to a real user
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  })
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  let subject = '', snippet = '', current_stage = 'sininfo', lead_name = 'Lead'
  try {
    const body = await req.json()
    subject = body.subject || ''
    snippet = body.snippet || ''
    current_stage = body.current_stage || 'sininfo'
    lead_name = body.lead_name || 'Lead'
  } catch {
    return new Response(JSON.stringify({ new_stage: current_stage, signal: 'neutral', reason: '' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (!subject && !snippet) {
    return new Response(JSON.stringify({ new_stage: current_stage, signal: 'neutral', reason: 'Sin contenido para analizar' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const prompt = `Eres un asistente de CRM. Basándote en este email, clasificá la etapa de ventas del lead.

Lead: ${lead_name}
Asunto del email: ${subject}
Fragmento del email: ${snippet}
Etapa actual: ${current_stage}

Etapas disponibles: cierre, propuesta, activa, ghost, frio, sininfo

Definiciones:
- cierre: el lead confirmó interés en cerrar o contratar
- propuesta: el lead pidió una propuesta o está evaluando una
- activa: conversación activa, preguntas, engagement claro
- ghost: sin respuesta por 14+ días
- frio: desinterés explícito o silencio muy prolongado
- sininfo: no hay suficiente información

Respondé SOLO en JSON válido, sin texto adicional:
{"new_stage": "...", "signal": "hot|warm|cold|neutral", "reason": "..."}

Reglas:
- Solo cambiá la etapa si el email claramente lo justifica
- Si hay duda o el email es rutinario, devolvé la etapa actual sin cambios
- reason debe ser 1 oración corta en español`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      console.error('Anthropic error:', await res.text())
      return new Response(JSON.stringify({ new_stage: current_stage, signal: 'neutral', reason: 'Error al consultar IA' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await res.json()
    const text = data.content?.[0]?.text?.trim() || ''

    let parsed: { new_stage?: string; signal?: string; reason?: string } = {}
    try { parsed = JSON.parse(text) } catch {
      return new Response(JSON.stringify({ new_stage: current_stage, signal: 'neutral', reason: 'Respuesta IA inválida' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const validStages = ['cierre', 'propuesta', 'activa', 'ghost', 'frio', 'sininfo']
    const validSignals = ['hot', 'warm', 'cold', 'neutral']
    const new_stage = validStages.includes(parsed.new_stage || '') ? parsed.new_stage! : current_stage
    const signal = validSignals.includes(parsed.signal || '') ? parsed.signal! : 'neutral'
    const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : ''

    return new Response(JSON.stringify({ new_stage, signal, reason }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('Unhandled error:', err)
    return new Response(JSON.stringify({ new_stage: current_stage, signal: 'neutral', reason: 'Error interno' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

- [ ] **Step 2: Deploy via Supabase MCP and set secret**

In Claude Code, use the Supabase MCP tools:
1. Deploy the function: `mcp__supabase__deploy_edge_function` with name `classify-email-lead`
2. Set the secret via Supabase Dashboard → Project Settings → Edge Functions → Secrets → add `ANTHROPIC_API_KEY` with your Anthropic API key (from console.anthropic.com)

- [ ] **Step 3: Smoke-test the deployed function**

Get a JWT from the browser: open `app.html`, open DevTools → Console, run:
```javascript
(await supabase.auth.getSession()).data.session.access_token
```
Copy the token, then run from terminal (replace `YOUR_JWT` and project URL):
```bash
curl -X POST https://llleoqfeluptmmbqluab.supabase.co/functions/v1/classify-email-lead \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"subject":"Re: Propuesta de servicio","snippet":"Perfecto, me interesa avanzar con esto. ¿Cuándo podemos firmar?","current_stage":"frio","lead_name":"Juan Pérez"}'
```

Expected response:
```json
{"new_stage":"cierre","signal":"hot","reason":"El lead confirmó interés en avanzar y preguntó por el cierre."}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/classify-email-lead/index.ts
git commit -m "feat: add classify-email-lead Edge Function (Claude Haiku)"
```

---

## Task 2: Extract `gmail_fetchInbox()` from `gmail_loadInbox()`

**Files:**
- Modify: `app.html` (lines 3726–3792)

`gmail_loadInbox()` currently mixes fetching and DOM rendering. We need a pure `gmail_fetchInbox()` that returns raw data so `home_load()` can reuse it.

- [ ] **Step 1: Add `gmail_fetchInbox()` immediately before `gmail_loadInbox()` (before line 3730)**

Locate the comment `// ── GMAIL INBOX ──` (line 3726) and insert this function right after the `escHtml` and `gmailInboxMessages` declarations (after line 3728):

```javascript
async function gmail_fetchInbox() {
  const token = await getGoogleToken();
  if (!token) return { token: null, messages: [] };
  try {
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=30',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (listRes.status === 401) {
      sessionStorage.removeItem('gtoken');
      sessionStorage.removeItem('gtoken_expires');
      return { token: null, messages: [] };
    }
    const listData = await listRes.json();
    const msgs = listData.messages || [];
    if (!msgs.length) return { token, messages: [] };
    const results = await Promise.allSettled(msgs.map(m =>
      fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata` +
        `&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then(r => r.json())
    ));
    return { token, messages: results.filter(r => r.status === 'fulfilled').map(r => r.value) };
  } catch {
    return { token, messages: [] };
  }
}
```

- [ ] **Step 2: Replace the body of `gmail_loadInbox()` to call `gmail_fetchInbox()`**

Replace the entire `gmail_loadInbox` function body (everything from `async function gmail_loadInbox()` to its closing `}`) with:

```javascript
async function gmail_loadInbox() {
  const listEl = document.getElementById('gmail-email-list');
  const previewEl = document.getElementById('gmail-preview-panel');
  if (!listEl || !previewEl) return;
  listEl.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-3)">⏳ Cargando inbox…</div>';
  previewEl.innerHTML = '<div style="color:var(--text-3);font-size:.84rem;margin-top:60px">Seleccioná un email para ver el preview</div>';
  document.getElementById('gmail-search').value = '';

  const { token, messages } = await gmail_fetchInbox();

  if (!token) {
    listEl.innerHTML = `<div class="gmail-no-token" style="margin:20px">
      <div style="font-size:1.4rem;margin-bottom:8px">📧</div>
      <strong>Gmail no conectado</strong><br>
      Ingresá con tu cuenta de Google para ver tu inbox.<br>
      <a href="login.html" style="color:#C4E538;display:inline-block;margin-top:10px;font-weight:700">Ir al login →</a>
    </div>`;
    return;
  }
  if (!messages.length) {
    listEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3)">No hay emails en el inbox</div>';
    return;
  }
  gmailInboxMessages = messages;
  gmail_renderList(messages);
  gmail_updateUnreadBadge(messages);
}
```

- [ ] **Step 3: Verify Gmail view still works**

Open `http://localhost:3000/app.html` → navigate to Gmail view → inbox loads exactly as before.

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "refactor: extract gmail_fetchInbox() from gmail_loadInbox()"
```

---

## Task 3: Add Home view CSS and HTML to `app.html`

**Files:**
- Modify: `app.html` (CSS around line 524, HTML before line 583)

- [ ] **Step 1: Add CSS before the closing `</style>` tag (line 524)**

Insert these rules immediately before `</style>`:

```css
/* ── HOME DASHBOARD ── */
.home-stat-card{flex:1;background:#161616;border:1px solid var(--border);border-radius:7px;padding:8px 10px;min-width:0}
.home-stat-label{font-size:.52rem;color:var(--text-3);margin-bottom:3px;white-space:nowrap}
.home-stat-value{font-size:1.1rem;font-weight:800;color:var(--text)}
.home-stat-value.lime{color:#C4E538}
.home-stat-value.red{color:#ef4444}
/* ── CRM INBOX DRAWER ── */
#crm-inbox-drawer{background:#0e1410;border-bottom:2px solid rgba(196,229,56,.15);padding:8px 12px;display:flex;gap:8px;overflow-x:auto;flex-shrink:0}
#crm-inbox-drawer.drawer-hidden{display:none}
.crm-drawer-card{flex-shrink:0;width:176px;background:#141f14;border:1px solid rgba(196,229,56,.12);border-radius:6px;padding:7px 9px;cursor:default}
.crm-drawer-card.plain{background:#161616;border-color:var(--border)}
.crm-drawer-name{font-size:.6rem;font-weight:700;color:#eee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.crm-drawer-name.dim{color:#888;font-weight:400}
.crm-drawer-subj{font-size:.56rem;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:2px 0 4px}
.crm-drawer-auto{font-size:.46rem;background:rgba(196,229,56,.1);color:#C4E538;padding:1px 5px;border-radius:2px;white-space:nowrap}
```

- [ ] **Step 2: Add `#view-home` HTML block immediately before `<!-- CRM VIEW -->` (line 583)**

Insert the following block before the line `<!-- CRM VIEW -->`:

```html
<!-- HOME VIEW -->
<div id="view-home" class="view" style="display:none">
<div class="main" style="display:flex;flex-direction:column;flex:1;overflow:hidden">
  <div class="topbar">
    <div class="topbar-breadcrumb">🏠 Inicio</div>
    <div class="topbar-divider"></div>
    <span id="home-date" style="font-size:.72rem;color:var(--text-3);margin-left:auto"></span>
    <button onclick="home_load()" style="margin-left:12px;background:none;border:1px solid var(--border);color:var(--text-2);padding:5px 14px;border-radius:6px;font-size:.78rem;cursor:pointer;font-family:inherit">↻ Actualizar</button>
  </div>
  <div style="display:flex;gap:8px;padding:12px 16px 8px;flex-shrink:0">
    <div class="home-stat-card"><div class="home-stat-label">Pipeline total</div><div class="home-stat-value lime" id="home-stat-pipeline">—</div></div>
    <div class="home-stat-card"><div class="home-stat-label">Leads activos</div><div class="home-stat-value" id="home-stat-activos">0</div></div>
    <div class="home-stat-card"><div class="home-stat-label">Emails nuevos</div><div class="home-stat-value lime" id="home-stat-emails">0</div></div>
    <div class="home-stat-card"><div class="home-stat-label">Follow-ups</div><div class="home-stat-value red" id="home-stat-followups">0</div></div>
    <div class="home-stat-card"><div class="home-stat-label">Movimientos hoy</div><div class="home-stat-value lime" id="home-stat-moved">0</div></div>
  </div>
  <div style="display:flex;gap:10px;padding:0 16px 16px;flex:1;overflow:hidden;min-height:0">
    <div style="flex:58;display:flex;flex-direction:column;overflow:hidden;min-width:0">
      <div style="background:#111;border:1px solid var(--border);border-radius:8px;flex:1;display:flex;flex-direction:column;overflow:hidden">
        <div style="padding:8px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;flex-shrink:0">
          <span style="font-size:.72rem;font-weight:700;color:#C4E538">📧 Emails recientes</span>
          <span style="font-size:.62rem;color:#C4E538;margin-left:auto">Analizado por IA ✦</span>
        </div>
        <div id="home-emails-panel" style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px">
          <div style="padding:40px;text-align:center;color:var(--text-3);font-size:.82rem">Cargando…</div>
        </div>
      </div>
    </div>
    <div style="flex:42;display:flex;flex-direction:column;gap:10px;overflow:hidden;min-width:0">
      <div style="background:#111;border:1px solid var(--border);border-radius:8px;flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0">
        <div style="padding:8px 14px;border-bottom:1px solid var(--border);flex-shrink:0">
          <span style="font-size:.72rem;font-weight:700;color:#C4E538">✦ Movimientos automáticos de hoy</span>
        </div>
        <div id="home-moves-panel" style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:4px">
          <div style="font-size:.72rem;color:var(--text-3);padding:8px 4px">Cargando…</div>
        </div>
      </div>
      <div style="background:#111;border:1px solid var(--border);border-radius:8px;flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0">
        <div style="padding:8px 14px;border-bottom:1px solid var(--border);flex-shrink:0">
          <span style="font-size:.72rem;font-weight:700;color:#ef4444">⚠ Follow-ups urgentes</span>
        </div>
        <div id="home-fu-panel" style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:2px">
          <div style="font-size:.72rem;color:var(--text-3);padding:8px 4px">Cargando…</div>
        </div>
      </div>
    </div>
  </div>
</div>
</div><!-- end view-home -->

```

- [ ] **Step 3: Verify structure renders without errors**

Open `http://localhost:3000/app.html` in browser → open DevTools Console → confirm no JS errors on load.

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "feat: add Home view HTML + CSS skeleton"
```

---

## Task 4: Implement `home_load()` and helpers

**Files:**
- Modify: `app.html` — add JS functions before the `// ── VIEW SWITCHER ──` comment (before line 1597)

- [ ] **Step 1: Add global state variables for Home**

Find the line `let crm_editingId=null, crm_dragId=null;` (around line 1635) and add immediately before it:

```javascript
// ── HOME STATE ────────────────────────────────────────────────────────────
let homeClassifications = [];
let homeAutoMovedToday = new Set();
```

- [ ] **Step 2: Add helper `parseDateES()` before the `// ── VIEW SWITCHER ──` comment**

```javascript
function parseDateES(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}
```

- [ ] **Step 3: Add `home_matchEmailsToLeads()` immediately after `parseDateES()`**

```javascript
function home_matchEmailsToLeads(messages, allLeads) {
  const leadsByEmail = {};
  allLeads.forEach(l => {
    const email = (l.data.email || '').toLowerCase().trim();
    if (email) leadsByEmail[email] = l;
  });
  const matched = [];
  const seen = new Set();
  messages.forEach(msg => {
    const headers = msg.payload?.headers || [];
    const from = headers.find(h => h.name === 'From')?.value || '';
    const bracketMatch = from.match(/<([^>]+)>/);
    const plainMatch = from.match(/([^\s<>"]+@[^\s<>"]+)/);
    const senderEmail = (bracketMatch ? bracketMatch[1] : plainMatch ? plainMatch[1] : '').toLowerCase().trim();
    if (!senderEmail || seen.has(senderEmail)) return;
    const lead = leadsByEmail[senderEmail];
    if (!lead) return;
    seen.add(senderEmail);
    matched.push({ email_msg: msg, lead });
  });
  return matched;
}
```

- [ ] **Step 4: Add `home_classifyOne()` immediately after `home_matchEmailsToLeads()`**

```javascript
async function home_classifyOne(email_msg, lead, jwt) {
  const headers = email_msg.payload?.headers || [];
  const get = name => headers.find(h => h.name === name)?.value || '';
  const subject = get('Subject') || '(sin asunto)';
  const snippet = email_msg.snippet || '';
  const current_stage = lead.data.estado || 'sininfo';
  const lead_name = lead.data.lead || lead.data.empresa || 'Lead';
  const original_stage = current_stage;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/classify-email-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
      body: JSON.stringify({ subject, snippet, current_stage, lead_name })
    });
    if (!res.ok) return { email_msg, lead, original_stage, new_stage: current_stage, signal: 'neutral', reason: '', changed: false };
    const { new_stage, signal, reason } = await res.json();
    const resolved_stage = new_stage || current_stage;
    return { email_msg, lead, original_stage, new_stage: resolved_stage, signal: signal || 'neutral', reason: reason || '', changed: resolved_stage !== current_stage };
  } catch {
    return { email_msg, lead, original_stage, new_stage: current_stage, signal: 'neutral', reason: '', changed: false };
  }
}
```

- [ ] **Step 5: Add `home_load()` immediately after `home_classifyOne()`**

```javascript
async function home_load() {
  const dateEl = document.getElementById('home-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  const emailsEl = document.getElementById('home-emails-panel');
  const movesEl = document.getElementById('home-moves-panel');
  const fuEl = document.getElementById('home-fu-panel');
  if (emailsEl) emailsEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3);font-size:.82rem">⏳ Analizando emails con IA…</div>';
  if (movesEl) movesEl.innerHTML = '<div style="font-size:.72rem;color:var(--text-3);padding:8px 4px">Cargando…</div>';
  if (fuEl) fuEl.innerHTML = '<div style="font-size:.72rem;color:var(--text-3);padding:8px 4px">Cargando…</div>';

  const [fetchResult, leadsResult] = await Promise.all([
    gmail_fetchInbox(),
    supabase.from('leads').select('*').eq('user_id', currentUser.id)
  ]);
  const { token, messages } = fetchResult;
  leads = leadsResult.data || leads;

  if (!token) {
    if (emailsEl) emailsEl.innerHTML = '<div style="padding:20px;font-size:.82rem;color:var(--text-3)">Gmail no conectado. <a href="login.html" style="color:#C4E538">Iniciar sesión con Google →</a></div>';
    home_render([], leads);
    return;
  }

  gmailInboxMessages = messages;
  gmail_updateUnreadBadge(messages);

  const matched = home_matchEmailsToLeads(messages, leads);
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token;

  const classifyResults = await Promise.allSettled(
    matched.map(({ email_msg, lead }) => home_classifyOne(email_msg, lead, jwt))
  );

  homeClassifications = classifyResults.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { email_msg: matched[i].email_msg, lead: matched[i].lead, original_stage: matched[i].lead.data.estado, new_stage: matched[i].lead.data.estado, signal: 'neutral', reason: '', changed: false }
  );

  const changed = homeClassifications.filter(c => c.changed);
  if (changed.length > 0) {
    await Promise.allSettled(changed.map(c => {
      homeAutoMovedToday.add(c.lead.id);
      return supabase.from('leads').upsert({
        id: c.lead.id,
        user_id: currentUser.id,
        data: { ...c.lead.data, estado: c.new_stage },
        updated_at: new Date().toISOString()
      });
    }));
    const { data: fresh } = await supabase.from('leads').select('*').eq('user_id', currentUser.id);
    if (fresh) leads = fresh;
  }

  home_render(homeClassifications, leads);
  crm_renderBoard();
  crm_drawer_render(homeClassifications);
}
```

- [ ] **Step 6: Verify no JS errors**

Open `http://localhost:3000/app.html` → DevTools Console → no errors on load. Functions are defined: type `home_load` in console, should show `async function`.

- [ ] **Step 7: Commit**

```bash
git add app.html
git commit -m "feat: add home_load(), home_matchEmailsToLeads(), home_classifyOne() helpers"
```

---

## Task 5: Implement `home_render()`

**Files:**
- Modify: `app.html` — add `home_render()` immediately after `home_load()`

- [ ] **Step 1: Add `home_render()` function**

```javascript
function home_render(classifications, allLeads) {
  const today = new Date();
  const stageLabels = { cierre: '🔥 Cierre', propuesta: '🟢 Propuesta', activa: '🔵 Activa', ghost: '👻 Ghost', frio: '❄️ Frío', sininfo: '❓ Sin info' };
  const stageColors = { cierre: '#C4E538', propuesta: '#0284C7', activa: '#16A34A', ghost: '#EA580C', frio: '#6B7280', sininfo: '#444' };

  // Stats
  const pipelineVal = allLeads.reduce((sum, l) => {
    const v = parseFloat((l.data.valor || '').replace(/[^0-9.]/g, ''));
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
  const activeLeads = allLeads.filter(l => ['cierre', 'propuesta', 'activa'].includes(l.data.estado)).length;
  const unread = (gmailInboxMessages || []).filter(m => (m.labelIds || []).includes('UNREAD')).length;
  const fuLeads = allLeads.filter(l => {
    const d = parseDateES(l.data.ultimoContacto);
    return d && (today - d) / 86400000 >= 7;
  });
  const movedCount = homeAutoMovedToday.size;

  const pEl = document.getElementById('home-stat-pipeline');
  const aEl = document.getElementById('home-stat-activos');
  const eEl = document.getElementById('home-stat-emails');
  const fEl = document.getElementById('home-stat-followups');
  const mEl = document.getElementById('home-stat-moved');
  if (pEl) pEl.textContent = pipelineVal > 0 ? '$' + pipelineVal.toLocaleString('es') : '—';
  if (aEl) aEl.textContent = activeLeads;
  if (eEl) eEl.textContent = unread;
  if (fEl) fEl.textContent = fuLeads.length;
  if (mEl) mEl.textContent = movedCount;

  // Email list
  const emailsEl = document.getElementById('home-emails-panel');
  if (emailsEl) {
    if (!classifications.length) {
      emailsEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3);font-size:.82rem">No hay emails de leads conocidos en el inbox</div>';
    } else {
      emailsEl.innerHTML = classifications.map(c => {
        const headers = c.email_msg.payload?.headers || [];
        const get = name => headers.find(h => h.name === name)?.value || '';
        const from = get('From');
        const displayName = from.replace(/<[^>]+>/, '').trim() || from.split('@')[0] || '?';
        const initials = displayName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
        const subject = get('Subject') || '(sin asunto)';
        const dateRaw = get('Date');
        const timeStr = dateRaw ? new Date(dateRaw).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
        const color = stageColors[c.new_stage] || '#444';
        const isUnread = (c.email_msg.labelIds || []).includes('UNREAD');
        const tagHtml = c.changed
          ? `<span style="font-size:.44rem;background:rgba(196,229,56,.1);color:#C4E538;padding:2px 6px;border-radius:3px;margin-top:3px;display:inline-block">✦ Movido a ${stageLabels[c.new_stage] || c.new_stage} automáticamente</span>`
          : `<span style="font-size:.44rem;color:${color};margin-top:3px;display:inline-block">${stageLabels[c.new_stage] || c.new_stage} — sin cambio</span>`;
        const avatarBg = c.changed ? 'rgba(196,229,56,.12)' : isUnread ? 'rgba(100,100,100,.15)' : 'rgba(60,60,60,.5)';
        const avatarColor = c.changed ? '#C4E538' : isUnread ? '#ccc' : '#555';
        return `<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 10px;background:#1a1a1a;border-radius:6px;border-left:3px solid ${color}">
          <div style="width:28px;height:28px;border-radius:50%;background:${avatarBg};color:${avatarColor};display:flex;align-items:center;justify-content:center;font-size:.58rem;font-weight:700;flex-shrink:0">${escHtml(initials)}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:.7rem;font-weight:${c.changed || isUnread ? '700' : '500'};color:${c.changed ? '#eee' : isUnread ? '#ddd' : '#888'}">${escHtml(displayName)}</span>
              <span style="font-size:.6rem;color:#444;flex-shrink:0;margin-left:8px">${escHtml(timeStr)}</span>
            </div>
            <div style="font-size:.63rem;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(subject)}</div>
            ${tagHtml}
          </div>
        </div>`;
      }).join('');
    }
  }

  // Movements panel
  const movesEl = document.getElementById('home-moves-panel');
  if (movesEl) {
    const moved = classifications.filter(c => c.changed);
    const notMoved = classifications.filter(c => !c.changed);
    if (!moved.length) {
      movesEl.innerHTML = '<div style="font-size:.72rem;color:var(--text-3);padding:8px 4px">Sin movimientos automáticos hoy</div>';
    } else {
      movesEl.innerHTML =
        moved.map(c => {
          const name = c.lead.data.lead || c.lead.data.empresa || '?';
          const toColor = stageColors[c.new_stage] || '#aaa';
          return `<div style="display:flex;align-items:center;gap:6px;padding:5px 7px;background:#1a1a1a;border-radius:4px">
            <span style="font-size:.68rem;color:#ccc;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(name)}</span>
            <span style="font-size:.6rem;color:#555">${stageLabels[c.original_stage] || c.original_stage}</span>
            <span style="font-size:.6rem;color:#333">→</span>
            <span style="font-size:.6rem;font-weight:700;color:${toColor}">${stageLabels[c.new_stage] || c.new_stage}</span>
            <span style="font-size:.48rem;background:rgba(196,229,56,.08);color:#C4E538;padding:1px 4px;border-radius:2px;flex-shrink:0">IA</span>
          </div>`;
        }).join('') +
        notMoved.map(c => {
          const name = c.lead.data.lead || c.lead.data.empresa || '?';
          return `<div style="font-size:.63rem;color:#333;padding:3px 7px">— ${escHtml(name)}: sin cambio</div>`;
        }).join('');
    }
  }

  // Follow-ups panel
  const fuEl = document.getElementById('home-fu-panel');
  if (fuEl) {
    if (!fuLeads.length) {
      fuEl.innerHTML = '<div style="font-size:.72rem;color:var(--text-3);padding:8px 4px">Sin follow-ups urgentes 🎉</div>';
    } else {
      fuEl.innerHTML = fuLeads
        .map(l => ({ l, days: Math.floor((today - parseDateES(l.data.ultimoContacto)) / 86400000) }))
        .sort((a, b) => b.days - a.days)
        .slice(0, 6)
        .map(({ l, days }) => {
          const color = days >= 14 ? '#ef4444' : days >= 7 ? '#f59e0b' : '#aaa';
          const name = l.data.empresa || l.data.lead || '?';
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 7px;border-radius:4px">
            <span style="font-size:.68rem;color:#ccc;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(name)}</span>
            <span style="font-size:.63rem;font-weight:700;color:${color};flex-shrink:0;margin-left:8px">${days} días</span>
          </div>`;
        }).join('');
    }
  }
}
```

- [ ] **Step 2: Manual test**

Open `http://localhost:3000/app.html` → DevTools Console → type `home_load()` and press Enter. The function should execute (even if Gmail isn't connected it should not throw). Check for runtime errors.

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "feat: implement home_render() — stats, email list, movements, follow-ups"
```

---

## Task 6: Wire Home into `switchView()` and set as default

**Files:**
- Modify: `app.html` (lines 529–570 sidebar, lines 1597–1621 switchView)

- [ ] **Step 1: Add `nav-home` sidebar item**

In the sidebar `<div class="sb-nav">` (around line 534), add this as the very first item, before `<div class="sb-group-label">Ventas Activas</div>`:

```html
    <div class="sb-item active" id="nav-home" onclick="switchView('home')">
      <span class="sb-icon">🏠</span> Inicio
    </div>
```

Also remove `active` class from the existing `nav-crm` item (change it to just `class="sb-item"`):
```html
    <div class="sb-item" id="nav-crm" onclick="switchView('crm')">
```

- [ ] **Step 2: Add `'home'` case to `switchView()`**

Replace the entire `switchView` function (lines 1597–1620) with:

```javascript
function switchView(view){
  document.getElementById('view-home').style.display=view==='home'?'flex':'none';
  document.getElementById('view-crm').style.display=view==='crm'?'flex':'none';
  document.getElementById('view-prm').style.display=view==='prm'?'flex':'none';
  document.getElementById('view-automations').style.display=view==='automations'?'flex':'none';
  document.getElementById('view-integraciones').style.display=view==='integraciones'?'flex':'none';
  document.getElementById('view-api').style.display=view==='api'?'flex':'none';
  document.getElementById('view-gmail').style.display=view==='gmail'?'flex':'none';
  document.getElementById('view-tasks').style.display=view==='tasks'?'block':'none';
  document.getElementById('view-calendar').style.display=view==='calendar'?'flex':'none';
  document.querySelectorAll('.sb-item').forEach(el=>el.classList.remove('active'));
  if(view==='home'){document.getElementById('nav-home').classList.add('active');home_load();}
  if(view==='crm')document.getElementById('nav-crm').classList.add('active');
  if(view==='prm')document.getElementById('nav-prm').classList.add('active');
  if(view==='automations')document.getElementById('nav-automations').classList.add('active');
  if(view==='integraciones')document.getElementById('nav-integraciones').classList.add('active');
  if(view==='api')document.getElementById('nav-api').classList.add('active');
  if(view==='gmail'){document.getElementById('nav-gmail').classList.add('active');gmail_loadInbox();}
  if(view==='tasks'){document.getElementById('nav-tasks').classList.add('active');task_loadGlobal();}
  if(view==='calendar'){document.getElementById('nav-calendar').classList.add('active');cal_init();}
  ['sb-crm-new'].forEach(id=>document.getElementById(id).style.display=view==='crm'?'block':'none');
  ['sb-prm-new','sb-prm-export'].forEach(id=>document.getElementById(id).style.display=view==='prm'?'block':'none');
  if(view==='automations')automation_renderDashboard();
  if(view==='integraciones')integraciones_checkStatus();
}
```

- [ ] **Step 3: Change default view from `'crm'` to `'home'`**

Change line 1621 from:
```javascript
switchView('crm');
```
to:
```javascript
switchView('home');
```

- [ ] **Step 4: Full integration test**

Open `http://localhost:3000/app.html`:
1. Default landing should be "🏠 Inicio" with sidebar "Inicio" active
2. Stats cards render (may show zeroes if no Gmail token)
3. Click "CRM Pipeline" in sidebar → kanban loads
4. Click "Inicio" again → Home view renders
5. No JS errors in console

- [ ] **Step 5: Commit**

```bash
git add app.html
git commit -m "feat: wire Home view into switchView(), set as default landing"
```

---

## Task 7: Add CRM inbox drawer HTML and toggle button

**Files:**
- Modify: `app.html` (CRM view HTML, lines 593–607)

- [ ] **Step 1: Add inbox toggle button to CRM topbar**

In the CRM topbar `.topbar-actions` div (around line 593), add a button after the existing `+ Nuevo Lead` button:

```html
    <div class="topbar-actions">
      <button class="btn-main" onclick="crm_openAddModal()">+ Nuevo Lead</button>
      <button id="crm-drawer-btn" onclick="crm_drawer_toggle()" style="background:rgba(196,229,56,.07);color:#C4E538;border:1px solid rgba(196,229,56,.25);padding:5px 12px;border-radius:6px;font-size:.72rem;cursor:pointer;font-family:inherit;margin-left:8px">📧 Emails ▾</button>
    </div>
```

- [ ] **Step 2: Add `#crm-inbox-drawer` between topbar close and statsbar**

Insert the drawer HTML immediately after the `</div>` that closes the topbar (after line 596, before `<div class="statsbar">`):

```html
  <div id="crm-inbox-drawer" class="drawer-hidden">
    <div style="font-size:.7rem;color:var(--text-3);padding:4px 8px;flex-shrink:0">Sin emails de leads conocidos</div>
  </div>
```

- [ ] **Step 3: Verify visually**

Open `http://localhost:3000/app.html` → navigate to CRM. The "📧 Emails ▾" button should appear in the topbar. Clicking it should do nothing yet (function not yet implemented). No console errors.

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "feat: add CRM inbox drawer HTML and toggle button"
```

---

## Task 8: Implement drawer rendering, toggle, and kanban badge

**Files:**
- Modify: `app.html` — add JS functions and modify `crm_renderBoard()`

- [ ] **Step 1: Add `crm_drawer_render()` before the `// ── VIEW SWITCHER ──` comment**

```javascript
function crm_drawer_render(classifications) {
  const drawer = document.getElementById('crm-inbox-drawer');
  if (!drawer) return;
  if (!classifications || !classifications.length) {
    drawer.innerHTML = '<div style="font-size:.7rem;color:var(--text-3);padding:4px 8px;flex-shrink:0">Sin emails de leads conocidos</div>';
    return;
  }
  const stageLabels = { cierre: '🔥 Cierre', propuesta: '🟢 Propuesta', activa: '🔵 Activa', ghost: '👻 Ghost', frio: '❄️ Frío', sininfo: '❓ Sin info' };
  const stageColors = { cierre: '#C4E538', propuesta: '#0284C7', activa: '#16A34A', ghost: '#EA580C', frio: '#6B7280', sininfo: '#444' };
  const visible = classifications.slice(0, 8);
  drawer.innerHTML = visible.map(c => {
    const headers = c.email_msg.payload?.headers || [];
    const get = name => headers.find(h => h.name === name)?.value || '';
    const from = get('From');
    const displayName = from.replace(/<[^>]+>/, '').trim() || from.split('@')[0] || '?';
    const subject = get('Subject') || '(sin asunto)';
    const autoHtml = c.changed
      ? `<span class="crm-drawer-auto">${['activa','propuesta'].includes(c.new_stage) ? '↑' : '✦'} AUTO</span>`
      : '';
    const toColor = stageColors[c.new_stage] || '#444';
    const stageHtml = c.changed
      ? `<span style="color:#444;font-size:.54rem">${stageLabels[c.original_stage] || c.original_stage} → </span><span style="color:${toColor};font-weight:700;font-size:.54rem">${stageLabels[c.new_stage] || c.new_stage}</span>`
      : `<span style="color:#444;font-size:.54rem">${stageLabels[c.new_stage] || c.new_stage} (sin cambio)</span>`;
    const cardCls = c.changed ? 'crm-drawer-card' : 'crm-drawer-card plain';
    return `<div class="${cardCls}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;gap:4px">
        <div class="crm-drawer-name${c.changed ? '' : ' dim'}">${escHtml(displayName)}</div>
        ${autoHtml}
      </div>
      <div class="crm-drawer-subj">${escHtml(subject)}</div>
      <div>${stageHtml}</div>
    </div>`;
  }).join('');
  if (classifications.length > 8) {
    drawer.innerHTML += `<div style="display:flex;align-items:center;padding:0 8px;font-size:.6rem;color:#555;flex-shrink:0">› ${classifications.length - 8} más</div>`;
  }
}
```

- [ ] **Step 2: Add `crm_drawer_toggle()` immediately after `crm_drawer_render()`**

```javascript
let crmDrawerOpen = false;
function crm_drawer_toggle() {
  crmDrawerOpen = !crmDrawerOpen;
  const drawer = document.getElementById('crm-inbox-drawer');
  const btn = document.getElementById('crm-drawer-btn');
  if (!drawer) return;
  if (crmDrawerOpen) {
    drawer.classList.remove('drawer-hidden');
    if (btn) btn.textContent = '📧 Emails ▾';
    crm_drawer_render(homeClassifications);
  } else {
    drawer.classList.add('drawer-hidden');
    if (btn) btn.textContent = '📧 Emails ▸';
  }
}
```

- [ ] **Step 3: Add "movido hoy por IA" badge to kanban card render**

In `crm_renderBoard()` (around line 1690), find the kanban card HTML template. Locate the string `activity_getBadgeHtml('lead', item.id)` inside `card-foot` and add a badge after the closing `</div>` of `card-foot`:

Find this exact string in the card render:
```javascript
`<div class="card-foot"><span class="badge ${badgeClass}">${{'urgente':'🔴 Urgente','alta':'🟠 Alta','media':'🟡 Media','baja':'⚪ Baja'}[item.data.prioridad]||'Media'}</span><span class="card-date">${item.data.ultimoContacto||'—'}</span>${activity_getBadgeHtml('lead', item.id)}</div>
```

Append the IA badge immediately after `</div>` of `card-foot`, still inside the card body, before the quick actions div:
```javascript
${homeAutoMovedToday.has(item.id) ? '<div style="font-size:.48rem;color:#C4E538;background:rgba(196,229,56,.06);padding:2px 6px;border-radius:3px;margin-top:4px;display:inline-block">✦ movido hoy por IA</div>' : ''}
```

The modified section should look like:
```javascript
`<div class="card-foot">...</div>${homeAutoMovedToday.has(item.id)?'<div style="font-size:.48rem;color:#C4E538;background:rgba(196,229,56,.06);padding:2px 6px;border-radius:3px;margin-top:4px;display:inline-block">✦ movido hoy por IA</div>':''}<div class="card-quick-actions">...`
```

- [ ] **Step 4: Update drawer button text to show unread count**

In `home_load()`, after `crm_drawer_render(homeClassifications)` at the end, add:
```javascript
  const btn = document.getElementById('crm-drawer-btn');
  if (btn) {
    const unread = homeClassifications.filter(c => (c.email_msg.labelIds || []).includes('UNREAD')).length;
    btn.textContent = unread > 0 ? `📧 Emails (${unread} nuevos) ▾` : '📧 Emails ▾';
  }
```

- [ ] **Step 5: Full end-to-end test**

Open `http://localhost:3000/app.html`:
1. Home view loads by default, shows "⏳ Analizando emails con IA…"
2. After loading: stats render, emails appear with AI tags
3. Navigate to CRM → topbar shows "📧 Emails ▾" button
4. Click the button → drawer slides open showing email cards
5. Click again → drawer closes
6. Any auto-moved leads show "✦ movido hoy por IA" badge on kanban card
7. No console errors

- [ ] **Step 6: Commit**

```bash
git add app.html
git commit -m "feat: implement CRM inbox drawer + drawer toggle + kanban AI badge"
```

---

## Task 9: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the file table in README.md to reflect current state**

Replace the Archivos table with:

```markdown
## Archivos

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Landing page (uniamoscrm.com) |
| `login.html` | Login/registro con email y Google OAuth |
| `app.html` | CRM principal — Home Dashboard, Kanban, PRM, Gmail, Tasks, Calendar |
| `cargar_contactos.html` | Importador de contactos LinkedIn |
| `reset-password.html` | Reset de contraseña (linked desde email Supabase) |
| `schema.sql` | Schema de Supabase (leads + prospects + RLS) |
| `supabase/functions/refresh-google-token/` | Edge Function: refresca Google OAuth token |
| `supabase/functions/classify-email-lead/` | Edge Function: clasifica etapa de lead por email via Claude AI |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README with new Edge Function and app features"
```

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - Home Dashboard with 5 stats → Task 3 (HTML) + Task 5 (render)
  - Email AI qualification via Edge Function → Task 1 + Task 4
  - Auto-move leads, no confirmation → Task 4 (`home_load` upserts silently)
  - CRM inbox drawer, collapsible → Task 7 + Task 8
  - Kanban "moved today" badge → Task 8
  - Loading/error states → Task 4 (`home_load` handles no-token, errors)
  - `gmail_fetchInbox()` extraction → Task 2
  - `switchView('home')` as default → Task 6
  - README update → Task 9

- [x] **No placeholders** — all steps have complete code blocks

- [x] **Type/name consistency:**
  - `homeClassifications` declared in Task 4 Step 1, used in Tasks 5, 8
  - `homeAutoMovedToday` declared in Task 4 Step 1, used in Tasks 4, 8
  - `home_matchEmailsToLeads()` defined Task 4 Step 3, called Task 4 Step 5
  - `home_classifyOne()` defined Task 4 Step 4, called Task 4 Step 5
  - `home_render()` defined Task 5, called Task 4 Step 5
  - `crm_drawer_render()` defined Task 8 Step 1, called Tasks 4, 8
  - `gmail_fetchInbox()` defined Task 2, called Task 4 Step 5
  - `parseDateES()` defined Task 4 Step 2, used Task 5
  - `escHtml()` already exists in `app.html` at line 3727
  - `SUPABASE_URL` already defined at line 1367
  - `gmailInboxMessages` already defined at line 3728
