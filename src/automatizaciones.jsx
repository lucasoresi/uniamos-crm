/* ============================================================
   Automatizaciones — métricas, lead scoring, motor de
   follow-ups y reglas de workflow configurables.
   Props: { leads, onRefresh, onOpenLead }
   Tabla: automations (id TEXT, user_id, data JSONB)
   ============================================================ */

const AUTO_TRIGGERS = [
  { id: 'days_no_contact', label: 'Días sin contacto' },
  { id: 'score_below',     label: 'Score por debajo de' },
  { id: 'score_above',     label: 'Score por encima de' },
];
const AUTO_ACTIONS = [
  { id: 'move_stage',   label: 'Mover a etapa' },
  { id: 'set_priority', label: 'Cambiar prioridad' },
  { id: 'add_note',     label: 'Agregar nota' },
  { id: 'create_task',  label: 'Crear tarea' },
];
const PRIO_OPTS = [
  { id: 'urg', label: 'Urgente' }, { id: 'alta', label: 'Alta' },
  { id: 'media', label: 'Media' }, { id: 'baja', label: 'Baja' },
];

function autoNewId() {
  const rnd = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return 'auto_' + Date.now().toString(36) + '_' + rnd;
}
function _daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function evalRule(rule, lead) {
  const t = rule.trigger || {};
  if (t.type === 'days_no_contact') {
    if (t.stage && t.stage !== 'any' && lead.stage !== t.stage) return false;
    const days = _daysSince(lead.lastContact);
    return days != null && days >= (Number(t.days) || 0);
  }
  if (t.type === 'score_below') return lead.score < (Number(t.value) || 0);
  if (t.type === 'score_above') return lead.score > (Number(t.value) || 0);
  return false;
}
function describeRule(rule) {
  const t = rule.trigger || {}, a = rule.action || {};
  let cond = '';
  if (t.type === 'days_no_contact') cond = `${t.days || 0}+ días sin contacto${t.stage && t.stage !== 'any' ? ` en ${STAGE_BY_ID[t.stage]?.short || t.stage}` : ''}`;
  else if (t.type === 'score_below') cond = `score < ${t.value || 0}`;
  else if (t.type === 'score_above') cond = `score > ${t.value || 0}`;
  let act = '';
  if (a.type === 'move_stage') act = `mover a ${STAGE_BY_ID[a.value]?.short || a.value}`;
  else if (a.type === 'set_priority') act = `prioridad ${a.value}`;
  else if (a.type === 'add_note') act = `nota: "${(a.value || '').slice(0, 30)}…"`;
  else if (a.type === 'create_task') act = `crear tarea: "${(a.value || '').slice(0, 30)}"`;
  return { cond, act };
}

