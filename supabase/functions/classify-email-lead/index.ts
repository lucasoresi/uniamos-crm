// supabase/functions/classify-email-lead/index.ts
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Verify JWT belongs to a real user
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  })
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  let subject = '', snippet = '', current_stage = 'sininfo', lead_name = 'Lead'
  try {
    const body = await req.json()
    subject = body.subject || ''
    snippet = body.snippet || ''
    current_stage = body.current_stage || 'sininfo'
    lead_name = body.lead_name || 'Lead'
  } catch {
    return new Response(JSON.stringify({ new_stage: current_stage, signal: 'neutral', reason: '' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (!subject && !snippet) {
    return new Response(JSON.stringify({ new_stage: current_stage, signal: 'neutral', reason: 'Sin contenido para analizar' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const safeSubject = subject.slice(0, 200)
  const safeSnippet = snippet.slice(0, 500)
  const safeLeadName = lead_name.slice(0, 100)

  const prompt = `Eres un asistente de CRM. Basándote en este email, clasificá la etapa de ventas del lead.

Lead: ${safeLeadName}
Asunto del email: ${safeSubject}
Fragmento del email: ${safeSnippet}
Etapa actual: ${current_stage}

Etapas disponibles: cierre, propuesta, activa, ghost, frio, sininfo

Definiciones:
- cierre: el lead confirmó interés en cerrar o contratar
- propuesta: el lead pidió una propuesta o está evaluando una
- activa: conversación activa, preguntas, engagement claro
- ghost: sin respuesta por 14+ días
- frio: desinterés explícito o silencio muy prolongado
- sininfo: no hay suficiente información

Respondé SOLO en JSON válido, sin texto adicional:
{"new_stage": "...", "signal": "hot|warm|cold|neutral", "reason": "..."}

Reglas:
- Solo cambiá la etapa si el email claramente lo justifica
- Si hay duda o el email es rutinario, devolvé la etapa actual sin cambios
- reason debe ser 1 oración corta en español`

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
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      console.error('Anthropic error:', await res.text())
      return new Response(JSON.stringify({ new_stage: current_stage, signal: 'neutral', reason: 'Error al consultar IA' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await res.json()
    const text = data.content?.[0]?.text?.trim() || ''

    let parsed: { new_stage?: string; signal?: string; reason?: string } = {}
    try { parsed = JSON.parse(text) } catch {
      return new Response(JSON.stringify({ new_stage: current_stage, signal: 'neutral', reason: 'Respuesta IA inválida' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const validStages = ['cierre', 'propuesta', 'activa', 'ghost', 'frio', 'sininfo']
    const validSignals = ['hot', 'warm', 'cold', 'neutral']
    const new_stage = validStages.includes(parsed.new_stage || '') ? parsed.new_stage! : current_stage
    const signal = validSignals.includes(parsed.signal || '') ? parsed.signal! : 'neutral'
    const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : ''

    return new Response(JSON.stringify({ new_stage, signal, reason }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('Unhandled error:', err)
    return new Response(JSON.stringify({ new_stage: current_stage, signal: 'neutral', reason: 'Error interno' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
