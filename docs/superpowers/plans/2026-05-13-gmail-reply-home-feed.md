# Gmail Reply + Home Activity Feed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar reply de emails directamente desde el panel Gmail del CRM, y convertir "Emails recientes" del Inicio en un feed de actividad que muestra todos los emails recibidos y enviados.

**Architecture:** Dos cambios independientes en `app.html`: (1) `gmail_selectMessage()` agrega textarea + `gmail_sendReply()` que llama a Gmail API; (2) `home_load()` + `home_render()` se refactorizan para mostrar inbox (30) + sent (20) sin filtro de leads ni clasificación IA. `login.html` recibe el scope `gmail.send`.

**Tech Stack:** Vanilla JS, Gmail REST API v1, Supabase Auth (para token JWT), OAuth2 scope `gmail.send`

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `login.html` línea 240 | Agregar `gmail.send` al scope OAuth |
| `app.html` — `gmail_selectMessage()` ~línea 4310 | Agregar textarea de respuesta y botón enviar al preview |
| `app.html` — después de `gmail_selectMessage()` | Agregar `gmail_sendReplyFromPanel()` y `gmail_sendReply()` |
| `app.html` — `home_load()` ~línea 1604 | Refactorizar para fetch inbox + sent, sin AI classify |
| `app.html` — `home_render()` ~línea 1676 | Refactorizar para feed genérico con badges Recibido/Enviado |

---

## Task 1: Agregar scope `gmail.send` en login.html

**Files:**
- Modify: `login.html` línea 240

- [ ] **Step 1: Localizar y reemplazar el scope en `login.html`**

Localizar exactamente esta línea:
```javascript
        scopes: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly',
```

Reemplazar con:
```javascript
        scopes: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.readonly',
```

- [ ] **Step 2: Verificar el cambio**

```bash
grep -n "gmail.send" /mnt/c/Users/lucas/Desktop/uniamos-crm/uniamos-crm/login.html
```

Resultado esperado: `240:        scopes: '...gmail.send...'`

- [ ] **Step 3: Commit**

```bash
git add /mnt/c/Users/lucas/Desktop/uniamos-crm/uniamos-crm/login.html
git commit -m "feat: add gmail.send OAuth scope for email reply"
```

---

## Task 2: Agregar `gmail_sendReply()` y `gmail_sendReplyFromPanel()` en app.html

**Files:**
- Modify: `app.html` — agregar las dos funciones ANTES del cierre `</script>` (al final del bloque de funciones Gmail, después de `gmail_updateUnreadBadge`)

Las dos funciones se agregan juntas después de `gmail_updateUnreadBadge()`.

- [ ] **Step 1: Agregar las dos funciones al final del bloque Gmail, antes de `</script>`**

Localizar en app.html esta línea (es el final del archivo):
```javascript
function gmail_updateUnreadBadge(messages) {
  const count = messages.filter(m => (m.labelIds || []).includes('UNREAD')).length;
  const badge = document.getElementById('nav-gmail-badge');
  if (!badge) return;
  badge.textContent = count;
  badge.style.display = count > 0 ? '' : 'none';
}
```

Agregar DESPUÉS del `}` de cierre de esa función y ANTES de `</script>`:

