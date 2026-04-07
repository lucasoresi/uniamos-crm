# Timeline de Actividades — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an activity timeline system to Uniamos CRM that auto-logs all interactions with leads/prospects and supports manual notes, displayed in the detail panel.

**Architecture:** New `activities` table in Supabase with RLS. Central `activity_log()` function for fire-and-forget inserts. Timeline UI rendered in a new tab within existing detail panels. Phased rollout: core auto-logging first, then communication tracking, then field changes.

**Tech Stack:** Vanilla JS (inline in app.html), Supabase JS client (`supabase` variable), CSS custom properties (existing dark theme)

**Spec:** `docs/superpowers/specs/2026-03-31-timeline-actividades-design.md`
**Schema:** `docs/superpowers/specs/2026-03-31-activities-schema.md`

---

## File Structure

All changes happen in a single file following the existing pattern:

- **Modify:** `app.html` — all CSS, HTML, and JS changes go here
- **Reference:** `schema.sql` — the activities table SQL is documented in the schema spec but must be run manually in Supabase Dashboard before implementation

**Pre-requisite:** The user must create the `activities` table in Supabase before starting Task 1. SQL is in `docs/superpowers/specs/2026-03-31-activities-schema.md`.

---

### Task 1: CSS for Timeline Components

**Files:**
- Modify: `app.html:10-230` (CSS section)

- [ ] **Step 1: Add timeline CSS after existing card styles (after line ~119)**

Add this CSS block right before the `/* DETAIL PANEL */` comment (line 121 in app.html):

```css
/* TIMELINE */
.panel-tabs{display:flex;border-bottom:2px solid var(--border);padding:0 24px;flex-shrink:0}
.panel-tab{padding:10px 14px;font-size:.78rem;color:var(--text-3);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;font-weight:600;transition:all .15s}
.panel-tab.active{color:#C4E538;border-bottom-color:#C4E538;font-weight:700}
.panel-tab:hover:not(.active){color:var(--text-2)}
.timeline-wrap{flex:1;display:flex;flex-direction:column;overflow:hidden}
.timeline-filters{display:flex;gap:5px;padding:10px 24px;flex-wrap:wrap;flex-shrink:0}
.tl-pill{padding:3px 10px;border-radius:12px;font-size:.67rem;font-weight:700;cursor:pointer;border:none;background:rgba(255,255,255,.06);color:rgba(255,255,255,.5);transition:all .15s;font-family:inherit}
.tl-pill.active{background:rgba(196,229,56,.15);color:#C4E538}
.tl-pill:hover:not(.active){background:rgba(255,255,255,.1);color:rgba(255,255,255,.7)}
.timeline-list{flex:1;overflow-y:auto;padding:0 24px}
.tl-entry{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.tl-icon{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:.7rem}
.tl-icon-stage{background:rgba(196,229,56,.15)}
.tl-icon-email{background:rgba(59,130,246,.15)}
.tl-icon-note{background:rgba(251,146,60,.15)}
.tl-icon-field{background:rgba(255,255,255,.06)}
.tl-icon-created{background:rgba(34,197,94,.15)}
.tl-icon-deleted{background:rgba(220,38,38,.15)}
.tl-icon-automation{background:rgba(234,179,8,.15)}
.tl-icon-prm{background:rgba(196,229,56,.15)}
.tl-body{flex:1;min-width:0}
.tl-title{font-size:.78rem;font-weight:600;color:var(--text)}
.tl-sub{font-size:.68rem;color:rgba(255,255,255,.35);margin-top:1px}
.tl-note-text{font-size:.68rem;color:rgba(255,255,255,.55);line-height:1.4;margin-top:2px}
.tl-time{font-size:.65rem;color:rgba(255,255,255,.3);white-space:nowrap;flex-shrink:0}
.tl-empty{text-align:center;padding:40px 20px;color:var(--text-3);font-size:.82rem}
.timeline-input{border-top:1px solid var(--border);padding:10px 24px;background:#0A0A0A;flex-shrink:0}
.tl-subtypes{display:flex;gap:6px;margin-bottom:6px}
.tl-subtype{padding:2px 8px;border-radius:8px;font-size:.62rem;font-weight:700;cursor:pointer;border:none;background:rgba(255,255,255,.06);color:rgba(255,255,255,.4);transition:all .15s;font-family:inherit}
.tl-subtype.active{background:rgba(251,146,60,.2);color:#FB923C}
.tl-input-row{display:flex;gap:6px}
.tl-input-row input{flex:1;padding:7px 10px;background:#1A1A1A;border:1px solid rgba(255,255,255,.08);border-radius:6px;color:#fff;font-size:.78rem;outline:none;font-family:inherit}
.tl-input-row input:focus{border-color:#C4E538;box-shadow:0 0 0 3px rgba(196,229,56,.2)}
.tl-input-row button{padding:7px 14px;background:#C4E538;color:#0A0A0A;border:none;border-radius:6px;font-weight:800;font-size:.75rem;cursor:pointer;font-family:inherit}
.tl-input-row button:hover{background:#A8C42A}
.card-activity-badge{font-size:.62rem;color:var(--text-3);display:inline-flex;align-items:center;gap:3px}
```

