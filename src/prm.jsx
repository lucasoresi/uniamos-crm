/* ============================================================
   PRM — Prospect Relationship Management
   Tabla: prospects (id TEXT, user_id, data JSONB, updated_at)
   7 etapas: nuevo, contactado, fu1, fu2, fu3, positivo, negativo
   ============================================================ */

const PRM_STAGES = [
  { id: 'nuevo',      name: 'Nuevo',        color: 'var(--st-sininfo)' },
  { id: 'contactado', name: 'Contactado',   color: 'var(--st-frio)' },
  { id: 'fu1',        name: 'Follow-up 1',  color: 'var(--st-ghost)' },
  { id: 'fu2',        name: 'Follow-up 2',  color: 'var(--p-alta)' },
  { id: 'fu3',        name: 'Follow-up 3',  color: 'var(--p-media)' },
  { id: 'positivo',   name: 'Positivo',     color: 'var(--st-cierre)' },
  { id: 'negativo',   name: 'Negativo',     color: 'var(--p-urg)' },
];
const PRM_STAGE_BY_ID = Object.fromEntries(PRM_STAGES.map(s => [s.id, s]));
const PRM_CHANNELS = ['LinkedIn', 'Email frío', 'Referido', 'Inbound', 'Evento', 'Base de datos', 'WhatsApp'];
// Días tras los cuales un follow-up se considera vencido, por etapa
const PRM_FU_DUE = { nuevo: 3, contactado: 5, fu1: 7, fu2: 7, fu3: 10 };

function prmNewId() {
  const rnd = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return 'prosp_' + Date.now().toString(36) + '_' + rnd;
}

function prmDaysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function Prm({ onPromoted }) {
  const [rows, setRows] = React.useState(null); // null = loading
  const [form, setForm] = React.useState(null); // {data, id} en edición/creación
  const [query, setQuery] = React.useState('');

  const load = React.useCallback(async () => {
    setRows(null);
    const { data: { session } } = await window.sb.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) { setRows([]); return; }
    const { data, error } = await window.sb.from('prospects')
      .select('*').eq('user_id', uid).order('updated_at', { ascending: false });
    if (error) { console.error('PRM load:', error); setRows([]); return; }
    setRows((data || []).map(r => ({ id: r.id, ...(r.data || {}) })));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const openNew = (estado) => setForm({ id: prmNewId(), estado: estado || 'nuevo', prioridad: 'media', canal: 'LinkedIn', _isNew: true });
  const openEdit = (p) => setForm({ ...p });

  const filtered = (rows || []).filter(p => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (p.empresa || '').toLowerCase().includes(q) || (p.contacto || '').toLowerCase().includes(q);
  });

  const byStage = Object.fromEntries(PRM_STAGES.map(s => [s.id, filtered.filter(p => (p.estado || 'nuevo') === s.id)]));
  const overdueCount = filtered.filter(p => {
    const due = PRM_FU_DUE[p.estado];
    const days = prmDaysSince(p.ultimoContacto);
    return due != null && days != null && days >= due;
  }).length;
  const positivos = filtered.filter(p => p.estado === 'positivo').length;

  return (
    <div className="pipe-wrap view-enter">
      <header className="pipe-head2">
        <div className="pipe-head2-left">
          <h1 className="pipe-title2">PRM Prospectos <span className="pipe-title2-cnt">{filtered.length}</span></h1>
          <div className="pipe-meta">
            <span>
              <Icon name="clock" size={12}/>{' '}
              {overdueCount > 0
                ? <><strong style={{ color: 'var(--p-urg)' }}>{overdueCount}</strong> follow-ups vencidos · </>
                : 'Sin follow-ups vencidos · '}
              <strong style={{ color: 'var(--accent)' }}>{positivos}</strong> positivos
            </span>
          </div>
        </div>
        <div className="pipe-head2-right">
          <button className="btn btn-primary btn-sm" onClick={() => openNew()}><Icon name="plus" size={12}/> Nuevo prospecto</button>
        </div>
      </header>

      <div className="pipe-toolbar2">
        <div className="pipe-search-wrap">
          <Icon name="search" size={13}/>
          <input className="pipe-search" placeholder="Buscar empresa o contacto…" value={query} onChange={e => setQuery(e.target.value)}/>
        </div>
      </div>

      {rows === null ? (
        <div className="ld-empty-sm" style={{ padding: 48 }}>Cargando prospectos…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
          <div style={{ marginBottom: 12 }}>No tenés prospectos todavía.</div>
          <button className="btn btn-primary btn-sm" onClick={() => openNew()}><Icon name="plus" size={12}/> Agregar el primero</button>
        </div>
      ) : (
        <div className="prm-board">
          {PRM_STAGES.map(stage => (
            <section className="prm-col" key={stage.id}>
              <div className="prm-col-hd">
                <span className="prm-col-dot" style={{ background: stage.color }}/>
                <span className="prm-col-name">{stage.name}</span>
                <span className="prm-col-cnt">{byStage[stage.id].length}</span>
              </div>
              <div className="prm-col-body">
                {byStage[stage.id].map(p => {
                  const due = PRM_FU_DUE[p.estado];
                  const days = prmDaysSince(p.ultimoContacto);
                  const overdue = due != null && days != null && days >= due;
                  return (
                    <div className="prm-card" key={p.id} onClick={() => openEdit(p)}>
                      <div className="prm-card-co">{p.empresa || p.contacto || '—'}</div>
                      <div className="prm-card-ct">{p.contacto || ''}{p.cargo ? ` · ${p.cargo}` : ''}</div>
                      <div className="prm-card-foot">
                        <span>{p.canal || '—'}</span>
                        <span className={overdue ? 'prm-card-overdue' : ''}>
                          {days == null ? 'sin contacto' : overdue ? `vencido ${days}d` : `hace ${days}d`}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <button className="prm-col-add" onClick={() => openNew(stage.id)}><Icon name="plus" size={11}/> Añadir</button>
              </div>
            </section>
          ))}
        </div>
      )}

      {form && (
        <ProspectForm
          prospect={form}
          onClose={() => setForm(null)}
          onSaved={async () => { setForm(null); await load(); }}
          onPromoted={async () => { setForm(null); await load(); onPromoted && onPromoted(); }}
        />
      )}
    </div>
  );
}

function ProspectForm({ prospect, onClose, onSaved, onPromoted }) {
  const isNew = !!prospect._isNew;
  const [f, setF] = React.useState({
    empresa: prospect.empresa || '',
    contacto: prospect.contacto || '',
    cargo: prospect.cargo || '',
    email: prospect.email || '',
    linkedin: prospect.linkedin || '',
    canal: prospect.canal || 'LinkedIn',
    sector: prospect.sector || '',
    pais: prospect.pais || '',
    estado: prospect.estado || 'nuevo',
    prioridad: prospect.prioridad || 'media',
    contexto: prospect.contexto || '',
    accion: prospect.accion || '',
    ultimoContacto: prospect.ultimoContacto || new Date().toISOString().split('T')[0],
  });
  const [saving, setSaving] = React.useState(false);
  const [promoting, setPromoting] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const [err, setErr] = React.useState('');

  const upd = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));

  async function uid() {
    const { data: { session } } = await window.sb.auth.getSession();
    return session?.user?.id;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!f.empresa.trim() && !f.contacto.trim()) { setErr('Cargá al menos la empresa o el contacto.'); return; }
    setSaving(true); setErr('');
    try {
      const userId = await uid();
      const data = { ...prospect, ...f };
      delete data._isNew; delete data.id;
      await window.sb.from('prospects').upsert({
        id: prospect.id, user_id: userId, data, updated_at: new Date().toISOString(),
      });
      onSaved();
    } catch (ex) { console.error('ProspectForm save:', ex); setErr('Error al guardar.'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    try { await window.sb.from('prospects').delete().eq('id', prospect.id); onSaved(); }
    catch (ex) { console.error(ex); setErr('Error al eliminar.'); }
  }

  // Promover a lead del CRM
  async function handlePromote() {
    setPromoting(true); setErr('');
    try {
      const lead = window.blankLead('frio');
      lead.co = f.empresa.trim() || '—';
      lead.contact = f.contacto.trim() || '—';
      lead.role = f.cargo.trim() || '—';
      lead.email = f.email.trim().toLowerCase();
      lead.sector = f.sector.trim() || '—';
      lead.country = f.pais.trim() || '—';
      lead.channel = (f.canal || 'gmail').toLowerCase().includes('linkedin') ? 'linkedin' : 'gmail';
      lead.last = f.contexto.trim();
      lead.next = f.accion.trim();
      lead.domain = lead.email ? (lead.email.split('@')[1] || '') : '';
      await window.upsertLead(lead);
      try { await window.addActivity('lead', lead.id, 'created', { from: 'prm', empresa: lead.co }); } catch {}
      // marcar prospecto como positivo (convertido)
      const userId = await uid();
      const data = { ...prospect, ...f, estado: 'positivo', convertedToLead: lead.id };
      delete data._isNew; delete data.id;
      await window.sb.from('prospects').upsert({ id: prospect.id, user_id: userId, data, updated_at: new Date().toISOString() });
      onPromoted();
    } catch (ex) { console.error('promote:', ex); setErr('Error al promover.'); }
    finally { setPromoting(false); }
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="modal-title">{isNew ? 'Nuevo prospecto' : 'Editar prospecto'}</div>
          <button className="ld-close" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>

        {confirmDel && (
          <div className="ld-confirm">
            <span>¿Eliminar este prospecto?</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(false)}>Cancelar</button>
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>Eliminar</button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-grid">
            <div className="field col-2"><label>Empresa</label><input className="mock-input" value={f.empresa} onChange={upd('empresa')} placeholder="ej: Globant" autoFocus/></div>
            <div className="field"><label>Contacto</label><input className="mock-input" value={f.contacto} onChange={upd('contacto')} placeholder="Nombre"/></div>
            <div className="field"><label>Cargo</label><input className="mock-input" value={f.cargo} onChange={upd('cargo')} placeholder="ej: VP Sales"/></div>
            <div className="field"><label>Email</label><input className="mock-input" type="email" value={f.email} onChange={upd('email')} placeholder="contacto@empresa.com"/></div>
            <div className="field"><label>LinkedIn</label><input className="mock-input" value={f.linkedin} onChange={upd('linkedin')} placeholder="linkedin.com/in/…"/></div>
            <div className="field"><label>Canal</label>
              <select className="mock-select" value={f.canal} onChange={upd('canal')}>
                {PRM_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field"><label>Etapa</label>
              <select className="mock-select" value={f.estado} onChange={upd('estado')}>
                {PRM_STAGES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Sector</label><input className="mock-input" value={f.sector} onChange={upd('sector')} placeholder="ej: SaaS"/></div>
            <div className="field"><label>País</label><input className="mock-input" value={f.pais} onChange={upd('pais')} placeholder="ej: México"/></div>
            <div className="field"><label>Prioridad</label>
              <select className="mock-select" value={f.prioridad} onChange={upd('prioridad')}>
                <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
              </select>
            </div>
            <div className="field"><label>Último contacto</label><input className="mock-input" type="date" value={f.ultimoContacto || ''} onChange={upd('ultimoContacto')}/></div>
            <div className="field col-2"><label>Contexto</label><input className="mock-input" value={f.contexto} onChange={upd('contexto')} placeholder="Cómo llegaste, de qué hablaron…"/></div>
            <div className="field col-2"><label>Próxima acción</label><input className="mock-input" value={f.accion} onChange={upd('accion')} placeholder="ej: Enviar segundo follow-up"/></div>
          </div>

          {err && <div className="form-err">{err}</div>}

          <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {!isNew && <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--text-4)' }} onClick={() => setConfirmDel(true)}>Eliminar</button>}
              {!isNew && <button type="button" className="btn btn-outline btn-sm" onClick={handlePromote} disabled={promoting} title="Crear un lead del CRM a partir de este prospecto">
                <Icon name="arrow-up-right" size={12}/> {promoting ? 'Promoviendo…' : 'Promover a lead'}
              </button>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>Cancelar</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? 'Guardando…' : (isNew ? 'Crear prospecto' : 'Guardar')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

window.Prm = Prm;
