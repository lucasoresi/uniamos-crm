/* ============================================================
   Gmail Inbox — two-panel view (list + preview + reply)
   ============================================================ */

function Inbox({ user }) {
  const [messages, setMessages]   = React.useState([]);
  const [loading, setLoading]     = React.useState(true);
  const [hasToken, setHasToken]   = React.useState(true);
  const [selected, setSelected]   = React.useState(null);
  const [replyText, setReplyText] = React.useState('');
  const [sending, setSending]     = React.useState(false);
  const [sendOk, setSendOk]       = React.useState(null); // null|true|false

  const load = React.useCallback(() => {
    setLoading(true);
    window.gmail_fetchInbox().then(({ hasToken: ht, messages: msgs }) => {
      setHasToken(ht);
      setMessages(msgs || []);
      setLoading(false);
    });
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const handleSelect = (msg) => {
    setSelected(msg);
    setReplyText('');
    setSendOk(null);
  };

  const handleReply = async () => {
    if (!selected || !replyText.trim() || sending) return;
    setSending(true);
    const ok = await window.gmail_sendReply(selected, replyText, user?.email || '');
    setSendOk(ok);
    if (ok) setReplyText('');
    setTimeout(() => setSendOk(null), 3000);
    setSending(false);
  };

  const unreadCount = messages.filter(m => (m.labelIds || []).includes('UNREAD')).length;

  return (
    <div className="inbox-wrap view-enter">
      {/* Header */}
      <header className="inbox-head">
        <div className="inbox-head-left">
          <h1 className="inbox-title">
            Gmail Inbox
            {unreadCount > 0 && (
              <span className="inbox-unread-badge">{unreadCount} sin leer</span>
            )}
          </h1>
          <div className="inbox-head-meta">
            {loading ? 'Cargando…' : `${messages.length} mensajes`}
          </div>
        </div>
        <div className="inbox-head-right">
          <button className="btn btn-ghost btn-sm btn-icon" onClick={load} title="Actualizar" disabled={loading}>
            <Icon name="refresh" size={14}/>
          </button>
          <a
            href="https://mail.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline btn-sm"
          >
            Abrir Gmail <Icon name="arrow-right" size={12}/>
          </a>
        </div>
      </header>

      {/* Body */}
      <div className="inbox-body">
        {/* Left: email list */}
        <div className="inbox-list">
          {!hasToken && (
            <div className="inbox-empty">
              <Icon name="mail" size={28}/>
              <div>Gmail no conectado.</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Cerrá sesión y volvé a entrar con Google para habilitar Gmail.
              </div>
            </div>
          )}

          {hasToken && loading && (
            <div className="inbox-empty">
              <div className="inbox-loading-dots">
                <span/><span/><span/>
              </div>
              <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Cargando inbox…</div>
            </div>
          )}

          {hasToken && !loading && messages.length === 0 && (
            <div className="inbox-empty">
              <Icon name="mail" size={28}/>
              <div>No hay emails en el inbox.</div>
            </div>
          )}

          {hasToken && !loading && messages.map((msg) => {
            const from    = _gmailHdr(msg, 'From');
            const subject = _gmailHdr(msg, 'Subject') || '(sin asunto)';
            const date    = _gmailHdr(msg, 'Date');
            const isUnread = (msg.labelIds || []).includes('UNREAD');
            const isSelected = selected?.id === msg.id;

            const displayName = from.replace(/<[^>]+>/, '').trim() || from.split('@')[0] || '?';
            const initials = displayName.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
            const snippet  = (msg.snippet || '').slice(0, 80);

            return (
              <div
                key={msg.id}
                className={`inbox-item${isUnread ? ' unread' : ''}${isSelected ? ' active' : ''}`}
                onClick={() => handleSelect(msg)}
              >
                <div className="inbox-item-avatar">{initials}</div>
                <div className="inbox-item-body">
                  <div className="inbox-item-row1">
                    <span className="inbox-item-name">{displayName}</span>
                    <span className="inbox-item-time mono">{_gmailFmtTime(date)}</span>
                  </div>
                  <div className="inbox-item-subject">{subject}</div>
                  <div className="inbox-item-snippet">{snippet}</div>
                </div>
                {isUnread && <span className="inbox-item-dot"/>}
              </div>
            );
          })}
        </div>

        {/* Right: preview */}
        <div className="inbox-preview">
          {!selected ? (
            <div className="inbox-preview-empty">
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'var(--accent-soft)', color: 'var(--accent)',
                display: 'grid', placeItems: 'center', margin: '0 auto 16px',
                border: '1px solid var(--accent-line)',
              }}>
                <Icon name="mail" size={20}/>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                Seleccioná un email
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                Hacé clic en un mensaje para ver el detalle y responder.
              </div>
            </div>
          ) : (
            <InboxPreview
              msg={selected}
              replyText={replyText}
              onReplyChange={setReplyText}
              onSend={handleReply}
              sending={sending}
              sendOk={sendOk}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function InboxPreview({ msg, replyText, onReplyChange, onSend, sending, sendOk }) {
  const from    = _gmailHdr(msg, 'From');
  const subject = _gmailHdr(msg, 'Subject') || '(sin asunto)';
  const date    = _gmailHdr(msg, 'Date');
  const snippet = msg.snippet || '';
  const gmailLink = `https://mail.google.com/mail/#inbox/${msg.id}`;

  const displayName = from.replace(/<[^>]+>/, '').trim() || from.split('@')[0] || '?';
  const emailAddr   = (from.match(/<([^>]+)>/) || [])[1] || from;
  const initials    = displayName.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';

  const dateFormatted = date
    ? new Date(date).toLocaleString('es-AR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="inbox-preview-content">
      {/* Subject */}
      <div className="inbox-preview-subject">{subject}</div>

      {/* Sender row */}
      <div className="inbox-preview-sender">
        <div className="inbox-preview-avatar">{initials}</div>
        <div className="inbox-preview-sender-info">
          <div className="inbox-preview-name">{displayName}</div>
          <div className="inbox-preview-email">{emailAddr}</div>
        </div>
        <div className="inbox-preview-date mono">{dateFormatted}</div>
        <a
          href={gmailLink}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-icon btn-sm"
          title="Abrir en Gmail"
        >
          <Icon name="arrow-right" size={13}/>
        </a>
      </div>

      {/* Body snippet */}
      <div className="inbox-preview-body">
        <p>{snippet}</p>
        <div className="inbox-preview-truncated">
          <a href={gmailLink} target="_blank" rel="noopener noreferrer">
            Ver email completo en Gmail ↗
          </a>
        </div>
      </div>

      {/* Reply */}
      <div className="inbox-reply">
        <div className="inbox-reply-label">
          <Icon name="mail" size={12}/>
          Responder a {displayName}
        </div>
        <textarea
          className="inbox-reply-textarea"
          placeholder={`Escribí tu respuesta para ${displayName}…`}
          value={replyText}
          onChange={e => onReplyChange(e.target.value)}
          rows={5}
        />
        <div className="inbox-reply-footer">
          {sendOk === true && (
            <span style={{ color: 'var(--accent)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="check" size={12}/> Email enviado
            </span>
          )}
          {sendOk === false && (
            <span style={{ color: 'var(--p-urg)', fontSize: 12 }}>
              Error al enviar. Intentá de nuevo.
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onReplyChange('')}
              disabled={sending || !replyText}
            >
              Limpiar
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={onSend}
              disabled={sending || !replyText.trim()}
            >
              {sending ? 'Enviando…' : <><Icon name="mail" size={12}/> Enviar</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

window.Inbox = Inbox;
