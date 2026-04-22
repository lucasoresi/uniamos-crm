# Gmail Inbox Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the authenticated user's real Gmail inbox inside the CRM with a persistent token that never expires mid-session.

**Architecture:** A Supabase Edge Function (`refresh-google-token`) holds the Google `client_secret` and exchanges the stored refresh token for fresh access tokens. The frontend saves the refresh token to a `google_tokens` Supabase table on login, then calls the Edge Function whenever `sessionStorage` has no valid token.

**Tech Stack:** Vanilla JS, Supabase JS SDK v2, Supabase Edge Functions (Deno/TypeScript), Gmail REST API v1, Supabase MCP tools.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `supabase/functions/refresh-google-token/index.ts` | **Create** | Deno Edge Function — exchanges refresh token for access token |
| `app.html:255-260` | **Modify** | Add `#view-gmail` CSS rule |
| `app.html:399-407` | **Modify** | Add Gmail message list item CSS classes |
| `app.html:424-427` | **Modify** | Add Gmail nav item to sidebar |
| `app.html:906` | **Modify** | Add `view-gmail` HTML block after automations view |
| `app.html:1154-1159` | **Modify** | Extend `initSession()` to save refresh token + token expiry |
| `app.html:1358-1374` | **Modify** | Extend `switchView()` to handle `'gmail'` |
| `app.html` (after line 2971) | **Modify** | Add `getGoogleToken()`, `gmail_loadInbox()`, `gmail_renderList()`, `gmail_selectMessage()`, `gmail_filterList()`, `gmail_updateUnreadBadge()` |

> **Note:** `login.html` line 241 already has `access_type: 'offline'` and `prompt: 'consent'` in the OAuth call — no changes needed there.

---

## Task 1: Create `google_tokens` table in Supabase

**Files:**
- Uses: Supabase MCP tool `mcp__supabase__apply_migration`

- [ ] **Step 1: Apply migration via MCP**

Call `mcp__supabase__apply_migration` with:
```sql
CREATE TABLE IF NOT EXISTS google_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own token"
  ON google_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert their own token"
  ON google_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own token"
  ON google_tokens FOR UPDATE
  USING (auth.uid() = user_id);
```

- [ ] **Step 2: Verify table exists**

Call `mcp__supabase__list_tables` and confirm `google_tokens` appears in the list.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add google_tokens table with RLS for Gmail token persistence"
```

---

## Task 2: Create the Edge Function

**Files:**
- Create: `supabase/functions/refresh-google-token/index.ts`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p supabase/functions/refresh-google-token
```

