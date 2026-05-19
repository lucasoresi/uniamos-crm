/* ============================================================
   Inicio V2 — "Briefing del día"
   Agent-first layout: AI briefing hero + chronological day plan
   + funnel viz + compact prioritized inbox
   ============================================================ */

function InicioV2({ onOpenLead, onView, leads = [] }) {
  const now = new Date('2026-05-12T09:48:00');
  const dateStr = now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  // pipeline funnel data
  const funnel = STAGES.map(s => ({
    ...s,
    leads: leads.filter(l => l.stage === s.id),
    value: leads.filter(l => l.stage === s.id).reduce((a, b) => a + (b.value || 0), 0),
  }));
  const totalPipeline = funnel.reduce((a, b) => a + b.value, 0);
  const maxFunnel = Math.max(...funnel.map(s => s.leads.length));

  // Today's plan (synthetic)
  const TODAY_PLAN = [
    { time: '09:00', kind: 'call',  leadCo: 'Rappi Pay',    text: 'Llamada con Camila — confirmar firma legal',  priority: 'urg', done: true },
    { time: '10:30', kind: 'email', leadCo: 'Despegar',     text: 'Reactivación — 18 días sin respuesta',         priority: 'alta', done: false },
    { time: '11:30', kind: 'email', leadCo: 'Bitso',        text: 'Enviar detalles SOC2 + adjuntar requisitos',   priority: 'alta', done: false },
    { time: '14:00', kind: 'demo',  leadCo: 'Nubank',       text: 'Demo enterprise · Rafael + equipo técnico',    priority: 'urg', done: false },
    { time: '16:00', kind: 'email', leadCo: 'Kavak',        text: 'Follow-up · revisión con CFO esta semana',     priority: 'media', done: false },
    { time: '17:00', kind: 'call',  leadCo: 'Cornershop',   text: 'Agendar firma de contrato',                    priority: 'urg', done: false },
  ];

  const kindIcons = { call: 'phone', email: 'mail', demo: 'video', note: 'attach' };

  return (
    <div className="page view-enter">
      <div className="inicio-v2">
        {/* Hero AI briefing */}
        <div className="brief">
          <div className="brief-head">
            <div className="brief-eyebrow">
              <span className="brief-dot"/>
              {dateStr} · 9:48
            </div>
            <div className="brief-tag">
              <Icon name="sparkles" size={11}/> Briefing IA
            </div>
          </div>
          <div className="brief-body">
            <h1 className="brief-title">
              Buen día, <em>Luca</em>. Tu pipeline cerró ayer en <span className="num">$482k</span> con <span className="num">3 leads</span> a punto de firmar.
            </h1>
            <p className="brief-text">
              Recomiendo empezar por <strong>Rappi Pay</strong> — Camila confirmó firma mañana, falta cerrar legal.
              Cornershop también aceptó la oferta y espera fecha de firma.
              Tenés <strong style={{ color: 'var(--p-urg)' }}>6 follow-ups atrasados</strong>; los más críticos son Despegar (18d) y Globant (12d).
              Anoche llegaron <strong>29 emails</strong> y ya moví 3 leads automáticamente.
            </p>
            <div className="brief-actions">
              <button className="btn btn-primary btn-sm" onClick={() => onView('pipeline')}>
                Ver pipeline <Icon name="arrow-right" size={12}/>
              </button>
              <button className="btn btn-outline btn-sm">
                <Icon name="sparkles" size={12}/> Replantear plan
              </button>
              <span className="brief-meta">
                Gmail sincronizado · hace 2 min · 29 emails analizados
              </span>
            </div>
          </div>
        </div>

        {/* Two column: plan + funnel */}
        <div className="v2-grid">
          {/* Plan del día */}
          <div className="plan">
            <div className="plan-hd">
              <h2 className="plan-title">Tu día</h2>
              <span className="plan-cnt">
                <strong className="num">{TODAY_PLAN.filter(p => !p.done).length}</strong>
                <span style={{ color: 'var(--text-3)' }}>/{TODAY_PLAN.length}</span> pendientes
              </span>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>
                <Icon name="plus" size={11}/> Agregar
              </button>
            </div>
            <div className="plan-list">
              {TODAY_PLAN.map((p, i) => {
                const lead = leads.find(l => l.co === p.leadCo);
                const stage = lead ? STAGE_BY_ID[lead.stage] : null;
                return (
                  <div
                    key={i}
                    className={'plan-row' + (p.done ? ' done' : '')}
                    onClick={() => lead && onOpenLead(lead)}
                    style={{ '--pri-c': p.priority === 'urg' ? 'var(--p-urg)' : p.priority === 'alta' ? 'var(--p-alta)' : 'var(--p-media)' }}
                  >
                    <span className="plan-time mono">{p.time}</span>
                    <button className="plan-check" onClick={(e) => e.stopPropagation()}>
                      {p.done && <Icon name="check" size={11} stroke={2.5}/>}
                    </button>
                    <span className={'plan-kind kind-' + p.kind}>
                      <Icon name={kindIcons[p.kind]} size={12}/>
                    </span>
                    <div className="plan-body">
                      <div className="plan-text">{p.text}</div>
                      <div className="plan-sub">
                        <span className="plan-co">{p.leadCo}</span>
                        {stage && (
                          <>
                            <span style={{ color: 'var(--text-4)' }}>·</span>
                            <StageTag stage={stage.id}/>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="plan-actions">
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={(e) => e.stopPropagation()}>
                        <Icon name="arrow-right" size={11}/>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right rail: funnel + counters */}
          <div className="v2-right">
            {/* Funnel viz */}
            <div className="funnel">
              <div className="funnel-hd">
                <div className="funnel-title">Pipeline</div>
                <div className="funnel-val">
                  <span className="num"><small>$</small>{(totalPipeline/1000).toFixed(0)}k</span>
                </div>
              </div>
              <div className="funnel-rows">
                {funnel.map(s => {
                  const pct = (s.leads.length / maxFunnel) * 100;
                  return (
                    <div key={s.id} className="funnel-row" onClick={() => onView('pipeline')}>
                      <span className="funnel-label">
                        <span className="funnel-pin" style={{ background: s.color }}/>
                        {s.short}
                      </span>
                      <span className="funnel-track">
                        <span className="funnel-bar" style={{ width: `${Math.max(pct, 6)}%`, background: s.color }}/>
                      </span>
                      <span className="funnel-cnt mono">{s.leads.length}</span>
                      <span className="funnel-amt mono">
                        {s.value > 0 ? `$${Math.round(s.value/1000)}k` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick stats */}
            <div className="v2-stat-grid">
              <div className="v2-stat">
                <div className="v2-stat-label">Activos</div>
                <div className="v2-stat-val num">{METRICS.activeLeads}</div>
                <div className="v2-stat-delta pos">
                  <Icon name="arrow-up-right" size={10}/> +2 esta semana
                </div>
              </div>
              <div className="v2-stat">
                <div className="v2-stat-label">Emails hoy</div>
                <div className="v2-stat-val num">{METRICS.newEmails}</div>
                <div className="v2-stat-delta">
                  <Icon name="sparkles" size={10}/> 3 con movimiento
                </div>
              </div>
              <div className="v2-stat warn">
                <div className="v2-stat-label">Atrasados</div>
                <div className="v2-stat-val num">{METRICS.followupsOverdue}</div>
                <div className="v2-stat-delta neg">
                  <Icon name="flame" size={10}/> +1 vs. ayer
                </div>
              </div>
              <div className="v2-stat">
                <div className="v2-stat-label">Cierre %</div>
                <div className="v2-stat-val num">{METRICS.conversionRate}%</div>
                <div className="v2-stat-delta pos">
                  <Icon name="trend-up" size={10}/> +4 pts Q
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Inbox prioritized */}
        <div className="v2-inbox">
          <div className="v2-inbox-hd">
            <h2 className="plan-title">Inbox priorizado</h2>
            <span className="ai-tag"><Icon name="sparkles" size={9}/> Clasificado por IA</span>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>
              Ver todos · {METRICS.newEmails}
              <Icon name="arrow-right" size={11}/>
            </button>
          </div>
          <div className="v2-inbox-list">
            {INICIO_EMAILS.map((e, i) => {
              const lead = leads.find(l => l.co === e.co);
              return (
                <div key={i} className="v2-email" onClick={() => lead && onOpenLead(lead)}>
                  <CompanyLogo co={e.co} size={32} radius={8}/>
                  <div className="v2-email-main">
                    <div className="v2-email-top">
                      <span className="v2-email-co">{e.co}</span>
                      <span className="v2-email-from">· {e.from}</span>
                      <span className="v2-email-time mono">{e.time}</span>
                    </div>
                    <div className="v2-email-sub">{e.subject}</div>
                  </div>
                  <div className="v2-email-ai">
                    {e.moveTo ? (
                      <span className="v2-email-move">
                        <StageTag stage={e.fromStage}/>
                        <Icon name="arrow-right" size={11} style={{ color: 'var(--accent)' }}/>
                        <StageTag stage={e.moveTo}/>
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Sin cambio</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

window.InicioV2 = InicioV2;
