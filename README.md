# Uniamos CRM

CRM y PRM (Prospect Relationship Management) con integración GSuite, automatizaciones avanzadas y lead scoring.

## Stack

- **Frontend**: HTML/CSS/JS (single-file, sin build step)
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Auth**: Supabase Auth con Google OAuth
- **Hosting**: Netlify (static)

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Landing page (uniamoscrm.com) |
| `login.html` | Login/registro con email y Google OAuth |
| `app.html` | CRM principal — Home Dashboard, Kanban, PRM, Gmail, Tasks, Calendar |
| `cargar_contactos.html` | Importador de contactos LinkedIn |
| `reset-password.html` | Reset de contraseña (linked desde email Supabase) |
| `schema.sql` | Schema de Supabase (leads + prospects + RLS) |
| `supabase/functions/refresh-google-token/` | Edge Function: refresca Google OAuth token |
| `supabase/functions/classify-email-lead/` | Edge Function: clasifica etapa de lead por email via Claude AI |

## Deploy

1. Crea un proyecto en Supabase y ejecuta schema.sql
2. Configura Google OAuth en Supabase Auth
3. Sube todos los archivos HTML a Netlify Drop
4. Conecta tu dominio personalizado en Netlify
