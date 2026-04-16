# Sesión de desarrollo — Dashboard CRM
**Fecha:** 2026-04-16  
**Objetivo:** Mejorar vistas CRM y PRM para que se parezcan al prototipo `Uniamos_Todo/Uniamos_Dashboard.html`, con datos reales de Supabase y Gmail integrado.

---

## Contexto del proyecto

- **App principal:** `/uniamos-crm/app.html` (~2000+ líneas, monolito HTML+CSS+JS)
- **Backend:** Supabase (URL: `https://xhqufddfvwzdptqhohxe.supabase.co`, MCP: `llleoqfeluptmmbqluab`)
- **Auth:** Supabase Auth — email/password + Google OAuth (actualmente sin scope de Gmail)
- **Tablas Supabase:** `leads` y `prospects` (schema JSONB en columna `data`), `activities`
- **Stack:** Vanilla HTML/CSS/JS, sin bundler, sin frameworks

## Decisiones de diseño tomadas

- **Opción elegida:** B (mejorar vistas CRM y PRM existentes, NO crear nueva vista Dashboard)
- **Gmail:** Opción A — tab "📧 Gmail" dentro del panel de detalle de cada lead/prospecto, filtrado por email del contacto
- **Tablas nuevas:** Ninguna necesaria (datos de rotting calculados desde `ultimoContacto` existente)

---

## Cambios a realizar

### 1. PRM cards — mejoras visuales [PENDIENTE]
**Archivo:** `app.html` — función `prm_makeCard()` (buscar por `function prm_makeCard`)

Agregar a cada card de prospecto:
- **Rotting strip** → `<div class="card-rot-strip">` barra 3px arriba de la card
  - Ámbar `#F59E0B` si 7–13 días sin contacto (campo `ultimoContacto` del JSONB)
  - Rojo `#EF4444` si ≥14 días sin contacto
  - Invisible si estado es `positivo`, `negativo`, o `nuevo`
- **FU badge** → contar entradas en `historial[]` con tipo follow-up → "FU 2"
- **Tags** → canal, sector, país (ya en datos Supabase)
- **Rot label** → "⚠️ 14d sin contacto" debajo de tags
- **Quick actions en hover** (event.stopPropagation):
  - `📤 Log FU` → llama `prm_logFollowUp(id)`
  - `✅ Positivo` → llama `prm_marcarPositivo(id)` 
  - `❌ No` → llama `prm_marcarNegativo(id)`
  - `🚀 → CRM` → solo si estado === 'positivo', llama `prm_moverAlCRM(id)`

CSS a agregar (dark theme, lima):
```css
.card-rot-strip{height:3px;position:absolute;top:0;left:4px;right:0;border-radius:0 8px 0 0;opacity:.85}
.card-rot-label{font-size:.69rem;font-weight:700;display:flex;align-items:center;gap:4px;margin-bottom:5px}
.fu-badge{flex-shrink:0;padding:2px 7px;border-radius:6px;font-size:.68rem;font-weight:800;white-space:nowrap;background:rgba(196,229,56,.15);color:#C4E538}
.card-actions{display:flex;gap:4px;margin-top:8px;opacity:0;transition:opacity .15s}
.card:hover .card-actions{opacity:1}
.card-btn{padding:4px 9px;border-radius:6px;font-size:.7rem;font-weight:700;cursor:pointer;border:none;font-family:inherit;transition:all .14s;display:flex;align-items:center;gap:4px}
.card-btn-fu{background:rgba(196,229,56,.15);color:#C4E538}
.card-btn-fu:hover{background:#C4E538;color:#0A0A0A}
.card-btn-pos{background:rgba(22,163,74,.15);color:#4ADE80}
.card-btn-pos:hover{background:#16A34A;color:#fff}
.card-btn-neg{background:rgba(220,38,38,.15);color:#F87171}
.card-btn-neg:hover{background:#DC2626;color:#fff}
.card-btn-crm{background:rgba(251,191,36,.15);color:#FCD34D;font-size:.7rem}
.card-btn-crm:hover{background:#D97706;color:#fff}
```

### 2. CRM cards — rotting strip [PENDIENTE]
**Archivo:** `app.html` — función `crm_makeCard()` (buscar por `function crm_makeCard`)

- Agregar rotting strip solo para etapas: `ghost`, `frio`, `sininfo`
- Misma lógica de días (ámbar ≥7, rojo ≥14)
- El campo en CRM es `ultimoContacto` dentro del JSONB `data`

### 3. Gmail tab en panel de detalle [PENDIENTE]
**Archivos:** `app.html` (panel HTML + JS) + `login.html` (scope OAuth)

#### login.html
Agregar scope a `signInWithOAuth`:
```js
options: {
  redirectTo: window.location.origin + '/app.html',
  scopes: 'https://www.googleapis.com/auth/gmail.readonly'
}
```

