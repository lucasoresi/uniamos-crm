/* ============================================================
   LeadForm — modal para crear / editar un lead manualmente
   Props: { lead, onClose, onSaved }
   - lead: UI lead a editar, o window.blankLead() para crear
   - onSaved(savedLeadId): se llama tras guardar OK
   ============================================================ */

const LEAD_CHANNELS = ['gmail', 'whatsapp', 'linkedin', 'referido', 'inbound', 'evento', 'otro'];
const LEAD_CURRENCIES = ['USD', 'ARS', 'EUR', 'MXN', 'CLP', 'COP'];

function LeadForm({ lead, onClose, onSaved }) {
  const isNew = !lead.co && !lead.contact && !lead.email;
  const [f, setF] = React.useState({
    co: lead.co === '—' ? '' : (lead.co || ''),
    contact: lead.contact === '—' ? '' : (lead.contact || ''),
    role: lead.role === '—' ? '' : (lead.role || ''),
    email: lead.email || '',
    tel: lead.tel || '',
    stage: lead.stage || 'sininfo',
    priority: lead.priority || 'media',
    value: lead.value != null ? String(lead.value) : '',
    currency: lead.currency || 'USD',
    sector: lead.sector === '—' ? '' : (lead.sector || ''),
    country: lead.country === '—' ? '' : (lead.country || ''),
    channel: lead.channel || 'gmail',
    last: lead.last || '',
    next: lead.next || '',
    lastContact: lead.lastContact || new Date().toISOString().split('T')[0],
  });
  const [catalog, setCatalog] = React.useState([]);
  const [selectedSvc, setSelectedSvc] = React.useState(
    Array.isArray(lead.services) ? lead.services.map(s => s.id).filter(Boolean) : []
  );
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');

  React.useEffect(() => {
    (async () => {
      const { data: { session } } = await window.sb.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;
      const { data } = await window.sb.from('user_services')
        .select('id,name,price,currency').eq('user_id', uid).order('created_at', { ascending: true });
      setCatalog(data || []);
    })();
  }, []);

  const upd = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));

  const svcObjs = catalog.filter(s => selectedSvc.includes(s.id));
  const svcSum = svcObjs.reduce((a, s) => a + (Number(s.price) || 0), 0);
  const effectiveValue = svcSum > 0 ? svcSum : (f.value ? Number(f.value) : null);

  function toggleSvc(id) {
    setSelectedSvc(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!f.co.trim() && !f.contact.trim()) { setErr('Cargá al menos la empresa o el contacto.'); return; }
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) { setErr('El email no es válido.'); return; }
    setSaving(true); setErr('');
    try {
      const uiLead = {
        ...lead,
        co: f.co.trim() || '—',
        contact: f.contact.trim() || '—',
        role: f.role.trim() || '—',
        email: f.email.trim().toLowerCase(),
        tel: f.tel.trim(),
        stage: f.stage,
        priority: f.priority,
        value: effectiveValue,
        currency: f.currency,
        sector: f.sector.trim() || '—',
        country: f.country.trim() || '—',
        channel: f.channel,
        last: f.last.trim(),
        next: f.next.trim(),
        lastContact: f.lastContact || null,
        services: svcObjs.map(s => ({ id: s.id, name: s.name, price: s.price, currency: s.currency })),
        domain: f.email ? (f.email.split('@')[1] || '') : (lead.domain || ''),
      };
      await window.upsertLead(uiLead);
      if (isNew) {
        try { await window.addActivity('lead', uiLead.id, 'created', { canal: uiLead.channel, manual: true }); } catch {}
      }
      onSaved && onSaved(uiLead.id);
    } catch (ex) {
      console.error('LeadForm save:', ex);
      setErr('Error al guardar. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="modal-title">{isNew ? 'Nuevo lead' : 'Editar lead'}</div>
          <button className="ld-close" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-grid">
            <div className="field col-2">
              <label>Empresa</label>
              <input className="mock-input" value={f.co} onChange={upd('co')} placeholder="ej: Rappi Pay" autoFocus/>
            </div>
            <div className="field">
              <label>Contacto</label>
              <input className="mock-input" value={f.contact} onChange={upd('contact')} placeholder="Nombre y apellido"/>
            </div>
            <div className="field">
              <label>Cargo</label>
              <input className="mock-input" value={f.role} onChange={upd('role')} placeholder="ej: Head of Ops"/>
            </div>
            <div className="field">
              <label>Email</label>
              <input className="mock-input" type="email" value={f.email} onChange={upd('email')} placeholder="contacto@empresa.com"/>
            </div>
            <div className="field">
              <label>Teléfono</label>
              <input className="mock-input" value={f.tel} onChange={upd('tel')} placeholder="+54 …"/>
            </div>

            <div className="field">
              <label>Etapa</label>
              <select className="mock-select" value={f.stage} onChange={upd('stage')}>
                {STAGES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Prioridad</label>
              <select className="mock-select" value={f.priority} onChange={upd('priority')}>
                <option value="urg">Urgente</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>

            <div className="field">
              <label>Sector</label>
              <input className="mock-input" value={f.sector} onChange={upd('sector')} placeholder="ej: Fintech"/>
            </div>
            <div className="field">
              <label>País</label>
              <input className="mock-input" value={f.country} onChange={upd('country')} placeholder="ej: Argentina"/>
            </div>
            <div className="field">
              <label>Canal de origen</label>
              <select className="mock-select" value={f.channel} onChange={upd('channel')}>
                {LEAD_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Último contacto</label>
              <input className="mock-input" type="date" value={f.lastContact || ''} onChange={upd('lastContact')}/>
            </div>

            <div className="field col-2">
              <label>Resumen / última interacción</label>
              <input className="mock-input" value={f.last} onChange={upd('last')} placeholder="ej: Pidió propuesta actualizada"/>
            </div>
            <div className="field col-2">
              <label>Próxima acción</label>
              <input className="mock-input" value={f.next} onChange={upd('next')} placeholder="ej: Enviar contrato el lunes"/>
            </div>
          </div>

          {/* Valor / servicios */}
          <div className="form-section">
            <div className="form-section-hd">Valor del lead</div>
            {catalog.length > 0 && (
              <div className="svc-pick">
                {catalog.map(s => (
                  <button type="button" key={s.id}
                    className={'svc-chip' + (selectedSvc.includes(s.id) ? ' on' : '')}
                    onClick={() => toggleSvc(s.id)}>
                    {selectedSvc.includes(s.id) && <Icon name="check" size={10}/>}
                    {s.name} · ${Number(s.price).toLocaleString('en-US')}
                  </button>
                ))}
              </div>
            )}
            <div className="value-row">
              <div className="field">
                <label>{svcSum > 0 ? 'Valor (auto por servicios)' : 'Valor manual'}</label>
                <input className="mock-input" type="number" min="0" step="0.01"
                  value={svcSum > 0 ? svcSum : f.value}
                  onChange={upd('value')} disabled={svcSum > 0} placeholder="0"/>
              </div>
              <div className="field" style={{ maxWidth: 110 }}>
                <label>Moneda</label>
                <select className="mock-select" value={f.currency} onChange={upd('currency')}>
                  {LEAD_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {err && <div className="form-err">{err}</div>}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Guardando…' : (isNew ? 'Crear lead' : 'Guardar cambios')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

window.LeadForm = LeadForm;
