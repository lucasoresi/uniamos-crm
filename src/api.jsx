/* ============================================================
   API — importación/exportación masiva de leads + referencia REST
   Props: { leads, onRefresh }
   ============================================================ */

const _SUPA_URL = 'https://llleoqfeluptmmbqluab.supabase.co';

// CSV parser que respeta comillas
function _parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

// Normaliza una fila (objeto con claves variadas) a un lead UI
const _STAGE_LOOKUP = (() => {
  const m = {};
  STAGES.forEach(s => { m[s.id] = s.id; m[s.name.toLowerCase()] = s.id; m[s.short.toLowerCase()] = s.id; });
  return m;
})();
const _PRIO_LOOKUP = { urgente: 'urg', urg: 'urg', alta: 'alta', high: 'alta', media: 'media', medium: 'media', baja: 'baja', low: 'baja' };

function _pick(obj, keys) {
  for (const k of Object.keys(obj)) {
    if (keys.includes(k.toLowerCase().trim())) return obj[k];
  }
  return undefined;
}

function rowToLead(obj) {
  const lead = window.blankLead('sininfo');
  const co = _pick(obj, ['empresa', 'company', 'co', 'cuenta']);
  const contact = _pick(obj, ['contacto', 'contact', 'lead', 'nombre', 'name']);
  const email = _pick(obj, ['email', 'correo', 'mail']);
  const tel = _pick(obj, ['telefono', 'teléfono', 'tel', 'phone', 'celular']);
  const role = _pick(obj, ['cargo', 'role', 'puesto', 'title']);
  const stage = _pick(obj, ['etapa', 'estado', 'stage', 'status']);
  const prio = _pick(obj, ['prioridad', 'priority']);
  const value = _pick(obj, ['valor', 'value', 'monto', 'amount']);
  const sector = _pick(obj, ['sector', 'industry', 'industria']);
  const country = _pick(obj, ['pais', 'país', 'country']);
  const channel = _pick(obj, ['canal', 'channel', 'origen', 'source']);
  if (co != null && String(co).trim()) lead.co = String(co).trim();
  if (contact != null && String(contact).trim()) lead.contact = String(contact).trim();
  if (email != null) lead.email = String(email).trim().toLowerCase();
  if (tel != null) lead.tel = String(tel).trim();
  if (role != null && String(role).trim()) lead.role = String(role).trim();
  if (stage != null) lead.stage = _STAGE_LOOKUP[String(stage).toLowerCase().trim()] || 'sininfo';
  if (prio != null) lead.priority = _PRIO_LOOKUP[String(prio).toLowerCase().trim()] || 'media';
  if (value != null && String(value).trim()) { const n = Number(String(value).replace(/[^0-9.]/g, '')); if (Number.isFinite(n) && n > 0) lead.value = n; }
  if (sector != null && String(sector).trim()) lead.sector = String(sector).trim();
  if (country != null && String(country).trim()) lead.country = String(country).trim();
  if (channel != null && String(channel).trim()) lead.channel = String(channel).trim().toLowerCase();
  if (lead.email) lead.domain = lead.email.split('@')[1] || '';
  return lead;
}

function parseImport(text) {
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], error: '' };
  // JSON
  if (trimmed[0] === '[' || trimmed[0] === '{') {
    try {
      const data = JSON.parse(trimmed);
      const arr = Array.isArray(data) ? data : [data];
      return { rows: arr.map(rowToLead), error: '' };
    } catch { return { rows: [], error: 'JSON inválido. Revisá el formato.' }; }
  }
  // CSV
  const matrix = _parseCSV(trimmed);
  if (matrix.length < 2) return { rows: [], error: 'El CSV necesita una fila de encabezados y al menos una fila de datos.' };
  const headers = matrix[0].map(h => h.trim());
  const rows = matrix.slice(1).map(cells => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] != null ? cells[i].trim() : ''; });
    return rowToLead(obj);
  });
  return { rows, error: '' };
}

