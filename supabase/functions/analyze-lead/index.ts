// supabase/functions/analyze-lead/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'

const VALID_STAGES = ['cierre', 'propuesta', 'activa', 'ghost', 'frio', 'sininfo']
const VALID_SIGNALS = ['hot', 'warm', 'cold', 'neutral']

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let email: { subject: string; from: string; snippet: string } = { subject: '', from: '', snippet: '' }
  let conversation_history: Array<{ subject: string; body: string; date: string; direction: string }> = []
  let current_stage = 'sininfo'
  let lead_name = 'Lead'
  let user_services: Array<{ id: string; name: string; price: number }> = []

  try {
    const body = await req.json()
    email = body.email || email
    conversation_history = Array.isArray(body.conversation_history) ? body.conversation_history : []
    if (VALID_STAGES.includes(body.current_stage)) current_stage = body.current_stage
    lead_name = String(body.lead_name || 'Lead').slice(0, 100)
    user_services = Array.isArray(body.user_services) ? body.user_services.slice(0, 20) : []
  } catch {
    return fallback(current_stage, corsHeaders)
  }

  const safeStr = (s: unknown, max: number) => String(s || '').replace(/[\r\n]+/g, ' ').slice(0, max)

  const historyLines = conversation_history.slice(0, 15).map((m, i) => {
    const dir = m.direction === 'sent' ? 'Enviado' : 'Recibido'
    return `[${i + 1}] ${dir} ${safeStr(m.date, 20)} | Asunto: ${safeStr(m.subject, 120)} | ${safeStr(m.body, 400)}`
  }).join('\n')

  const servicesLines = user_services.length > 0
    ? user_services.map(s => `- ID: ${s.id} | Nombre: ${safeStr(s.name, 80)} | Precio: $${s.price}`).join('\n')
    : '(el usuario no tiene servicios configurados)'

  const prompt = `Sos un asistente de CRM B2B. Analizá el siguiente email y el historial de conversación con el lead y respondé en JSON.

Lead: ${lead_name}
Email actual — De: ${safeStr(email.from, 100)} | Asunto: ${safeStr(email.subject, 200)} | Fragmento: ${safeStr(email.snippet, 300)}

Historial completo (últimos mensajes, del más antiguo al más reciente):
${historyLines || '(sin historial previo)'}

Etapa actual: ${current_stage}

Catálogo de servicios del usuario:
${servicesLines}

Respondé SOLO en JSON válido, sin texto adicional:
{
  "is_noise": bool,
  "new_stage": "...",
  "matched_services": ["id1", "id2"],
  "signal": "hot|warm|cold|neutral",
  "reason": "1 oración en español"
}

Reglas para is_noise:
- true si el email es notificación automática, recibo de pago, newsletter, alerta de sistema, confirmación de compra personal, publicidad masiva
- false si es una comunicación real de negocio (aunque sea breve)

Reglas para new_stage:
- "cierre": mencionan contrato, firma, "cerramos", "cuándo empezamos", cierre inminente
- "propuesta": piden presupuesto, cotización, reunión para evaluar oferta
- "activa": conversación bidireccional activa, preguntas concretas sobre servicios
- "ghost": sin respuesta del lead en 14+ días (verificar fechas del historial)
- "frio": desinterés explícito o silencio de 30+ días
- "sininfo": primer email o contexto insuficiente
- Si hay duda, devolvé la etapa actual (${current_stage}) sin cambios

Reglas para matched_services:
- Incluí solo los IDs de servicios que el historial menciona claramente
- Si no hay servicios configurados o no se mencionan, devolvé []`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      console.error('Anthropic error:', await res.text())
      return fallback(current_stage, corsHeaders)
    }

    const data = await res.json()
    const text = data.content?.[0]?.text?.trim() || ''

    let parsed: { is_noise?: boolean; new_stage?: string; matched_services?: string[]; signal?: string; reason?: string } = {}
    try { parsed = JSON.parse(text) } catch { return fallback(current_stage, corsHeaders) }

    const is_noise = parsed.is_noise === true
    const new_stage = VALID_STAGES.includes(parsed.new_stage || '') ? parsed.new_stage! : current_stage
    const signal = VALID_SIGNALS.includes(parsed.signal || '') ? parsed.signal! : 'neutral'
    const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : ''
    const validServiceIds = new Set(user_services.map(s => s.id))
    const matched_services = Array.isArray(parsed.matched_services)
      ? parsed.matched_services.filter(id => typeof id === 'string' && validServiceIds.has(id))
      : []

    return new Response(JSON.stringify({ is_noise, new_stage, matched_services, signal, reason }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Unhandled error:', err)
    return fallback(current_stage, corsHeaders)
  }
})

function fallback(stage: string, headers: Record<string, string>) {
  return new Response(JSON.stringify({
    is_noise: false, new_stage: stage, matched_services: [], signal: 'neutral', reason: '',
  }), { headers: { ...headers, 'Content-Type': 'application/json' } })
}
