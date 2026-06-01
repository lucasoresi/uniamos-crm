# Email Intelligence & Pipeline Value — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar filtrado inteligente de emails (IA + lista manual), catálogo de servicios con asignación automática de valor por lead, y movimiento automático de etapas basado en historial completo de conversación.

**Architecture:** Se crea un nuevo Edge Function `analyze-lead` que en una sola llamada a Claude Haiku recibe el historial completo de conversación + catálogo de servicios del usuario y devuelve: si el email es ruido, nueva etapa, y servicios detectados. El filtrado se refuerza en dos capas: regex + tabla `ignored_senders` en el cliente, y prompt mejorado en `enrich-gmail-contacts` en el servidor. Dos nuevas secciones en el sidebar (Servicios y Bloqueados) proveen configuración al usuario.

**Tech Stack:** Vanilla JSX transpilado por Babel Standalone en el navegador, React 18 (CDN), Supabase (PostgreSQL + RLS + Edge Functions con Deno), Claude Haiku via Anthropic API, Playwright para E2E tests.

---

## Mapa de archivos

| Acción | Archivo | Responsabilidad |
|---|---|---|
| Crear | `supabase/functions/analyze-lead/index.ts` | Nuevo Edge Function unificado |
| Crear | `src/servicios.jsx` | Catálogo de servicios CRUD |
| Crear | `src/bloqueados.jsx` | Gestión de contactos bloqueados |
| Modificar | `src/data.jsx` | Agregar iconos 'layers' y 'shield' |
| Modificar | `src/data-layer.jsx` | Mapear campo `services` en `dbToUi`/`uiToDb` |
| Modificar | `src/gmail-layer.jsx` | Bodies en historial, pre-filtro ignored_senders, integrar analyze-lead |
| Modificar | `src/sidebar.jsx` | Agregar items Servicios y Bloqueados |
| Modificar | `src/app.jsx` | Routear vistas servicios/bloqueados, pasar userServices |
| Modificar | `app.html` | Registrar nuevos scripts |
| Modificar | `src/lead-detail.jsx` | Sección de servicios detectados |
| Modificar | `supabase/functions/enrich-gmail-contacts/index.ts` | Prompt B2C mejorado |
| Esquema | SQL migration | Tablas user_services + ignored_senders con RLS |

---

## Task 1: Crear tablas Supabase con RLS

**Files:**
- Modify: `schema.sql`

- [ ] **Step 1: Aplicar migración — tabla user_services**

Via Supabase MCP (`mcp__supabase__apply_migration`) o dashboard SQL editor:

```sql
create table if not exists public.user_services (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  name        text not null,
  price       numeric(10,2) not null,
  currency    text not null default 'USD',
  description text,
  created_at  timestamptz default now()
);

alter table public.user_services enable row level security;

create policy "user_services_select" on public.user_services
  for select using (auth.uid() = user_id);

create policy "user_services_insert" on public.user_services
  for insert with check (auth.uid() = user_id);

create policy "user_services_update" on public.user_services
  for update using (auth.uid() = user_id);

create policy "user_services_delete" on public.user_services
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 2: Aplicar migración — tabla ignored_senders**

```sql
create table if not exists public.ignored_senders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  platform   text not null default 'email',
  identifier text not null,
  source     text not null default 'manual',
  reason     text,
  created_at timestamptz default now(),
  unique(user_id, platform, identifier)
);

alter table public.ignored_senders enable row level security;

create policy "ignored_senders_select" on public.ignored_senders
  for select using (auth.uid() = user_id);

create policy "ignored_senders_insert" on public.ignored_senders
  for insert with check (auth.uid() = user_id);

create policy "ignored_senders_delete" on public.ignored_senders
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 3: Verificar tablas en Supabase**

En el dashboard de Supabase → Table Editor, verificar que existen `user_services` e `ignored_senders` con las columnas correctas.

- [ ] **Step 4: Actualizar schema.sql con las nuevas tablas**

Agregar al final de `schema.sql` los dos bloques SQL anteriores.

- [ ] **Step 5: Commit**

```bash
git add schema.sql
git commit -m "feat: add user_services and ignored_senders tables with RLS"
```

---

## Task 2: Agregar iconos al componente Icon y mapear services en data-layer

**Files:**
- Modify: `src/data.jsx:88` (case default del switch)
- Modify: `src/data-layer.jsx:22-51` (función dbToUi)
- Modify: `src/data-layer.jsx:54+` (función uiToDb)

- [ ] **Step 1: Agregar iconos 'layers' y 'shield' en data.jsx**