function _download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Api({ leads = [], onRefresh }) {
  const [tab, setTab] = React.useState('import');
  const [raw, setRaw] = React.useState('');
  const [parsed, setParsed] = React.useState(null);
  const [importing, setImporting] = React.useState(false);
  const [result, setResult] = React.useState('');

  function handleParse(text) {
    setRaw(text); setResult('');
    if (!text.trim()) { setParsed(null); return; }
    const { rows, error } = parseImport(text);
    setParsed({ rows, error });
  }
  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handleParse(String(reader.result || ''));
    reader.readAsText(file);
  }

  async function runImport() {
    if (!parsed || !parsed.rows.length || importing) return;
    setImporting(true); setResult('');
    let ok = 0, fail = 0;
    for (const lead of parsed.rows) {
      if (!lead.co && !lead.contact && !lead.email) { fail++; continue; }
      try { await window.upsertLead(lead); await window.addActivity('lead', lead.id, 'created', { via: 'import' }); ok++; }
      catch (e) { console.error('import row:', e); fail++; }
    }
    setResult(`✓ ${ok} leads importados${fail ? ` · ${fail} omitidos (sin datos o error)` : ''}.`);
    setRaw(''); setParsed(null);
    onRefresh && await onRefresh();
    setImporting(false);
  }

  function exportJSON() {
    const data = leads.map(l => ({
      empresa: l.co, contacto: l.contact, cargo: l.role, email: l.email, tel: l.tel,
      etapa: l.stage, prioridad: l.priority, valor: l.value, moneda: l.currency,
      sector: l.sector, pais: l.country, canal: l.channel, score: l.score,
    }));
    _download('leads-uniamos.json', JSON.stringify(data, null, 2), 'application/json');
  }
  function exportCSV() {
    const cols = ['empresa', 'contacto', 'cargo', 'email', 'tel', 'etapa', 'prioridad', 'valor', 'moneda', 'sector', 'pais', 'canal', 'score'];
    const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [cols.join(',')];
    leads.forEach(l => lines.push([l.co, l.contact, l.role, l.email, l.tel, l.stage, l.priority, l.value, l.currency, l.sector, l.country, l.channel, l.score].map(esc).join(',')));
    _download('leads-uniamos.csv', lines.join('\n'), 'text/csv');
  }

  const restSnippet = `// Leer tus leads vía REST (PostgREST de Supabase)
const res = await fetch(
  '${_SUPA_URL}/rest/v1/leads?select=*',
  {
    headers: {
      apikey: '<TU_ANON_KEY>',
      Authorization: 'Bearer <TU_ACCESS_TOKEN>'
    }
  }
);
const leads = await res.json();`;

  return (
    <div className="page view-enter">
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 24px 40px' }}>
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ fontFamily: 'var(--ff-display)', fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text)' }}>API & Datos</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>Importá y exportá leads en masa, y consultá tu backend vía REST.</p>
        </div>

        <div className="api-tabs">
          {[{ id: 'import', label: 'Importar' }, { id: 'export', label: 'Exportar' }, { id: 'rest', label: 'Referencia REST' }].map(t => (
            <button key={t.id} className={'api-tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {tab === 'import' && (
          <div className="api-panel">
            <p className="auto-help">Pegá JSON (array de objetos) o CSV (con encabezados), o subí un archivo. Columnas reconocidas: empresa, contacto, email, tel, cargo, etapa, prioridad, valor, sector, pais, canal.</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                <Icon name="attach" size={12}/> Subir archivo
                <input type="file" accept=".json,.csv,.txt" style={{ display: 'none' }} onChange={handleFile}/>
              </label>
              <button className="btn btn-ghost btn-sm" onClick={() => handleParse('[\n  { "empresa": "Acme", "contacto": "Ana Díaz", "email": "ana@acme.com", "etapa": "activa", "prioridad": "alta", "valor": 5000 }\n]')}>Ver ejemplo</button>
            </div>
            <textarea className="api-textarea" value={raw} onChange={e => handleParse(e.target.value)} placeholder='[ { "empresa": "...", "email": "..." } ]  ·  o  ·  empresa,email,etapa&#10;Acme,ana@acme.com,activa' rows={9}/>
            {parsed && parsed.error && <div className="form-err" style={{ marginTop: 8 }}>{parsed.error}</div>}
            {parsed && !parsed.error && (
              <div className="api-preview">
                <span><strong>{parsed.rows.length}</strong> leads detectados · {parsed.rows.filter(r => r.co || r.contact || r.email).length} válidos</span>
                <button className="btn btn-primary btn-sm" onClick={runImport} disabled={importing || !parsed.rows.length}>
                  {importing ? 'Importando…' : `Importar ${parsed.rows.length}`}
                </button>
              </div>
            )}
            {result && <div className="auto-runmsg" style={{ marginTop: 10 }}>{result}</div>}
          </div>
        )}

        {tab === 'export' && (
          <div className="api-panel">
            <p className="auto-help">Descargá tus {leads.length} leads actuales en el formato que prefieras.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline btn-sm" onClick={exportJSON} disabled={!leads.length}><Icon name="code" size={12}/> Exportar JSON</button>
              <button className="btn btn-outline btn-sm" onClick={exportCSV} disabled={!leads.length}><Icon name="layers" size={12}/> Exportar CSV</button>
            </div>
            {!leads.length && <div className="ld-empty-sm" style={{ textAlign: 'left', paddingLeft: 0 }}>No hay leads para exportar todavía.</div>}
          </div>
        )}

        {tab === 'rest' && (
          <div className="api-panel">
            <p className="auto-help">El backend es Supabase (PostgREST). Tus tablas se exponen como endpoints REST. Necesitás tu <code>anon key</code> y el <code>access_token</code> de tu sesión (RLS garantiza que solo veas tus datos).</p>
            <div className="api-endpoint"><span className="api-method">GET</span> <code>{_SUPA_URL}/rest/v1/leads?select=*</code></div>
            <div className="api-endpoint"><span className="api-method">GET</span> <code>{_SUPA_URL}/rest/v1/prospects?select=*</code></div>
            <div className="api-endpoint"><span className="api-method post">POST</span> <code>{_SUPA_URL}/rest/v1/leads</code></div>
            <pre className="api-code">{restSnippet}</pre>
            <p style={{ fontSize: 11.5, color: 'var(--text-4)', lineHeight: 1.5 }}>
              Tablas disponibles: <code>leads</code>, <code>prospects</code>, <code>activities</code>, <code>tasks</code>, <code>automations</code>, <code>user_services</code>, <code>ignored_senders</code>. Todas con Row Level Security por usuario.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

window.Api = Api;
