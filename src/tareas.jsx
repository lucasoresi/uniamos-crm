/* ============================================================
   Mis Tareas — gestor de tareas con vencimientos y vínculo a leads
   Props: { leads, onOpenLead }
   Tabla: tasks (id TEXT, user_id, data JSONB)
   ============================================================ */

const TASK_PRIOS = [
  { id: 'urg', label: 'Urgente', color: 'var(--p-urg)' },
  { id: 'alta', label: 'Alta', color: 'var(--p-alta)' },
  { id: 'media', label: 'Media', color: 'var(--p-media)' },
  { id: 'baja', label: 'Baja', color: 'var(--text-4)' },
];
const TASK_PRIO_BY_ID = Object.fromEntries(TASK_PRIOS.map(p => [p.id, p]));

function _todayStr() { return new Date().toISOString().split('T')[0]; }
function _fmtDue(due) {
  if (!due) return 'Sin fecha';
  const today = _todayStr();
  if (due === today) return 'Hoy';
  const d = new Date(due + 'T00:00:00');
  const t = new Date(today + 'T00:00:00');
  const diff = Math.round((d - t) / 86400000);
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  if (diff < 0) return `Hace ${-diff}d`;
  if (diff <= 7) return `En ${diff}d`;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function Tareas({ leads = [], onOpenLead }) {
  const [tasks, setTasks] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [showDone, setShowDone] = React.useState(false);
  const [busy, setBusy] = React.useState(null);

  const load = React.useCallback(async () => {
    const data = await window.loadTasks();
    setTasks(data);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  async function toggleDone(t) {
    setBusy(t.id);
    try { await window.saveTask({ ...t, done: !t.done }); await load(); }
    catch (e) { console.error(e); } finally { setBusy(null); }
  }
  async function removeTask(id) {
    setBusy(id);
    try { await window.deleteTask(id); await load(); }
    catch (e) { console.error(e); } finally { setBusy(null); }
  }

  const today = _todayStr();
  const pending = (tasks || []).filter(t => !t.done);
  const done = (tasks || []).filter(t => t.done);
  const groups = [
    { key: 'overdue', label: 'Vencidas', color: 'var(--p-urg)', items: pending.filter(t => t.due && t.due < today).sort((a, b) => a.due.localeCompare(b.due)) },
    { key: 'today', label: 'Hoy', color: 'var(--p-media)', items: pending.filter(t => t.due === today) },
    { key: 'upcoming', label: 'Próximas', color: 'var(--st-frio)', items: pending.filter(t => t.due && t.due > today).sort((a, b) => a.due.localeCompare(b.due)) },
    { key: 'nodate', label: 'Sin fecha', color: 'var(--text-4)', items: pending.filter(t => !t.due) },
  ].filter(g => g.items.length > 0);

  const blankTask = () => ({ id: window.newTaskId(), title: '', notes: '', due: '', priority: 'media', leadId: null, leadName: null, done: false, _isNew: true });

  return (
    <div className="page view-enter">
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 24px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--ff-display)', fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Mis Tareas</h2>
            <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
              {pending.length} pendientes{done.length ? ` · ${done.length} completadas` : ''}
            </p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setForm(blankTask())}><Icon name="plus" size={12}/> Nueva tarea</button>
        </div>

        {tasks === null ? (
          <div className="ld-empty-sm" style={{ padding: 48 }}>Cargando tareas…</div>
        ) : pending.length === 0 && done.length === 0 ? (
          <div style={{ border: '1px dashed var(--border)', borderRadius: 12, padding: 48, textAlign: 'center' }}>
            <div style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 12 }}>No tenés tareas. Creá la primera o dejá que una automatización las genere.</div>
            <button className="btn btn-primary btn-sm" onClick={() => setForm(blankTask())}><Icon name="plus" size={12}/> Nueva tarea</button>
          </div>
        ) : (
          <>
            {groups.map(g => (
              <div key={g.key} className="task-group">
                <div className="task-group-hd"><span className="task-group-dot" style={{ background: g.color }}/> {g.label} <span className="task-group-cnt">{g.items.length}</span></div>
                {g.items.map(t => (
                  <TaskRow key={t.id} task={t} busy={busy === t.id}
                    onToggle={() => toggleDone(t)} onEdit={() => setForm({ ...t })} onDelete={() => removeTask(t.id)}
                    onOpenLead={onOpenLead} leads={leads}/>
                ))}
              </div>
            ))}

            {done.length > 0 && (
              <div className="task-group">
                <button className="task-done-toggle" onClick={() => setShowDone(v => !v)}>
                  <Icon name={showDone ? 'chevron-down' : 'chevron-right'} size={12}/> Completadas ({done.length})
                </button>
                {showDone && done.map(t => (
                  <TaskRow key={t.id} task={t} busy={busy === t.id}
                    onToggle={() => toggleDone(t)} onEdit={() => setForm({ ...t })} onDelete={() => removeTask(t.id)}
                    onOpenLead={onOpenLead} leads={leads}/>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {form && <TaskForm task={form} leads={leads} onClose={() => setForm(null)} onSaved={async () => { setForm(null); await load(); }}/>}
    </div>
  );
}

function TaskRow({ task, busy, onToggle, onEdit, onDelete, onOpenLead, leads }) {
  const prio = TASK_PRIO_BY_ID[task.priority] || TASK_PRIO_BY_ID.media;
  const overdue = task.due && !task.done && task.due < _todayStr();
  const lead = task.leadId ? leads.find(l => l.id === task.leadId) : null;
  return (
    <div className={'task-row' + (task.done ? ' done' : '')}>
      <button className={'task-check' + (task.done ? ' on' : '')} onClick={onToggle} disabled={busy} title={task.done ? 'Marcar pendiente' : 'Completar'}>
        {task.done && <Icon name="check" size={12}/>}
      </button>
      <div className="task-main" onClick={onEdit}>
        <div className="task-title">{task.title || '(sin título)'}</div>
        <div className="task-meta">
          <span className="task-prio" style={{ color: prio.color }}>● {prio.label}</span>
          {task.due && <span className={overdue ? 'task-due-over' : 'task-due'}>· {_fmtDue(task.due)}</span>}
          {(lead || task.leadName) && (
            <span className="task-lead" onClick={(e) => { e.stopPropagation(); if (lead && onOpenLead) onOpenLead(lead); }}>
              · <Icon name="pipeline" size={10}/> {lead ? lead.co : task.leadName}
            </span>
          )}
        </div>
      </div>
      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-4)', fontSize: 11, padding: '3px 8px' }} onClick={onDelete} disabled={busy}>Borrar</button>
    </div>
  );
}

function TaskForm({ task, leads = [], onClose, onSaved }) {
  const isNew = !!task._isNew;
  const [title, setTitle] = React.useState(task.title || '');
  const [due, setDue] = React.useState(task.due || '');
  const [priority, setPriority] = React.useState(task.priority || 'media');
  const [leadId, setLeadId] = React.useState(task.leadId || '');
  const [notes, setNotes] = React.useState(task.notes || '');
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { setErr('Poné un título a la tarea.'); return; }
    setSaving(true); setErr('');
    try {
      const lead = leadId ? leads.find(l => l.id === leadId) : null;
      await window.saveTask({
        ...task, title: title.trim(), due: due || null, priority,
        leadId: leadId || null, leadName: lead ? lead.co : null, notes: notes.trim(),
      });
      onSaved();
    } catch (ex) { console.error('TaskForm:', ex); setErr('Error al guardar.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(500px, 100%)' }}>
        <div className="modal-hd">
          <div className="modal-title">{isNew ? 'Nueva tarea' : 'Editar tarea'}</div>
          <button className="ld-close" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="field"><label>Título</label><input className="mock-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="ej: Enviar propuesta a Rappi" autoFocus/></div>
          <div className="value-row">
            <div className="field"><label>Vencimiento</label><input className="mock-input" type="date" value={due} onChange={e => setDue(e.target.value)}/></div>
            <div className="field"><label>Prioridad</label>
              <select className="mock-select" value={priority} onChange={e => setPriority(e.target.value)}>
                {TASK_PRIOS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>Vincular a lead (opcional)</label>
            <select className="mock-select" value={leadId} onChange={e => setLeadId(e.target.value)}>
              <option value="">— Ninguno —</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.co}{l.contact && l.contact !== '—' ? ` · ${l.contact}` : ''}</option>)}
            </select>
          </div>
          <div className="field"><label>Notas (opcional)</label><input className="mock-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Detalle…"/></div>
          {err && <div className="form-err">{err}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Guardando…' : (isNew ? 'Crear tarea' : 'Guardar')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

window.Tareas = Tareas;
