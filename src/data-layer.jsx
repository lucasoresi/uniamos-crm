/* ============================================================
   Data layer — leads (Supabase ↔ React UI)
   - Mapping español (DB) ↔ inglés (UI)
   - CRUD: loadLeads, saveLead, deleteLead
   Expone window.{loadLeads, saveLead, deleteLead, dbToUi, uiToDb}
   ============================================================ */

const PRIORITY_DB_TO_UI = { urgente: 'urg', alta: 'alta', media: 'media', baja: 'baja' };
const PRIORITY_UI_TO_DB = { urg: 'urgente', alta: 'alta', media: 'media', baja: 'baja' };

function daysAgoLabel(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'hace 1d';
  return 'hace ' + days + 'd';
}

function dbToUi(row) {
  const d = row.data || {};
  const valorNum = d.valor != null ? Number(d.valor) : null;
  return {
    id: row.id,
    co: d.empresa || '—',
    contact: d.lead || '—',
    role: d.cargo || '—',
    email: d.email || '',
    tel: d.tel || '',
    domain: d.domain || '',
    gmailUrl: d.gmailUrl || '',
    value: Number.isFinite(valorNum) ? valorNum : null,
    currency: d.currency || 'USD',
    stage: d.estado || 'sininfo',
    priority: PRIORITY_DB_TO_UI[d.prioridad] || 'media',
    last: d.resumen || '',
    next: d.accion || '',
    firstContact: d.primerContacto || null,
    lastContact: d.ultimoContacto || null,
    lastActivity: daysAgoLabel(d.ultimoContacto),
    // Campos UI que aún no existen en DB — defaults para sub-proyectos siguientes
    score: 0,
    emails: 0,
    tasksOpen: 0,
    channel: d.canal || 'gmail',
    country: d.pais || '—',
    sector: d.sector || '—',
    aiMove: null,
  };
}

function uiToDb(lead) {
  return {
    empresa: lead.co,
    lead: lead.contact,
    cargo: lead.role,
    email: lead.email,
    tel: lead.tel,
    domain: lead.domain,
    gmailUrl: lead.gmailUrl,
    valor: lead.value,
    currency: lead.currency,
    estado: lead.stage,
    prioridad: PRIORITY_UI_TO_DB[lead.priority] || 'media',
    resumen: lead.last,
    accion: lead.next,
    primerContacto: lead.firstContact,
    ultimoContacto: lead.lastContact,
  };
}

async function loadLeads() {
  const { data, error } = await window.sb
    .from('leads')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(dbToUi);
}

async function saveLead(lead) {
  const user = window.getUser();
  if (!user) throw new Error('No hay sesión');
  const payload = {
    id: lead.id,
    user_id: user.id,
    data: uiToDb(lead),
    updated_at: new Date().toISOString(),
  };
  const { error } = await window.sb.from('leads').upsert(payload);
  if (error) throw error;
}

async function deleteLead(id) {
  const { error } = await window.sb.from('leads').delete().eq('id', id);
  if (error) throw error;
}

Object.assign(window, { loadLeads, saveLead, deleteLead, dbToUi, uiToDb });