Abrir `src/data.jsx`. Antes del `case 'logo':` (línea ~83), agregar:

```jsx
case 'layers':
  return <svg {...common}><path d="M2 12 12 7l10 5-10 5L2 12Z"/><path d="M2 17l10 5 10-5"/><path d="M2 7l10 5 10-5"/></svg>;
case 'shield':
  return <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>;
```

- [ ] **Step 2: Extender dbToUi para incluir services**

En `src/data-layer.jsx`, en la función `dbToUi`, agregar después de `aiMove: null,`:

```js
services: Array.isArray(d.services) ? d.services : [],
```

- [ ] **Step 3: Extender uiToDb para serializar services**

En `src/data-layer.jsx`, en la función `uiToDb`, agregar el campo services al objeto retornado. Buscar el bloque `return {` en `uiToDb` y agregar:

```js
services: Array.isArray(lead.services) ? lead.services : [],
valor: Array.isArray(lead.services) && lead.services.length > 0
  ? lead.services.reduce((sum, s) => sum + (s.price || 0), 0)
  : (lead.value ?? null),
```

- [ ] **Step 4: Verificar en el navegador**

Abrir `http://localhost:3000/app.html` (con `python3 -m http.server 3000`). Abrir consola. Ejecutar `window.dbToUi({ id: 'test', data: { services: [{ id: '1', name: 'Web', price: 100 }] } })` — debe retornar un objeto con `services: [...]`.

- [ ] **Step 5: Commit**

```bash
git add src/data.jsx src/data-layer.jsx
git commit -m "feat: add layers/shield icons and services field mapping in data-layer"
```

---

## Task 3: Crear src/servicios.jsx — catálogo de servicios CRUD

**Files:**
- Create: `src/servicios.jsx`

- [ ] **Step 1: Crear el archivo servicios.jsx**

```jsx
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
    await window.sb.from('user_services').update(fields).eq('id', id);
    setEditing(null);
    await load();
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Eliminar este servicio?')) return;
    await window.sb.from('user_services').delete().eq('id', id);
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
                    <div style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 700, fontFamily: 'var(--ff-mono)' }}>${sv.price.toLocaleString('en-US')}</div>
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
            <span style={{ color: 'var(--text-4)', fontSize: 12 }}>Valor total del catálogo</span>
            <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-mono)' }}>${total.toLocaleString('en-US')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

window.Servicios = Servicios;
```

- [ ] **Step 2: Verificar sintaxis**

El archivo no tiene build step — los errores de sintaxis aparecerán en la consola del navegador al cargar la página. Se verifica en Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/servicios.jsx
git commit -m "feat: add Servicios catalog CRUD component"
```

---

## Task 4: Crear src/bloqueados.jsx — gestión de contactos bloqueados

**Files:**
- Create: `src/bloqueados.jsx`

- [ ] **Step 1: Crear el archivo bloqueados.jsx**

```jsx
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
  const [filter, setFilter] = React.useState('all'); // all | ai | manual | email | domain | linkedin | instagram
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
    await window.sb.from('ignored_senders').delete().eq('id', id);
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

        {/* Filtros */}
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

        {/* Tabla */}
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

        {/* Formulario agregar */}
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
```

- [ ] **Step 2: Commit**

```bash
git add src/bloqueados.jsx
git commit -m "feat: add Bloqueados contact management component"
```

---

## Task 5: Registrar nuevas vistas en app.html, sidebar.jsx y app.jsx

**Files:**
- Modify: `app.html:28-34` (lista de scripts)
- Modify: `src/sidebar.jsx:6-20` (items de navegación)
- Modify: `src/app.jsx` (breadcrumbs, routing, render)

- [ ] **Step 1: Agregar scripts en app.html**

En `app.html`, después de `<script type="text/babel" src="src/inbox.jsx?v=3"></script>` (línea 33) y antes de `<script type="text/babel" src="src/app.jsx?v=3"></script>` (línea 34), insertar:

```html
<script type="text/babel" src="src/servicios.jsx?v=1"></script>
<script type="text/babel" src="src/bloqueados.jsx?v=1"></script>
```

- [ ] **Step 2: Agregar items en sidebar.jsx**

En `src/sidebar.jsx`, modificar `items3` para incluir los nuevos items:

```js
const items3 = [
  { id: 'auto',       name: 'Automatizaciones', icon: 'bolt',    badge: null },
  { id: 'servicios',  name: 'Servicios',         icon: 'layers',  badge: null },
  { id: 'bloqueados', name: 'Bloqueados',         icon: 'shield',  badge: null },
  { id: 'integ',      name: 'Integraciones',      icon: 'link',   badge: null },
  { id: 'api',        name: 'API',                icon: 'code',   badge: null },
];
```

- [ ] **Step 3: Agregar breadcrumbs y routing en app.jsx**

En `src/app.jsx`, en el objeto `breadcrumbs`, agregar:

```js
servicios:  ['Configuración', 'Servicios'],
bloqueados: ['Configuración', 'Bloqueados'],
```

En el bloque de renders de vistas (cerca del final, donde están los `{view === 'inicio' && ...}`), agregar:

```jsx
{view === 'servicios' && <Servicios/>}
{view === 'bloqueados' && <Bloqueados/>}
```

- [ ] **Step 4: Verificar en el navegador**

1. Iniciar servidor: `python3 -m http.server 3000`
2. Abrir `http://localhost:3000/app.html`
3. Loguearse con cuenta de prueba
4. Hacer click en "Servicios" en el sidebar — debe cargar la vista de catálogo
5. Hacer click en "Bloqueados" en el sidebar — debe cargar la vista de bloqueados
6. Agregar un servicio: nombre "Prueba", precio 100, moneda USD → debe aparecer en la lista
7. Editar ese servicio → debe actualizarse
8. Borrarlo → debe desaparecer
9. En Bloqueados, agregar un email de prueba → debe aparecer en la tabla
10. Desbloquearlo → debe desaparecer

