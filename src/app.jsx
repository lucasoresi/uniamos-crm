/* ============================================================
   App — main shell, view routing, Tweaks
   ============================================================ */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "onyx",
  "accent": "lime",
  "density": "comfy",
  "inicioVariant": "v1"
}/*EDITMODE-END*/;

function BootSplash() {
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
      background: 'var(--bg)', color: 'var(--text-3)', zIndex: 1000,
      fontFamily: 'var(--ff-display)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <span style={{ color: 'var(--accent)' }}><Icon name="logo" size={32}/></span>
        <span style={{ fontSize: 13 }}>Cargando…</span>
      </div>
    </div>
  );
}

function ErrorBanner({ onRetry }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      padding: '10px 16px',
      background: 'oklch(0.70 0.20 25 / 0.18)',
      borderBottom: '1px solid oklch(0.70 0.20 25 / 0.45)',
      color: 'var(--text)',
      fontSize: 13,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span>Error al cargar tus datos.</span>
      <button className="btn btn-outline btn-sm" onClick={onRetry}>Reintentar</button>
    </div>
  );
}

function App() {
  const [view, setView] = React.useState('inicio');
  const [openLead, setOpenLead] = React.useState(null);
  const [leads, setLeads] = React.useState([]);
  const [user, setUser] = React.useState(null);
  const [loadState, setLoadState] = React.useState('loading'); // 'loading' | 'ready' | 'error'
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [homeEmails, setHomeEmails] = React.useState(null); // null=loading, []=loaded
  const [inboxCount, setInboxCount] = React.useState(null);

  // Apply theme + accent via data-attrs on <html>
  React.useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', tweaks.theme);
    root.setAttribute('data-accent', tweaks.accent);
    root.setAttribute('data-density', tweaks.density);
  }, [tweaks.theme, tweaks.accent, tweaks.density]);

  const fetchLeads = React.useCallback(async () => {
    setLoadState('loading');
    try {
      const data = await window.loadLeads();
      setLeads(data);
      setLoadState('ready');
      return data;
    } catch (e) {
      console.error('loadLeads error:', e);
      setLoadState('error');
      return [];
    }
  }, []);

  const fetchHomeEmails = React.useCallback(async (currentLeads) => {
    setHomeEmails(null); // loading
    const { hasToken, messages } = await window.gmail_fetchForHome();
    if (!hasToken || !messages.length) { setHomeEmails([]); return; }

    // Update inbox badge count
    const inbox = messages.filter(m => m._type === 'inbox');
    setInboxCount(inbox.length);

    // Match emails to leads and format for Inicio
    const matched = window.gmail_matchEmailsToLeads(inbox, currentLeads);
    const matchedCos = new Set(matched.map(m => m.lead.co));

    // Build list: matched leads first, then unmatched inbox emails
    const emailItems = [];
    matched.slice(0, 5).forEach(({ msg, lead }) => {
      const from = _gmailHdr(msg, 'From');
      emailItems.push({
        co: lead.co,
        from: from.replace(/<[^>]+>/, '').trim() || from.split('@')[0] || '?',
        subject: _gmailHdr(msg, 'Subject') || '(sin asunto)',
        time: _gmailFmtTime(_gmailHdr(msg, 'Date')),
        fromStage: lead.stage,
        moveTo: null,
        confidence: null,
        isUnread: (msg.labelIds || []).includes('UNREAD'),
        _lead: lead,
      });
    });

    // Add unmatched emails up to total of 8
    messages.filter(m => m._type === 'inbox').slice(0, 20).forEach(msg => {
      if (emailItems.length >= 8) return;
      const from = _gmailHdr(msg, 'From');
      const sender = from.replace(/<[^>]+>/, '').trim() || from.split('@')[0] || '?';
      // Avoid showing if lead already shown
      if (matched.find(m => {
        const mFrom = _gmailHdr(m.msg, 'From');
        return mFrom === from;
      })) return;
      emailItems.push({
        co: sender,
        from: sender,
        subject: _gmailHdr(msg, 'Subject') || '(sin asunto)',
        time: _gmailFmtTime(_gmailHdr(msg, 'Date')),
        fromStage: null,
        moveTo: null,
        confidence: null,
        isUnread: (msg.labelIds || []).includes('UNREAD'),
        _lead: null,
      });
    });

    setHomeEmails(emailItems);
  }, []);

  // Boot: esperar INITIAL_SESSION para evitar race condition con OAuth redirect
  React.useEffect(() => {
    const { data: { subscription } } = window.sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (!session) {
          window.location.replace('/login.html');
          return;
        }
        const u = session.user;
        const fullName =
          (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) ||
          (u.email ? u.email.split('@')[0] : 'Usuario');
        const initials = fullName
          .split(/[\s.&-]+/).filter(Boolean).slice(0, 2)
          .map(w => w[0].toUpperCase()).join('') || '?';
        setUser({ id: u.id, name: fullName, email: u.email || '', initials });

        // Persist Google tokens for refresh capability
        window.gmail_storeTokens(session);

        const currentLeads = await fetchLeads();

        // Load Gmail emails in background (non-blocking)
        fetchHomeEmails(currentLeads);

        // Run Gmail sync to discover/update leads (fire and forget)
        window.gmailSync_run();

      } else if (event === 'SIGNED_OUT') {
        window.location.replace('/login.html');
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchLeads, fetchHomeEmails]);

  const handleOpenLead = (lead) => {
    setOpenLead(lead);
    if (view !== 'pipeline' && view !== 'inicio') setView('pipeline');
  };

  const breadcrumbs = {
    inicio: ['Inicio'],
    pipeline: ['Ventas', 'Pipeline'],
    prm: ['Ventas', 'PRM Prospectos'],
    inbox: ['Comunicaciones', 'Gmail Inbox'],
    tasks: ['Comunicaciones', 'Mis Tareas'],
    calendar: ['Comunicaciones', 'Calendario'],
    auto: ['Herramientas', 'Automatizaciones'],
    integ: ['Herramientas', 'Integraciones'],
    api: ['Herramientas', 'API'],
  };

  const crumbs = breadcrumbs[view] || ['Inicio'];

  if (loadState === 'loading' && !user) return <BootSplash/>;

  return (
    <>
      <div className="app">
        <Sidebar view={view} onView={setView} user={user} onLogout={window.signOut}/>
        <main className="main">
          {loadState === 'error' && <ErrorBanner onRetry={fetchLeads}/>}
          <div className="topbar">
            <div className="crumb">
              {crumbs.map((c, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="crumb-sep"><Icon name="chevron-right" size={11}/></span>}
                  <span className={i === crumbs.length - 1 ? 'crumb-cur' : ''}>{c}</span>
                </React.Fragment>
              ))}
            </div>
            <div className="topbar-actions">
              <button className="btn btn-ghost btn-icon btn-sm" title="Notificaciones" style={{ position: 'relative' }}>
                <Icon name="bell" size={14}/>
                <span style={{
                  position: 'absolute', top: 4, right: 4,
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--p-urg)',
                }}/>
              </button>
              <button className="btn btn-outline btn-sm" disabled title="Disponible en próximo sub-proyecto">
                <Icon name="refresh" size={12}/> Sincronizar Gmail
              </button>
              <button className="btn btn-primary btn-sm">
                <Icon name="plus" size={12}/> Nuevo Lead
              </button>
            </div>
          </div>

          {view === 'inicio' && tweaks.inicioVariant === 'v1' && <Inicio leads={leads} onOpenLead={handleOpenLead} onView={setView} homeEmails={homeEmails} user={user}/>}
          {view === 'inicio' && tweaks.inicioVariant === 'v2' && <InicioV2 leads={leads} onOpenLead={handleOpenLead} onView={setView}/>}
          {view === 'pipeline' && <Pipeline leads={leads} onOpenLead={handleOpenLead} selectedId={openLead?.id}/>}
          {view === 'inbox' && <Inbox user={user}/>}
          {view !== 'inicio' && view !== 'pipeline' && view !== 'inbox' && <Placeholder view={view}/>}
        </main>
      </div>

      {openLead && <LeadDetail lead={openLead} onClose={() => setOpenLead(null)}/>}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Vista de Inicio">
          <TweakRadio
            label="Layout"
            value={tweaks.inicioVariant}
            onChange={(v) => setTweak('inicioVariant', v)}
            options={[
              { value: 'v1', label: 'Dashboard' },
              { value: 'v2', label: 'Briefing' },
            ]}
          />
        </TweakSection>
        <TweakSection label="Tema">
          <TweakRadio
            label="Variante"
            value={tweaks.theme}
            onChange={(v) => setTweak('theme', v)}
            options={[
              { value: 'onyx', label: 'Onyx' },
              { value: 'slate', label: 'Slate' },
              { value: 'cream', label: 'Cream' },
            ]}
          />
        </TweakSection>
        <TweakSection label="Acento">
          <TweakRadio
            label="Color"
            value={tweaks.accent}
            onChange={(v) => setTweak('accent', v)}
            options={[
              { value: 'lime', label: 'Lima' },
              { value: 'indigo', label: 'Indigo' },
              { value: 'sunset', label: 'Sunset' },
            ]}
          />
        </TweakSection>
        <TweakSection label="Densidad">
          <TweakRadio
            label="Espaciado"
            value={tweaks.density}
            onChange={(v) => setTweak('density', v)}
            options={[
              { value: 'compact', label: 'Compacta' },
              { value: 'comfy', label: 'Cómoda' },
            ]}
          />
        </TweakSection>
        <div style={{
          marginTop: 10, padding: 10,
          borderRadius: 8, background: 'rgba(196,229,56,0.08)',
          border: '1px solid rgba(196,229,56,0.2)',
          fontSize: 11.5, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5,
        }}>
          <strong style={{ color: '#C4E538' }}>Tip:</strong> tocá un email del Inicio o un lead del Pipeline para abrir el panel de detalle con timeline, hilo Gmail y resumen IA.
        </div>
      </TweaksPanel>
    </>
  );
}

