/* ============================================================
   Data layer — leads (Supabase ↔ React UI)
   - Mapping español (DB) ↔ inglés (UI)
   - CRUD: loadLeads, saveLead, deleteLead
   Expone window.{loadLeads, saveLead, deleteLead, dbToUi, uiToDb}
   ============================================================ */

const PRIORITY_DB_TO_UI = { urgente: 'urg', alta: 'alta', media: 'media', baja: 'baja' };
const PRIORITY_UI_TO_DB = { urg: 'urgente', alta: 'alta', media: 'media', baja: 'baja' };

// Score 0–100 basado en etapa, prioridad, recencia y valor
const _STAGE_BASE = { cierre: 85, propuesta: 65, activa: 45, ghost: 20, frio: 8, sininfo: 5 };
const _PRIO_BONUS = { urgente: 15, alta: 10, media: 5, baja: 0 };

function computeScore(d) {
  let s = _STAGE_BASE[d.estado] || 5;
  s += _PRIO_BONUS[d.prioridad] || 0;
  if (d.ultimoContacto) {
    const days = Math.floor((Date.now() - new Date(d.ultimoContacto).getTime()) / 86400000);
    if (days > 30) s -= 20;
    else if (days > 14) s -= 10;
    else if (days > 7) s -= 5;
  }
  if (d.valor && Number(d.valor) > 0) s += 5;
  return Math.min(Math.max(Math.round(s), 0), 100);
}

// Decay temporal: mueve etapas automáticamente según días sin contacto
function decayStage(estado, ultimoContacto) {
  if (estado === 'cierre' || estado === 'frio' || estado === 'sininfo') return estado;
  // Sin fecha → lead sin historial de contacto real, tratar como ghost
  if (!ultimoContacto) return estado === 'activa' || estado === 'propuesta' ? 'ghost' : estado;
  const d = new Date(ultimoContacto);
  if (isNaN(d.getTime())) return estado;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (estado === 'activa' && days > 14) return 'ghost';
  if (estado === 'propuesta' && days > 60) return 'ghost'; // propuesta tiene margen más largo
  if (estado === 'ghost' && days > 45) return 'frio';
  return estado;
}

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
    stage: decayStage(d.estado || 'sininfo', d.ultimoContacto),
    priority: PRIORITY_DB_TO_UI[d.prioridad] || 'media',
    last: d.resumen || '',
    next: d.accion || '',
    firstContact: d.primerContacto || null,
    lastContact: d.ultimoContacto || null,
    lastActivity: daysAgoLabel(d.ultimoContacto),
    score: computeScore(d),
    emails: 0,
    tasksOpen: 0,
    channel: d.canal || 'gmail',
    country: d.pais || '—',
    sector: d.sector || '—',
    aiMove: null,
    services: Array.isArray(d.services) ? d.services : [],
    _raw: row.data || {},
  };
}

function uiToDb(lead) {
  const _svSum = Array.isArray(lead.services)
    ? lead.services.reduce((sum, s) => sum + (Number(s.price) || 0), 0)
    : 0;
  return {
    empresa: lead.co,
    lead: lead.contact,
    cargo: lead.role,
    email: lead.email,
    tel: lead.tel,
    domain: lead.domain,
    gmailUrl: lead.gmailUrl,
    services: Array.isArray(lead.services) ? lead.services : [],
    valor: _svSum > 0 ? _svSum : (lead.value ?? null),
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
