/* ============================================================
   Gmail Layer
   Expone en window: getGoogleToken, gmail_storeTokens,
   gmailSync_run, gmail_fetchForHome, gmail_matchEmailsToLeads,
   gmail_fetchInbox, gmail_sendReply, gmail_loadForContact,
   _gmailHdr, _gmailFmtTime
   ============================================================ */

const _GAPI = 'https://gmail.googleapis.com/gmail/v1/users/me';
const _SF   = 'https://llleoqfeluptmmbqluab.supabase.co/functions/v1';

// ── Helpers ─────────────────────────────────────────────────

function _gmailHdr(msg, name) {
  return msg?.payload?.headers?.find(h => h.name === name)?.value || '';
}

function _gmailFmtTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function _parseAddresses(raw) {
  return (raw || '').split(/,(?![^<]*>)/).flatMap(part => {
    const t = part.trim();
    const m = t.match(/^"?([^"<]*)"?\s*<([^>]+)>/) || t.match(/([^\s<>"]+@[^\s<>"]+)/);
    if (!m) return [];
    return [{ name: (m[2] ? m[1] : '').trim(), email: (m[2] || m[1]).toLowerCase().trim() }];
  });
}

const _NOISE = /noreply|no-reply|mailer-daemon|newsletter|notifications?|unsubscribe|bounce|donotreply|do-not-reply|@googlegroups|@list\./i;
const _PERSONAL = new Set(['gmail.com','hotmail.com','yahoo.com','outlook.com','icloud.com','live.com','protonmail.com','me.com','msn.com']);

// ── Token management ─────────────────────────────────────────

async function getGoogleToken() {
  const token = sessionStorage.getItem('gtoken');
  const exp   = parseInt(sessionStorage.getItem('gtoken_exp') || '0');
  if (token && Date.now() < exp) return token;

  try {
    const { data: { session } } = await window.sb.auth.getSession();
    const jwt = session?.access_token;
    if (!jwt) return null;

    const res = await fetch(`${_SF}/refresh-google-token`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) return null;

    const { access_token, expires_in } = await res.json();
    if (!access_token) return null;

    sessionStorage.setItem('gtoken', access_token);
    sessionStorage.setItem('gtoken_exp', String(Date.now() + ((expires_in ?? 3600) - 60) * 1000));
    return access_token;
  } catch {
    return null;
  }
}

function gmail_storeTokens(session) {
  if (session.provider_token) {
    sessionStorage.setItem('gtoken', session.provider_token);
    sessionStorage.setItem('gtoken_exp', String(Date.now() + 55 * 60 * 1000));
  }
  if (session.provider_refresh_token && session.user?.id) {
    window.sb.from('google_tokens').upsert({
      user_id: session.user.id,
      refresh_token: session.provider_refresh_token,
      updated_at: new Date().toISOString(),
    }).then(() => {});
  }
}

// ── Gmail Sync (auto-discover leads on login) ────────────────

let _syncRunning = false;

