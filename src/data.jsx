/* ============================================================
   Shared icons + utilities for Uniamos rediseño
   Exposed to window for use by other Babel scripts.
   ============================================================ */

const Icon = ({ name, size = 16, stroke = 1.6, ...rest }) => {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    ...rest,
  };
  switch (name) {
    case 'home':
      return <svg {...common}><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>;
    case 'pipeline':
      return <svg {...common}><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/></svg>;
    case 'target':
      return <svg {...common}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>;
    case 'mail':
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>;
    case 'check':
      return <svg {...common}><path d="M5 12.5 10 17.5l9-11"/></svg>;
    case 'check-square':
      return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/></svg>;
    case 'calendar':
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>;
    case 'bolt':
      return <svg {...common}><path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z"/></svg>;
    case 'link':
      return <svg {...common}><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg>;
    case 'code':
      return <svg {...common}><path d="m8 6-6 6 6 6M16 6l6 6-6 6"/></svg>;
    case 'search':
      return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>;
    case 'plus':
      return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case 'arrow-up-right':
      return <svg {...common}><path d="M7 17 17 7M9 7h8v8"/></svg>;
    case 'trend-up':
      return <svg {...common}><path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>;
    case 'arrow-right':
      return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case 'arrow-down':
      return <svg {...common}><path d="M12 5v14M6 13l6 6 6-6"/></svg>;
    case 'flame':
      return <svg {...common}><path d="M12 21c4 0 7-3 7-7 0-3-2-5-3-6-1 2-3 3-4 3 0-3 2-5 1-8-3 2-8 5-8 11 0 4 3 7 7 7Z"/></svg>;
    case 'sparkles':
      return <svg {...common}><path d="M12 3v4M12 17v4M5 12H3M21 12h-2M6.3 6.3 5 5M19 19l-1.3-1.3M6.3 17.7 5 19M19 5l-1.3 1.3"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'clock':
      return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'bell':
      return <svg {...common}><path d="M6 10a6 6 0 1 1 12 0v4l1.5 3h-15L6 14Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>;
    case 'settings':
      return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.4 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.4l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.6 7l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>;
    case 'phone':
      return <svg {...common}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.5 2L7.9 9.8a16 16 0 0 0 6 6l1.4-1.4a2 2 0 0 1 2-.5c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2Z"/></svg>;
    case 'video':
      return <svg {...common}><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m22 8-6 4 6 4Z"/></svg>;
    case 'attach':
      return <svg {...common}><path d="m21 12-9 9a5.6 5.6 0 1 1-8-8l9-9a4 4 0 1 1 5.6 5.6L9.4 18.6a2 2 0 0 1-2.8-2.8L15.2 7"/></svg>;
    case 'dots':
      return <svg {...common}><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg>;
    case 'menu':
      return <svg {...common}><path d="M3 6h18M3 12h18M3 18h18"/></svg>;
    case 'x':
      return <svg {...common}><path d="M6 6 18 18M18 6 6 18"/></svg>;
    case 'refresh':
      return <svg {...common}><path d="M3 12a9 9 0 0 1 15-6.7L21 7"/><path d="M21 3v4h-4"/><path d="M21 12a9 9 0 0 1-15 6.7L3 17"/><path d="M3 21v-4h4"/></svg>;
    case 'filter':
      return <svg {...common}><path d="M3 5h18l-7 9v6l-4-2v-4Z"/></svg>;
    case 'sort':
      return <svg {...common}><path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/></svg>;
    case 'chevron-down':
      return <svg {...common}><path d="m6 9 6 6 6-6"/></svg>;
    case 'chevron-right':
      return <svg {...common}><path d="m9 6 6 6-6 6"/></svg>;
    case 'layers':
      return <svg {...common}><path d="M2 12 12 7l10 5-10 5L2 12Z"/><path d="M2 17l10 5 10-5"/><path d="M2 7l10 5 10-5"/></svg>;
    case 'shield':
      return <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>;
    case 'logo':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M5 7v6a7 7 0 1 0 14 0V7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
        <circle cx="12" cy="6" r="1.8" fill="currentColor"/>
      </svg>;
    default:
      return null;
  }
};