function Automatizaciones({ leads = [], onRefresh, onOpenLead }) {
  const [rules, setRules] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [running, setRunning] = React.useState(false);
  const [runMsg, setRunMsg] = React.useState('');
  const [busyLead, setBusyLead] = React.useState(null);

  const load = React.useCallback(async () => {
    const { data: { session } } = await window.sb.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) { setRules([]); return; }
    const { data, error } = await window.sb.from('automations').select('*').eq('user_id', uid).order('updated_at', { ascending: false });
    if (error) { console.error('automations load:', error); setRules([]); return; }
    setRules((data || []).map(r => ({ id: r.id, ...(r.data || {}) })));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  // ── Métricas del pipeline ──
  const total = leads.length;
  const totalValue = leads.reduce((a, l) => a + (l.value || 0), 0);
  const ganados = leads.filter(l => l.stage === 'ganado').length;
  const perdidos = leads.filter(l => l.stage === 'perdido').length;
  // Win rate real = ganados / (ganados + perdidos)
  const winRate = (ganados + perdidos) ? Math.round((ganados / (ganados + perdidos)) * 100) : 0;
  // Pronóstico ponderado = Σ(valor × probabilidad de etapa)
  const forecast = leads.reduce((a, l) => a + (l.value || 0) * (STAGE_PROB[l.stage] ?? 0), 0);
  const needAttention = leads.filter(l => l.health === 'en-riesgo' || l.health === 'dormido').length;

  // ── Scoring bands ──
  const bands = [
    { label: 'Caliente (80-100)', min: 80, color: 'var(--st-cierre)' },
    { label: 'Templado (50-79)', min: 50, color: 'var(--p-media)' },
    { label: 'Frío (0-49)', min: 0, color: 'var(--st-frio)' },
  ].map(b => ({ ...b, count: leads.filter(l => l.score >= b.min && l.score < (b.min === 80 ? 101 : b.min === 50 ? 80 : 50)).length }));
  const topLeads = [...leads].sort((a, b) => b.score - a.score).slice(0, 5);

  // ── Motor de follow-ups ──
  const overdue = leads
    .map(l => ({ l, days: _daysSince(l.lastContact) }))
    .filter(({ l }) => l.health === 'en-riesgo' || l.health === 'dormido')
    .sort((a, b) => (b.days || 0) - (a.days || 0))
    .slice(0, 8);

  async function registrarContacto(lead) {
    setBusyLead(lead.id);
    try {
      const today = new Date().toISOString().split('T')[0];
      await window.upsertLead({ ...lead, lastContact: today });
      await window.addActivity('lead', lead.id, 'note', { text: 'Contacto registrado desde el motor de follow-ups' });
      onRefresh && await onRefresh();
    } catch (e) { console.error(e); } finally { setBusyLead(null); }
  }

  // ── Ejecutar reglas ──
  async function runRules() {
    if (running) return;
    setRunning(true); setRunMsg('');
    const enabled = (rules || []).filter(r => r.enabled);
    let applied = 0;
    try {
      // firmas de tareas existentes (leadId|title) para evitar duplicar en cada corrida
      const existingTasks = await window.loadTasks();
      const taskSigs = new Set(existingTasks.filter(t => !t.done).map(t => `${t.leadId || ''}|${t.title}`));
      for (const lead of leads) {
        // primera regla que matchea por lead (evita conflictos)
        for (const rule of enabled) {
          if (!evalRule(rule, lead)) continue;
          const a = rule.action || {};
          if (a.type === 'move_stage' && a.value && a.value !== lead.stage) {
            await window.upsertLead({ ...lead, stage: a.value });
            await window.addActivity('lead', lead.id, 'automation', { text: `Regla "${rule.name}": ${describeRule(rule).act}`, from: lead.stage, to: a.value });
            applied++;
          } else if (a.type === 'set_priority' && a.value && a.value !== lead.priority) {
            await window.upsertLead({ ...lead, priority: a.value });
            await window.addActivity('lead', lead.id, 'automation', { text: `Regla "${rule.name}": ${describeRule(rule).act}` });
            applied++;
          } else if (a.type === 'add_note' && a.value) {
            await window.addActivity('lead', lead.id, 'note', { text: a.value });
            applied++;
          } else if (a.type === 'create_task' && a.value) {
            const sig = `${lead.id}|${a.value}`;
            if (!taskSigs.has(sig)) {
              await window.createTask({ title: a.value, leadId: lead.id, leadName: lead.co, priority: lead.priority });
              taskSigs.add(sig);
              await window.addActivity('lead', lead.id, 'automation', { text: `Regla "${rule.name}": tarea creada` });
              applied++;
            }
          }
          break;
        }
      }
      // registrar última corrida
      const { data: { session } } = await window.sb.auth.getSession();
      const uid = session?.user?.id;
      for (const rule of enabled) {
        await window.sb.from('automations').update({
          data: { ...rule, id: undefined, lastRun: new Date().toISOString(), lastCount: applied },
          updated_at: new Date().toISOString(),
        }).eq('id', rule.id).eq('user_id', uid);
      }
      setRunMsg(applied > 0 ? `✓ ${applied} ${applied === 1 ? 'lead afectado' : 'leads afectados'}.` : 'Ninguna regla coincidió con tus leads ahora mismo.');
      await load();
      onRefresh && await onRefresh();
    } catch (e) { console.error('runRules:', e); setRunMsg('Error al ejecutar las reglas.'); }
    finally { setRunning(false); }
  }

  async function toggleRule(rule) {
    const { data: { session } } = await window.sb.auth.getSession();
    const uid = session?.user?.id;
    await window.sb.from('automations').update({ data: { ...rule, id: undefined, enabled: !rule.enabled }, updated_at: new Date().toISOString() }).eq('id', rule.id).eq('user_id', uid);
    await load();
  }
  async function deleteRule(id) {
    await window.sb.from('automations').delete().eq('id', id);
    await load();
  }

  return (
    <div className="page view-enter">
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 24px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--ff-display)', fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Automatizaciones</h2>
            <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>Motor de follow-ups, lead scoring y reglas que actúan sobre tu pipeline.</p>
          </div>
        </div>

        {/* Métricas */}
        <div className="auto-metrics">
          <MetricCard label="Valor del pipeline" value={`$${(totalValue / 1000).toFixed(0)}k`} icon="trend-up"/>
          <MetricCard label="Forecast ponderado" value={`$${(forecast / 1000).toFixed(0)}k`} sub="esperado" icon="sparkles"/>
          <MetricCard label="Win rate" value={`${winRate}%`} sub={`${ganados}G · ${perdidos}P`} icon="target"/>
          <MetricCard label="Necesitan atención" value={needAttention} sub="en riesgo + dormidos" icon="flame" alert={needAttention > 0}/>
        </div>

        {/* Lead scoring */}
        <section className="auto-section">
          <div className="auto-section-hd"><Icon name="sparkles" size={13}/> Lead Scoring</div>
          <p className="auto-help">Score 0–100 = base por etapa + bonus por prioridad − penalización por antigüedad del último contacto + bonus si tiene valor.</p>
          <div className="score-bands">
            {bands.map(b => (
              <div key={b.label} className="score-band">
                <div className="score-band-top"><span style={{ color: b.color }}>●</span> {b.label}</div>
                <div className="score-band-bar"><i style={{ width: (total ? (b.count / total * 100) : 0) + '%', background: b.color }}/></div>
                <div className="score-band-cnt">{b.count}</div>
              </div>
            ))}
          </div>
          <div className="auto-toplist">
            <div className="auto-toplist-hd">Top leads por score</div>
            {topLeads.length === 0 ? <div className="ld-empty-sm">Sin leads todavía.</div> : topLeads.map(l => (
              <div key={l.id} className="auto-toprow" onClick={() => onOpenLead && onOpenLead(l)}>
                <span className="auto-toprow-co">{l.co}</span>
                <StageTag stage={l.stage}/>
                <span className="auto-toprow-score mono">{l.score}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Motor de follow-ups */}
        <section className="auto-section">
          <div className="auto-section-hd"><Icon name="clock" size={13}/> Motor de follow-ups <span className="auto-badge">{overdue.length}</span></div>
          <p className="auto-help">Leads marcados <strong>en riesgo</strong> o <strong>dormidos</strong> por inactividad (la etapa no cambia sola). Registrá un contacto para resetear el contador.</p>
          {overdue.length === 0 ? (
            <div className="ld-empty-sm">Nada vencido. Tu pipeline está al día. 🎯</div>
          ) : overdue.map(({ l, days }) => (
            <div key={l.id} className="fu-row">
              <div className="fu-row-main" onClick={() => onOpenLead && onOpenLead(l)}>
                <CompanyLogo co={l.co} size={30} radius={8}/>
                <div>
                  <div className="fu-row-co">{l.co}</div>
                  <div className="fu-row-ct">{l.contact} · <StageTag stage={l.stage}/></div>
                </div>
              </div>
              <span className="fu-row-days" style={{ color: HEALTH_LABELS[l.health]?.color }}>
                {HEALTH_LABELS[l.health]?.label || '—'}{days != null ? ` · ${days}d` : ''}
              </span>
              <button className="btn btn-outline btn-sm" disabled={busyLead === l.id} onClick={() => registrarContacto(l)}>
                {busyLead === l.id ? '…' : 'Registrar contacto'}
              </button>
            </div>
          ))}
        </section>

        {/* Reglas */}
        <section className="auto-section">
          <div className="auto-section-hd" style={{ justifyContent: 'space-between' }}>
            <span><Icon name="bolt" size={13}/> Reglas de workflow</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline btn-sm" onClick={runRules} disabled={running || !(rules && rules.some(r => r.enabled))}>
                <Icon name="bolt" size={12}/> {running ? 'Ejecutando…' : 'Ejecutar reglas'}
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setForm({ id: autoNewId(), name: '', enabled: true, trigger: { type: 'days_no_contact', stage: 'any', days: 14 }, action: { type: 'move_stage', value: 'ghost' }, _isNew: true })}>
                <Icon name="plus" size={12}/> Nueva regla
              </button>
            </div>
          </div>
          {runMsg && <div className="auto-runmsg">{runMsg}</div>}
          {rules === null ? (
            <div className="ld-empty-sm">Cargando reglas…</div>
          ) : rules.length === 0 ? (
            <div className="ld-empty-sm">No tenés reglas. Creá una para automatizar movimientos de etapa, prioridad o notas.</div>
          ) : rules.map(r => {
            const { cond, act } = describeRule(r);
            return (
              <div key={r.id} className={'rule-row' + (r.enabled ? '' : ' off')}>
                <button className={'rule-toggle' + (r.enabled ? ' on' : '')} onClick={() => toggleRule(r)} title={r.enabled ? 'Activa' : 'Pausada'}>
                  <span/>
                </button>
                <div className="rule-main">
                  <div className="rule-name">{r.name || 'Regla sin nombre'}</div>
                  <div className="rule-desc">Si <strong>{cond}</strong> → <strong style={{ color: 'var(--accent)' }}>{act}</strong></div>
                  {r.lastRun && <div className="rule-lastrun">Última corrida: {new Date(r.lastRun).toLocaleDateString('es-AR')} · {r.lastCount || 0} afectados</div>}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setForm({ ...r })}>Editar</button>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-4)' }} onClick={() => deleteRule(r.id)}>Borrar</button>
              </div>
            );
          })}
        </section>
      </div>

      {form && <RuleForm rule={form} onClose={() => setForm(null)} onSaved={async () => { setForm(null); await load(); }}/>}
    </div>
  );
}

