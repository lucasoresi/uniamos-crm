/* ============================================================
   CRM Pipeline (Kanban) — V2 redesign
   - Robust horizontal scroll
   - More refined column headers with conversion arrows
   - Card redesign: priority edge, prominent value, score bar
   ============================================================ */

function Pipeline({ leads, onOpenLead, selectedId }) {
  const [filter, setFilter] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState('score');

  const filtered = leads.filter(l => {
    if (filter === 'urgent') return l.priority === 'urg' || l.priority === 'alta';
    if (filter === 'ai-moved') return l.aiMove;
    if (filter === 'no-followup') return l.lastActivity.includes('d') && parseInt(l.lastActivity.replace(/[^\d]/g, '')) > 7;
    return true;
  }).filter(l =>
    !query || l.co.toLowerCase().includes(query.toLowerCase()) || l.contact.toLowerCase().includes(query.toLowerCase())
  );

  const sortLeads = (arr) => {
    return [...arr].sort((a, b) => {
      if (sort === 'score') return b.score - a.score;
      if (sort === 'value') return (b.value || 0) - (a.value || 0);
      return 0;
    });
  };

  const byStage = Object.fromEntries(STAGES.map(s => [s.id, sortLeads(filtered.filter(l => l.stage === s.id))]));

  const totals = STAGES.map(s => ({
    ...s,
    leads: byStage[s.id],
    value: byStage[s.id].reduce((a, b) => a + (b.value || 0), 0),
  }));

  const totalValue = totals.reduce((a, b) => a + b.value, 0);
  const activeCount = totals.filter(s => ['cierre', 'propuesta', 'activa'].includes(s.id)).reduce((a, b) => a + b.leads.length, 0);
  const closingValue = totals.find(s => s.id === 'cierre').value + totals.find(s => s.id === 'propuesta').value;

  return (
    <div className="pipe-wrap view-enter">
      <header className="pipe-head2">
        <div className="pipe-head2-left">
          <h1 className="pipe-title2">
            Pipeline <span className="pipe-title2-cnt">{leads.length}</span>
          </h1>
          <div className="pipe-meta">
            <span><Icon name="trend-up" size={12}/> ${(totalValue/1000).toFixed(0)}k pipeline · <strong style={{ color: 'var(--accent)' }}>${(closingValue/1000).toFixed(0)}k</strong> cerca de cierre</span>
          </div>
        </div>
        <div className="pipe-head2-right">
          <button className="btn btn-outline btn-sm"><Icon name="refresh" size={12}/> Sync</button>
          <button className="btn btn-primary btn-sm"><Icon name="plus" size={12}/> Nuevo lead</button>
        </div>
      </header>

      {/* funnel mini-viz */}
      <div className="pipe-funnel">
        {totals.map((s, i) => {
          const flexBasis = Math.max(s.leads.length, 0.4);
          return (
            <React.Fragment key={s.id}>
              <div className="pipe-funnel-seg" style={{ flex: flexBasis, '--c': s.color }} title={`${s.name} · ${s.leads.length} leads · $${(s.value/1000).toFixed(0)}k`}>
                <span className="pipe-funnel-bar" style={{ background: s.color, opacity: 0.85 }}/>
                <span className="pipe-funnel-meta">
                  <span className="pipe-funnel-lbl">{s.short}</span>
                  <span className="pipe-funnel-cnt mono">{s.leads.length}</span>
                </span>
              </div>
              {i < totals.length - 1 && (
                <span className="pipe-funnel-arr"><Icon name="chevron-right" size={12}/></span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="pipe-toolbar2">
        <div className="pipe-search-wrap">
          <Icon name="search" size={13}/>
          <input
            className="pipe-search"
            placeholder="Buscar empresa o contacto…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button className={'chip' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>
          Todos · {leads.length}
        </button>
        <button className={'chip' + (filter === 'urgent' ? ' active' : '')} onClick={() => setFilter('urgent')}>
          <Icon name="flame" size={11}/> Urgentes · {leads.filter(l => l.priority === 'urg' || l.priority === 'alta').length}
        </button>
        <button className={'chip' + (filter === 'ai-moved' ? ' active' : '')} onClick={() => setFilter('ai-moved')}>
          <Icon name="sparkles" size={11}/> Movidos por IA · {leads.filter(l => l.aiMove).length}
        </button>
        <button className={'chip' + (filter === 'no-followup' ? ' active' : '')} onClick={() => setFilter('no-followup')}>
          <Icon name="clock" size={11}/> Sin contacto +7d
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <select className="chip-select" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="score">Ordenar: Score</option>
            <option value="value">Ordenar: Valor</option>
          </select>
        </div>
      </div>

      <div className="board2">
        {totals.map(stage => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            onOpenLead={onOpenLead}
            selectedId={selectedId}
          />
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Column
   ============================================================ */

function KanbanColumn({ stage, onOpenLead, selectedId }) {
  return (
    <section className="col2" style={{ '--col-c': stage.color }}>
      <div className="col2-hd">
        <div className="col2-hd-bar"/>
        <div className="col2-hd-top">
          <div className="col2-hd-name-row">
            <span className="col2-hd-name">{stage.short}</span>
            <span className="col2-hd-cnt mono">{stage.leads.length}</span>
          </div>
          <span className="col2-hd-desc">{stage.desc}</span>
        </div>
        <div className="col2-hd-val">
          {stage.value > 0
            ? <><small>$</small>{(stage.value/1000).toFixed(stage.value > 100000 ? 0 : 1).replace(/\.0$/,'')}k</>
            : <span style={{ color: 'var(--text-4)' }}>—</span>}
        </div>
      </div>

      <div className="col2-body" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
        {stage.leads.map(l => (
          <LeadCard2
            key={l.id}
            lead={l}
            selected={l.id === selectedId}
            onClick={() => onOpenLead(l)}
            showSummary={stage.leads.length <= 5}
          />
        ))}
        {stage.leads.length === 0 && (
          <div className="col2-empty">
            <div className="col2-empty-icon"><Icon name="plus" size={14}/></div>
            Vacío
          </div>
        )}
        <button className="col2-add">
          <Icon name="plus" size={11}/> Añadir lead
        </button>
      </div>
    </section>
  );
}

/* ============================================================
   Lead card V2 — priority edge, hero value, score progress
   ============================================================ */

function LeadCard2({ lead, selected, onClick, showSummary = true }) {
  const stage = STAGE_BY_ID[lead.stage];
  const priClass = {
    urg: 'pri-urg',
    alta: 'pri-alta',
    media: 'pri-media',
    baja: 'pri-baja',
  }[lead.priority] || '';
  const priColor = {
    urg: 'var(--p-urg)',
    alta: 'var(--p-alta)',
    media: 'var(--p-media)',
    baja: 'transparent',
  }[lead.priority];

  return (
    <article
      className={'lc2' + (selected ? ' selected' : '') + (lead.aiMove ? ' has-ai' : '')}
      onClick={onClick}
      style={{ '--pri': priColor }}
    >
      {lead.aiMove && (
        <div className="lc2-ai">
          <Icon name="sparkles" size={10}/> {lead.aiMove}
        </div>
      )}
      <div className="lc2-edge"/>
      <div className="lc2-body">
        <header className="lc2-head">
          <CompanyLogo co={lead.co} size={36} radius={9}/>
          <div className="lc2-name-block">
            <div className="lc2-co">{lead.co}</div>
            <div className="lc2-ct">{lead.contact}</div>
          </div>
          {lead.priority === 'urg' && (
            <span className="lc2-flag" title="Urgente">
              <Icon name="flame" size={12}/>
            </span>
          )}
        </header>

        <div className="lc2-value-row">
          {lead.value ? (
            <span className="lc2-value">
              <small>$</small>{lead.value.toLocaleString('en-US')}
            </span>
          ) : (
            <span className="lc2-value-empty">Sin valor estimado</span>
          )}
          <span className="lc2-score">
            <span className="lc2-score-label">Score</span>
            <span className="lc2-score-val mono">{lead.score}</span>
          </span>
        </div>

        <div className="lc2-score-bar">
          <i style={{ width: lead.score + '%', background: stage.color }}/>
        </div>

        {showSummary && lead.last && (
          <div className="lc2-summary">{lead.last}</div>
        )}

        <div className="lc2-meta">
          <div className="lc2-tags">
            {lead.channel === 'whatsapp' && <span className="lc2-tag canal-wa">WA</span>}
            {lead.channel === 'linkedin' && <span className="lc2-tag canal-li">in</span>}
          </div>
          <div className="lc2-stats">
            <span title="Última actividad" style={{ marginLeft: 'auto' }}>
              <Icon name="clock" size={11}/> {lead.lastActivity}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

window.Pipeline = Pipeline;
window.LeadCard2 = LeadCard2;
window.KanbanColumn = KanbanColumn;
