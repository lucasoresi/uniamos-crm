/* ============================================================
   Data layer — leads (Supabase ↔ React UI)
   - Mapping español (DB) ↔ inglés (UI)
   - CRUD: loadLeads, saveLead, deleteLead
   Expone window.{loadLeads, saveLead, deleteLead, dbToUi, uiToDb}
   ============================================================ */

const PRIORITY_DB_TO_UI = { urgente: 'urg', alta: 'alta', media: 'media', baja: 'baja' };
const PRIORITY_UI_TO_DB = { urg: 'urgente', alta: 'alta', media: 'media', baja: 'baja' };

// Score 0–100 basado en etapa, prioridad, recencia y valor
const _STAGE_BASE = { ganado: 100, cierre: 85, propuesta: 65, activa: 45, ghost: 20, frio: 8, sininfo: 5, perdido: 0 };
const _PRIO_BONUS = { urgente: 15, alta: 10, media: 5, baja: 0 };

function computeScore(d) {
  if (d.estado === 'ganado') return 100;
  if (d.estado === 'perdido') return 0;
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

// Salud del lead: señal de inactividad SEPARADA de la etapa (no mueve el pipeline).
// Estilo Pipedrive "rotting": alerta visual, la etapa real se respeta.
// Devuelve: 'cerrado' | 'al-dia' | 'en-riesgo' | 'dormido'
const _HEALTH_THRESHOLDS = { // [enRiesgo, dormido] en días, por etapa
  activa: [10, 21], propuesta: [14, 45], cierre: [5, 14],
  ghost: [0, 14], frio: [30, 60], sininfo: [14, 30],
};
function computeHealth(estado, ultimoContacto) {
  if (estado === 'ganado' || estado === 'perdido') return 'cerrado';
  const d = ultimoContacto ? new Date(ultimoContacto) : null;
  if (!d || isNaN(d.getTime())) return 'en-riesgo'; // sin fecha de contacto = atención
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  const [risk, dormant] = _HEALTH_THRESHOLDS[estado] || [14, 30];
  if (days >= dormant) return 'dormido';
  if (days >= risk) return 'en-riesgo';
  return 'al-dia';
}
const HEALTH_LABELS = {
  'al-dia': { label: 'Al día', color: 'var(--st-cierre)' },
  'en-riesgo': { label: 'En riesgo', color: 'var(--p-alta)' },
  'dormido': { label: 'Dormido', color: 'var(--p-urg)' },
  'cerrado': { label: 'Cerrado', color: 'var(--text-4)' },
};

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
    health: computeHealth(d.estado || 'sininfo', d.ultimoContacto),
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

// ── Crear lead manual ────────────────────────────────────────
function newLeadId() {
  const rnd = (window.crypto && window.crypto.randomUUID)
    ? window.crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return 'lead_' + Date.now().toString(36) + '_' + rnd;
}

// Lead UI vacío con valores por defecto sensatos
function blankLead(stage = 'sininfo') {
  return {
    id: newLeadId(),
    co: '', contact: '', role: '', email: '', tel: '',
    domain: '', gmailUrl: '',
    value: null, currency: 'USD',
    stage, priority: 'media',
    last: '', next: '',
    firstContact: new Date().toISOString().split('T')[0],
    lastContact: new Date().toISOString().split('T')[0],
    channel: 'gmail', country: '—', sector: '—',
    services: [], emails: 0, tasksOpen: 0, score: 0, aiMove: null,
    _raw: {},
  };
}

// saveLead pero preservando campos extra del _raw (sector, pais, canal, domain…)
async function upsertLead(lead) {
  const user = window.getUser();
  if (!user) throw new Error('No hay sesión');
  const base = uiToDb(lead);
  const data = {
    ...(lead._raw || {}),
    ...base,
    sector: lead.sector && lead.sector !== '—' ? lead.sector : (lead._raw?.sector || ''),
    pais: lead.country && lead.country !== '—' ? lead.country : (lead._raw?.pais || ''),
    canal: lead.channel || lead._raw?.canal || 'gmail',
    domain: lead.domain || lead._raw?.domain || (lead.email ? lead.email.split('@')[1] || '' : ''),
  };
  const { error } = await window.sb.from('leads').upsert({
    id: lead.id,
    user_id: user.id,
    data,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return lead.id;
}

// ── Actividades (timeline real: notas, cambios de etapa, etc.) ─
async function loadActivities(entityType, entityId) {
  const { data, error } = await window.sb
    .from('activities')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', String(entityId))
    .order('created_at', { ascending: false });
  if (error) { console.error('loadActivities:', error); return []; }
  return data || [];
}

async function addActivity(entityType, entityId, type, payload = {}) {
  const user = window.getUser();
  if (!user) throw new Error('No hay sesión');
  const { data, error } = await window.sb.from('activities').insert({
    user_id: user.id,
    entity_type: entityType,
    entity_id: String(entityId),
    type,
    data: payload,
  }).select().maybeSingle();
  if (error) throw error;
  return data;
}

// ── Tareas ───────────────────────────────────────────────────
function newTaskId() {
  const rnd = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return 'task_' + Date.now().toString(36) + '_' + rnd;
}

async function loadTasks() {
  const { data, error } = await window.sb.from('tasks').select('*').order('updated_at', { ascending: false });
  if (error) { console.error('loadTasks:', error); return []; }
  return (data || []).map(r => ({ id: r.id, ...(r.data || {}) }));
}

async function saveTask(task) {
  const user = window.getUser();
  if (!user) throw new Error('No hay sesión');
  const id = task.id || newTaskId();
  const data = {
    title: task.title || '',
    notes: task.notes || '',
    due: task.due || null,
    done: !!task.done,
    priority: task.priority || 'media',
    leadId: task.leadId || null,
    leadName: task.leadName || null,
    createdAt: task.createdAt || new Date().toISOString(),
  };
  const { error } = await window.sb.from('tasks').upsert({ id, user_id: user.id, data, updated_at: new Date().toISOString() });
  if (error) throw error;
  return id;
}

// Helper compacto usado por automatizaciones (acción create_task)
async function createTask({ title, due = null, priority = 'media', leadId = null, leadName = null, notes = '' }) {
  return saveTask({ title, due, priority, leadId, leadName, notes, done: false });
}

async function deleteTask(id) {
  const { error } = await window.sb.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

Object.assign(window, {
  loadLeads, saveLead, deleteLead, dbToUi, uiToDb,
  newLeadId, blankLead, upsertLead, loadActivities, addActivity,
  daysAgoLabel, computeHealth, HEALTH_LABELS,
  newTaskId, loadTasks, saveTask, createTask, deleteTask,
});
