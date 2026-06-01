/* ============================================================
   Sidebar
   ============================================================ */

function Sidebar({ view, onView, user, onLogout, leads = [] }) {
  const items1 = [
    { id: 'inicio',   name: 'Inicio',         icon: 'home',     badge: null },
    { id: 'pipeline', name: 'CRM Pipeline',   icon: 'pipeline', badge: leads.length || null, badgeColor: 'accent' },
    { id: 'prm',      name: 'PRM Prospectos', icon: 'target',   badge: 7 },
  ];
  const items2 = [
    { id: 'inbox',    name: 'Gmail Inbox',    icon: 'mail',     badge: 29 },
    { id: 'tasks',    name: 'Mis Tareas',     icon: 'check-square', badge: 8 },
    { id: 'calendar', name: 'Calendario',     icon: 'calendar', badge: null },
  ];
  const items3 = [
    { id: 'auto',       name: 'Automatizaciones', icon: 'bolt',   badge: null },
    { id: 'servicios',  name: 'Servicios',         icon: 'layers', badge: null },
    { id: 'bloqueados', name: 'Bloqueados',         icon: 'shield', badge: null },
    { id: 'integ',      name: 'Integraciones',      icon: 'link',   badge: null },
    { id: 'api',        name: 'API',                icon: 'code',   badge: null },
  ];

  return (
    <aside className="sb">
      <div className="sb-logo">
        <div className="sb-mark">U</div>
        <div className="sb-brand">
          <div className="sb-name">Un<em>IA</em>mos</div>
          <div className="sb-name-sub">Sales Hub</div>
        </div>
      </div>

      <div className="sb-search">
        <div className="sb-search-wrap">
          <Icon name="search" size={13}/>
          <input className="sb-search-input" placeholder="Buscar leads, empresas…"/>
          <span className="sb-kbd">⌘K</span>
        </div>
      </div>

      <nav className="sb-nav">
        <div className="sb-section">
          <div className="sb-section-label">Ventas</div>
          {items1.map(it => (
            <div key={it.id}
                 className={'sb-item' + (view === it.id ? ' active' : '')}
                 onClick={() => onView(it.id)}>
              <span className="sb-icon"><Icon name={it.icon} size={15}/></span>
              <span>{it.name}</span>
              {it.badge != null && (
                <span className={'sb-badge' + (it.badgeColor === 'accent' && view !== it.id ? ' dim' : '')}>
                  {it.badge}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="sb-section">
          <div className="sb-section-label">Comunicaciones</div>
          {items2.map(it => (
            <div key={it.id}
                 className={'sb-item' + (view === it.id ? ' active' : '')}
                 onClick={() => onView(it.id)}>
              <span className="sb-icon"><Icon name={it.icon} size={15}/></span>
              <span>{it.name}</span>
              {it.badge != null && <span className="sb-badge dim">{it.badge}</span>}
            </div>
          ))}
        </div>

        <div className="sb-section">
          <div className="sb-section-label">Herramientas</div>
          {items3.map(it => (
            <div key={it.id}
                 className={'sb-item' + (view === it.id ? ' active' : '')}
                 onClick={() => onView(it.id)}>
              <span className="sb-icon"><Icon name={it.icon} size={15}/></span>
              <span>{it.name}</span>
            </div>
          ))}
        </div>
      </nav>

      <div className="sb-bottom">
        <div className="sb-avatar">{user ? user.initials : '·'}</div>
        <div className="sb-user">
          <div className="sb-uname">{user ? user.name : '—'}</div>
          <div className="sb-uemail">{user ? user.email : ''}</div>
        </div>
        <button className="sb-bottom-btn" title="Configuración">
          <Icon name="settings" size={14}/>
        </button>
        <button
          className="sb-bottom-btn"
          title="Cerrar sesión"
          onClick={onLogout}
          style={{ marginLeft: 4 }}
        >
          <Icon name="x" size={14}/>
        </button>
      </div>
    </aside>
  );
}

window.Sidebar = Sidebar;