- [ ] **Step 2: Verify CSS was added correctly**

Open `app.html` in browser at `http://localhost:3000/app.html`, open DevTools, search for `.panel-tabs` in Elements panel. Confirm the styles are present (they won't be visible yet since no HTML uses them).

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "feat: add CSS styles for activity timeline components"
```

---

### Task 2: Core JS — `activity_log`, `activity_loadTimeline`, `activity_formatTime`

**Files:**
- Modify: `app.html:1640-1644` (before `// INIT` section)

- [ ] **Step 1: Add the core activity functions before the `// INIT` line**

Insert this code block right before `// INIT` (line 1642) and before `initSession();` (line 1643):

```javascript
// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY TIMELINE MODULE
// ═══════════════════════════════════════════════════════════════════════════════

const ACTIVITY_ICONS = {
  stage_change: { icon: '↗', css: 'tl-icon-stage' },
  email_sent:   { icon: '✉', css: 'tl-icon-email' },
  calendar_event: { icon: '📅', css: 'tl-icon-note' },
  note:         { icon: '📝', css: 'tl-icon-note' },
  field_change: { icon: '✎', css: 'tl-icon-field' },
  created:      { icon: '+', css: 'tl-icon-created' },
  deleted:      { icon: '✗', css: 'tl-icon-deleted' },
  automation:   { icon: '⚙', css: 'tl-icon-automation' },
  prm_to_crm:   { icon: '⬆', css: 'tl-icon-prm' }
};

const ACTIVITY_NOTE_ICONS = {
  llamada: '📞',
  reunion: '🤝',
  nota: '📝',
  tarea: '✅'
};

const ACTIVITY_FILTER_MAP = {
  todos: null,
  notas: ['note'],
  emails: ['email_sent', 'calendar_event'],
  cambios: ['stage_change', 'field_change', 'automation', 'created', 'deleted', 'prm_to_crm']
};

let activity_currentFilter = 'todos';
let activity_currentSubtype = 'nota';
let activity_cachedList = [];

function activity_formatTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return 'hace ' + diffMin + 'm';
  if (diffHr < 24) return 'hace ' + diffHr + 'h';
  if (diffDay === 1) return 'ayer';
  if (diffDay < 7) return 'hace ' + diffDay + 'd';
  return date.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

async function activity_log(entityType, entityId, type, data) {
  try {
    await supabase.from('activities').insert([{
      user_id: currentUser.id,
      entity_type: entityType,
      entity_id: entityId,
      type: type,
      data: data || {}
    }]);
  } catch (e) {
    console.warn('Activity log failed:', e);
  }
  // If detail panel is open for this entity, refresh timeline
  const openId = entityType === 'lead' ? crm_editingId : prm_editingId;
  if (openId === entityId) {
    activity_loadAndRender(entityType, entityId);
  }
}

async function activity_loadTimeline(entityType, entityId) {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('Activity load failed:', e);
    return [];
  }
}

function activity_renderEntry(a) {
  const iconInfo = ACTIVITY_ICONS[a.type] || { icon: '?', css: 'tl-icon-field' };
  let icon = iconInfo.icon;
  let title = '';
  let sub = '';
  let noteText = '';

  switch (a.type) {
    case 'stage_change':
      title = 'Movido a <span style="color:#C4E538">' + (CRM_STAGES.find(s => s.id === a.data.to)?.label || a.data.to) + '</span>';
      sub = 'desde ' + (CRM_STAGES.find(s => s.id === a.data.from)?.label || a.data.from) + ' · Auto';
      break;
    case 'note':
      icon = ACTIVITY_NOTE_ICONS[a.data.subtype] || '📝';
      title = (a.data.subtype || 'Nota').charAt(0).toUpperCase() + (a.data.subtype || 'nota').slice(1);
      noteText = a.data.text || '';
      break;
    case 'email_sent':
      title = 'Email enviado';
      sub = (a.data.subject || '') + ' · ' + (a.data.to || '');
      break;
    case 'calendar_event':
      title = 'Evento de calendario';
      sub = (a.data.title || '') + ' · ' + (a.data.date || '');
      break;
    case 'field_change':
      title = (a.data.field || 'Campo') + ' cambiado';
      sub = (a.data.from || '?') + ' → ' + (a.data.to || '?') + ' · Auto';
      break;
    case 'created':
      title = 'Lead creado';
      sub = (a.data.empresa || '') + ' · ' + (a.data.lead || a.data.contacto || '');
      break;
    case 'deleted':
      title = 'Eliminado';
      sub = (a.data.empresa || '') + ' · ' + (a.data.lead || a.data.contacto || '');
      break;
    case 'automation':
      title = 'Automatización';
      sub = a.data.description || a.data.rule || '';
      break;
    case 'prm_to_crm':
      title = 'Promovido a CRM';
      sub = (a.data.prospect_empresa || '') + ' · Auto';
      break;
    default:
      title = a.type;
  }

  return `<div class="tl-entry">
    <div class="tl-icon ${iconInfo.css}">${icon}</div>
    <div class="tl-body">
      <div class="tl-title">${title}</div>
      ${sub ? '<div class="tl-sub">' + sub + '</div>' : ''}
      ${noteText ? '<div class="tl-note-text">' + noteText + '</div>' : ''}
    </div>
    <div class="tl-time">${activity_formatTime(a.created_at)}</div>
  </div>`;
}

function activity_renderTimeline(activities, containerId) {
  const filterTypes = ACTIVITY_FILTER_MAP[activity_currentFilter];
  const filtered = filterTypes ? activities.filter(a => filterTypes.includes(a.type)) : activities;

  const container = document.getElementById(containerId || 'activity_timeline_list');
  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="tl-empty">Sin actividad registrada</div>';
    return;
  }
  container.innerHTML = filtered.map(a => activity_renderEntry(a)).join('');
}

async function activity_loadAndRender(entityType, entityId) {
  activity_cachedList = await activity_loadTimeline(entityType, entityId);
  const containerId = entityType === 'lead' ? 'activity_timeline_list' : 'activity_timeline_list_prm';
  activity_renderTimeline(activity_cachedList, containerId);
}

function activity_setFilter(filter) {
  activity_currentFilter = filter;
  document.querySelectorAll('.tl-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.filter === filter);
  });
  activity_renderTimeline(activity_cachedList);
}

function activity_setSubtype(subtype) {
  activity_currentSubtype = subtype;
  document.querySelectorAll('.tl-subtype').forEach(s => {
    s.classList.toggle('active', s.dataset.subtype === subtype);
  });
}

async function activity_addNote(entityType, entityId) {
  const input = document.getElementById('activity_note_input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  await activity_log(entityType, entityId, 'note', {
    text: text,
    subtype: activity_currentSubtype
  });
  input.value = '';
}
```

- [ ] **Step 2: Verify the functions are defined**

Open browser DevTools console on `app.html` and type:
```
typeof activity_log === 'function' && typeof activity_formatTime === 'function'
```
Expected: `true`

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "feat: add core activity timeline JS module (log, load, render, formatTime)"
```

---

### Task 3: HTML — Add Tabs and Timeline to CRM Detail Panel

**Files:**
- Modify: `app.html:437-491` (CRM detail panel HTML)

- [ ] **Step 1: Add tabs after panel-actions div**

Replace the `<div class="panel-body">` opening (line 444) with tabs + panel-body wrapped in a tab container. The full replacement — find:

```html
    <div class="panel-body">
      <div class="pf-section">
        <div class="pf-section-title">Empresa y Contacto</div>
```

Replace with:

```html
    <div class="panel-tabs">
      <div class="panel-tab active" onclick="crm_switchPanelTab('datos')">Datos</div>
      <div class="panel-tab" onclick="crm_switchPanelTab('actividad')">Actividad</div>
    </div>
    <div class="panel-body" id="crm_panel_datos">
      <div class="pf-section">
        <div class="pf-section-title">Empresa y Contacto</div>
```

- [ ] **Step 2: Add timeline container and note input after the panel-body closing**

Find the closing of the current panel-body and the old activity section (lines 489-491):

```html
      <div><div class="activity-hd">Actividad reciente</div><div id="crm_m-activity"></div></div>
    </div>
  </div>
```

Replace with:

```html
    </div>
    <div class="timeline-wrap" id="crm_panel_actividad" style="display:none">
      <div class="timeline-filters">
        <button class="tl-pill active" data-filter="todos" onclick="activity_setFilter('todos')">Todos</button>
        <button class="tl-pill" data-filter="notas" onclick="activity_setFilter('notas')">Notas</button>
        <button class="tl-pill" data-filter="emails" onclick="activity_setFilter('emails')">Emails</button>
        <button class="tl-pill" data-filter="cambios" onclick="activity_setFilter('cambios')">Cambios</button>
      </div>
      <div class="timeline-list" id="activity_timeline_list">
        <div class="tl-empty">Sin actividad registrada</div>
      </div>
      <div class="timeline-input">
        <div class="tl-subtypes">
          <button class="tl-subtype" data-subtype="llamada" onclick="activity_setSubtype('llamada')">📞 Llamada</button>
          <button class="tl-subtype" data-subtype="reunion" onclick="activity_setSubtype('reunion')">🤝 Reunión</button>
          <button class="tl-subtype active" data-subtype="nota" onclick="activity_setSubtype('nota')">📝 Nota</button>
          <button class="tl-subtype" data-subtype="tarea" onclick="activity_setSubtype('tarea')">✅ Tarea</button>
        </div>
        <div class="tl-input-row">
          <input id="activity_note_input" type="text" placeholder="Agregar nota..." onkeydown="if(event.key==='Enter')activity_addNote('lead',crm_editingId)">
          <button onclick="activity_addNote('lead',crm_editingId)">Enviar</button>
        </div>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: Add the `crm_switchPanelTab` function**

Add this function in the JS section, right after the `crm_closeDetail` function (after line 1295):

```javascript
function crm_switchPanelTab(tab) {
  document.getElementById('crm_panel_datos').style.display = tab === 'datos' ? 'block' : 'none';
  document.getElementById('crm_panel_actividad').style.display = tab === 'actividad' ? 'flex' : 'none';
  document.querySelectorAll('#crm_detailOverlay .panel-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  if (tab === 'actividad' && crm_editingId) {
    activity_currentFilter = 'todos';
    activity_loadAndRender('lead', crm_editingId);
  }
}
```

- [ ] **Step 4: Test the tabs**

1. Open `http://localhost:3000/app.html` in browser
2. Click on any lead card to open the detail panel
3. Click "Actividad" tab — should show empty timeline with filter pills and note input
4. Click "Datos" tab — should show original form fields
5. Type a note and press Enter or click Enviar — should appear in timeline (requires `activities` table to exist in Supabase)

- [ ] **Step 5: Commit**

```bash
git add app.html
git commit -m "feat: add tabs and timeline UI to CRM detail panel"
```

---

### Task 4: HTML — Add Tabs and Timeline to PRM Detail Panel

**Files:**
- Modify: `app.html` (PRM detail panel HTML, around lines 600-700)

- [ ] **Step 1: Find the PRM detail panel and add tabs**

Find the PRM panel-body opening. Search for the PRM detail overlay. The structure mirrors CRM. Find:

```html
    <div class="panel-body">
```

inside the `prm_detailOverlay` section, and add tabs before it:

```html
    <div class="panel-tabs">
      <div class="panel-tab active" onclick="prm_switchPanelTab('datos')">Datos</div>
      <div class="panel-tab" onclick="prm_switchPanelTab('actividad')">Actividad</div>
    </div>
    <div class="panel-body" id="prm_panel_datos">
```

- [ ] **Step 2: Add timeline container after PRM panel-body closing**

Find the end of the PRM panel-body (the closing `</div>` before `</div><!-- panel -->`) and add the timeline container. Find the PRM follow-up log section at the end of the panel-body and replace its closing with:

```html
    </div>
    <div class="timeline-wrap" id="prm_panel_actividad" style="display:none">
      <div class="timeline-filters">
        <button class="tl-pill active" data-filter="todos" onclick="activity_setFilter('todos')">Todos</button>
        <button class="tl-pill" data-filter="notas" onclick="activity_setFilter('notas')">Notas</button>
        <button class="tl-pill" data-filter="emails" onclick="activity_setFilter('emails')">Emails</button>
        <button class="tl-pill" data-filter="cambios" onclick="activity_setFilter('cambios')">Cambios</button>
      </div>
      <div class="timeline-list" id="activity_timeline_list_prm">
        <div class="tl-empty">Sin actividad registrada</div>
      </div>
      <div class="timeline-input">
        <div class="tl-subtypes">
          <button class="tl-subtype" data-subtype="llamada" onclick="activity_setSubtype('llamada')">📞 Llamada</button>
          <button class="tl-subtype" data-subtype="reunion" onclick="activity_setSubtype('reunion')">🤝 Reunión</button>
          <button class="tl-subtype active" data-subtype="nota" onclick="activity_setSubtype('nota')">📝 Nota</button>
          <button class="tl-subtype" data-subtype="tarea" onclick="activity_setSubtype('tarea')">✅ Tarea</button>
        </div>
        <div class="tl-input-row">
          <input id="activity_note_input_prm" type="text" placeholder="Agregar nota..." onkeydown="if(event.key==='Enter')activity_addNote_prm()">
          <button onclick="activity_addNote_prm()">Enviar</button>
        </div>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: Add `prm_switchPanelTab` and `activity_addNote_prm` functions**

Add after `prm_closeDetail` function:

```javascript
function prm_switchPanelTab(tab) {
  document.getElementById('prm_panel_datos').style.display = tab === 'datos' ? 'block' : 'none';
  document.getElementById('prm_panel_actividad').style.display = tab === 'actividad' ? 'flex' : 'none';
  document.querySelectorAll('#prm_detailOverlay .panel-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  if (tab === 'actividad' && prm_editingId) {
    activity_currentFilter = 'todos';
    activity_loadAndRender('prospect', prm_editingId);
  }
}

async function activity_addNote_prm() {
  const input = document.getElementById('activity_note_input_prm');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  await activity_log('prospect', prm_editingId, 'note', {
    text: text,
    subtype: activity_currentSubtype
  });
  input.value = '';
}
```

**Note:** The PRM timeline reuses `activity_timeline_list_prm` as its container ID. The `activity_loadAndRender` and `activity_renderTimeline` functions defined in Task 2 already handle both CRM and PRM containers via the `containerId` parameter — no changes needed here.

- [ ] **Step 4: Test PRM timeline**

1. Navigate to PRM view
2. Click on any prospect card
3. Toggle between Datos and Actividad tabs
4. Add a note — should appear in timeline

- [ ] **Step 5: Commit**

```bash
git add app.html
git commit -m "feat: add tabs and timeline UI to PRM detail panel"
```

---

### Task 5: Fase 1 Auto-Logging — Created, Deleted, Stage Change

**Files:**
- Modify: `app.html` (multiple existing functions)

- [ ] **Step 1: Add auto-log to `crm_saveNewLead` (line ~1337)**

Find the end of `crm_saveNewLead()`, after `showToast('Lead creado');` (line 1363). Add before the closing `}`:

```javascript
  activity_log('lead', newLead.id, 'created', { empresa: newLead.data.empresa, lead: newLead.data.lead });