- [ ] **Step 5: Commit**

```bash
git add app.html src/sidebar.jsx src/app.jsx
git commit -m "feat: wire Servicios and Bloqueados views into app navigation"
```

---

## Task 6: Mejorar prompt B2C en enrich-gmail-contacts

**Files:**
- Modify: `supabase/functions/enrich-gmail-contacts/index.ts:92-129`

- [ ] **Step 1: Reemplazar el bloque del prompt en enrich-gmail-contacts**

En `supabase/functions/enrich-gmail-contacts/index.ts`, reemplazar la constante `prompt` (líneas 92-129) con:

```ts
  const prompt = `Sos un asistente de CRM experto en ventas B2B.

Analizá estos ${contacts.length} contactos extraídos de Gmail de un vendedor. Para cada uno determiná si es un prospecto/cliente B2B real.

Contactos:
${contactLines}

Devolvé SOLO un array JSON con los contactos que SÍ son leads B2B de ventas. Ignorá completamente y NO incluyas en el resultado:
- Newsletters, notificaciones automáticas, servicios de software (Slack, GitHub, Jira, Google, Notion, Linear, etc.)
- Emails de soporte técnico, facturación automática, alertas de sistema, tracking de pedidos
- Contactos de comercios B2C: supermercados, tiendas de ropa, restaurantes, farmacéuticas de consumo, retail en general
- Apps de pago y fintech de consumo: MercadoPago, PayPal, Visa, Mastercard, bancos en modo transaccional
- Servicios de delivery, transporte, turismo, hotelería para consumo personal
- Suscripciones de entretenimiento: Netflix, Spotify, plataformas de streaming
- Confirmaciones de compras personales, recibos, facturas de servicios domésticos
- Contactos sin contexto de negocio claro o sin intercambio bidireccional real

Para cada lead B2B incluí exactamente este formato:
{
  "email": "email exacto del contacto",
  "empresa": "nombre de la empresa (inferir del dominio si es necesario, ej: gabor.com.mx → Gabor)",
  "lead": "nombre del contacto",
  "domain": "dominio del email",
  "estado": "cierre|propuesta|activa|ghost|frio|sininfo",
  "prioridad": "urgente|alta|media|baja",
  "notas": "1 oración corta de contexto basada en los asuntos detectados"
}

Criterios de estado:
- "cierre": asuntos mencionan firma, contrato firmado, cierre, deal cerrado
- "propuesta": asuntos mencionan propuesta, cotización, presupuesto
- "activa": sent_count + received_count >= 3, conversación bidireccional en curso
- "ghost": intercambio previo pero sin respuesta reciente (solo 1 mensaje del contacto)
- "frio": 1 solo email sin intercambio real, o señal de desinterés
- "sininfo": poco contexto, asuntos vagos o insuficientes

Criterios de prioridad:
- "urgente": 6+ intercambios totales o asuntos con urgencia explícita
- "alta": 3-5 intercambios o asuntos con propuesta/reunión
- "media": 2 intercambios
- "baja": 1 solo email

Respondé SOLO con el array JSON, sin texto adicional, sin markdown.`
```

- [ ] **Step 2: Deploy del Edge Function**

```bash
npx supabase functions deploy enrich-gmail-contacts
```