async function gmailSync_run() {
  if (_syncRunning) return;
  _syncRunning = true;
  try {
    const token = await getGoogleToken();
    if (!token) return;

    const contacts = await _fetchContacts(token);
    if (!contacts.length) return;

    const { data: { session } } = await window.sb.auth.getSession();
    const jwt = session?.access_token;
    if (!jwt) return;

    const res = await fetch(`${_SF}/enrich-gmail-contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ contacts }),
    });
    if (!res.ok) return;

    const { leads: enriched } = await res.json();
    if (!enriched?.length) return;

    const uid = session.user.id;
    for (const l of enriched) {
      if (!l.email) continue;
      const { data: existing } = await window.sb.from('leads')
        .select('id').eq('user_id', uid).eq('data->>email', l.email).maybeSingle();

      const rowData = {
        empresa: l.empresa || '',
        lead: l.lead || '',
        email: l.email,
        domain: l.domain || '',
        estado: l.estado || 'sininfo',
        prioridad: l.prioridad || 'media',
        valor: null,
        resumen: l.notas || '',
        accion: '',
        ultimoContacto: new Date().toISOString().split('T')[0],
        channel: 'gmail',
      };

      if (existing?.id) {
        await window.sb.from('leads').update({ data: rowData, updated_at: new Date().toISOString() }).eq('id', existing.id);
      } else {
        await window.sb.from('leads').insert({ user_id: uid, data: rowData, updated_at: new Date().toISOString() });
      }
    }
  } catch (e) {
    console.error('gmailSync_run:', e);
  } finally {
    _syncRunning = false;
  }
}

async function _fetchContacts(token) {
  const h = { Authorization: `Bearer ${token}` };
  const [sentData, inboxData] = await Promise.all([
    fetch(`${_GAPI}/messages?labelIds=SENT&maxResults=50`, { headers: h }).then(r => r.json()).catch(() => ({})),
    fetch(`${_GAPI}/messages?labelIds=INBOX&maxResults=30`, { headers: h }).then(r => r.json()).catch(() => ({})),
  ]);

  const refs = [
    ...(sentData.messages || []).map(m => ({ id: m.id, src: 'sent' })),
    ...(inboxData.messages || []).map(m => ({ id: m.id, src: 'inbox' })),
  ];

  const results = await Promise.allSettled(refs.map(({ id, src }) =>
    fetch(`${_GAPI}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`, { headers: h })
      .then(r => r.json()).then(m => ({ ...m, _src: src }))
  ));

  const { data: { session } } = await window.sb.auth.getSession();
  const myEmail = session?.user?.email || '';
  const contactMap = new Map();

  results.filter(r => r.status === 'fulfilled').map(r => r.value).forEach(msg => {
    const src = msg._src;
    const raw = src === 'sent'
      ? (_gmailHdr(msg, 'To') + (_gmailHdr(msg, 'Cc') ? ',' + _gmailHdr(msg, 'Cc') : ''))
      : _gmailHdr(msg, 'From');

    _parseAddresses(raw).forEach(({ email, name }) => {
      if (!email || email === myEmail || _NOISE.test(email)) return;
      const domain = email.split('@')[1] || '';
      if (!contactMap.has(email)) contactMap.set(email, { email, name, domain, subjects: [], sent_count: 0, received_count: 0 });
      const c = contactMap.get(email);
      if (src === 'sent') c.sent_count++; else c.received_count++;
      const subj = _gmailHdr(msg, 'Subject');
      if (subj && c.subjects.length < 3) c.subjects.push(subj);
      if (!c.name && name) c.name = name;
    });
  });

  return Array.from(contactMap.values())
    .filter(c => !(_PERSONAL.has(c.domain) && (c.sent_count + c.received_count) < 3))
    .sort((a, b) => (b.sent_count + b.received_count) - (a.sent_count + a.received_count))
    .slice(0, 40);
}

// ── Home email load ──────────────────────────────────────────

async function gmail_fetchForHome() {
  const token = await getGoogleToken();
  if (!token) return { hasToken: false, messages: [] };

  const h = { Authorization: `Bearer ${token}` };
  try {
    const [inboxRes, sentRes] = await Promise.all([
      fetch(`${_GAPI}/messages?labelIds=INBOX&maxResults=30`, { headers: h }).then(r => r.json()).catch(() => ({})),
      fetch(`${_GAPI}/messages?labelIds=SENT&maxResults=20`, { headers: h }).then(r => r.json()).catch(() => ({})),
    ]);

    const refs = [
      ...(inboxRes.messages || []).map(m => ({ id: m.id, type: 'inbox' })),
      ...(sentRes.messages || []).map(m => ({ id: m.id, type: 'sent' })),
    ];

    const results = await Promise.allSettled(refs.map(({ id, type }) =>
      fetch(`${_GAPI}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`, { headers: h })
        .then(r => r.json()).then(m => ({ ...m, _type: type }))
    ));

    const all = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .sort((a, b) => new Date(_gmailHdr(b, 'Date')).getTime() - new Date(_gmailHdr(a, 'Date')).getTime())
      .slice(0, 30);

    return { hasToken: true, messages: all };
  } catch {
    return { hasToken: true, messages: [] };
  }
}

// Match Gmail messages to CRM leads by sender email
function gmail_matchEmailsToLeads(messages, leads) {
  const byEmail = {};
  leads.forEach(l => {
    const e = (l.email || '').toLowerCase().trim();
    if (e) byEmail[e] = l;
  });

  const matched = [];
  const seen = new Set();

  messages.forEach(msg => {
    const from = _gmailHdr(msg, 'From');
    const m = from.match(/<([^>]+)>/) || from.match(/([^\s<>"]+@[^\s<>"]+)/);
    const email = (m ? (m[1] || m[0]) : '').toLowerCase().trim();
    if (!email || seen.has(email)) return;
    const lead = byEmail[email];
    if (!lead) return;
    seen.add(email);
    matched.push({ msg, lead });
  });

  return matched;
}

// ── Inbox view ───────────────────────────────────────────────

async function gmail_fetchInbox() {
  const token = await getGoogleToken();
  if (!token) return { hasToken: false, messages: [] };

  const h = { Authorization: `Bearer ${token}` };
  try {
    const listRes = await fetch(`${_GAPI}/messages?labelIds=INBOX&maxResults=30`, { headers: h });
    if (listRes.status === 401) {
      sessionStorage.removeItem('gtoken'); sessionStorage.removeItem('gtoken_exp');
      return { hasToken: false, messages: [] };
    }
    const listData = await listRes.json();
    const msgs = listData.messages || [];
    if (!msgs.length) return { hasToken: true, messages: [] };

    const results = await Promise.allSettled(msgs.map(m =>
      fetch(`${_GAPI}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, { headers: h })
        .then(r => r.json())
    ));
    return {
      hasToken: true,
      messages: results.filter(r => r.status === 'fulfilled').map(r => r.value),
    };
  } catch {
    return { hasToken: true, messages: [], error: true };
  }
}