```

The full modified end of the function:

```javascript
  await crm_saveLead(newLead);
  crm_renderBoard();
  crm_closeAddModal();
  showToast('Lead creado');
  activity_log('lead', newLead.id, 'created', { empresa: newLead.data.empresa, lead: newLead.data.lead });
}
```

- [ ] **Step 2: Add auto-log to `prm_saveNewProspect` (line ~1535)**

After `showToast('Prospecto añadido');` (line 1570), add:

```javascript
    activity_log('prospect', newProspect.id, 'created', { empresa: newProspect.data.empresa, contacto: newProspect.data.contacto });
```

- [ ] **Step 3: Add auto-log to `crm_deleteLead` (line ~1368)**

Before the `await supabase.from('leads').delete()` call, capture the lead data and log. Replace the function:

```javascript
async function crm_deleteLead(){
  if(!crm_editingId||!confirm('Eliminar este lead?'))return;
  const lead = leads.find(l => l.id === crm_editingId);
  const logData = lead ? { empresa: lead.data.empresa, lead: lead.data.lead } : {};
  const deleteId = crm_editingId;
  try{
    const {error}=await supabase.from('leads').delete().eq('id',crm_editingId);
    if(error)throw error;
    leads=leads.filter(l=>l.id!==crm_editingId);
    crm_closeDetail();
    crm_renderBoard();
    showToast('Lead eliminado');
    activity_log('lead', deleteId, 'deleted', logData);
  }catch(e){console.error('Delete error:',e);}
}
```

- [ ] **Step 4: Add auto-log to `prm_deleteProspect` (line ~1628)**

Replace the function:

```javascript
async function prm_deleteProspect(){
  if(!prm_editingId||!confirm('Eliminar este prospecto?'))return;
  const p = prospects.find(x => x.id === prm_editingId);
  const logData = p ? { empresa: p.data.empresa, contacto: p.data.contacto } : {};
  const deleteId = prm_editingId;
  try{
    await supabase.from('prospects').delete().eq('id',deleteId);
    prospects=prospects.filter(x=>x.id!==deleteId);
    prm_closeDetail();
    prm_renderBoard();
    showToast('Prospecto eliminado');
    activity_log('prospect', deleteId, 'deleted', logData);
  }catch(e){console.error('Delete error:',e);}
}
```

- [ ] **Step 5: Add auto-log to `crm_dropCard` for stage changes (line ~1250)**

Replace the function to capture old stage:

```javascript
async function crm_dropCard(e,stageId){
  e.preventDefault();e.currentTarget.classList.remove('drag-over');
  const lead=leads.find(l=>l.id===crm_dragId);
  if(!lead)return;
  const oldStage = lead.data.estado;
  if (oldStage === stageId) return;
  lead.data.estado=stageId;
  await crm_saveLead(lead);
  crm_renderBoard();
  activity_log('lead', lead.id, 'stage_change', { from: oldStage, to: stageId });
}
```

- [ ] **Step 6: Add auto-log to `crm_saveDetail` for stage changes (line ~1297)**

Modify `crm_saveDetail` to detect stage change before saving. Add at the beginning of the function, after `if(!lead)return;`:

```javascript
  const oldEstado = lead.data.estado;