- [ ] **Step 3: Verificar**

En el dashboard de Supabase → Edge Functions, verificar que el deploy fue exitoso. Opcionalmente forzar un nuevo login para disparar `gmailSync_run` y ver en la consola si reduce los contactos B2C capturados.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/enrich-gmail-contacts/index.ts
git commit -m "fix: strengthen B2C filtering in enrich-gmail-contacts prompt"
```

---

## Task 7: Crear Edge Function analyze-lead

**Files:**
- Create: `supabase/functions/analyze-lead/index.ts`

- [ ] **Step 1: Crear el archivo**

```ts
// supabase/functions/analyze-lead/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'

const VALID_STAGES = ['cierre', 'propuesta', 'activa', 'ghost', 'frio', 'sininfo']
const VALID_SIGNALS = ['hot', 'warm', 'cold', 'neutral']

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let email: { subject: string; from: string; snippet: string } = { subject: '', from: '', snippet: '' }
  let conversation_history: Array<{ subject: string; body: string; date: string; direction: string }> = []
  let current_stage = 'sininfo'
  let lead_name = 'Lead'
  let user_services: Array<{ id: string; name: string; price: number }> = []

  try {
    const body = await req.json()
    email = body.email || email
    conversation_history = Array.isArray(body.conversation_history) ? body.conversation_history : []
    if (VALID_STAGES.includes(body.current_stage)) current_stage = body.current_stage
    lead_name = String(body.lead_name || 'Lead').slice(0, 100)
    user_services = Array.isArray(body.user_services) ? body.user_services.slice(0, 20) : []
  } catch {
    return fallback(current_stage, corsHeaders)
  }

  const safeStr = (s: unknown, max: number) => String(s || '').replace(/[\r\n]+/g, ' ').slice(0, max)

  const historyLines = conversation_history.slice(0, 15).map((m, i) => {
    const dir = m.direction === 'sent' ? 'Enviado' : 'Recibido'
    return `[${i + 1}] ${dir} ${safeStr(m.date, 20)} | Asunto: ${safeStr(m.subject, 120)} | ${safeStr(m.body, 400)}`
  }).join('\n')

  const servicesLines = user_services.length > 0
    ? user_services.map(s => `- ID: ${s.id} | Nombre: ${safeStr(s.name, 80)} | Precio: $${s.price}`).join('\n')
    : '(el usuario no tiene servicios configurados)'

  const prompt = `Sos un asistente de CRM B2B. Analizá el siguiente email y el historial de conversación con el lead y respondé en JSON.

Lead: ${lead_name}
Email actual — De: ${safeStr(email.from, 100)} | Asunto: ${safeStr(email.subject, 200)} | Fragmento: ${safeStr(email.snippet, 300)}

Historial completo (últimos mensajes, del más antiguo al más reciente):
${historyLines || '(sin historial previo)'}

Etapa actual: ${current_stage}

Catálogo de servicios del usuario:
${servicesLines}

Respondé SOLO en JSON válido, sin texto adicional:
{
  "is_noise": bool,
  "new_stage": "...",
  "matched_services": ["id1", "id2"],
  "signal": "hot|warm|cold|neutral",
  "reason": "1 oración en español"
}

Reglas para is_noise:
- true si el email es notificación automática, recibo de pago, newsletter, alerta de sistema, confirmación de compra personal, publicidad masiva
- false si es una comunicación real de negocio (aunque sea breve)

Reglas para new_stage:
- "cierre": mencionan contrato, firma, "cerramos", "cuándo empezamos", cierre inminente
- "propuesta": piden presupuesto, cotización, reunión para evaluar oferta
- "activa": conversación bidireccional activa, preguntas concretas sobre servicios
- "ghost": sin respuesta del lead en 14+ días (verificar fechas del historial)
- "frio": desinterés explícito o silencio de 30+ días
- "sininfo": primer email o contexto insuficiente
- Si hay duda, devolvé la etapa actual (${current_stage}) sin cambios

Reglas para matched_services:
- Incluí solo los IDs de servicios que el historial menciona claramente
- Si no hay servicios configurados o no se mencionan, devolvé []`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      console.error('Anthropic error:', await res.text())
      return fallback(current_stage, corsHeaders)
    }

    const data = await res.json()
    const text = data.content?.[0]?.text?.trim() || ''

    let parsed: { is_noise?: boolean; new_stage?: string; matched_services?: string[]; signal?: string; reason?: string } = {}
    try { parsed = JSON.parse(text) } catch { return fallback(current_stage, corsHeaders) }

    const is_noise = parsed.is_noise === true
    const new_stage = VALID_STAGES.includes(parsed.new_stage || '') ? parsed.new_stage! : current_stage
    const signal = VALID_SIGNALS.includes(parsed.signal || '') ? parsed.signal! : 'neutral'
    const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : ''
    const validServiceIds = new Set(user_services.map(s => s.id))
    const matched_services = Array.isArray(parsed.matched_services)
      ? parsed.matched_services.filter(id => typeof id === 'string' && validServiceIds.has(id))
      : []

    return new Response(JSON.stringify({ is_noise, new_stage, matched_services, signal, reason }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Unhandled error:', err)
    return fallback(current_stage, corsHeaders)
  }
})