async function gmail_sendReply(originalMsg, replyText, fromEmail) {
  const token = await getGoogleToken();
  if (!token) return false;

  const to      = _gmailHdr(originalMsg, 'From');
  const rawSubj = _gmailHdr(originalMsg, 'Subject') || '';
  const subject = rawSubj.toLowerCase().startsWith('re:') ? rawSubj : `Re: ${rawSubj}`;
  const msgId   = _gmailHdr(originalMsg, 'Message-ID');
  const threadId = originalMsg.threadId;

  const raw = [
    `From: ${fromEmail}`, `To: ${to}`, `Subject: ${subject}`,
    ...(msgId ? [`In-Reply-To: ${msgId}`, `References: ${msgId}`] : []),
    `Content-Type: text/plain; charset=utf-8`, ``, replyText,
  ].join('\r\n');

  const encoded = btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  try {
    const res = await fetch(`${_GAPI}/messages/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded, ...(threadId ? { threadId } : {}) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function gmail_loadForContact(email) {
  const token = await getGoogleToken();
  if (!token) return { hasToken: false, messages: [] };

  const h = { Authorization: `Bearer ${token}` };
  try {
    const q = encodeURIComponent(`from:${email} OR to:${email}`);
    const listRes = await fetch(`${_GAPI}/messages?q=${q}&maxResults=15`, { headers: h });
    if (listRes.status === 401) {
      sessionStorage.removeItem('gtoken'); sessionStorage.removeItem('gtoken_exp');
      return { hasToken: false, messages: [] };
    }
    const listData = await listRes.json();
    const msgs = listData.messages || [];
    if (!msgs.length) return { hasToken: true, messages: [] };

    const details = await Promise.all(msgs.slice(0, 15).map(m =>
      fetch(`${_GAPI}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`, { headers: h })
        .then(r => r.json())
    ));
    return { hasToken: true, messages: details };
  } catch {
    return { hasToken: true, messages: [], error: true };
  }
}

Object.assign(window, {
  getGoogleToken,
  gmail_storeTokens,
  gmailSync_run,
  gmail_fetchForHome,
  gmail_matchEmailsToLeads,
  gmail_fetchInbox,
  gmail_sendReply,
  gmail_loadForContact,
  _gmailHdr,
  _gmailFmtTime,
});