```

And after `showToast('Lead actualizado');`, add:

```javascript
  const newEstado = lead.data.estado;
  if (oldEstado !== newEstado) {
    activity_log('lead', crm_editingId, 'stage_change', { from: oldEstado, to: newEstado });
  }
```

- [ ] **Step 7: Add auto-log to `prm_saveDetail` for stage changes (line ~1497)**

Same pattern. After `if(!p)return;` add:

```javascript
  const oldEstado = p.data.estado;
```

After `showToast('Prospecto actualizado');` add:

```javascript
  const newEstado = p.data.estado;
  if (oldEstado !== newEstado) {
    activity_log('prospect', prm_editingId, 'stage_change', { from: oldEstado, to: newEstado });
  }
```

- [ ] **Step 8: Test Fase 1 auto-logging**

1. Create a new lead — open its detail panel, go to Activity tab, should see "Lead creado" entry
2. Drag a lead card to a different column — open detail, Activity tab, should see "Movido a [stage]"
3. Change estado in detail panel dropdown and save — should see stage_change entry
4. Delete a lead — create a new one first, delete it, check Supabase table directly to confirm the deleted entry exists
5. Repeat steps 1-4 for PRM prospects

- [ ] **Step 9: Commit**

```bash
git add app.html
git commit -m "feat: add Fase 1 auto-logging (created, deleted, stage_change)"
```

---

### Task 6: Fase 2 Auto-Logging — Email, Calendar, PRM to CRM

**Files:**
- Modify: `app.html` (email, calendar, and PRM promotion functions)

- [ ] **Step 1: Add auto-log to `crm_sendEmail` (line ~1380)**

After the `window.open(...)` line, add:

```javascript
  activity_log('lead', crm_editingId, 'email_sent', { to: email, subject: subject });
