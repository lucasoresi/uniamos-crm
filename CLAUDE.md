# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Uniamos CRM is a CRM + PRM (Prospect Relationship Management) SaaS product targeting sales teams in LATAM/USA. It's a fully static site (no build step) using Supabase as the backend.

## Stack

- **Frontend**: Vanilla HTML/CSS/JS in single-file pages (no framework, no bundler)
- **Backend**: Supabase (PostgreSQL + Auth + Row Level Security)
- **Auth**: Supabase Auth with email/password and Google OAuth
- **Hosting**: Vercel (static) or Netlify
- **Logos**: Clearbit API (`logo.clearbit.com/{domain}`)

## Development

```bash
# Serve locally (no build required)
python3 -m http.server 3000
# or
npx serve .
```

Then open `http://localhost:3000` (starts at `index.html` landing page).

## Architecture

All application logic lives in self-contained HTML files with inline `<style>` and `<script>` tags:

| File | Role |
|---|---|
| `index.html` | Marketing landing page, links to `/login.html` |
| `login.html` | Auth (login/register/forgot password), redirects to `app.html` on success |
| `app.html` | Main CRM application (~2000+ lines, contains all modules) |
| `cargar_contactos.html` | Bulk LinkedIn contact importer (requires active Supabase session) |
| `reset-password.html` | Password reset page (linked from Supabase reset email) |
| `schema.sql` | Supabase database schema (2 tables + RLS policies) |

### Auth Flow

`index.html` → `login.html` → `app.html` (session check on load, redirects to `login.html` if no session)

### Database Design

Two tables with identical structure — all business data stored as JSONB in `data` column:

- **`leads`**: CRM pipeline items (`id TEXT PK`, `user_id UUID FK`, `data JSONB`, `updated_at`)
- **`prospects`**: PRM prospect items (same schema)

RLS ensures each user only accesses their own rows.

### app.html Modules

The main app contains 5 view modules switched via `switchView()`:

1. **CRM Pipeline** — Kanban board with 6 stages (Cierre, Propuesta, Activa, Ghost, Frío, Sin Info). Drag & drop, detail panel, CRUD via Supabase.
2. **PRM Prospectos** — 7-stage prospect pipeline with follow-up tracker. Prospects can be promoted to CRM leads.
3. **Automatizaciones** — Follow-up engine, lead scoring (0-100), pipeline metrics, workflow rules.
4. **Integraciones** — GSuite integration via deep links (Calendar, Gmail, Drive, Contacts). No actual Google API — uses `mailto:` and Calendar URL schemes.
5. **API** — Interactive REST API docs, bulk import (JSON/CSV), webhook management.

### Supabase Configuration

- URL and anon key are hardcoded in each HTML file that uses Supabase
- Supabase client variable is named `sb` in `login.html`/`reset-password.html`, and `supabase` in `app.html`/`cargar_contactos.html`
- `autoSetupData()` in `app.html` seeds demo data when DB is empty for a new user

## Key Patterns

- All Supabase operations use `upsert` for saves, allowing create-or-update in one call
- Lead/prospect data is schemaless JSONB — field names are in Spanish (empresa, lead, estado, prioridad, etc.)
- UI uses CSS custom properties (`:root` vars) with a dark theme (lime green `#C4E538` accent on `#0A0A0A` background)
- No external JS dependencies beyond `@supabase/supabase-js` loaded via CDN

## Deploy

After deploying to Vercel/Netlify, update Supabase Auth settings:
- **Site URL**: the production domain
- **Redirect URLs**: add `https://{domain}/**`
- Enable Google OAuth provider if using Google login
