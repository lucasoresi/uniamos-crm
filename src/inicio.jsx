/* ============================================================
   Inicio Dashboard
   ============================================================ */

function fmtMoney(n, currency = 'USD') {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function Inicio({ onOpenLead, onView, leads = [], homeEmails = null, user = null }) {
  // Normalize: null = loading, array = loaded (empty or with items)
  const emails = Array.isArray(homeEmails) ? homeEmails : null;
  const now = new Date();
  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  })();
  const dateStr = now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const firstName = user?.name?.split(' ')[0] || '';

  // pipeline value distribution
  const stageDist = STAGES.map(s => ({
    ...s,
    value: leads.filter(l => l.stage === s.id).reduce((a, b) => a + (b.value || 0), 0),
    count: leads.filter(l => l.stage === s.id).length,
  }));
  const total = stageDist.reduce((a, b) => a + b.value, 0);

  // real derived data (no mock)
  const closingCount = leads.filter(l => l.stage === 'cierre').length;
  const ghostLeads = leads.filter(l => l.stage === 'ghost');
  const followups = ghostLeads
    .map(l => {
      const days = l.lastContact
        ? Math.floor((Date.now() - new Date(l.lastContact).getTime()) / 86400000)
        : null;
      return { co: l.co, ct: l.contact, days, stage: l.stage };
    })
    .sort((a, b) => (b.days || 0) - (a.days || 0));
  const aiMoves = emails !== null
    ? emails.filter(e => e.moveTo !== null).map(e => ({
        co: e.co, from: e.fromStage, to: e.moveTo, reason: e.subject, time: e.time,
      }))
    : null;

  return (
    <div className="page view-enter">
      <div className="inicio">
        {/* HERO */}
        <div className="in-hero">
          <div>
            <div className="in-greeting">{greeting}{firstName ? <>, <em>{firstName}</em></> : ''}.</div>
            <div className="in-sub">
              {closingCount > 0 || followups.length > 0 ? (
                <>
                  Tenés{' '}
                  {closingCount > 0 && <strong style={{ color: 'var(--text)' }}>{closingCount} lead{closingCount !== 1 ? 's' : ''} a punto de cerrar</strong>}
                  {closingCount > 0 && followups.length > 0 && ' y '}
                  {followups.length > 0 && <strong style={{ color: 'var(--text)' }}>{followups.length} follow-up{followups.length !== 1 ? 's' : ''} atrasado{followups.length !== 1 ? 's' : ''}</strong>}
                  . Empezá por ahí.
                </>
              ) : 'Todo al día.'}
            </div>
            <div className="in-hero-meta">
              <span className="in-pill"><span className="dot"></span>{dateStr}</span>
              <span className="in-pill">
                <Icon name="mail" size={12}/>
                Gmail sincronizado · hace 2min
              </span>
              <span className="in-pill" style={{ color: 'var(--accent)', borderColor: 'var(--accent-line)', background: 'var(--accent-soft)' }}>
                <Icon name="sparkles" size={12}/>
                IA analizó 29 emails hoy
              </span>
            </div>
          </div>

          <div className="in-hero-stat">
            <div className="in-hero-stat-label">Valor del Pipeline</div>
            <div className="in-hero-stat-val tnum"><span className="currency">$</span>{fmtMoney(total)}</div>
            <div className="in-hero-stat-delta">
              <Icon name="trend-up" size={13}/>
              +12.4% vs. mes pasado
              <span style={{ color: 'var(--text-3)', fontWeight: 500, marginLeft: 8 }}>· 14 leads activos</span>
            </div>
            <div className="in-hero-stat-bar" title="Distribución por etapa">
              {stageDist.filter(s => s.value > 0).map(s => (
                <span key={s.id} style={{ '--f': s.value, background: s.color }} title={`${s.short}: $${fmtMoney(s.value)}`}/>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
              {stageDist.filter(s => s.value > 0).slice(0, 4).map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-3)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: 2, background: s.color }}/>
                  {s.short} <span className="mono" style={{ color: 'var(--text-2)' }}>${fmtMoney(s.value/1000)}k</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* METRICS ROW */}
        <div className="in-metrics">
          <div className="metric">
            <div className="metric-label">
              <span className="metric-icon"><Icon name="target" size={12}/></span>
              Leads activos
            </div>
            <div className="metric-val tnum">{METRICS.activeLeads}</div>
            <div className="metric-delta pos"><Icon name="arrow-up-right" size={11}/> +2 esta semana</div>
            <Sparkline data={[8,9,10,11,10,12,13,14]} width={90} height={36} color="var(--accent)"/>
          </div>
          <div className="metric">
            <div className="metric-label">
              <span className="metric-icon"><Icon name="mail" size={12}/></span>
              Emails nuevos
            </div>
            <div className="metric-val tnum">{METRICS.newEmails}</div>
            <div className="metric-delta"><Icon name="sparkles" size={11}/> 3 generaron movimiento</div>
            <Sparkline data={[12,18,15,22,19,25,29,29]} width={90} height={36} color="var(--st-frio)"/>
          </div>
          <div className="metric">
            <div className="metric-label">
              <span className="metric-icon"><Icon name="clock" size={12}/></span>
              Follow-ups urgentes
            </div>
            <div className="metric-val tnum" style={{ color: 'var(--p-urg)' }}>{METRICS.followupsOverdue}</div>
            <div className="metric-delta neg"><Icon name="arrow-up-right" size={11} style={{ transform: 'rotate(45deg)' }}/> +1 desde ayer</div>
            <Sparkline data={[3,4,3,5,4,5,5,6]} width={90} height={36} color="var(--p-urg)"/>
          </div>
          <div className="metric">
            <div className="metric-label">
              <span className="metric-icon"><Icon name="check" size={12}/></span>
              Tasa de cierre
            </div>
            <div className="metric-val tnum">{METRICS.conversionRate}<span style={{ color: 'var(--text-3)', fontSize: 18 }}>%</span></div>
            <div className="metric-delta pos"><Icon name="arrow-up-right" size={11}/> +4pts trimestre</div>
            <Sparkline data={[18,17,19,20,21,22,23,24]} width={90} height={36} color="var(--st-cierre)"/>
          </div>
        </div>

        {/* MAIN GRID */}
        <div className="in-grid">
          {/* Left: actividades recientes (Gmail real o mock) */}
          <div className="panel">
            <div className="panel-hd">
              <h3>Actividades recientes</h3>
              {emails === null
                ? <span className="ai-tag" style={{ opacity: 0.6 }}><Icon name="refresh" size={9}/> Cargando…</span>
                : emails.length > 0
                  ? <span className="ai-tag"><Icon name="sparkles" size={9}/> Analizado por IA</span>
                  : <span className="ai-tag" style={{ opacity: 0.5 }}>Gmail · sin datos</span>
              }
            </div>
            <div className="panel-body">
              {/* Loading skeleton */}
              {emails === null && [0,1,2].map(i => (
                <div key={i} className="email-row" style={{ opacity: 0.4, pointerEvents: 'none' }}>
                  <div className="email-avatar" style={{ background: 'var(--surface-2)' }}/>
                  <div className="email-main">
                    <div style={{ height: 12, width: '60%', borderRadius: 4, background: 'var(--surface-2)', marginBottom: 6 }}/>
                    <div style={{ height: 10, width: '85%', borderRadius: 4, background: 'var(--surface-2)' }}/>
                  </div>
                </div>
              ))}

              {/* Real Gmail emails */}
              {emails !== null && emails.length > 0 && emails.map((e, i) => {
                const lead = e._lead || leads.find(l => l.co === e.co);
                const { bg, bg2 } = logoColors(e.co);
                return (
                  <div key={i} className="email-row" onClick={() => lead && onOpenLead(lead)} style={{ cursor: lead ? 'pointer' : 'default' }}>
                    <div className="email-avatar" style={{ background: `linear-gradient(135deg, ${bg}, ${bg2})` }}>
                      {initials(e.co)}
                    </div>
                    <div className="email-main">
                      <div className="email-co">
                        {e.co}
                        {e.from !== e.co && <span style={{ color: 'var(--text-3)', fontWeight: 500, fontSize: 12 }}>· {e.from}</span>}
                      </div>
                      <div className="email-subject">{e.subject}</div>
                      <div className="email-meta">
                        {e.fromStage ? (
                          e.moveTo ? (
                            <span className="ai-move">
                              <StageTag stage={e.fromStage}/>
                              <span className="ai-move-arrow"><Icon name="arrow-right" size={11}/></span>
                              <StageTag stage={e.moveTo}/>
                              {e.confidence && <span style={{ marginLeft: 4, color: 'var(--accent)', fontWeight: 600 }}>· {e.confidence}%</span>}
                            </span>
                          ) : (
                            <span className="ai-move">
                              <StageTag stage={e.fromStage}/>
                            </span>
                          )
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>Gmail</span>
                        )}
                        {e.isUnread && <span style={{ marginLeft: 6, width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', verticalAlign: 'middle' }}/>}
                      </div>
                    </div>
                    <div className="email-time">{e.time}</div>
                  </div>
                );
              })}

              {/* Fallback: mock data when no Gmail connection */}
              {emails !== null && emails.length === 0 && INICIO_EMAILS.map(e => {
                const lead = leads.find(l => l.co === e.co);
                const { bg, bg2 } = logoColors(e.co);
                return (
                  <div key={e.co + e.time} className="email-row" onClick={() => lead && onOpenLead(lead)}>
                    <div className="email-avatar" style={{ background: `linear-gradient(135deg, ${bg}, ${bg2})` }}>
                      {initials(e.co)}
                    </div>
                    <div className="email-main">
                      <div className="email-co">
                        {e.co}
                        <span style={{ color: 'var(--text-3)', fontWeight: 500, fontSize: 12 }}>· {e.from}</span>
                      </div>
                      <div className="email-subject">{e.subject}</div>
                      <div className="email-meta">
                        {e.moveTo ? (
                          <span className="ai-move">
                            <StageTag stage={e.fromStage}/>
                            <span className="ai-move-arrow"><Icon name="arrow-right" size={11}/></span>
                            <StageTag stage={e.moveTo}/>
                            <span style={{ marginLeft: 4, color: 'var(--accent)', fontWeight: 600 }}>· {e.confidence}%</span>
                          </span>
                        ) : (
                          <span className="ai-move">
                            <StageTag stage={e.fromStage}/>
                            <span style={{ color: 'var(--text-3)' }}>· sin cambio</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="email-time">{e.time}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: AI moves + follow-ups */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="panel">
              <div className="panel-hd">
                <h3>Movimientos automáticos</h3>
                <span className="ai-tag"><Icon name="sparkles" size={9}/> Hoy</span>
              </div>
              <div className="panel-body">
                {aiMoves === null && [0,1,2].map(i => (
                  <div key={i} className="move-card" style={{ opacity: 0.4, pointerEvents: 'none' }}>
                    <div className="move-card-head">
                      <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--surface-2)', flexShrink: 0 }}/>
                      <div style={{ height: 12, width: '45%', borderRadius: 4, background: 'var(--surface-2)' }}/>
                      <div style={{ height: 10, width: '15%', borderRadius: 4, background: 'var(--surface-2)', marginLeft: 'auto' }}/>
                    </div>
                    <div style={{ height: 20, width: '60%', borderRadius: 4, background: 'var(--surface-2)', marginTop: 8 }}/>
                    <div style={{ height: 10, width: '85%', borderRadius: 4, background: 'var(--surface-2)', marginTop: 6 }}/>
                  </div>
                ))}
                {aiMoves !== null && aiMoves.length === 0 && (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 12.5 }}>
                    Sin movimientos automáticos hoy
                  </div>
                )}
                {aiMoves !== null && aiMoves.map((m, i) => (
                  <div key={i} className="move-card" onClick={() => {
                    const lead = leads.find(l => l.co === m.co);
                    if (lead) onOpenLead(lead);
                  }}>
                    <div className="move-card-head">
                      <CompanyLogo co={m.co} size={24} radius={6}/>
                      <span className="move-card-co">{m.co}</span>
                      <span className="move-card-time">{m.time}</span>
                    </div>
                    <div className="move-flow">
                      <StageTag stage={m.from}/>
                      <span className="move-flow-arr"><Icon name="arrow-right" size={12}/></span>
                      <StageTag stage={m.to}/>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.4 }}>
                      {m.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-hd">
                <h3>Follow-ups urgentes</h3>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                  borderRadius: 999, padding: '2px 7px',
                  background: 'oklch(0.70 0.20 25 / 0.16)', color: 'var(--p-urg)',
                  border: '1px solid oklch(0.70 0.20 25 / 0.3)'
                }}>
                  <Icon name="flame" size={9}/> {followups.length} atrasado{followups.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="panel-body">
                {followups.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 12.5 }}>
                    Sin follow-ups urgentes
                  </div>
                ) : followups.map(fu => {
                  const lead = leads.find(l => l.co === fu.co);
                  return (
                    <div key={fu.co} className="fu-row" onClick={() => lead && onOpenLead(lead)}>
                      <div className="fu-days">
                        {fu.days != null ? fu.days : '?'}<span>días</span>
                      </div>
                      <div>
                        <div className="fu-co">{fu.co}</div>
                        <div className="fu-ct">{fu.ct} · <StageTag stage={fu.stage}/></div>
                      </div>
                      <button className="fu-cta" onClick={(e) => e.stopPropagation()}>
                        <Icon name="mail" size={11}/> Enviar
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

window.Inicio = Inicio;