```

- [ ] **Step 2: Add auto-log to `crm_quickEmail` (line ~2295)**

After the `window.open(...)` line, add:

```javascript
  activity_log('lead', leadId, 'email_sent', { to: d.email, subject: subject });
```

- [ ] **Step 3: Add auto-log to `crm_quickCalendar` (line ~2282)**

After the `window.open(url, '_blank');` line, add:

```javascript
  activity_log('lead', leadId, 'calendar_event', { title: eventTitle, date: dateStr });
```

- [ ] **Step 4: Add auto-log to `prm_confirmarMoverAlCRM` (line ~1592)**

After `showToast('Prospecto movido al CRM');` (line 1625), add:

```javascript
  activity_log('lead', newLead.id, 'prm_to_crm', { prospect_empresa: p.data.empresa, new_lead_id: newLead.id });
  activity_log('prospect', prm_editingId, 'prm_to_crm', { prospect_empresa: p.data.empresa, new_lead_id: newLead.id });
```

- [ ] **Step 5: Test Fase 2**

1. Open a lead detail, click "Enviar Email" — check Activity tab shows "Email enviado"
2. Use quick calendar action on a card — check Activity tab shows calendar entry
3. Promote a PRM prospect to CRM — check both the prospect and new lead have prm_to_crm entries

- [ ] **Step 6: Commit**

```bash
git add app.html
git commit -m "feat: add Fase 2 auto-logging (email, calendar, prm_to_crm)"
```

---

### Task 7: Fase 3 Auto-Logging — Field Changes and Automation

**Files:**
- Modify: `app.html` (`crm_saveDetail`, `prm_saveDetail`, `automation_runAll`)

- [ ] **Step 1: Enhance `crm_saveDetail` to track field changes**

The function already captures `oldEstado` from Task 5. Expand it to track more fields. After the `const oldEstado = lead.data.estado;` line added in Task 5, add:

```javascript
  const oldPrioridad = lead.data.prioridad;
  const oldValor = lead.data.valor;
  const oldLead = lead.data.lead;
  const oldEmail = lead.data.email;
