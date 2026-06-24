/* ============================================================
   Lead Detail Panel — slide-in drawer (con edición real)
   Props: { lead, onClose, onStageChange, onEdit, onDelete }
   ============================================================ */

function _relTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'recién';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `hace ${days}d`;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function LeadDetail({ lead, onClose, onStageChange, onEdit, onDelete }) {
  const [tab, setTab] = React.useState('timeline');
  const [acts, setActs] = React.useState(null);     // null=loading
  const [noteText, setNoteText] = React.useState('');
  const [savingNote, setSavingNote] = React.useState(false);
  const [thread, setThread] = React.useState(null);  // null=loading, []=sin token/vacío
  const [stageBusy, setStageBusy] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);

  const stage = STAGE_BY_ID[lead.stage];
  const stageIdx = STAGES.findIndex(s => s.id === lead.stage);

  // Cargar actividades reales del lead
  const loadActs = React.useCallback(() => {
    setActs(null);
    window.loadActivities('lead', lead.id).then(setActs);
  }, [lead.id]);

  React.useEffect(() => { loadActs(); }, [loadActs]);

  // Cargar hilo Gmail real cuando se abre la pestaña Emails
  React.useEffect(() => {
    if (tab !== 'emails' || thread !== null || !lead.email) return;
    let alive = true;
    window.gmail_loadForContact(lead.email).then(({ messages }) => {
      if (!alive) return;
      const items = (messages || []).map(m => ({
        id: m.id,
        from: window._gmailHdr(m, 'From'),
        subject: window._gmailHdr(m, 'Subject') || '(sin asunto)',
        date: window._gmailHdr(m, 'Date'),
        snippet: m.snippet || '',
      })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setThread(items);
    });
    return () => { alive = false; };
  }, [tab, thread, lead.email]);

  async function handleStage(stageId) {
    if (stageId === lead.stage || stageBusy) return;
    setStageBusy(true);
    try {
      await window.upsertLead({ ...lead, stage: stageId });
      await window.addActivity('lead', lead.id, 'stage_change', { from: lead.stage, to: stageId });
      onStageChange && onStageChange(lead.id, stageId);
      loadActs();
    } catch (e) { console.error('handleStage:', e); }
    finally { setStageBusy(false); }
  }

  async function handleAddNote() {
    const text = noteText.trim();
    if (!text || savingNote) return;
    setSavingNote(true);
    try {
      await window.addActivity('lead', lead.id, 'note', { text });
      setNoteText('');
      loadActs();
    } catch (e) { console.error('addNote:', e); }
    finally { setSavingNote(false); }
  }

  async function handleDelete() {
    try {
      await window.deleteLead(lead.id);
      onDelete && onDelete(lead.id);
      onClose();
    } catch (e) { console.error('deleteLead:', e); }
  }

  const stop = (e) => e.stopPropagation();
  const emailCount = thread ? thread.length : (lead.emails || 0);

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
            {lead.health && lead.health !== 'al-dia' && lead.health !== 'cerrado' && HEALTH_LABELS[lead.health] && (
              <span className="health-pill" style={{ '--h': HEALTH_LABELS[lead.health].color, marginTop: 6, display: 'inline-flex' }}>
                <Icon name="clock" size={10}/> {HEALTH_LABELS[lead.health].label}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="ld-close" onClick={() => onEdit && onEdit(lead)} title="Editar lead"><Icon name="settings" size={15}/></button>
            <button className="ld-close" onClick={() => setConfirmDel(true)} title="Eliminar lead"><Icon name="x" size={16}/></button>
          </div>
        </div>

        {confirmDel && (
          <div className="ld-confirm">
            <span>¿Eliminar este lead? No se puede deshacer.</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(false)}>Cancelar</button>
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>Eliminar</button>
            </div>
          </div>
        )}

        {/* Stage strip — clickeable, persiste */}
        <div className="ld-stage-strip">
          <div className="ld-stage-row">
            {STAGES.slice().reverse().map((s, i) => {
              const idxFromEnd = STAGES.length - 1 - i;
              const isCur = idxFromEnd === stageIdx;
              const isDone = idxFromEnd < stageIdx;
              return (
                <div
                  key={s.id}
                  className={'ld-stage-pip' + (isCur ? ' cur' : '') + (isDone ? ' done' : '')}
                  style={isCur || isDone ? { '--col-color': stage.color, background: s.color } : {}}
                  onClick={() => handleStage(s.id)}
                  title={`Mover a: ${s.name}`}
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
            { id: 'emails', label: `Emails${emailCount ? ' · ' + emailCount : ''}` },
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
              {/* Resumen del lead (datos reales) */}
              {(lead.last || lead.next) && (
                <div className="ai-card">
                  <div className="ai-card-head">
                    <span className="ai-card-tag"><Icon name="sparkles" size={9}/> Resumen</span>
                  </div>
                  <div className="ai-card-body">
                    {lead.last && <>Última interacción: <strong>{lead.last}</strong>. </>}
                    {lead.next && <>Próximo paso: <strong style={{ color: 'var(--accent)' }}>{lead.next}</strong>.</>}
                  </div>
                </div>
              )}

              {/* Agregar nota */}
              <div className="ld-note-add">
                <input
                  placeholder="Agregar una nota…"
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddNote(); }}
                />
                <button className="btn btn-primary btn-sm" onClick={handleAddNote} disabled={savingNote || !noteText.trim()}>
                  {savingNote ? '…' : 'Guardar'}
                </button>
              </div>

              <div className="ld-section">
                <div className="ld-section-hd"><Icon name="clock" size={11}/> Actividad</div>
                {acts === null ? (
                  <div className="ld-empty-sm">Cargando…</div>
                ) : acts.length === 0 ? (
                  <div className="ld-empty-sm">Sin actividad todavía. Agregá una nota o cambiá la etapa.</div>
                ) : (
                  acts.map(a => <ActivityRow key={a.id} act={a}/>)
                )}
              </div>
            </>
          )}

          {tab === 'emails' && (
            <div className="ld-section">
              <div className="ld-section-hd"><Icon name="mail" size={11}/> Hilo Gmail{lead.email ? ` · ${lead.email}` : ''}</div>
              {!lead.email ? (
                <div className="ld-empty-sm">Este lead no tiene email cargado.</div>
              ) : thread === null ? (
                <div className="ld-empty-sm">Cargando hilo…</div>
              ) : thread.length === 0 ? (
                <div className="ld-empty-sm">Sin emails con este contacto (o Gmail no conectado).</div>
              ) : (
                <div className="thread">
                  {thread.map(t => (
                    <div className="thread-item" key={t.id}>
                      <div className="thread-from">
                        <span className="name">{t.from.replace(/<[^>]+>/, '').trim() || t.from}</span>
                        <span className="time">{window._gmailFmtTime(t.date)}</span>
                      </div>
                      <div className="thread-subject">{t.subject}</div>
                      <div className="thread-snippet">{t.snippet}</div>
                    </div>
                  ))}
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
                <dt>Email</dt><dd>{lead.email || '—'}</dd>
                <dt>Teléfono</dt><dd>{lead.tel || '—'}</dd>
                <dt>Sector</dt><dd>{lead.sector}</dd>
                <dt>País</dt><dd>{lead.country}</dd>
                <dt>Canal origen</dt><dd>{lead.channel}</dd>
                <dt>Valor estimado</dt><dd>{lead.value ? `$${lead.value.toLocaleString()} ${lead.currency || ''}` : '—'}</dd>
                <dt>Score</dt><dd>{lead.score}/100</dd>
                <dt>Etapa</dt><dd>{stage.name}</dd>
              </dl>

              {Array.isArray(lead.services) && lead.services.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ color: 'var(--text-4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                    Servicios asociados
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
                </div>
              )}

              <button className="btn btn-outline btn-sm" style={{ marginTop: 16 }} onClick={() => onEdit && onEdit(lead)}>
                <Icon name="settings" size={12}/> Editar datos
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ act }) {
  const t = act.type;
  const d = act.data || {};
  const icons = { note: 'attach', stage_change: 'arrow-right', created: 'plus', email: 'mail', field_change: 'settings', automation: 'bolt' };
  const colors = { note: 'var(--p-alta)', stage_change: 'var(--st-cierre)', created: 'var(--text-3)', email: 'var(--st-frio)', automation: 'var(--accent)' };
  let body;
  if (t === 'note') body = d.text;
  else if (t === 'stage_change') {
    const from = STAGE_BY_ID[d.from]?.short || d.from || '?';
    const to = STAGE_BY_ID[d.to]?.short || d.to || '?';
    body = `Movido de ${from} → ${to}`;
  } else if (t === 'created') body = `Lead creado${d.canal ? ' · canal ' + d.canal : ''}`;
  else if (t === 'email') body = d.subject || 'Email';
  else body = d.text || t;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 12, padding: '10px 2px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: colors[t] || 'var(--text-3)', flexShrink: 0 }}>
        <Icon name={icons[t] || 'dots'} size={13}/>
      </div>
      <div style={{ minWidth: 0, fontSize: 13, color: t === 'note' ? 'var(--text)' : 'var(--text-2)', lineHeight: 1.45, alignSelf: 'center' }}>
        {body}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', whiteSpace: 'nowrap', paddingTop: 2 }}>
        {_relTime(act.created_at)}
      </div>
    </div>
  );
}

window.LeadDetail = LeadDetail;
