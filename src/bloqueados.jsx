/* ============================================================
   Bloqueados — gestión de contactos ignorados por el sistema
   ============================================================ */

const PLATFORM_LABELS = {
  email: 'Email',
  domain: 'Dominio',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  other: 'Otro',
};

function Bloqueados() {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState('all');
  const [newPlatform, setNewPlatform] = React.useState('email');
  const [newIdentifier, setNewIdentifier] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [addErr, setAddErr] = React.useState('');

  async function load() {
    setLoading(true);
    const { data: { session } } = await window.sb.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) { setLoading(false); return; }
    const { data } = await window.sb.from('ignored_senders')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    setItems(data || []);
    setLoading(false);
  }

  React.useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    const val = newIdentifier.trim();
    if (!val) { setAddErr('El identificador es obligatorio.'); return; }
    setAdding(true);
    setAddErr('');
    try {
      const { data: { session } } = await window.sb.auth.getSession();
      const uid = session?.user?.id;
      const { error } = await window.sb.from('ignored_senders').insert({
        user_id: uid,
        platform: newPlatform,
        identifier: val,
        source: 'manual',
      });
      if (error) {
        if (error.code === '23505') setAddErr('Este contacto ya está bloqueado.');
        else throw error;
      } else {
        setNewIdentifier('');
        await load();
      }
    } catch {
      setAddErr('Error al agregar. Intentá de nuevo.');
    } finally {
      setAdding(false);
    }
  }

  async function handleUnblock(id) {
    const { error } = await window.sb.from('ignored_senders').delete().eq('id', id);
    if (error) { alert('Error al desbloquear. Intentá de nuevo.'); return; }
    await load();
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (diff === 0) return 'hoy';
    if (diff === 1) return 'hace 1 día';
    if (diff < 7) return `hace ${diff} días`;
    if (diff < 30) return `hace ${Math.floor(diff / 7)} sem.`;
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  }

  const displayed = items.filter(it => {
    if (filter === 'all') return true;
    if (filter === 'ai') return it.source === 'ai';
    if (filter === 'manual') return it.source === 'manual';
    return it.platform === filter;
  });

  const counts = {
    all: items.length,
    ai: items.filter(i => i.source === 'ai').length,
    manual: items.filter(i => i.source === 'manual').length,
    email: items.filter(i => i.platform === 'email').length,
    domain: items.filter(i => i.platform === 'domain').length,
    linkedin: items.filter(i => i.platform === 'linkedin').length,
    instagram: items.filter(i => i.platform === 'instagram').length,
  };

  const tabs = [
    { id: 'all', label: `Todos (${counts.all})` },
    { id: 'ai', label: `IA (${counts.ai})` },
    { id: 'manual', label: `Manual (${counts.manual})` },
    { id: 'email', label: 'Email' },
    { id: 'domain', label: 'Dominio' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'instagram', label: 'Instagram' },
  ];

  return (
    <div className="page view-enter">
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--ff-display)', fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Contactos Bloqueados</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
            El sistema no analiza ni muestra estos contactos. Podés agregar emails, dominios, perfiles de LinkedIn o Instagram.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              style={{
                background: filter === t.id ? 'var(--accent-soft)' : 'var(--surface-2)',
                color: filter === t.id ? 'var(--accent)' : 'var(--text-4)',
                border: filter === t.id ? '1px solid var(--accent-line)' : '1px solid var(--border)',
                borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-4)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>Cargando…</div>
        ) : displayed.length === 0 ? (
          <div style={{ color: 'var(--text-4)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>
            {filter === 'all' ? 'No hay contactos bloqueados todavía.' : 'Sin resultados para este filtro.'}
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '12px 90px 1fr 100px 90px 90px', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              {['', 'Plataforma', 'Identificador', 'Origen', 'Bloqueado', ''].map((h, i) => (
                <span key={i} style={{ color: 'var(--text-4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</span>
              ))}
            </div>
            {displayed.map((it, i) => (
              <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '12px 90px 1fr 100px 90px 90px', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < displayed.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: it.source === 'manual' ? 'var(--accent)' : 'var(--border)', flexShrink: 0 }}/>
                <span style={{ background: 'var(--surface-2)', color: 'var(--text-3)', fontSize: 10, padding: '2px 8px', borderRadius: 4, textAlign: 'center', border: '1px solid var(--border)' }}>
                  {PLATFORM_LABELS[it.platform] || it.platform}
                </span>
                <span style={{ color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.identifier}</span>
                <span style={{ color: it.source === 'manual' ? 'var(--accent)' : 'var(--text-4)', fontSize: 11 }}>
                  {it.source === 'manual' ? 'Manual' : it.reason || 'IA'}
                </span>
                <span style={{ color: 'var(--text-4)', fontSize: 11 }}>{fmtDate(it.created_at)}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, padding: '3px 8px', color: 'var(--text-4)' }}
                  onClick={() => handleUnblock(it.id)}
                >
                  Desbloquear
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Agregar contacto a bloquear</div>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <select
              value={newPlatform}
              onChange={e => setNewPlatform(e.target.value)}
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 12 }}
            >
              <option value="email">Email</option>
              <option value="domain">Dominio completo</option>
              <option value="linkedin">LinkedIn</option>
              <option value="instagram">Instagram</option>
              <option value="other">Otro</option>
            </select>
            <input
              className="mock-input"
              style={{ flex: 1, minWidth: 200 }}
              value={newIdentifier}
              onChange={e => { setNewIdentifier(e.target.value); setAddErr(''); }}
              placeholder={
                newPlatform === 'email' ? 'spam@ejemplo.com' :
                newPlatform === 'domain' ? 'mercadopago.com' :
                newPlatform === 'linkedin' ? 'linkedin.com/in/usuario' :
                newPlatform === 'instagram' ? '@usuario' : 'identificador'
              }
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={adding}>
              {adding ? 'Agregando…' : 'Agregar'}
            </button>
          </form>
          {addErr && <div style={{ color: 'var(--p-urg)', fontSize: 12, marginTop: 6 }}>{addErr}</div>}
        </div>
      </div>
    </div>
  );
}

window.Bloqueados = Bloqueados;
