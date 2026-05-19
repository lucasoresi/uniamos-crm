/* ============================================================
   Lead Detail Panel — slide-in drawer
   ============================================================ */

function LeadDetail({ lead, onClose, onStageChange }) {
  const [tab, setTab] = React.useState('timeline');
  if (!lead) return null;
  const stage = STAGE_BY_ID[lead.stage];
  const stageIdx = STAGES.findIndex(s => s.id === lead.stage);

  // Build a synthetic timeline
  const timeline = [
    { type: 'ai', tag: 'IA · Cambio sugerido', body: `Detecté en el último email de ${lead.contact.split(' ')[0]} indicios de cierre. Sugiero mover a "${stage.name}".`, time: 'hace 4h' },
    { type: 'email', from: lead.contact, dir: 'recibido', subject: `Re: ${lead.next || 'Propuesta v3'}`, snippet: lead.last, time: 'hace 4h' },
    { type: 'email', from: 'Luca Soresi', dir: 'enviado', subject: 'Propuesta v3 — términos finales', snippet: 'Adjunto la propuesta actualizada con los cambios discutidos en la última call.', time: 'hace 2d' },
    { type: 'stage', body: 'Movido de Activa → Propuesta', time: 'hace 5d' },
    { type: 'note', body: 'Confirma que evaluan junto al CFO esta semana. Pidió ver casos de éxito en LATAM.', time: 'hace 6d' },
    { type: 'email', from: lead.contact, dir: 'recibido', subject: 'Consulta sobre integración', snippet: 'Hola Luca, queremos avanzar pero tenemos dudas sobre los requisitos de compliance.', time: 'hace 8d' },
    { type: 'created', body: `Lead creado · canal ${lead.channel}`, time: 'hace 14d' },
  ];

  const stop = (e) => e.stopPropagation();

  return (
    <div className="ld-mask" onClick={onClose}>
      <div className="ld" onClick={stop}>
        <div className="ld-hd">
          <CompanyLogo co={lead.co} size={48} radius={12}/>
          <div className="ld-title">
            <div className="ld-co">{lead.co}</div>
            <div className="ld-contact">
              {lead.contact} · <span style={{ color: 'var(--text-3)' }}>{lead.role}</span>
            </div>
          </div>
          <button className="ld-close" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>

        {/* Stage strip */}
        <div className="ld-stage-strip">
          <div className="ld-stage-row">
            {STAGES.slice().reverse().map((s, i) => {
              const idxFromEnd = STAGES.length - 1 - i;
              const isCur = idxFromEnd === stageIdx;
              const isDone = idxFromEnd < stageIdx; // earlier in sales funnel
              return (
                <div
                  key={s.id}
                  className={'ld-stage-pip' + (isCur ? ' cur' : '') + (isDone ? ' done' : '')}
                  style={isCur || isDone ? { '--col-color': stage.color, background: s.color } : {}}
                  onClick={() => onStageChange && onStageChange(s.id)}
                  title={s.name}
                />
              );
            })}
          </div>
          <div className="ld-stage-labels">
            {STAGES.slice().reverse().map((s, i) => {
              const idxFromEnd = STAGES.length - 1 - i;
              return <span key={s.id} className={idxFromEnd === stageIdx ? 'cur' : ''}>{s.short}</span>;
            })}
          </div>
        </div>

        {/* Quick stats */}
        <div className="ld-quick">
          <div className="ld-quick-cell">
            <div className="ld-quick-label">Valor</div>
            <div className="ld-quick-val">
              {lead.value ? <><small>$</small>{(lead.value/1000).toFixed(0)}k</> : <span style={{ color: 'var(--text-3)' }}>—</span>}
            </div>
          </div>
          <div className="ld-quick-cell">
            <div className="ld-quick-label">Lead Score</div>
            <div className="ld-quick-val">{lead.score}<span style={{ color: 'var(--text-3)', fontSize: 13, fontWeight: 500 }}>/100</span></div>
          </div>
          <div className="ld-quick-cell">
            <div className="ld-quick-label">Última actividad</div>
            <div className="ld-quick-val" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)' }}>
              {lead.lastActivity}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="ld-tabs">
          {[
            { id: 'timeline', label: 'Timeline' },
            { id: 'emails', label: `Emails · ${lead.emails}` },
            { id: 'tasks', label: `Tareas · ${lead.tasksOpen}` },
            { id: 'info', label: 'Info' },
          ].map(t => (
            <button key={t.id} className={'ld-tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="ld-body">
          {tab === 'timeline' && (
            <>
              <div className="ai-card">
                <div className="ai-card-head">
                  <span className="ai-card-tag"><Icon name="sparkles" size={9}/> Resumen IA</span>
                  <span className="ai-card-time">actualizado hace 4h</span>
                </div>
                <div className="ai-card-body">
                  Conversación activa con <strong>{lead.contact.split(' ')[0]}</strong>. Los últimos {lead.emails} emails muestran intención clara de avance.
                  Próximo paso: <strong style={{ color: 'var(--accent)' }}>{lead.next}</strong>.
                </div>
              </div>

              <div className="ld-section">
                <div className="ld-section-hd">
                  <Icon name="clock" size={11}/> Actividad reciente
                </div>
                {timeline.map((t, i) => <TimelineRow key={i} entry={t}/>)}
              </div>

              <div style={{
                marginTop: 4,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 10,
                display: 'flex',
                gap: 6,
              }}>
                <input
                  placeholder="Agregar nota o tarea…"
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    fontSize: 13, color: 'var(--text)', padding: '4px 6px',
                  }}
                />
                <button className="btn btn-ghost btn-sm" style={{ height: 28 }}>
                  <Icon name="attach" size={12}/>
                </button>
                <button className="btn btn-primary btn-sm" style={{ height: 28 }}>
                  Guardar
                </button>
              </div>
            </>
          )}

          {tab === 'emails' && (
            <div className="ld-section">
              <div className="ld-section-hd"><Icon name="mail" size={11}/> Hilo Gmail · {lead.emails} mensajes</div>
              <div className="thread">
                {timeline.filter(t => t.type === 'email').map((t, i) => (
                  <div className="thread-item" key={i}>
                    <div className="thread-from">
                      <span className="name">{t.from}</span>
                      <span className="dir">· {t.dir}</span>
                      <span className="time">{t.time}</span>
                    </div>
                    <div className="thread-subject">{t.subject}</div>
                    <div className="thread-snippet">{t.snippet}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'tasks' && (
            <div className="ld-section">
              <div className="ld-section-hd"><Icon name="check-square" size={11}/> Tareas pendientes</div>
              {lead.tasksOpen > 0 ? (
                <>
                  <TaskItem text={`Follow-up: ${lead.next}`} due="hoy"/>
                  {lead.tasksOpen > 1 && <TaskItem text="Preparar caso de éxito Cornershop" due="mañana"/>}
                  {lead.tasksOpen > 2 && <TaskItem text="Compartir presentación técnica" due="jueves"/>}
                </>
              ) : (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                  Sin tareas abiertas
                </div>
              )}
            </div>
          )}

          {tab === 'info' && (
            <div className="ld-section">
              <div className="ld-section-hd"><Icon name="target" size={11}/> Datos del lead</div>
              <dl className="kv">
                <dt>Empresa</dt><dd>{lead.co}</dd>
                <dt>Contacto</dt><dd>{lead.contact}</dd>
                <dt>Cargo</dt><dd>{lead.role}</dd>
                <dt>Sector</dt><dd>{lead.sector}</dd>
                <dt>País</dt><dd>{lead.country}</dd>
                <dt>Canal origen</dt><dd>{lead.channel}</dd>
                <dt>Valor estimado</dt><dd>{lead.value ? `$${lead.value.toLocaleString()}` : '—'}</dd>
                <dt>Score</dt><dd>{lead.score}/100</dd>
                <dt>Etapa</dt><dd>{stage.name}</dd>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ entry }) {
  const icons = {
    ai: 'sparkles',
    email: 'mail',
    stage: 'arrow-right',
    note: 'attach',
    created: 'plus',
  };
  const colors = {
    ai: 'var(--accent)',
    email: 'var(--st-frio)',
    stage: 'var(--st-cierre)',
    note: 'var(--p-alta)',
    created: 'var(--text-3)',
  };
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '28px 1fr auto',
      gap: 12, padding: '10px 2px',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: 'var(--surface-2)',
        display: 'grid', placeItems: 'center',
        color: colors[entry.type] || 'var(--text-3)',
        flexShrink: 0,
      }}>
        <Icon name={icons[entry.type] || 'dots'} size={13}/>
      </div>
      <div style={{ minWidth: 0 }}>
        {entry.type === 'email' ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {entry.subject}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
              {entry.from} · {entry.dir}
            </div>
            {entry.snippet && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.45 }}>
                {entry.snippet}
              </div>
            )}
          </>
        ) : entry.type === 'ai' ? (
          <>
            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {entry.tag}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3, lineHeight: 1.5 }}>
              {entry.body}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
            {entry.body}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', whiteSpace: 'nowrap', paddingTop: 2 }}>
        {entry.time}
      </div>
    </div>
  );
}

function TaskItem({ text, due }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: 10, borderRadius: 8,
      background: 'var(--surface)', border: '1px solid var(--border)',
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: 4,
        border: '1.5px solid var(--text-3)',
        flexShrink: 0,
      }}/>
      <div style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{text}</div>
      <span style={{
        fontSize: 10.5, fontWeight: 600,
        padding: '2px 7px', borderRadius: 5,
        background: due === 'hoy' ? 'oklch(0.82 0.14 92 / 0.16)' : 'var(--surface-2)',
        color: due === 'hoy' ? 'var(--p-media)' : 'var(--text-3)',
      }}>{due}</span>
    </div>
  );
}

window.LeadDetail = LeadDetail;