/* ============================================================
   Placeholder for unbuilt views
   ============================================================ */
function Placeholder({ view }) {
  const labels = {
    prm: 'PRM Prospectos',
    inbox: 'Gmail Inbox',
    tasks: 'Mis Tareas',
    calendar: 'Calendario',
    auto: 'Automatizaciones',
    integ: 'Integraciones',
    api: 'API',
  };
  return (
    <div className="page view-enter" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48,
    }}>
      <div style={{
        maxWidth: 480, textAlign: 'center',
        padding: 48, borderRadius: 'var(--r-lg)',
        background: 'var(--surface)', border: '1px solid var(--border)',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'var(--accent-soft)', color: 'var(--accent)',
          display: 'grid', placeItems: 'center', margin: '0 auto 16px',
          border: '1px solid var(--accent-line)',
        }}>
          <Icon name="sparkles" size={20}/>
        </div>
        <div style={{
          fontFamily: 'var(--ff-display)', fontSize: 22, fontWeight: 700,
          letterSpacing: '-0.025em', color: 'var(--text)', marginBottom: 8,
        }}>
          {labels[view]}
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.55 }}>
          Este rediseño se centra en <strong style={{ color: 'var(--text-2)' }}>Inicio</strong> y <strong style={{ color: 'var(--text-2)' }}>CRM Pipeline</strong>,
          las vistas más usadas. Si querés que extienda la nueva estética a esta vista, avisame.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
          <button className="btn btn-outline btn-sm" onClick={() => {
            document.querySelectorAll('.sb-item').forEach(el => {
              if (el.textContent.trim().startsWith('Inicio')) el.click();
            });
          }}>
            ← Volver a Inicio
          </button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