```

After the stage_change logging added in Task 5 (after `showToast`), add:

```javascript
  if (oldPrioridad !== lead.data.prioridad) {
    activity_log('lead', crm_editingId, 'field_change', { field: 'prioridad', from: oldPrioridad, to: lead.data.prioridad });
  }
  if (oldValor !== lead.data.valor) {
    activity_log('lead', crm_editingId, 'field_change', { field: 'valor', from: oldValor, to: lead.data.valor });
  }
  if (oldLead !== lead.data.lead) {
    activity_log('lead', crm_editingId, 'field_change', { field: 'contacto', from: oldLead, to: lead.data.lead });
  }
  if (oldEmail !== lead.data.email) {
    activity_log('lead', crm_editingId, 'field_change', { field: 'email', from: oldEmail, to: lead.data.email });
  }
```

- [ ] **Step 2: Enhance `prm_saveDetail` to track field changes**

Same pattern. After `const oldEstado = p.data.estado;` add:

```javascript
  const oldPrioridad = p.data.prioridad;
  const oldContacto = p.data.contacto;
  const oldEmail = p.data.email;
```

After the stage_change logging, add:

```javascript
  if (oldPrioridad !== p.data.prioridad) {
    activity_log('prospect', prm_editingId, 'field_change', { field: 'prioridad', from: oldPrioridad, to: p.data.prioridad });
  }
  if (oldContacto !== p.data.contacto) {
    activity_log('prospect', prm_editingId, 'field_change', { field: 'contacto', from: oldContacto, to: p.data.contacto });
  }
  if (oldEmail !== p.data.email) {
    activity_log('prospect', prm_editingId, 'field_change', { field: 'email', from: oldEmail, to: p.data.email });
  }