Create `supabase/functions/refresh-google-token/index.ts` with this exact content:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify caller's JWT and get user_id
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Read refresh token using service role (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { data: tokenRow, error: dbError } = await supabaseAdmin
      .from('google_tokens')
      .select('refresh_token')
      .eq('user_id', user.id)
      .single()

    if (dbError || !tokenRow) {
      return new Response(
        JSON.stringify({ error: 'No refresh token stored. Log in with Google again.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Exchange refresh token for a new access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
        refresh_token: tokenRow.refresh_token,
        grant_type: 'refresh_token',
      }),
    })

    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      return new Response(
        JSON.stringify({ error: 'Google token refresh failed', details: tokenData }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ access_token: tokenData.access_token, expires_in: tokenData.expires_in ?? 3600 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 2: Deploy via MCP**

Call `mcp__supabase__deploy_edge_function` with:
- `name`: `refresh-google-token`
- `files`: the content of `supabase/functions/refresh-google-token/index.ts`

- [ ] **Step 3: Set Supabase secrets**

You need `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from Google Cloud Console:
1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Find the OAuth 2.0 Client ID that Supabase uses (type: "Web application")
3. Copy the Client ID and Client Secret

Then set them in Supabase Dashboard → Edge Functions → Secrets (or via Supabase CLI):
```bash
supabase secrets set GOOGLE_CLIENT_ID=<your_client_id>
supabase secrets set GOOGLE_CLIENT_SECRET=<your_client_secret>
```

- [ ] **Step 4: Verify deployment**

Call `mcp__supabase__list_edge_functions` and confirm `refresh-google-token` appears.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/refresh-google-token/index.ts
git commit -m "feat: add refresh-google-token edge function"
```

---

## Task 3: Extend `initSession()` to persist refresh token

**Files:**
- Modify: `app.html:1154-1159`

Current code at line 1154–1159:
```js
    // Guardar provider_token de Google para Gmail API (se pierde en refresh de sesión)
    if(session.provider_token){sessionStorage.setItem('gtoken',session.provider_token);}
    else if(session.user?.app_metadata?.provider==='google'){
      // Token expiró — limpiar por si era viejo
      sessionStorage.removeItem('gtoken');
    }
```

- [ ] **Step 1: Replace token-saving block**

Replace those 5 lines with:

```js
    // Persist Google tokens for Gmail API
    if(session.provider_refresh_token){
      supabase.from('google_tokens').upsert({
        user_id:currentUser.id,
        refresh_token:session.provider_refresh_token,
        updated_at:new Date().toISOString()
      }).then(({error})=>{if(error)console.warn('google_tokens upsert:',error.message);});
    }
    if(session.provider_token){
      const exp=Date.now()+55*60*1000; // 55 min (token expires at 60)
      sessionStorage.setItem('gtoken',session.provider_token);
      sessionStorage.setItem('gtoken_expires',exp.toString());
    } else {
      sessionStorage.removeItem('gtoken');
      sessionStorage.removeItem('gtoken_expires');
    }
```

- [ ] **Step 2: Verify in browser**

Open app with a fresh Google login (not a cached session). In DevTools → Application → Session Storage, confirm:
- `gtoken` is set (non-empty string)
- `gtoken_expires` is set (a future timestamp)

Also open DevTools → Network, confirm a PATCH/POST to `google_tokens` Supabase endpoint happened and returned 2xx.

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "feat: persist Google refresh token to Supabase on login"
```

---

## Task 4: Add `getGoogleToken()` helper

**Files:**
- Modify: `app.html` — add after the existing `gmail_loadForContact` function (around line 3040)

- [ ] **Step 1: Add the helper function**

Find the line `// ── SESSION & AUTH` section close (around line 1185) — actually add this as a new section after the existing gmail functions. Insert after the closing `}` of `gmail_loadForContact` (around line 3040):

```js
// ── GOOGLE TOKEN HELPER ────────────────────────────────────────────────────
async function getGoogleToken() {
  const token = sessionStorage.getItem('gtoken');
  const expires = parseInt(sessionStorage.getItem('gtoken_expires') || '0');
  if (token && Date.now() < expires) return token;

  // Token missing or expired — ask Edge Function to refresh
  const {data:{session}} = await supabase.auth.getSession();
  const jwt = session?.access_token;
  if (!jwt) return null;

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/refresh-google-token`, {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    if (!res.ok) return null;
    const { access_token, expires_in } = await res.json();
    sessionStorage.setItem('gtoken', access_token);
    sessionStorage.setItem('gtoken_expires', (Date.now() + (expires_in - 60) * 1000).toString());
    return access_token;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Verify in browser console**

With the app open and logged in with Google, run in DevTools console:
```js
getGoogleToken().then(t => console.log('token:', t ? t.slice(0,20) + '…' : 'null'))
```
Expected: logs a token string (not null).

Now manually expire the session storage token and re-run:
```js
sessionStorage.setItem('gtoken_expires', '0');
getGoogleToken().then(t => console.log('refreshed:', t ? t.slice(0,20) + '…' : 'null'))
```
Expected: calls the Edge Function and returns a fresh token.

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "feat: add getGoogleToken() helper with Edge Function fallback"
```

---

## Task 5: Add Gmail view CSS

**Files:**
- Modify: `app.html:255-260` (VIEWS section) and after line 407 (existing gmail CSS at 399–407)

- [ ] **Step 1: Add `#view-gmail` to the VIEWS CSS block**

Find this block at line 255–259:
```css
#view-crm{display:flex;flex-direction:column;flex:1;overflow:hidden;min-width:0}
#view-prm{display:none;flex-direction:column;flex:1;overflow:hidden;min-width:0}
#view-automations{display:none;flex-direction:column;flex:1;overflow:hidden;min-width:0}
#view-integraciones{display:none;flex-direction:column;flex:1;overflow:hidden;min-width:0}
#view-api{display:none;flex-direction:column;flex:1;overflow:hidden;min-width:0}
```

Add one line after `#view-api`:
```css
#view-gmail{display:none;flex-direction:row;flex:1;overflow:hidden;min-width:0}
```

- [ ] **Step 2: Add Gmail message list CSS**

Find the existing gmail CSS block (lines 399–407) that ends with `.gmail-no-token{...}`. After that block, add:

```css
.gmail-msg-item{display:flex;gap:10px;padding:12px 16px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .12s}
.gmail-msg-item:hover{background:#161616}
.gmail-msg-item.gmail-msg-selected{background:rgba(196,229,56,.06);border-left:2px solid #C4E538;padding-left:14px}
.gmail-msg-avatar{width:36px;height:36px;border-radius:50%;background:#222;color:var(--text-3);display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;flex-shrink:0}
.gmail-msg-unread .gmail-msg-avatar{background:rgba(196,229,56,.12);color:#C4E538}
.gmail-msg-body{flex:1;min-width:0}
.gmail-msg-row1{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:1px}
.gmail-msg-name{font-size:.78rem;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gmail-msg-unread .gmail-msg-name{font-weight:700;color:var(--text)}
.gmail-msg-date{font-size:.67rem;color:var(--text-3);white-space:nowrap;flex-shrink:0}
.gmail-msg-subject{font-size:.74rem;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:1px}
.gmail-msg-unread .gmail-msg-subject{font-weight:600;color:var(--text-2)}
.gmail-msg-snippet{font-size:.69rem;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
```

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "feat: add Gmail inbox view CSS"
```

---

## Task 6: Add Gmail nav item to sidebar

**Files:**
- Modify: `app.html:424-427`

- [ ] **Step 1: Add nav item after PRM nav item**

Find this block at line 424–427:
```html
    <div class="sb-item" id="nav-prm" onclick="switchView('prm')">
      <span class="sb-icon">🎯</span> PRM Prospectos
      <span class="sb-badge" id="nav-prm-badge">0</span>
    </div>
```

Add immediately after it:
```html
    <div class="sb-item" id="nav-gmail" onclick="switchView('gmail')">
      <span class="sb-icon">📧</span> Gmail
      <span class="sb-badge" id="nav-gmail-badge" style="display:none">0</span>
    </div>
```

- [ ] **Step 2: Verify in browser**

Reload app. The sidebar should show "📧 Gmail" between PRM Prospectos and Herramientas. Clicking it should not crash (view is not wired yet — that's Task 7).

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "feat: add Gmail nav item to sidebar"
```

---

## Task 7: Add Gmail view HTML

**Files:**
- Modify: `app.html` — insert after line 906 (`</div><!-- end view-automations -->`)

- [ ] **Step 1: Insert Gmail view HTML**

After the line `</div><!-- end view-automations -->` (line 906), insert:

```html
<!-- GMAIL VIEW -->
<div id="view-gmail" class="view">
<div class="main" style="display:flex;flex-direction:column;flex:1;overflow:hidden">
  <div class="topbar">
    <div class="topbar-breadcrumb"><span style="color:var(--text-3)">Comunicaciones</span> <span style="color:var(--text-3);margin:0 4px">›</span> <span>Inbox Gmail</span></div>
    <div class="topbar-divider"></div>
    <button onclick="gmail_refreshInbox()" style="margin-left:auto;background:none;border:1px solid var(--border);color:var(--text-2);padding:5px 14px;border-radius:6px;font-size:.78rem;cursor:pointer;font-family:inherit">↻ Actualizar</button>
  </div>
  <div style="display:flex;flex:1;overflow:hidden">
    <!-- Left: email list -->
    <div style="width:38%;min-width:260px;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden">
      <div style="padding:10px 14px;border-bottom:1px solid var(--border)">
        <input id="gmail-search" oninput="gmail_filterList(this.value)" placeholder="🔍 Buscar en inbox…"
          style="width:100%;padding:7px 10px;background:#111;border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:.8rem;box-sizing:border-box;font-family:inherit">
      </div>
      <div id="gmail-email-list" style="flex:1;overflow-y:auto"></div>
    </div>
    <!-- Right: preview panel -->
    <div id="gmail-preview-panel" style="flex:1;overflow-y:auto;padding:28px 32px;display:flex;align-items:flex-start;justify-content:center">
      <div style="color:var(--text-3);font-size:.84rem;margin-top:60px">Seleccioná un email para ver el preview</div>
    </div>
  </div>
</div>
</div><!-- end view-gmail -->
```

- [ ] **Step 2: Commit**

```bash
git add app.html
git commit -m "feat: add Gmail inbox view HTML structure"
```

---

## Task 8: Wire `switchView()` for Gmail

**Files:**
- Modify: `app.html:1358-1374`

- [ ] **Step 1: Replace the entire `switchView` function**

Find the function at line 1358–1374:
```js
function switchView(view){
  document.getElementById('view-crm').style.display=view==='crm'?'flex':'none';
  document.getElementById('view-prm').style.display=view==='prm'?'flex':'none';
  document.getElementById('view-automations').style.display=view==='automations'?'flex':'none';
  document.getElementById('view-integraciones').style.display=view==='integraciones'?'flex':'none';
  document.getElementById('view-api').style.display=view==='api'?'flex':'none';
  document.querySelectorAll('.sb-item').forEach(el=>el.classList.remove('active'));
  if(view==='crm')document.getElementById('nav-crm').classList.add('active');
  if(view==='prm')document.getElementById('nav-prm').classList.add('active');
  if(view==='automations')document.getElementById('nav-automations').classList.add('active');
  if(view==='integraciones')document.getElementById('nav-integraciones').classList.add('active');
  if(view==='api')document.getElementById('nav-api').classList.add('active');
  ['sb-crm-new'].forEach(id=>document.getElementById(id).style.display=view==='crm'?'block':'none');
  ['sb-prm-new','sb-prm-export'].forEach(id=>document.getElementById(id).style.display=view==='prm'?'block':'none');
  if(view==='automations')automation_renderDashboard();
  if(view==='integraciones')integraciones_checkStatus();
}
```

Replace with:
```js
function switchView(view){
  document.getElementById('view-crm').style.display=view==='crm'?'flex':'none';
  document.getElementById('view-prm').style.display=view==='prm'?'flex':'none';
  document.getElementById('view-automations').style.display=view==='automations'?'flex':'none';
  document.getElementById('view-integraciones').style.display=view==='integraciones'?'flex':'none';
  document.getElementById('view-api').style.display=view==='api'?'flex':'none';
  document.getElementById('view-gmail').style.display=view==='gmail'?'flex':'none';
  document.querySelectorAll('.sb-item').forEach(el=>el.classList.remove('active'));
  if(view==='crm')document.getElementById('nav-crm').classList.add('active');
  if(view==='prm')document.getElementById('nav-prm').classList.add('active');
  if(view==='automations')document.getElementById('nav-automations').classList.add('active');
  if(view==='integraciones')document.getElementById('nav-integraciones').classList.add('active');
  if(view==='api')document.getElementById('nav-api').classList.add('active');
  if(view==='gmail')document.getElementById('nav-gmail').classList.add('active');
  ['sb-crm-new'].forEach(id=>document.getElementById(id).style.display=view==='crm'?'block':'none');
  ['sb-prm-new','sb-prm-export'].forEach(id=>document.getElementById(id).style.display=view==='prm'?'block':'none');
  if(view==='automations')automation_renderDashboard();
  if(view==='integraciones')integraciones_checkStatus();
  if(view==='gmail')gmail_loadInbox();
}
```

- [ ] **Step 2: Commit**

```bash
git add app.html
git commit -m "feat: wire Gmail view into switchView"
```

---

## Task 9: Implement Gmail inbox functions

**Files:**
- Modify: `app.html` — add after the existing `gmail_loadForContact` function (around line 3040)

- [ ] **Step 1: Add all Gmail inbox functions**

Find the end of the `getGoogleToken()` function added in Task 4. After its closing `}`, add:

```js
// ── GMAIL INBOX ────────────────────────────────────────────────────────────
let gmailInboxMessages = [];

async function gmail_loadInbox() {
  const listEl = document.getElementById('gmail-email-list');
  const previewEl = document.getElementById('gmail-preview-panel');
  if (!listEl) return;

  listEl.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-3)">⏳ Cargando inbox…</div>';
  previewEl.innerHTML = '<div style="color:var(--text-3);font-size:.84rem;margin-top:60px">Seleccioná un email para ver el preview</div>';
  document.getElementById('gmail-search').value = '';

  const token = await getGoogleToken();
  if (!token) {
    listEl.innerHTML = `<div class="gmail-no-token" style="margin:20px">
      <div style="font-size:1.4rem;margin-bottom:8px">📧</div>
      <strong>Gmail no conectado</strong><br>
      Ingresá con tu cuenta de Google para ver tu inbox.<br>
      <a href="login.html" style="color:#C4E538;display:inline-block;margin-top:10px;font-weight:700">Ir al login →</a>
    </div>`;
    return;
  }

  try {
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=30',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (listRes.status === 401) {
      sessionStorage.removeItem('gtoken');
      sessionStorage.removeItem('gtoken_expires');
      listEl.innerHTML = '<div class="gmail-no-token" style="margin:20px">Token de Google expirado. <a href="login.html" style="color:#C4E538">Volvé a ingresar →</a></div>';
      return;
    }
    const listData = await listRes.json();
    const messages = listData.messages || [];

    if (messages.length === 0) {
      listEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3)">No hay emails en el inbox</div>';
      return;
    }

    const details = await Promise.all(messages.map(m =>
      fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata` +
        `&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then(r => r.json())
    ));

    gmailInboxMessages = details;
    gmail_renderList(details);
    gmail_updateUnreadBadge(details);

  } catch (err) {
    listEl.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-3)">
      No se pudo cargar Gmail.<br>
      <button onclick="gmail_loadInbox()" style="margin-top:10px;padding:7px 16px;background:#C4E538;color:#0A0A0A;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-family:inherit">Reintentar</button>
    </div>`;
  }
}

function gmail_refreshInbox() {
  sessionStorage.removeItem('gtoken');
  sessionStorage.removeItem('gtoken_expires');
  gmail_loadInbox();
}

function gmail_renderList(messages) {
  const listEl = document.getElementById('gmail-email-list');
  if (!messages.length) {
    listEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3)">Sin resultados</div>';
    return;
  }
  // Use msg.id as key so selection works correctly even after filtering
  listEl.innerHTML = messages.map(msg => {
    const headers = msg.payload?.headers || [];
    const get = name => headers.find(h => h.name === name)?.value || '';
    const from = get('From');
    const displayName = from.replace(/<[^>]+>/, '').trim() || from.split('@')[0] || '?';
    const initials = displayName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
    const subject = get('Subject') || '(sin asunto)';
    const dateRaw = get('Date');
    const date = dateRaw ? new Date(dateRaw).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '';
    const isUnread = (msg.labelIds || []).includes('UNREAD');
    const snippet = (msg.snippet || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
    return `<div class="gmail-msg-item${isUnread ? ' gmail-msg-unread' : ''}" data-msgid="${msg.id}" onclick="gmail_selectMessage('${msg.id}')">
      <div class="gmail-msg-avatar">${initials}</div>
      <div class="gmail-msg-body">
        <div class="gmail-msg-row1">
          <span class="gmail-msg-name">${displayName}</span>
          <span class="gmail-msg-date">${date}</span>
        </div>
        <div class="gmail-msg-subject">${subject}</div>
        <div class="gmail-msg-snippet">${snippet}</div>
      </div>
    </div>`;
  }).join('');
}

function gmail_selectMessage(msgId) {
  // Look up by ID so it works correctly after list filtering
  const msg = gmailInboxMessages.find(m => m.id === msgId);
  if (!msg) return;

  document.querySelectorAll('.gmail-msg-item').forEach(el => el.classList.remove('gmail-msg-selected'));
  const item = document.querySelector(`[data-msgid="${msgId}"]`);
  if (item) { item.classList.add('gmail-msg-selected'); item.classList.remove('gmail-msg-unread'); }

  const headers = msg.payload?.headers || [];
  const get = name => headers.find(h => h.name === name)?.value || '';
  const from = get('From');
  const subject = get('Subject') || '(sin asunto)';
  const dateRaw = get('Date');
  const date = dateRaw
    ? new Date(dateRaw).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  const snippet = (msg.snippet || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  const gmailLink = `https://mail.google.com/mail/#inbox/${msg.id}`;

  document.getElementById('gmail-preview-panel').innerHTML = `
    <div style="max-width:580px;width:100%">
      <div style="font-size:.72rem;color:var(--text-3);margin-bottom:4px">${from}</div>
      <div style="font-size:1.05rem;font-weight:800;color:var(--text);margin-bottom:6px;line-height:1.3">${subject}</div>
      <div style="font-size:.72rem;color:var(--text-3);padding-bottom:14px;border-bottom:1px solid var(--border);margin-bottom:16px">${date}</div>
      <div style="font-size:.84rem;color:var(--text-2);line-height:1.75">${snippet}</div>
      <a href="${gmailLink}" target="_blank"
        style="display:inline-flex;align-items:center;gap:6px;margin-top:22px;padding:9px 20px;background:#C4E538;color:#0A0A0A;border-radius:6px;font-weight:700;font-size:.82rem;text-decoration:none">
        Abrir en Gmail ↗
      </a>
    </div>`;
}

function gmail_filterList(q) {
  if (!q) { gmail_renderList(gmailInboxMessages); return; }
  const lower = q.toLowerCase();
  const filtered = gmailInboxMessages.filter(msg => {
    const headers = msg.payload?.headers || [];
    const get = name => headers.find(h => h.name === name)?.value || '';
    return (get('From') + get('Subject') + (msg.snippet || '')).toLowerCase().includes(lower);
  });
  gmail_renderList(filtered);
}

function gmail_updateUnreadBadge(messages) {
  const count = messages.filter(m => (m.labelIds || []).includes('UNREAD')).length;
  const badge = document.getElementById('nav-gmail-badge');
  if (!badge) return;
  badge.textContent = count;
  badge.style.display = count > 0 ? '' : 'none';
}
```

- [ ] **Step 2: Verify in browser — full flow test**

1. Start server: `python3 -m http.server 3000`
2. Open `http://localhost:3000/login.html`
3. Log in with Google
4. In the CRM, click "📧 Gmail" in the sidebar
5. Expected: spinner → then list of 30 inbox emails appears
6. Click an email → preview panel shows sender, subject, snippet, "Abrir en Gmail ↗" button
7. Type in search box → list filters in real-time
8. Unread emails should appear bold with lime-green avatar
9. Click "↻ Actualizar" → inbox reloads

- [ ] **Step 3: Verify token persistence across page refresh**

1. After step 2 works, do a hard reload (`Ctrl+Shift+R`)
2. The CRM re-opens without going through login
3. Click "📧 Gmail" — it should still load emails (token refreshed via Edge Function)
4. In DevTools → Network, you should see a call to `/functions/v1/refresh-google-token` that returns 200

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "feat: implement Gmail inbox with token refresh, two-column UI, and search"
```

---

## Task 10: Final cleanup and verification

- [ ] **Step 1: Check `gmail_loadForContact` still works**

In the CRM, open a lead that has an email address. Go to the Gmail tab in the detail panel. It should still show contact-specific emails (uses `getGoogleToken()` now instead of the old `sessionStorage.getItem('gtoken')` directly).

Update `gmail_loadForContact` to use `getGoogleToken()` instead of `sessionStorage.getItem('gtoken')`:

Find at line 2976:
```js
  const token = sessionStorage.getItem('gtoken');
  if (!token) {
```

Replace with:
```js
  const token = await getGoogleToken();
  if (!token) {
```

- [ ] **Step 2: Remove stale `sessionStorage.removeItem('gtoken')` in `gmail_loadForContact`**

Find at line 3002:
```js
      sessionStorage.removeItem('gtoken');
      container.innerHTML = `<div class="gmail-no-token">Token de Google expirado. Ingresá nuevamente con Google para ver emails.</div>`;
```

Replace with:
```js
      sessionStorage.removeItem('gtoken');
      sessionStorage.removeItem('gtoken_expires');
      container.innerHTML = `<div class="gmail-no-token">Token de Google expirado. Ingresá nuevamente con Google para ver emails.</div>`;
```

- [ ] **Step 3: Final smoke test**

1. Login fresh with Google
2. Check Gmail inbox view loads ✅
3. Check contact-specific Gmail tab in a lead panel loads ✅
4. Reload page, check Gmail inbox view still loads (token refresh) ✅
5. Check sidebar shows unread badge if there are unread emails ✅

- [ ] **Step 4: Final commit**

```bash
git add app.html
git commit -m "feat: update gmail_loadForContact to use getGoogleToken() helper"
```