#### app.html — Panel HTML
En ambos paneles (CRM y PRM), agregar tabs:
```html
<div class="panel-tabs" id="crm_panel-tabs">
  <div class="panel-tab active" onclick="crm_switchTab('datos')">📋 Datos</div>
  <div class="panel-tab" onclick="crm_switchTab('gmail')">📧 Gmail</div>
  <div class="panel-tab" onclick="crm_switchTab('timeline')">📅 Timeline</div>
</div>
<div id="crm_tab-datos"><!-- contenido actual del panel --></div>
<div id="crm_tab-gmail" style="display:none">
  <div id="crm_gmail-list"><!-- emails cargados via API --></div>
</div>
```

#### app.html — Gmail fetch function
```js
async function fetchGmailForContact(email, containerId) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.provider_token;
  if (!token) {
    document.getElementById(containerId).innerHTML = '<p>Iniciá sesión con Google para ver emails.</p>';
    return;
  }
  const query = encodeURIComponent(`from:${email} OR to:${email}`);
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=15`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  // fetch each message snippet...
}
```

**Nota:** El `provider_token` solo está disponible en la sesión si el usuario inició sesión con Google Y el scope fue pedido. Se pierde al refrescar la sesión (limitación de Supabase). Se puede guardar en `sessionStorage` al momento del login.

---

## Estado actual de app.html (referencia)

| Función | Línea aprox | Descripción |
|---|---|---|
| `switchView()` | ~1299 | Cambia entre vistas |
| CRM `makeCard` / `crm_makeCard` | ~1400 | Genera cards del CRM |
| PRM `makeCard` / `prm_makeCard` | ~1700 | Genera cards del PRM |
| `crm_openDetail()` | ~1470 | Abre panel de detalle CRM |
| `prm_openDetail()` | ~1700 | Abre panel de detalle PRM |
| Gmail section | ~907 | Integraciones deep links (no API real) |

## Cambios completados

- [x] Análisis completo de ambos directorios
- [x] Decisiones de diseño tomadas y aprobadas
- [x] CSS agregado: `.card-rot-strip`, `.card-rot-label`, `.fu-badge`, `.prm-card-actions`, `.card-btn-*`, `.prm-tags`, `.gmail-item`, `.gmail-no-token`
- [x] Funciones helper: `daysSince()`, `rotInfo()` — soportan formato `YYYY-MM-DD` e `DD Mon YYYY`
- [x] CRM cards: rotting strip + rot label (para ghost/frio/sininfo y cualquier etapa con días ≥7)
- [x] PRM cards: rotting strip + FU badge + tags canal/sector + rot label + quick actions hover (Log FU, Positivo, No, → CRM)
- [x] Funciones quick action: `prm_quickFU()`, `prm_quickPos()`, `prm_quickNeg()`, `prm_saveProspect()`
- [x] Tab "📧 Gmail" en panel de detalle CRM y PRM
- [x] `crm_switchPanelTab` y `prm_switchPanelTab` actualizados para manejar tab gmail
- [x] `gmail_loadForContact()` — fetch a Gmail API con provider_token, manejo de 401, snippets
- [x] `provider_token` guardado en `sessionStorage` al iniciar sesión
- [x] `login.html` — scope `gmail.readonly` agregado al OAuth de Google

## Pendiente / Próxima sesión

- [ ] **Supabase Authorized Domains**: Agregar `https://www.googleapis.com` al dashboard de Supabase → Auth → URL Configuration para que el OAuth funcione correctamente con los nuevos scopes
- [ ] **Google Cloud Console**: Verificar que la app de Google OAuth tiene habilitado el scope `gmail.readonly` en OAuth consent screen → Scopes
- [ ] Testear rotting en datos reales (verificar formato de fechas `ultimoContacto` en Supabase)
- [ ] Considerar: stale stat en PRM stats bar (ya existe el elemento HTML `prm_statStale` pero siempre muestra 0 — conectar con `daysSince`)
- [ ] Considerar: Mostrar datos reales en `autoSetupData()` si la BD tiene datos en otra tabla

---

## Notas técnicas importantes

1. **JSONB schema**: Los datos de leads/prospects están en columna `data` como JSONB. El campo `ultimoContacto` es string en formato `"DD Mon YYYY"` (ej: `"10 Mar 2026"`) — parsear con `new Date(str)` puede fallar. Usar regex o `Date.parse()` con cuidado.
2. **provider_token**: El token de Google (para Gmail API) está en `session.provider_token` pero se pierde al refresh. Guardar en `sessionStorage` al cargar la app.
3. **Prefijos de funciones**: Todas las funciones CRM tienen prefijo `crm_`, PRM tienen `prm_`. Respetar este patrón.
4. **Supabase MCP**: El archivo `.mcp.json` apunta a proyecto `llleoqfeluptmmbqluab` pero app.html usa `xhqufddfvwzdptqhohxe`. Pueden ser proyectos distintos (dev vs prod).