```

- [ ] **Step 3: Add auto-log to `automation_runAll` (line ~2234)**

Replace the ghost rule section to log each change individually. Find the ghost rule block inside `automation_runAll`:

```javascript
  // Ghost rule
  if (document.getElementById('auto_ghost_rule').checked) {
    leads.forEach(l => {
      const lastContact = new Date(l.data.ultimoContacto || new Date());
      const daysSince = Math.floor((now - lastContact) / (1000 * 60 * 60 * 24));
      if (daysSince >= 14 && l.data.estado !== 'ghost') {
        l.data.estado = 'ghost';
        changes++;
      }
    });
  }
```

Replace with:

```javascript
  // Ghost rule
  if (document.getElementById('auto_ghost_rule').checked) {
    leads.forEach(l => {
      const lastContact = new Date(l.data.ultimoContacto || new Date());
      const daysSince = Math.floor((now - lastContact) / (1000 * 60 * 60 * 24));
      if (daysSince >= 14 && l.data.estado !== 'ghost') {
        const oldEstado = l.data.estado;
        l.data.estado = 'ghost';
        changes++;
        activity_log('lead', l.id, 'automation', { rule: 'ghost_rule', description: 'Auto-movido a Ghost por ' + daysSince + ' dias sin contacto' });
        activity_log('lead', l.id, 'stage_change', { from: oldEstado, to: 'ghost' });
      }
    });
  }
```

Find the priority escalation block:

```javascript
  // Priority escalation rule
  if (document.getElementById('auto_priority_rule').checked) {
    leads.forEach(l => {
      if (l.data.estado === 'propuesta') {
        const createdAt = new Date(l.created_at || l.data.ultimoContacto || new Date());
        const daysSince = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
        if (daysSince >= 7 && l.data.prioridad !== 'urgente') {
          l.data.prioridad = 'urgente';
          changes++;
        }
      }
    });
  }
```

Replace with:

```javascript
  // Priority escalation rule
  if (document.getElementById('auto_priority_rule').checked) {
    leads.forEach(l => {
      if (l.data.estado === 'propuesta') {
        const createdAt = new Date(l.created_at || l.data.ultimoContacto || new Date());
        const daysSince = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
        if (daysSince >= 7 && l.data.prioridad !== 'urgente') {
          const oldPrioridad = l.data.prioridad;
          l.data.prioridad = 'urgente';
          changes++;
          activity_log('lead', l.id, 'automation', { rule: 'priority_escalation', description: 'Prioridad escalada a urgente por ' + daysSince + ' dias en propuesta' });
          activity_log('lead', l.id, 'field_change', { field: 'prioridad', from: oldPrioridad, to: 'urgente' });
        }
      }
    });
  }
```

- [ ] **Step 4: Test Fase 3**

1. Edit a lead's priority in the detail panel, save — check Activity tab shows "prioridad cambiado"
2. Run automations with ghost rule enabled — check affected leads have "Automatización" entries
3. Run automations with priority rule enabled — check affected leads have priority field_change entries

- [ ] **Step 5: Commit**

```bash
git add app.html
git commit -m "feat: add Fase 3 auto-logging (field_change, automation)"
```

---

### Task 8: Fase 2 UI — Activity Badge on Kanban Cards

**Files:**
- Modify: `app.html` (`crm_renderBoard` and `prm_renderBoard` functions)

- [ ] **Step 1: Add a local activities cache for badges**

Add this variable and function near the top of the ACTIVITY TIMELINE MODULE section:

```javascript
let activity_lastByEntity = {};

async function activity_loadLastActivities() {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('entity_type,entity_id,type,data,created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    activity_lastByEntity = {};
    (data || []).forEach(a => {
      const key = a.entity_type + ':' + a.entity_id;
      if (!activity_lastByEntity[key]) {
        activity_lastByEntity[key] = a;
      }
    });
  } catch (e) {
    console.warn('Activity badge load failed:', e);
  }
}

function activity_getBadgeHtml(entityType, entityId) {
  const a = activity_lastByEntity[entityType + ':' + entityId];
  if (!a) return '';
  const typeLabels = {
    stage_change: 'movido', email_sent: 'email', calendar_event: 'calendario',
    note: a.data?.subtype || 'nota', field_change: 'editado', created: 'creado',
    deleted: 'eliminado', automation: 'auto', prm_to_crm: 'promovido'
  };
  const label = typeLabels[a.type] || a.type;
  return '<span class="card-activity-badge">🕐 ' + activity_formatTime(a.created_at) + ': ' + label + '</span>';
}
```

- [ ] **Step 2: Call `activity_loadLastActivities` during init**

In the `initSession` function (line ~1028), after `crm_load()` and `prm_load()` are called and before `crm_renderBoard()`, add:

```javascript
  await activity_loadLastActivities();