/* ---- color helpers for company logos ----------------------- */
const LOGO_HUES = [120, 50, 240, 25, 90, 200, 280, 160, 60, 320];
function logoColors(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = LOGO_HUES[h % LOGO_HUES.length];
  return {
    bg: `oklch(0.85 0.14 ${hue})`,
    bg2: `oklch(0.70 0.16 ${hue})`,
  };
}
function initials(name) {
  return name.split(/[\s.&-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

/* ---- Stage definitions ------------------------------------- */
const STAGES = [
  { id: 'ganado',    name: 'Ganado', short: 'Ganado',              color: 'var(--st-ganado)',    desc: 'Trato cerrado / firmado', terminal: 'won' },
  { id: 'cierre',    name: 'Cierre Inminente', short: 'Cierre',    color: 'var(--st-cierre)',    desc: 'Decisión en <7 días' },
  { id: 'propuesta', name: 'Propuesta Enviada', short: 'Propuesta', color: 'var(--st-propuesta)', desc: 'Esperando respuesta' },
  { id: 'activa',    name: 'Negociación Activa', short: 'Activa',   color: 'var(--st-activa)',    desc: 'En conversación' },
  { id: 'ghost',     name: 'Ghost', short: 'Ghost',                color: 'var(--st-ghost)',     desc: '+10 días sin respuesta' },
  { id: 'frio',      name: 'Frío', short: 'Frío',                  color: 'var(--st-frio)',      desc: 'Lead nuevo, sin contacto' },
  { id: 'sininfo',   name: 'Sin Info', short: 'Sin Info',          color: 'var(--st-sininfo)',   desc: 'Necesita enriquecer' },
  { id: 'perdido',   name: 'Perdido', short: 'Perdido',            color: 'var(--st-perdido)',   desc: 'Descartado / no avanza', terminal: 'lost' },
];
const STAGE_BY_ID = Object.fromEntries(STAGES.map(s => [s.id, s]));

// Probabilidad de cierre por etapa (para el pronóstico ponderado, estilo Salesforce/Pipedrive)
const STAGE_PROB = {
  ganado: 1.0, cierre: 0.85, propuesta: 0.55, activa: 0.30,
  ghost: 0.10, frio: 0.05, sininfo: 0.05, perdido: 0,
};

/* ---- Inicio sample data ------------------------------------ */
const INICIO_EMAILS = [
  { co:'Rappi Pay',   from:'Camila Restrepo',  subject:'Re: Propuesta v3 — listo para firma legal',           moveTo:'cierre',    fromStage:'propuesta', time:'09:42', confidence:96 },
  { co:'Nubank',      from:'Rafael Souza',     subject:'Quisiéramos una demo enterprise antes del Q1',         moveTo:'activa',    fromStage:'frio',      time:'08:21', confidence:91 },
  { co:'Cornershop',  from:'Mateo González',   subject:'Aceptamos la oferta — agendemos firma',                moveTo:'cierre',    fromStage:'propuesta', time:'Ayer 18:04', confidence:98 },
  { co:'Kavak',       from:'Sofía Mendoza',    subject:'Revisión interna con CFO — vuelta esta semana',        moveTo:null,        fromStage:'propuesta', time:'Ayer 14:30', confidence:74 },
  { co:'Bitso',       from:'Diego Ferrer',     subject:'Detalles SOC2 + compliance — adjunto requisitos',      moveTo:null,        fromStage:'propuesta', time:'Ayer 11:15', confidence:82 },
];

const FOLLOWUPS = [
  { co:'Despegar',  ct:'Tomás Aguirre', days:12, stage:'ghost' },
  { co:'Globant',   ct:'Florencia Núñez', days:18, stage:'ghost' },
  { co:'Belvo',     ct:'Paula Quiñones', days:8,  stage:'frio'  },
];

const AI_MOVES = [
  { co:'Rappi Pay',  from:'propuesta', to:'cierre',     reason:'Cliente confirma firma legal',    time:'09:42' },
  { co:'Nubank',     from:'frio',      to:'activa',     reason:'Solicitó demo enterprise',        time:'08:21' },
  { co:'Cornershop', from:'propuesta', to:'cierre',     reason:'Aceptación explícita de oferta',  time:'Ayer'  },
];

const METRICS = {
  pipelineValue: 482500,
  pipelineDelta: 12.4,
  activeLeads: 14,
  newEmails: 29,
  followupsOverdue: 6,
  movesToday: 3,
  weekClose: 70500,
  conversionRate: 24,
};

/* ---- Sparkline helper -------------------------------------- */
function Sparkline({ data, color = 'var(--accent)', height = 38, width = 90 }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => `${i * step},${height - 4 - ((v - min) / range) * (height - 10)}`).join(' ');
  const last = data[data.length - 1];
  const lastY = height - 4 - ((last - min) / range) * (height - 10);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={`spk-${color.replace(/[^a-z0-9]/gi,'')}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"/>
      <polygon points={`0,${height} ${pts} ${width},${height}`} fill={`url(#spk-${color.replace(/[^a-z0-9]/gi,'')})`}/>
      <circle cx={width-step*0} cy={lastY} r="2.5" fill={color}/>
    </svg>
  );
}

function StageTag({ stage, size = 'sm' }) {
  const s = STAGE_BY_ID[stage];
  if (!s) return null;
  return (
    <span className="stage-tag">
      <span className="stage-dot" style={{ background: s.color }}></span>
      {s.short}
    </span>
  );
}

function CompanyLogo({ co, size = 32, radius = 8 }) {
  const { bg, bg2 } = logoColors(co);
  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      background: `linear-gradient(135deg, ${bg}, ${bg2})`,
      display: 'grid', placeItems: 'center',
      fontSize: Math.round(size * 0.36), fontWeight: 700,
      letterSpacing: '-0.03em',
      color: 'oklch(0.18 0.04 80)',
      flexShrink: 0,
    }}>{initials(co)}</div>
  );
}

Object.assign(window, {
  Icon, STAGES, STAGE_BY_ID, STAGE_PROB, INICIO_EMAILS, FOLLOWUPS, AI_MOVES, METRICS,
  Sparkline, StageTag, CompanyLogo, initials, logoColors,
});
