/* ============================================================
   Calendario — agenda real (Google Calendar) + tareas con
   vencimiento, agrupadas por día.
   Props: { leads, onOpenLead }
   ============================================================ */

function _dayKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function _dayLabel(key) {
  const today = new Date(); const tKey = _dayKey(today.getTime());
  const tomorrow = new Date(today.getTime() + 86400000); const tmKey = _dayKey(tomorrow.getTime());
  if (key === tKey) return 'Hoy';
  if (key === tmKey) return 'Mañana';
  const d = new Date(key + 'T00:00:00');
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}
function _evTime(ev) {
  if (ev.allDay) return 'Todo el día';
  return new Date(ev.startMs).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function Calendario({ leads = [], onOpenLead }) {
  const [events, setEvents] = React.useState(null); // null=loading
  const [hasToken, setHasToken] = React.useState(true);
  const [tasks, setTasks] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [cal, tk] = await Promise.all([window.gcal_fetchUpcoming(21), window.loadTasks()]);
    setHasToken(cal.hasToken);
    setEvents(cal.events || []);
    setTasks((tk || []).filter(t => !t.done && t.due));
    setLoading(false);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  // Construir agenda: map dateKey -> { events:[], tasks:[] }
  const map = {};
  (events || []).forEach(ev => {
    const k = _dayKey(ev.startMs);
    (map[k] = map[k] || { events: [], tasks: [] }).events.push(ev);
  });
  tasks.forEach(t => {
    (map[t.due] = map[t.due] || { events: [], tasks: [] }).tasks.push(t);
  });
  const dayKeys = Object.keys(map).sort();

  return (
    <div className="page view-enter">
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 24px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--ff-display)', fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Calendario</h2>
            <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>Tus próximos 21 días — eventos de Google Calendar y tareas con vencimiento.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={load} disabled={loading} title="Actualizar"><Icon name="refresh" size={14}/></button>
            <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">Abrir Google Calendar <Icon name="arrow-right" size={12}/></a>
          </div>
        </div>

        {!hasToken && (
          <div className="cal-notice">
            <Icon name="calendar" size={20}/>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-2)' }}>Google Calendar no conectado</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Cerrá sesión y volvé a entrar con Google para habilitar el calendario. Las tareas con fecha igual se muestran abajo.</div>
            </div>
          </div>
        )}

        {loading && events === null ? (
          <div className="ld-empty-sm" style={{ padding: 48 }}>Cargando agenda…</div>
        ) : dayKeys.length === 0 ? (
          <div style={{ border: '1px dashed var(--border)', borderRadius: 12, padding: 48, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            No hay eventos ni tareas con vencimiento en los próximos 21 días.
          </div>
        ) : (
          dayKeys.map(key => {
            const day = map[key];
            return (
              <div key={key} className="cal-day">
                <div className="cal-day-hd">{_dayLabel(key)}</div>
                <div className="cal-day-items">
                  {day.events.sort((a, b) => a.startMs - b.startMs).map(ev => (
                    <a key={ev.id} className="cal-item cal-item-event" href={ev.link || '#'} target="_blank" rel="noopener noreferrer">
                      <span className="cal-item-time mono">{_evTime(ev)}</span>
                      <span className="cal-item-dot"/>
                      <span className="cal-item-body">
                        <span className="cal-item-title">{ev.title}</span>
                        {(ev.location || ev.attendees > 0) && (
                          <span className="cal-item-sub">
                            {ev.location}{ev.location && ev.attendees > 0 ? ' · ' : ''}{ev.attendees > 0 ? `${ev.attendees} invitados` : ''}
                          </span>
                        )}
                      </span>
                      <Icon name="calendar" size={13}/>
                    </a>
                  ))}
                  {day.tasks.map(t => {
                    const lead = t.leadId ? leads.find(l => l.id === t.leadId) : null;
                    return (
                      <div key={t.id} className="cal-item cal-item-task" onClick={() => { if (lead && onOpenLead) onOpenLead(lead); }} style={{ cursor: lead ? 'pointer' : 'default' }}>
                        <span className="cal-item-time"><Icon name="check-square" size={13}/></span>
                        <span className="cal-item-dot task"/>
                        <span className="cal-item-body">
                          <span className="cal-item-title">{t.title}</span>
                          {(lead || t.leadName) && <span className="cal-item-sub">{lead ? lead.co : t.leadName}</span>}
                        </span>
                        <span className="cal-item-tag">tarea</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

window.Calendario = Calendario;