```

- [ ] **Step 3: Add badge to CRM card rendering**

In `crm_renderBoard` function (line ~1203), find the card footer HTML that contains the `.card-foot` div. Look for the `card-date` span. After it (still inside `.card-foot`), add the badge. Find the template string that renders cards and add `${activity_getBadgeHtml('lead', l.id)}` inside the `.card-foot` div.

The exact location is in the template literal inside `crm_renderBoard`. Find the `.card-foot` section in the card HTML template and append the badge call after the date span.

- [ ] **Step 4: Add badge to PRM card rendering**

Same pattern in `prm_renderBoard` function. Add `${activity_getBadgeHtml('prospect', p.id)}` to the card footer.

- [ ] **Step 5: Refresh badge cache after logging**

Update `activity_log` to refresh the badge cache. Add at the end of the function (after the timeline refresh check):

```javascript
  activity_lastByEntity[entityType + ':' + entityId] = {
    entity_type: entityType,
    entity_id: entityId,
    type: type,
    data: data || {},
    created_at: new Date().toISOString()
  };
```

- [ ] **Step 6: Test badges**

1. Create a new lead — card should show "ahora: creado" badge
2. Move a lead to a different column — card should show "ahora: movido"
3. Add a note via timeline — return to board, card should show "ahora: nota"
4. Check that older leads without activities show no badge

- [ ] **Step 7: Commit**

```bash
git add app.html
git commit -m "feat: add activity badge to kanban cards (Fase 2)"
```

---

### Task 9: Final Cleanup and Reset Panel State

**Files:**
- Modify: `app.html`

- [ ] **Step 1: Reset panel tab to Datos when opening detail**

In `crm_openDetail` function (line ~1259), add at the very beginning after `crm_editingId=id;`:

```javascript
  const datosPanel = document.getElementById('crm_panel_datos');
  const actPanel = document.getElementById('crm_panel_actividad');
  if (datosPanel) datosPanel.style.display = 'block';
  if (actPanel) actPanel.style.display = 'none';
  document.querySelectorAll('#crm_detailOverlay .panel-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
```

In `prm_openDetail` function, add same pattern:

```javascript
  const datosPanel = document.getElementById('prm_panel_datos');
  const actPanel = document.getElementById('prm_panel_actividad');
  if (datosPanel) datosPanel.style.display = 'block';
  if (actPanel) actPanel.style.display = 'none';
  document.querySelectorAll('#prm_detailOverlay .panel-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
```

- [ ] **Step 2: Remove old activity section from CRM panel**

The old `crm_addNote` function (line ~1366) shows an alert. Replace it:

```javascript
function crm_addNote() {
  crm_switchPanelTab('actividad');
  document.getElementById('activity_note_input').focus();
}
```

- [ ] **Step 3: Remove old crm_m-activity reference**

In `crm_openDetail`, the line that renders `crm_m-activity` (line 1288) is now dead code since we removed that HTML element in Task 3. Remove or comment out that line:

```javascript
  // Old activity section removed — now using timeline module
```

- [ ] **Step 4: Full integration test**

1. **CRM flow:** Create lead → move between stages → edit fields → add note → send email → verify all appear in timeline
2. **PRM flow:** Create prospect → change status → add note → promote to CRM → verify timeline on both prospect and new lead
3. **Automation flow:** Run automations → verify ghost/priority entries in affected leads
4. **Badge check:** Verify badges update on kanban cards after each action
5. **Filter check:** In timeline, click each filter pill and verify correct filtering
6. **Note subtypes:** Add notes with different subtypes (llamada, reunion, nota, tarea) — verify correct icons

- [ ] **Step 5: Commit**

```bash
git add app.html
git commit -m "feat: cleanup and finalize activity timeline integration"
```

---

## Summary

| Task | Description | Fase |
|------|-------------|------|
| 1 | CSS for timeline components | Setup |
| 2 | Core JS module (log, load, render, format) | Setup |
| 3 | CRM detail panel tabs + timeline HTML | Fase 1 |
| 4 | PRM detail panel tabs + timeline HTML | Fase 1 |
| 5 | Auto-logging: created, deleted, stage_change | Fase 1 |
| 6 | Auto-logging: email, calendar, prm_to_crm | Fase 2 |
| 7 | Auto-logging: field_change, automation | Fase 3 |
| 8 | Activity badge on kanban cards | Fase 2 |
| 9 | Cleanup, reset state, integration test | Final |

**Pre-requisite:** The `activities` table must exist in Supabase before the timeline can be tested end-to-end. However, **all code changes (Tasks 1-9) can be implemented without the table existing** — the `activity_log` function uses fire-and-forget with `console.warn` on failure, so the app won't break. The SQL to create the table is in `docs/superpowers/specs/2026-03-31-activities-schema.md`. The user will run it manually in Supabase Dashboard when they have access. **Do NOT block implementation on this — implement all tasks, and note in the final commit that testing requires the Supabase table.**