function fallback(stage: string, headers: Record<string, string>) {
  return new Response(JSON.stringify({
    is_noise: false, new_stage: stage, matched_services: [], signal: 'neutral', reason: '',
  }), { headers: { ...headers, 'Content-Type': 'application/json' } })
}
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy analyze-lead
```

- [ ] **Step 3: Verificar con curl**

Reemplazar `<JWT>` con un access_token real de una sesión:

```bash
curl -X POST https://llleoqfeluptmmbqluab.supabase.co/functions/v1/analyze-lead \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": { "subject": "Cotización sitio web", "from": "ana@techcorp.com", "snippet": "Necesitamos una propuesta para rediseñar nuestro sitio" },
    "conversation_history": [],
    "current_stage": "activa",
    "lead_name": "TechCorp",
    "user_services": [{ "id": "abc-123", "name": "Creación de sitio web", "price": 100 }]
  }'
```

Respuesta esperada: `{"is_noise":false,"new_stage":"propuesta","matched_services":["abc-123"],"signal":"warm","reason":"..."}"`

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/analyze-lead/index.ts
git commit -m "feat: add analyze-lead edge function (noise + stage + services in one call)"
```

---

## Task 8: Modificar gmail-layer.jsx — bodies, pre-filtro y analyze-lead

**Files:**
- Modify: `src/gmail-layer.jsx`

- [ ] **Step 1: Agregar helper _gmailExtractBody**

En `src/gmail-layer.jsx`, después de la función `_parseAddresses` (línea ~36), agregar:

```js
function _gmailExtractBody(msg) {
  function findText(part) {
    if (!part) return '';
    if (part.mimeType === 'text/plain' && part.body?.data) {
      try { return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/')); } catch { return ''; }
    }
    if (part.parts) {
      for (const p of part.parts) { const t = findText(p); if (t) return t; }
    }
    return '';
  }
  return findText(msg.payload).replace(/\s+/g, ' ').trim().slice(0, 500);
}
```

- [ ] **Step 2: Modificar gmail_loadForContact para retornar bodies**

Reemplazar la función `gmail_loadForContact` completa (desde `async function gmail_loadForContact` hasta el cierre de la función, líneas ~310-334) con:

```js
async function gmail_loadForContact(email, { withBodies = false } = {}) {
  const token = await getGoogleToken();
  if (!token) return { hasToken: false, messages: [] };

  const h = { Authorization: `Bearer ${token}` };
  try {
    const q = encodeURIComponent(`from:${email} OR to:${email}`);
    const listRes = await fetch(`${_GAPI}/messages?q=${q}&maxResults=15`, { headers: h });
    if (listRes.status === 401) {
      sessionStorage.removeItem('gtoken'); sessionStorage.removeItem('gtoken_exp');
      return { hasToken: false, messages: [] };
    }
    const listData = await listRes.json();
    const msgs = listData.messages || [];
    if (!msgs.length) return { hasToken: true, messages: [] };

    const format = withBodies ? 'minimal' : 'metadata';
    const metaHeaders = 'metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date';
    const details = await Promise.all(msgs.slice(0, 15).map(m =>
      fetch(`${_GAPI}/messages/${m.id}?format=${format}&${metaHeaders}`, { headers: h })
        .then(r => r.json())
    ));
    return { hasToken: true, messages: details };
  } catch {
    return { hasToken: true, messages: [], error: true };
  }
}
```

- [ ] **Step 3: Agregar función _loadIgnoredSenders**

Después de la función `gmail_storeTokens` (línea ~81), agregar:

```js
async function _loadIgnoredSenders() {
  try {
    const { data } = await window.sb.from('ignored_senders').select('platform,identifier');
    return data || [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Modificar _fetchContacts para aplicar pre-filtro**

En la función `_fetchContacts`, antes del `return Array.from(contactMap.values())...` (línea ~183), agregar:

```js
  const ignored = await _loadIgnoredSenders();
  const ignoredEmails = new Set(ignored.filter(i => i.platform === 'email').map(i => i.identifier.toLowerCase()));
  const ignoredDomains = new Set(ignored.filter(i => i.platform === 'domain').map(i => i.identifier.toLowerCase()));
```

Y modificar el `.filter(c => ...)` de la línea ~184 para incluir el pre-filtro:

```js
  return Array.from(contactMap.values())
    .filter(c => {
      if (ignoredEmails.has(c.email.toLowerCase())) return false;
      if (ignoredDomains.has((c.domain || '').toLowerCase())) return false;
      return !(_PERSONAL.has(c.domain) && (c.sent_count + c.received_count) < 3);
    })
    .sort((a, b) => (b.sent_count + b.received_count) - (a.sent_count + a.received_count))
    .slice(0, 40);
```

- [ ] **Step 5: Agregar función gmail_analyzeEmails**

Agregar antes del bloque `Object.assign(window, ...)` al final del archivo:

```js
async function gmail_analyzeEmails(matched, leads) {
  const { data: { session } } = await window.sb.auth.getSession();
  const jwt = session?.access_token;
  if (!jwt) return [];

  const { data: services } = await window.sb.from('user_services').select('id,name,price,currency');
  const userServices = (services || []).map(s => ({ id: s.id, name: s.name, price: s.price }));

  const token = await getGoogleToken();

  const results = await Promise.allSettled(matched.map(async ({ msg, lead }) => {
    const histResult = token
      ? await gmail_loadForContact(lead.email, { withBodies: true })
      : { messages: [] };

    const history = histResult.messages.map(m => {
      const from = _gmailHdr(m, 'From');
      const isOwn = from.includes(session.user.email || '__nobody__');
      return {
        subject: _gmailHdr(m, 'Subject'),
        body: _gmailExtractBody(m),
        date: _gmailHdr(m, 'Date'),
        direction: isOwn ? 'sent' : 'received',
      };
    });

    const res = await fetch(`${_SF}/analyze-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        email: {
          subject: _gmailHdr(msg, 'Subject'),
          from: _gmailHdr(msg, 'From'),
          snippet: msg.snippet || '',
        },
        conversation_history: history,
        current_stage: lead.stage,
        lead_name: lead.co,
        user_services: userServices,
      }),
    });

    const classification = res.ok ? await res.json() : { is_noise: false, new_stage: lead.stage, matched_services: [], signal: 'neutral', reason: '' };

    // Apply stage change if needed
    if (!classification.is_noise && classification.new_stage !== lead.stage) {
      await window.sb.from('leads').update({
        data: { ...lead._raw, estado: classification.new_stage },
        updated_at: new Date().toISOString(),
      }).eq('id', lead.id);
    }

    // Apply services if returned
    if (!classification.is_noise && classification.matched_services?.length > 0) {
      const matchedSvcs = userServices.filter(s => classification.matched_services.includes(s.id));
      const valor = matchedSvcs.reduce((sum, s) => sum + s.price, 0);
      await window.sb.from('leads').update({
        data: { ...lead._raw, services: matchedSvcs, valor },
        updated_at: new Date().toISOString(),
      }).eq('id', lead.id);
    }

    return { msg, lead, classification };
  }));

  return results
    .filter(r => r.status === 'fulfilled' && !r.value.classification.is_noise)
    .map(r => r.value);
}
```

- [ ] **Step 6: Exponer gmail_analyzeEmails en window**

En el bloque `Object.assign(window, {...})` al final del archivo, agregar `gmail_analyzeEmails`:

```js
Object.assign(window, {
  getGoogleToken,
  gmail_storeTokens,
  gmailSync_run,
  gmail_fetchForHome,
  gmail_matchEmailsToLeads,
  gmail_analyzeEmails,
  gmail_fetchInbox,
  gmail_sendReply,
  gmail_loadForContact,
  _gmailHdr,
  _gmailFmtTime,
});
```

- [ ] **Step 7: Commit**

```bash
git add src/gmail-layer.jsx
git commit -m "feat: add email body extraction, ignored_senders pre-filter, and gmail_analyzeEmails"
```

---

## Task 9: Integrar gmail_analyzeEmails en app.jsx

**Files:**
- Modify: `src/app.jsx` — función `fetchHomeEmails`

- [ ] **Step 1: Modificar fetchHomeEmails para usar gmail_analyzeEmails**

En `src/app.jsx`, reemplazar la función `fetchHomeEmails` completa con:

```js
const fetchHomeEmails = React.useCallback(async (currentLeads) => {
  setHomeEmails(null); // loading
  const { hasToken, messages } = await window.gmail_fetchForHome();
  if (!hasToken || !messages.length) { setHomeEmails([]); return; }

  const inbox = messages.filter(m => m._type === 'inbox');
  setInboxCount(inbox.length);

  // Match inbox emails to known leads
  const matched = window.gmail_matchEmailsToLeads(inbox, currentLeads);

  // Enrich leads with _raw data for updates inside gmail_analyzeEmails
  const enrichedLeads = currentLeads.map(l => ({
    ...l,
    _raw: l._raw || {},
  }));

  // Analyze matched emails with AI (classify noise, stage, services)
  const analyzed = await window.gmail_analyzeEmails(
    matched.map(({ msg, lead }) => ({
      msg,
      lead: enrichedLeads.find(l => l.id === lead.id) || lead,
    })),
    enrichedLeads
  );

  // Build email items from non-noise analyzed emails
  const emailItems = analyzed.slice(0, 5).map(({ msg, lead, classification }) => ({
    co: lead.co,
    from: _gmailHdr(msg, 'From').replace(/<[^>]+>/, '').trim() || lead.email.split('@')[0] || '?',
    subject: _gmailHdr(msg, 'Subject') || '(sin asunto)',
    time: _gmailFmtTime(_gmailHdr(msg, 'Date')),
    fromStage: lead.stage,
    moveTo: classification.new_stage !== lead.stage ? classification.new_stage : null,
    confidence: classification.signal === 'hot' ? 90 : classification.signal === 'warm' ? 70 : null,
    isUnread: (msg.labelIds || []).includes('UNREAD'),
    _lead: lead,
  }));

  // Fill remaining slots with unmatched inbox emails (no analysis)
  const matchedEmails = new Set(analyzed.map(a => _gmailHdr(a.msg, 'From')));
  inbox.slice(0, 20).forEach(msg => {
    if (emailItems.length >= 8) return;
    const from = _gmailHdr(msg, 'From');
    if (matchedEmails.has(from)) return;
    const sender = from.replace(/<[^>]+>/, '').trim() || from.split('@')[0] || '?';
    emailItems.push({
      co: sender, from: sender,
      subject: _gmailHdr(msg, 'Subject') || '(sin asunto)',
      time: _gmailFmtTime(_gmailHdr(msg, 'Date')),
      fromStage: null, moveTo: null, confidence: null,
      isUnread: (msg.labelIds || []).includes('UNREAD'),
      _lead: null,
    });
  });

  setHomeEmails(emailItems);
}, []);
```

- [ ] **Step 2: Exponer _raw en el data layer para que gmail_analyzeEmails pueda hacer updates**

En `src/data-layer.jsx`, en la función `dbToUi`, agregar al objeto retornado:

```js
_raw: row.data || {},
```

- [ ] **Step 3: Verificar en el navegador**

1. Abrir `http://localhost:3000/app.html` y loguear
2. Esperar que cargue el home
3. Verificar en consola que no hay errores de JS
4. Verificar que "Actividades recientes" muestra emails (o estado vacío si no hay conexión Gmail)
5. Si hay emails de leads conocidos, verificar que los movimientos de etapa aparecen en la sección "Movimientos automáticos"

