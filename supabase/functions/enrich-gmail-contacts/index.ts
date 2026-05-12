// supabase/functions/enrich-gmail-contacts/index.ts
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

interface Contact {
  email: string
  name: string
  domain: string
  subjects: string[]
  sent_count: number
  received_count: number
}

interface Lead {
  email: string
  empresa: string
  lead: string
  domain: string
  estado: string
  prioridad: string
  notas: string
}

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

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  })
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  let contacts: Contact[] = []
  try {
    const body = await req.json()
    contacts = (body.contacts || []).slice(0, 40).map((c: Contact) => ({
      ...c,
      subjects: Array.isArray(c.subjects) ? c.subjects : [],
    }))
  } catch {
    return new Response(JSON.stringify({ leads: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (!contacts.length) {
    return new Response(JSON.stringify({ leads: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const sanitize = (s: string, max = 100) => String(s || '').replace(/[\n\r]/g, ' ').slice(0, max)
  const contactLines = contacts.map((c, i) => {
    const name = sanitize(c.name || '?', 80)
    const domain = sanitize(c.domain, 80)
    const subjects = (Array.isArray(c.subjects) ? c.subjects : [])
      .slice(0, 3)
      .map(s => sanitize(s, 100))
      .join(' / ') || 'sin asuntos'
    return `${i + 1}. Email: ${sanitize(c.email, 150)} | Nombre: ${name} | Dominio: ${domain} | Enviados: ${c.sent_count} | Recibidos: ${c.received_count} | Asuntos: ${subjects}`
  }).join('\n')

  const prompt = `Sos un asistente de CRM experto en ventas B2B.

Analizá estos ${contacts.length} contactos extraídos de Gmail de un vendedor. Para cada uno determiná si es un prospecto/cliente B2B real.

Contactos:
${contactLines}

Devolvé SOLO un array JSON con los contactos que SÍ son leads B2B de ventas. Ignorá completamente:
- Newsletters, notificaciones automáticas, servicios (Slack, GitHub, Jira, Google, etc.)
- Emails de soporte técnico, facturación automática, alertas de sistema
- Contactos sin contexto de negocio claro

Para cada lead B2B incluí exactamente este formato:
{
  "email": "email exacto del contacto",
  "empresa": "nombre de la empresa (inferir del dominio si es necesario, ej: gabor.com.mx → Gabor)",
  "lead": "nombre del contacto",
  "domain": "dominio del email",
  "estado": "cierre|propuesta|activa|ghost|frio|sininfo",
  "prioridad": "urgente|alta|media|baja",
  "notas": "1 oración corta de contexto basada en los asuntos detectados"
}

Criterios de estado:
- "cierre": asuntos mencionan firma, contrato firmado, cierre, deal cerrado
- "propuesta": asuntos mencionan propuesta, cotización, presupuesto
- "activa": sent_count + received_count >= 3, conversación bidireccional en curso
- "ghost": intercambio previo pero sin respuesta reciente (solo 1 mensaje del contacto)
- "frio": 1 solo email sin intercambio real, o señal de desinterés
- "sininfo": poco contexto, asuntos vagos o insuficientes

Criterios de prioridad:
- "urgente": 6+ intercambios totales o asuntos con urgencia explícita
- "alta": 3-5 intercambios o asuntos con propuesta/reunión
- "media": 2 intercambios
- "baja": 1 solo email

Respondé SOLO con el array JSON, sin texto adicional, sin markdown.`

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!anthropicRes.ok) {
      console.error('Anthropic error:', await anthropicRes.text())
      return new Response(JSON.stringify({ leads: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await anthropicRes.json()
    const text = data.content?.[0]?.text?.trim() || '[]'

    let leads: Lead[] = []
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      leads = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    } catch {
      leads = []
    }

    const VALID_STAGES = ['cierre', 'propuesta', 'activa', 'ghost', 'frio', 'sininfo']
    const VALID_PRIORITIES = ['urgente', 'alta', 'media', 'baja']

    leads = leads
      .filter((l): l is Lead => l !== null && typeof l === 'object' && typeof l.email === 'string' && l.email.includes('@'))
      .map(l => ({
        email: String(l.email).toLowerCase().trim().slice(0, 200),
        empresa: String(l.empresa || '').trim().slice(0, 200),
        lead: String(l.lead || '').trim().slice(0, 200),
        domain: String(l.domain || l.email.split('@')[1] || '').trim().slice(0, 200),
        estado: VALID_STAGES.includes(l.estado) ? l.estado : 'sininfo',
        prioridad: VALID_PRIORITIES.includes(l.prioridad) ? l.prioridad : 'media',
        notas: String(l.notas || '').trim().slice(0, 500),
      }))

    return new Response(JSON.stringify({ leads }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Unhandled error:', err)
    return new Response(JSON.stringify({ leads: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
