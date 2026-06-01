/* ============================================================
   Servicios — catálogo de servicios del usuario
   ============================================================ */

const CURRENCIES = ['USD', 'ARS', 'EUR', 'MXN', 'CLP', 'COP'];

function ServiciosForm({ initial, onSave, onCancel }) {
  const [name, setName] = React.useState(initial?.name || '');
  const [price, setPrice] = React.useState(initial?.price != null ? String(initial.price) : '');
  const [currency, setCurrency] = React.useState(initial?.currency || 'USD');
  const [description, setDescription] = React.useState(initial?.description || '');
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const p = parseFloat(price);
    if (!name.trim()) { setErr('El nombre es obligatorio.'); return; }
    if (!Number.isFinite(p) || p <= 0) { setErr('El precio debe ser un número mayor a 0.'); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), price: p, currency, description: description.trim() });
    } catch (ex) {
      setErr('Error al guardar. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ color: 'var(--text-3)', fontSize: 11 }}>Nombre del servicio *</label>
        <input
          className="mock-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="ej: Creación de sitio web"
          autoFocus
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ color: 'var(--text-3)', fontSize: 11 }}>Precio *</label>
          <input
            className="mock-input"
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder="100"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ color: 'var(--text-3)', fontSize: 11 }}>Moneda</label>
          <select
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '6px 10px', fontSize: 13 }}
            value={currency}
            onChange={e => setCurrency(e.target.value)}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ color: 'var(--text-3)', fontSize: 11 }}>Descripción (opcional)</label>
        <input
          className="mock-input"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="ej: Landing page, e-commerce, portfolio"
        />
      </div>
      {err && <div style={{ color: 'var(--p-urg)', fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? 'Guardando…' : (initial ? 'Guardar cambios' : 'Agregar servicio')}
        </button>
      </div>
    </form>
  );
}

function Servicios() {
  const [services, setServices] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [editing, setEditing] = React.useState(null);

  async function load() {
    setLoading(true);
    const { data: { session } } = await window.sb.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) { setLoading(false); return; }
    const { data } = await window.sb.from('user_services')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: true });
    setServices(data || []);
    setLoading(false);
  }

  React.useEffect(() => { load(); }, []);

  async function handleAdd(fields) {
    const { data: { session } } = await window.sb.auth.getSession();
    const uid = session?.user?.id;
    await window.sb.from('user_services').insert({ user_id: uid, ...fields });
    setShowForm(false);
    await load();
  }

  async function handleUpdate(id, fields) {
    const { error } = await window.sb.from('user_services').update(fields).eq('id', id);
    if (error) { alert('Error al actualizar. Intentá de nuevo.'); return; }
    setEditing(null);
    await load();
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Eliminar este servicio?')) return;
    const { error } = await window.sb.from('user_services').delete().eq('id', id);
    if (error) { alert('Error al eliminar. Intentá de nuevo.'); return; }
    await load();
  }

  const total = services.reduce((s, sv) => s + (sv.price || 0), 0);

  return (
    <div className="page view-enter">
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--ff-display)', fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Catálogo de Servicios</h2>
            <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
              La IA analiza el historial de cada conversación para detectar qué servicios se discuten y calcular el valor del lead.
            </p>
          </div>
          {!showForm && !editing && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
              <Icon name="plus" size={12}/> Nuevo servicio
            </button>
          )}
        </div>

        {(showForm && !editing) && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Nuevo servicio</div>
            <ServiciosForm onSave={handleAdd} onCancel={() => setShowForm(false)} />
          </div>
        )}

        {loading ? (
          <div style={{ color: 'var(--text-4)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>Cargando…</div>
        ) : services.length === 0 && !showForm ? (
          <div style={{ border: '1px dashed var(--border)', borderRadius: 12, padding: 48, textAlign: 'center' }}>
            <div style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 12 }}>No tenés servicios configurados.</div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
              <Icon name="plus" size={12}/> Agregar el primero
            </button>
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 60px 80px', padding: '8px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              {['Nombre', 'Precio', 'Moneda', ''].map((h, i) => (
                <span key={i} style={{ color: 'var(--text-4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</span>
              ))}
            </div>
            {services.map((sv, i) => (
              <React.Fragment key={sv.id}>
                {editing?.id === sv.id ? (
                  <div style={{ padding: 16, borderBottom: i < services.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <ServiciosForm
                      initial={sv}
                      onSave={fields => handleUpdate(sv.id, fields)}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 60px 80px', alignItems: 'center', padding: '12px 16px', borderBottom: i < services.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <div>
                      <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>{sv.name}</div>
                      {sv.description && <div style={{ color: 'var(--text-4)', fontSize: 11, marginTop: 2 }}>{sv.description}</div>}
                    </div>
                    <div style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 700, fontFamily: 'var(--ff-mono)' }}>${(sv.price ?? 0).toLocaleString('en-US')}</div>
                    <div style={{ color: 'var(--text-4)', fontSize: 12 }}>{sv.currency}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => { setEditing(sv); setShowForm(false); }}>Editar</button>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--text-4)' }} onClick={() => handleDelete(sv.id)}>Borrar</button>
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {services.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 12, padding: '10px 0', borderTop: '1px solid var(--border-subtle)' }}>
            <span style={{ color: 'var(--text-4)', fontSize: 12 }}>Valor total del catálogo (sin conversión)</span>
            <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-mono)' }}>${total.toLocaleString('en-US')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

window.Servicios = Servicios;