- [ ] **Step 4: Commit**

```bash
git add src/app.jsx src/data-layer.jsx
git commit -m "feat: integrate gmail_analyzeEmails into home dashboard email loading"
```

---

## Task 10: Mostrar servicios detectados en el panel de detalle del lead

**Files:**
- Modify: `src/lead-detail.jsx`

- [ ] **Step 1: Localizar la sección de resumen en lead-detail.jsx**

Buscar en `src/lead-detail.jsx` dónde se renderiza el valor del lead (`lead.value`) o el campo de resumen. Agregar después de ese bloque:

```jsx
{/* Servicios detectados por IA */}
{Array.isArray(lead.services) && lead.services.length > 0 && (
  <div style={{ marginTop: 16 }}>
    <div style={{ color: 'var(--text-4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
      Servicios detectados
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {lead.services.map((sv, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--accent-soft)', border: '1px solid var(--accent-line)',
          borderRadius: 6, padding: '6px 10px',
        }}>
          <span style={{ color: 'var(--text-2)', fontSize: 12 }}>{sv.name}</span>
          <span style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 700, fontFamily: 'var(--ff-mono)' }}>
            ${(sv.price || 0).toLocaleString('en-US')} {sv.currency || 'USD'}
          </span>
        </div>
      ))}
    </div>
    <div style={{ color: 'var(--text-4)', fontSize: 10, marginTop: 6 }}>
      Detectado por IA · valor total: ${(lead.value || 0).toLocaleString('en-US')}
    </div>
  </div>
)}
```

