/* ============================================================
   Auth helpers — getSession, ensureSession, getUser, signOut
   Expone window.{ensureSession, getUser, signOut, onAuthChange}
   ============================================================ */

let _currentSession = null;

async function ensureSession() {
  const { data, error } = await window.sb.auth.getSession();
  if (error || !data.session) {
    window.location.replace('/login.html');
    return null;
  }
  _currentSession = data.session;
  return data.session;
}

function getUser() {
  if (!_currentSession) return null;
  const u = _currentSession.user;
  const fullName =
    (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) ||
    (u.email ? u.email.split('@')[0] : 'Usuario');
  const initials = fullName
    .split(/[\s.&-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
  return {
    id: u.id,
    name: fullName,
    email: u.email || '',
    initials: initials || '?',
  };
}

async function signOut() {
  await window.sb.auth.signOut();
  window.location.replace('/login.html');
}

function onAuthChange(cb) {
  return window.sb.auth.onAuthStateChange((event, session) => {
    _currentSession = session;
    cb(event, session);
  });
}

// Mantener _currentSession sincronizado para que getUser() y saveLead() funcionen
window.sb.auth.onAuthStateChange((_, session) => {
  _currentSession = session;
});

Object.assign(window, { ensureSession, getUser, signOut, onAuthChange });