function MetricCard({ label, value, sub, icon, alert }) {
  return (
    <div className="auto-metric">
      <div className="auto-metric-icon" style={alert ? { color: 'var(--p-urg)', background: 'oklch(0.70 0.20 25 / 0.14)' } : {}}><Icon name={icon} size={15}/></div>
      <div className="auto-metric-val">{value}{sub && <span className="auto-metric-sub">{sub}</span>}</div>
      <div className="auto-metric-label">{label}</div>
    </div>
  );
}

function RuleForm({ rule, onClose, onSaved }) {
  const isNew = !!rule._isNew;
  const [name, setName] = React.useState(rule.name || '');
  const [trigType, setTrigType] = React.useState(rule.trigger?.type || 'days_no_contact');
  const [trigStage, setTrigStage] = React.useState(rule.trigger?.stage || 'any');
  const [trigDays, setTrigDays] = React.useState(rule.trigger?.days != null ? String(rule.trigger.days) : '14');
  const [trigValue, setTrigValue] = React.useState(rule.trigger?.value != null ? String(rule.trigger.value) : '50');
  const [actType, setActType] = React.useState(rule.action?.type || 'move_stage');
  const [actValue, setActValue] = React.useState(rule.action?.value || 'ghost');
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');

  // defaults coherentes al cambiar el tipo de acción
  React.useEffect(() => {
    if (actType === 'move_stage' && !STAGE_BY_ID[actValue]) setActValue('ghost');
    if (actType === 'set_priority' && !PRIO_OPTS.find(p => p.id === actValue)) setActValue('alta');
    if ((actType === 'add_note' || actType === 'create_task') && (STAGE_BY_ID[actValue] || PRIO_OPTS.find(p => p.id === actValue))) setActValue('');
  }, [actType]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr('Poné un nombre a la regla.'); return; }
    if (actType === 'add_note' && !actValue.trim()) { setErr('Escribí el texto de la nota.'); return; }
    if (actType === 'create_task' && !actValue.trim()) { setErr('Escribí el título de la tarea.'); return; }
    setSaving(true); setErr('');
    try {
      const { data: { session } } = await window.sb.auth.getSession();
      const uid = session?.user?.id;
      const trigger = trigType === 'days_no_contact'
        ? { type: trigType, stage: trigStage, days: Number(trigDays) || 0 }
        : { type: trigType, value: Number(trigValue) || 0 };
      const action = { type: actType, value: actValue };
      const data = { name: name.trim(), enabled: rule.enabled !== false, trigger, action, lastRun: rule.lastRun || null, lastCount: rule.lastCount || 0 };
      await window.sb.from('automations').upsert({ id: rule.id, user_id: uid, data, updated_at: new Date().toISOString() });
      onSaved();
    } catch (ex) { console.error('RuleForm:', ex); setErr('Error al guardar.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(520px, 100%)' }}>
        <div className="modal-hd">
          <div className="modal-title">{isNew ? 'Nueva regla' : 'Editar regla'}</div>
          <button className="ld-close" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="field"><label>Nombre</label><input className="mock-input" value={name} onChange={e => setName(e.target.value)} placeholder="ej: Marcar ghost a los 14 días" autoFocus/></div>

          <div className="form-section">
            <div className="form-section-hd">Si… (condición)</div>
            <div className="field"><label>Disparador</label>
              <select className="mock-select" value={trigType} onChange={e => setTrigType(e.target.value)}>
                {AUTO_TRIGGERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            {trigType === 'days_no_contact' ? (
              <div className="value-row">
                <div className="field"><label>En etapa</label>
                  <select className="mock-select" value={trigStage} onChange={e => setTrigStage(e.target.value)}>
                    <option value="any">Cualquiera</option>
                    {STAGES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="field" style={{ maxWidth: 120 }}><label>Días</label><input className="mock-input" type="number" min="0" value={trigDays} onChange={e => setTrigDays(e.target.value)}/></div>
              </div>
            ) : (
              <div className="field" style={{ maxWidth: 160 }}><label>Score</label><input className="mock-input" type="number" min="0" max="100" value={trigValue} onChange={e => setTrigValue(e.target.value)}/></div>
            )}
          </div>

          <div className="form-section">
            <div className="form-section-hd">Entonces… (acción)</div>
            <div className="field"><label>Acción</label>
              <select className="mock-select" value={actType} onChange={e => setActType(e.target.value)}>
                {AUTO_ACTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            {actType === 'move_stage' && (
              <div className="field"><label>Etapa destino</label>
                <select className="mock-select" value={actValue} onChange={e => setActValue(e.target.value)}>
                  {STAGES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            {actType === 'set_priority' && (
              <div className="field"><label>Prioridad</label>
                <select className="mock-select" value={actValue} onChange={e => setActValue(e.target.value)}>
                  {PRIO_OPTS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            )}
            {actType === 'add_note' && (
              <div className="field"><label>Texto de la nota</label><input className="mock-input" value={actValue} onChange={e => setActValue(e.target.value)} placeholder="ej: Revisar y reactivar"/></div>
            )}
            {actType === 'create_task' && (
              <div className="field"><label>Título de la tarea</label><input className="mock-input" value={actValue} onChange={e => setActValue(e.target.value)} placeholder="ej: Llamar para reactivar"/></div>
            )}
          </div>

          {err && <div className="form-err">{err}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Guardando…' : (isNew ? 'Crear regla' : 'Guardar')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

window.Automatizaciones = Automatizaciones;
