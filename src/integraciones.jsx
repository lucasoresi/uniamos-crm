/* ============================================================
   Integraciones — estado de conexión Google Workspace + deep links
   Props: { user }
   ============================================================ */

function Integraciones({ user }) {
  const [googleOk, setGoogleOk] = React.useState(null); // null=checking
  const myEmail = user?.email || '';

  React.useEffect(() => {
    let alive = true;
    window.getGoogleToken().then(tok => { if (alive) setGoogleOk(!!tok); });
    return () => { alive = false; };
  }, []);

  const cards = [
    {
      key: 'gmail', name: 'Gmail', icon: 'mail',
      desc: 'Sincronización de leads, bandeja y respuestas desde la app.',
      wired: ['Auto-sync de contactos en cada login', 'Bandeja en la vista Inbox', 'Responder sin salir del CRM'],
      actions: [
        { label: 'Abrir bandeja', href: 'https://mail.google.com', primary: true },
        { label: 'Redactar email', href: 'https://mail.google.com/mail/?view=cm&fs=1' },
      ],
    },
    {
      key: 'calendar', name: 'Google Calendar', icon: 'calendar',
      desc: 'Tu agenda real de los próximos días en la vista Calendario.',
      wired: ['Agenda de 21 días', 'Tareas con vencimiento superpuestas'],
      actions: [
        { label: 'Abrir calendario', href: 'https://calendar.google.com', primary: true },
        { label: 'Nuevo evento', href: 'https://calendar.google.com/calendar/r/eventedit' },
      ],
    },
    {
      key: 'drive', name: 'Google Drive', icon: 'layers',
      desc: 'Acceso rápido a tus documentos y propuestas.',
      wired: [],
      actions: [
        { label: 'Abrir Drive', href: 'https://drive.google.com', primary: true },
        { label: 'Nuevo documento', href: 'https://docs.google.com/document/create' },
        { label: 'Nueva planilla', href: 'https://docs.google.com/spreadsheets/create' },
      ],
    },
    {
      key: 'contacts', name: 'Google Contacts', icon: 'target',
      desc: 'Tu libreta de contactos de Google Workspace.',
      wired: [],
      actions: [
        { label: 'Abrir contactos', href: 'https://contacts.google.com', primary: true },
        { label: 'Nuevo contacto', href: 'https://contacts.google.com/new' },
      ],
    },
  ];

  return (
    <div className="page view-enter">
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px 40px' }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--ff-display)', fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Integraciones</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>Uniamos se conecta con tu Google Workspace. Accesos directos y estado de conexión.</p>
        </div>

        {/* Estado de conexión */}
        <div className="integ-status">
          <div className={'integ-status-dot' + (googleOk ? ' on' : googleOk === false ? ' off' : '')}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
              {googleOk === null ? 'Verificando conexión con Google…' : googleOk ? 'Google Workspace conectado' : 'Google Workspace no conectado'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {googleOk ? (myEmail || 'Cuenta autenticada vía OAuth') : googleOk === false ? 'Cerrá sesión y volvé a entrar con Google para habilitar Gmail y Calendar.' : ''}
            </div>
          </div>
          {googleOk === false && (
            <a href="/login.html" className="btn btn-primary btn-sm">Reconectar</a>
          )}
        </div>

        {/* Cards */}
        <div className="integ-grid">
          {cards.map(c => (
            <div key={c.key} className="integ-card">
              <div className="integ-card-hd">
                <div className="integ-card-icon"><Icon name={c.icon} size={18}/></div>
                <div>
                  <div className="integ-card-name">{c.name}</div>
                  <div className={'integ-card-badge' + (c.key === 'gmail' || c.key === 'calendar' ? (googleOk ? ' on' : '') : '')}>
                    {(c.key === 'gmail' || c.key === 'calendar')
                      ? (googleOk ? 'Activo' : googleOk === false ? 'Requiere reconexión' : '…')
                      : 'Acceso directo'}
                  </div>
                </div>
              </div>
              <p className="integ-card-desc">{c.desc}</p>
              {c.wired.length > 0 && (
                <ul className="integ-wired">
                  {c.wired.map((w, i) => <li key={i}><Icon name="check" size={11}/> {w}</li>)}
                </ul>
              )}
              <div className="integ-card-actions">
                {c.actions.map((a, i) => (
                  <a key={i} href={a.href} target="_blank" rel="noopener noreferrer" className={'btn btn-sm ' + (a.primary ? 'btn-outline' : 'btn-ghost')}>
                    {a.label} <Icon name="arrow-up-right" size={11}/>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 18, lineHeight: 1.5 }}>
          Gmail y Calendar usan el token OAuth de tu sesión (scopes <code>gmail.readonly</code>, <code>gmail.send</code> y <code>calendar.readonly</code>). Drive y Contacts abren en una pestaña nueva con tu cuenta activa de Google.
        </p>
      </div>
    </div>
  );
}

window.Integraciones = Integraciones;