- [ ] **Step 2: Verificar en el navegador**

1. Abrir un lead que tenga servicios detectados (después de que `gmail_analyzeEmails` haya corrido)
2. Verificar que aparece la sección "Servicios detectados" con los nombres y precios
3. Si no hay servicios aún, la sección no debe renderizarse

- [ ] **Step 3: Commit**

```bash
git add src/lead-detail.jsx
git commit -m "feat: show detected services in lead detail panel"
```

---

## Task 11: Escribir tests Playwright para flujos clave

**Files:**
- Create: `test/servicios-bloqueados.spec.js`

- [ ] **Step 1: Crear test E2E para Servicios**

```js
// test/servicios-bloqueados.spec.js
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

test.describe('Servicios', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app (assumes already logged in via session cookie, or mock)
    await page.goto(`${BASE}/app.html`);
    await page.waitForSelector('.sb-item', { timeout: 10000 });
    // Click Servicios in sidebar
    await page.click('.sb-item:has-text("Servicios")');
    await page.waitForSelector('h2:has-text("Catálogo de Servicios")', { timeout: 5000 });
  });

  test('muestra la vista de catálogo', async ({ page }) => {
    await expect(page.locator('h2')).toContainText('Catálogo de Servicios');
    await expect(page.locator('text=La IA analiza')).toBeVisible();
  });

  test('puede agregar un servicio', async ({ page }) => {
    await page.click('button:has-text("Nuevo servicio")');
    await page.fill('input[placeholder*="sitio web"]', 'Test Service');
    await page.fill('input[type="number"]', '150');
    await page.click('button:has-text("Agregar servicio")');
    await expect(page.locator('text=Test Service')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Bloqueados', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/app.html`);
    await page.waitForSelector('.sb-item', { timeout: 10000 });
    await page.click('.sb-item:has-text("Bloqueados")');
    await page.waitForSelector('h2:has-text("Contactos Bloqueados")', { timeout: 5000 });
  });

  test('muestra la vista de bloqueados', async ({ page }) => {
    await expect(page.locator('h2')).toContainText('Contactos Bloqueados');
  });

  test('puede agregar un email bloqueado', async ({ page }) => {
    await page.fill('input[placeholder*="spam@"]', 'test-block@ejemplo.com');
    await page.click('button:has-text("Agregar")');
    await expect(page.locator('text=test-block@ejemplo.com')).toBeVisible({ timeout: 5000 });
  });
});
```

- [ ] **Step 2: Configurar baseURL en playwright.config.js**

En `playwright.config.js`, descomentar la línea `baseURL`:

```js
use: {
  baseURL: 'http://localhost:3000',
  trace: 'on-first-retry',
},
```

- [ ] **Step 3: Notar limitación de auth en tests**

Los tests E2E requieren una sesión activa de Supabase. En CI, se deberán configurar credenciales de prueba via variables de entorno y un setup que haga login antes de cada test. Para correr localmente, el usuario debe estar ya logueado en el navegador y los tests deben reusar la sesión.

- [ ] **Step 4: Commit final**

```bash
git add test/servicios-bloqueados.spec.js playwright.config.js
git commit -m "test: add E2E tests for Servicios and Bloqueados views"
```

---

## Self-Review del Plan

**Cobertura del spec:**
- [x] Filtrado dual: pre-filtro en `_fetchContacts` (Task 8) + prompt mejorado en enrich-gmail-contacts (Task 6)
- [x] `ignored_senders` tabla + UI Bloqueados (Tasks 1, 4, 5)
- [x] `user_services` tabla + UI Servicios (Tasks 1, 3, 5)
- [x] `analyze-lead` Edge Function (Task 7)
- [x] Historial de conversación con bodies (Task 8)
- [x] Integración en home dashboard (Task 9)
- [x] Services en lead-detail (Task 10)
- [x] `dbToUi`/`uiToDb` con services (Task 2)

**Consideración importante:** `gmail_analyzeEmails` en Task 8 accede a `lead._raw` para hacer updates a Supabase. El campo `_raw` es el objeto `data` original de la DB. Este campo se agrega en Task 9 (Step 2) en `dbToUi`. Asegurarse de ejecutar Task 2 y Task 9 antes de ejecutar Task 8 en producción.

**Orden recomendado de ejecución:** Task 1 → Task 2 → Task 6 → Task 7 → Task 3 → Task 4 → Task 5 → Task 8 → Task 9 → Task 10 → Task 11.