```javascript

async function gmail_sendReplyFromPanel(msgId, textareaId) {
  const msg = gmailInboxMessages.find(m => m.id === msgId);
  const textarea = document.getElementById(textareaId);
  if (!msg || !textarea) return;

  const replyText = textarea.value.trim();
  if (!replyText) return;

  const btn = textarea.nextElementSibling;
  if (btn) btn.style.opacity = '0.4';
  textarea.disabled = true;

  const ok = await gmail_sendReply(msg, replyText);
  if (ok) {
    textarea.value = '';
    textarea.style.height = 'auto';
  }
  if (btn) btn.style.opacity = '1';
  textarea.disabled = false;
}

async function gmail_sendReply(originalMsg, replyText) {
  const token = await getGoogleToken();
  if (!token) { showToast('Gmail no conectado', 'global_toast', true); return false; }

  const headers = originalMsg.payload?.headers || [];
  const get = name => headers.find(h => h.name === name)?.value || '';
  const to = get('From');
  const rawSubject = get('Subject') || '';
  const subject = rawSubject.toLowerCase().startsWith('re:') ? rawSubject : `Re: ${rawSubject}`;
  const messageId = get('Message-ID');
  const threadId = originalMsg.threadId;

  const emailLines = [
    `From: ${currentUser.email}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    ...(messageId ? [`In-Reply-To: ${messageId}`, `References: ${messageId}`] : []),
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    replyText
  ];

  const raw = emailLines.join('\r\n');
  const encoded = btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded, ...(threadId ? { threadId } : {}) })
  });

  if (!res.ok) {
    console.error('Gmail send error:', res.status);
    showToast('Error al enviar el email', 'global_toast', true);
    return false;
  }

  showToast('Email enviado ✓');
  return true;
}
```

- [ ] **Step 2: Verificar que las funciones existen**

```bash
grep -n "gmail_sendReply\|gmail_sendReplyFromPanel" /mnt/c/Users/lucas/Desktop/uniamos-crm/uniamos-crm/app.html
```

Resultado esperado: al menos 4 líneas (definición + uso de cada función).

- [ ] **Step 3: Commit**

```bash
git add /mnt/c/Users/lucas/Desktop/uniamos-crm/uniamos-crm/app.html
git commit -m "feat: add gmail_sendReply and gmail_sendReplyFromPanel functions"
```

---

## Task 3: Modificar `gmail_selectMessage()` para agregar el textarea de respuesta

**Files:**
- Modify: `app.html` — función `gmail_selectMessage()` ~línea 4310

- [ ] **Step 1: Reemplazar la función `gmail_selectMessage()` completa**

Localizar la función completa (desde `function gmail_selectMessage(msgId) {` hasta su `}` de cierre). Reemplazarla con:

```javascript
function gmail_selectMessage(msgId) {
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
  const snippet = escHtml(msg.snippet || '');
  const gmailLink = `https://mail.google.com/mail/#inbox/${msg.id}`;
  const senderName = escHtml(from.replace(/<[^>]+>/, '').trim() || from.split('@')[0] || '?');
  const replyId = `reply-${msg.id}`;

  document.getElementById('gmail-preview-panel').innerHTML = `
    <div style="max-width:580px;width:100%;display:flex;flex-direction:column">
      <div style="padding:28px 0 16px">
        <div style="font-size:.72rem;color:var(--text-3);margin-bottom:4px">${escHtml(from)}</div>
        <div style="font-size:1.05rem;font-weight:800;color:var(--text);margin-bottom:6px;line-height:1.3">${escHtml(subject)}</div>
        <div style="font-size:.72rem;color:var(--text-3);padding-bottom:14px;border-bottom:1px solid var(--border);margin-bottom:16px">${escHtml(date)}</div>
        <div style="font-size:.84rem;color:var(--text-2);line-height:1.75">${snippet}</div>
        <a href="${gmailLink}" target="_blank"
          style="display:inline-flex;align-items:center;gap:6px;margin-top:22px;padding:9px 20px;background:#C4E538;color:#0A0A0A;border-radius:6px;font-weight:700;font-size:.82rem;text-decoration:none">
          Abrir en Gmail ↗
        </a>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:14px;padding-bottom:8px">
        <div style="display:flex;gap:10px;align-items:flex-end">
          <textarea id="${replyId}" placeholder="Responder a ${senderName}…"
            style="flex:1;background:#1c1c1e;border:1px solid var(--border);border-radius:16px;padding:10px 16px;color:var(--text);font-size:.84rem;font-family:inherit;resize:none;line-height:1.5;min-height:44px;max-height:140px;outline:none;transition:border-color .15s;box-sizing:border-box"
            rows="1"
            oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,140)+'px'"
            onfocus="this.style.borderColor='rgba(196,229,56,.4)'"
            onblur="this.style.borderColor='var(--border)'"></textarea>
          <button onclick="gmail_sendReplyFromPanel('${msg.id}','${replyId}')"
            style="width:40px;height:40px;border-radius:50%;background:#C4E538;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .15s"
            title="Enviar respuesta">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    </div>`;
}
```

- [ ] **Step 2: Verificar que `gmail_sendReplyFromPanel` es referenciada en el nuevo `gmail_selectMessage`**

```bash
grep -n "gmail_sendReplyFromPanel" /mnt/c/Users/lucas/Desktop/uniamos-crm/uniamos-crm/app.html
```

Resultado esperado: al menos 2 líneas (definición en Task 2 + llamada inline en onclick).

- [ ] **Step 3: Commit**

```bash
git add /mnt/c/Users/lucas/Desktop/uniamos-crm/uniamos-crm/app.html
git commit -m "feat: add reply textarea to Gmail preview panel"
```

---

## Task 4: Refactorizar `home_load()` — feed inbox + sent sin clasificación IA

**Files:**
- Modify: `app.html` — función `home_load()` ~línea 1604

- [ ] **Step 1: Reemplazar la función `home_load()` completa**

Localizar la función desde `async function home_load() {` hasta su `}` de cierre. Reemplazarla por:

```javascript
async function home_load() {
  if (homeLoading) return;
  homeLoading = true;
  const dateEl = document.getElementById('home-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  const emailsEl = document.getElementById('home-emails-panel');
  const movesEl = document.getElementById('home-moves-panel');
  const fuEl = document.getElementById('home-fu-panel');
  if (emailsEl) emailsEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3);font-size:.82rem">⏳ Cargando comunicaciones…</div>';
  if (movesEl) movesEl.innerHTML = '<div style="font-size:.72rem;color:var(--text-3);padding:8px 4px">Cargando…</div>';
  if (fuEl) fuEl.innerHTML = '<div style="font-size:.72rem;color:var(--text-3);padding:8px 4px">Cargando…</div>';
  homeAutoMovedToday.clear();

  const token = await getGoogleToken();
  const leadsResult = await supabase.from('leads').select('*').eq('user_id', currentUser.id);
  leads = leadsResult.data || leads;

  if (!token) {
    if (emailsEl) emailsEl.innerHTML = '<div style="padding:20px;font-size:.82rem;color:var(--text-3)">Gmail no conectado. <a href="login.html" style="color:#C4E538">Iniciar sesión con Google →</a></div>';
    home_render([], leads);
    homeLoading = false;
    return;
  }

  // Fetch inbox + sent in parallel
  const [inboxData, sentData] = await Promise.all([
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=30',
      { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({})),
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=SENT&maxResults=20',
      { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({}))
  ]);

  if (inboxData === null || sentData === null) {
    sessionStorage.removeItem('gtoken');
    sessionStorage.removeItem('gtoken_expires');
    if (emailsEl) emailsEl.innerHTML = '<div style="padding:20px;font-size:.82rem;color:var(--text-3)">Sesión de Gmail expirada. <a href="login.html" style="color:#C4E538">Reconectar →</a></div>';
    home_render([], leads);
    homeLoading = false;
    return;
  }

  const allRefs = [
    ...(inboxData.messages || []).map(m => ({ id: m.id, type: 'inbox' })),
    ...(sentData.messages || []).map(m => ({ id: m.id, type: 'sent' }))
  ];

  if (!allRefs.length) {
    home_render([], leads);
    homeLoading = false;
    return;
  }

  // Fetch metadata for all messages in parallel
  const msgResults = await Promise.allSettled(
    allRefs.map(({ id, type }) =>
      fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata` +
        `&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then(r => r.json()).then(msg => ({ ...msg, _type: type }))
    )
  );

  const allMessages = msgResults
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)
    .sort((a, b) => {
      const d = m => {
        const h = m.payload?.headers || [];
        const s = h.find(x => x.name === 'Date')?.value || '';
        return s ? new Date(s).getTime() : 0;
      };
      return d(b) - d(a);
    })
    .slice(0, 30);

  // Keep inbox messages for badge + drawer
  const inboxMessages = allMessages.filter(m => m._type === 'inbox');
  gmailInboxMessages = inboxMessages;
  gmail_updateUnreadBadge(inboxMessages);

  // Simplified match for CRM drawer (no AI)
  const matched = home_matchEmailsToLeads(inboxMessages, leads);
  homeClassifications = matched.map(({ email_msg, lead }) => ({
    email_msg, lead,
    original_stage: lead.data.estado,
    new_stage: lead.data.estado,
    signal: 'neutral', reason: '', changed: false
  }));
  crm_drawer_render(homeClassifications);

  const btn = document.getElementById('crm-drawer-btn');
  if (btn) {
    const unread = inboxMessages.filter(m => (m.labelIds || []).includes('UNREAD')).length;
    btn.textContent = unread > 0 ? `📧 Emails (${unread} nuevos) ▾` : '📧 Emails ▾';
  }

  home_render(allMessages, leads);
  homeLoading = false;
}
```

- [ ] **Step 2: Verificar que `home_load` no tiene referencias a `home_classifyOne` ni `classifyResults`**

```bash
grep -n "classifyOne\|classifyResults\|matched.map.*classifyOne" /mnt/c/Users/lucas/Desktop/uniamos-crm/uniamos-crm/app.html
```

Resultado esperado: sin resultados (la clasificación IA se elimina del home).

- [ ] **Step 3: Commit**

```bash
git add /mnt/c/Users/lucas/Desktop/uniamos-crm/uniamos-crm/app.html
git commit -m "feat: refactor home_load to show inbox+sent feed without AI classify"
```

---

## Task 5: Refactorizar `home_render()` — feed de comunicaciones con badges

**Files:**
- Modify: `app.html` — función `home_render()` ~línea 1676

- [ ] **Step 1: Reemplazar la función `home_render()` completa**

Localizar la función desde `function home_render(classifications, allLeads) {` hasta su `}` de cierre. Reemplazarla por:

```javascript
function home_render(allMessages, allLeads) {
  const today = new Date();

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

  const pEl = document.getElementById('home-stat-pipeline');
  const aEl = document.getElementById('home-stat-activos');
  const eEl = document.getElementById('home-stat-emails');
  const fEl = document.getElementById('home-stat-followups');
  const mEl = document.getElementById('home-stat-moved');
  if (pEl) pEl.textContent = pipelineVal > 0 ? '$' + pipelineVal.toLocaleString('es') : '—';
  if (aEl) aEl.textContent = activeLeads;
  if (eEl) eEl.textContent = unread;
  if (fEl) fEl.textContent = fuLeads.length;
  if (mEl) mEl.textContent = homeAutoMovedToday.size;

  // Communications feed
  const emailsEl = document.getElementById('home-emails-panel');
  if (emailsEl) {
    if (!allMessages.length) {
      emailsEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3);font-size:.82rem">Sin comunicaciones recientes</div>';
    } else {
      emailsEl.innerHTML = allMessages.map(msg => {
        const headers = msg.payload?.headers || [];
        const get = name => headers.find(h => h.name === name)?.value || '';
        const isSent = msg._type === 'sent';
        const dateRaw = get('Date');
        const timeStr = dateRaw ? new Date(dateRaw).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
        const subject = get('Subject') || '(sin asunto)';
        const isUnread = !isSent && (msg.labelIds || []).includes('UNREAD');

        let displayName, initials;
        if (isSent) {
          const to = get('To');
          displayName = to.replace(/<[^>]+>/, '').trim() || to.split('@')[0] || '?';
          initials = '→';
        } else {
          const from = get('From');
          displayName = from.replace(/<[^>]+>/, '').trim() || from.split('@')[0] || '?';
          initials = displayName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
        }

        const badgeHtml = isSent
          ? `<span style="font-size:.62rem;color:#555;margin-top:2px;display:inline-block">📤 Enviado</span>`
          : `<span style="font-size:.62rem;color:#555;margin-top:2px;display:inline-block">📧 Recibido</span>`;

        const avatarBg = isSent ? 'rgba(60,60,60,.3)' : isUnread ? 'rgba(196,229,56,.12)' : 'rgba(60,60,60,.5)';
        const avatarColor = isSent ? '#444' : isUnread ? '#C4E538' : '#555';
        const nameWeight = isUnread ? '700' : '500';
        const nameColor = isUnread ? '#ddd' : '#888';
        const leftBorder = isSent ? '#222' : isUnread ? 'rgba(196,229,56,.3)' : '#1a1a1a';

        return `<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 10px;background:#1a1a1a;border-radius:6px;border-left:3px solid ${leftBorder}">
          <div style="width:28px;height:28px;border-radius:50%;background:${avatarBg};color:${avatarColor};display:flex;align-items:center;justify-content:center;font-size:.58rem;font-weight:700;flex-shrink:0">${escHtml(initials)}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:.7rem;font-weight:${nameWeight};color:${nameColor}">${escHtml(displayName)}</span>
              <span style="font-size:.6rem;color:#444;flex-shrink:0;margin-left:8px">${escHtml(timeStr)}</span>
            </div>
            <div style="font-size:.63rem;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(subject)}</div>
            ${badgeHtml}
          </div>
        </div>`;
      }).join('');
    }
  }

  // Movements panel
  const movesEl = document.getElementById('home-moves-panel');
  if (movesEl) {
    movesEl.innerHTML = '<div style="font-size:.72rem;color:var(--text-3);padding:8px 4px">Los movimientos automáticos ocurren al sincronizar Gmail al iniciar sesión</div>';
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

- [ ] **Step 2: Verificar que `home_render` recibe `allMessages` (no `classifications`)**

```bash
grep -n "home_render(" /mnt/c/Users/lucas/Desktop/uniamos-crm/uniamos-crm/app.html
```

Resultado esperado: todas las llamadas a `home_render` usan `allMessages` como primer argumento.

- [ ] **Step 3: Verificar que no quedan referencias rotas a `classifications` en `home_render`**

```bash
grep -n "classifications" /mnt/c/Users/lucas/Desktop/uniamos-crm/uniamos-crm/app.html | grep -v "homeClassifications\|crm_drawer_render"
```

Resultado esperado: sin resultados (solo deben quedar `homeClassifications` y `crm_drawer_render`).

- [ ] **Step 4: Commit**

```bash
git add /mnt/c/Users/lucas/Desktop/uniamos-crm/uniamos-crm/app.html
git commit -m "feat: refactor home_render to communications activity feed (inbox + sent)"
```

---

## Notas de implementación

- El scope `gmail.send` requiere que el usuario re-autorice Google la próxima vez que haga login. Usuarios existentes verán el pop-up de permisos una sola vez.
- `gmail_sendReply` usa `btoa(unescape(encodeURIComponent()))` para codificar UTF-8 a base64url — necesario para caracteres como ñ, á, etc.
- El drawer del CRM Pipeline (`crm_drawer_render`) se mantiene funcional: sigue mostrando emails de leads conocidos, pero sin clasificación IA (sin mover etapas automáticamente desde el Home).
- La función `home_classifyOne` queda en el código (no se elimina) por si se necesita en el futuro, pero ya no se llama desde `home_load`.
- El feed del Home muestra máximo 30 items (los más recientes de inbox+sent mezclados).
