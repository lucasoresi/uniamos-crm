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

The main app contains 6 view modules switched via `switchView()`:

1. **Home** — Dashboard landing. Fetches Gmail inbox, matches emails to existing leads via `home_matchEmailsToLeads()`, AI-classifies them via `classify-email-lead` Edge Function, and auto-moves leads to new stages. Also shows follow-ups urgentes and pipeline stats.
2. **CRM Pipeline** — Kanban board with 6 stages (Cierre, Propuesta, Activa, Ghost, Frío, Sin Info). Drag & drop, detail panel, CRUD via Supabase.
3. **PRM Prospectos** — 7-stage prospect pipeline with follow-up tracker. Prospects can be promoted to CRM leads.
4. **Automatizaciones** — Follow-up engine, lead scoring (0-100), pipeline metrics, workflow rules.
5. **Integraciones** — GSuite integration via deep links (Calendar, Gmail, Drive, Contacts). No actual Google API — uses `mailto:` and Calendar URL schemes.
6. **API** — Interactive REST API docs, bulk import (JSON/CSV), webhook management.

### Supabase Configuration

- URL and anon key are hardcoded in each HTML file that uses Supabase
- Supabase client variable is named `sb` in `login.html`/`reset-password.html`, and `supabase` in `app.html`/`cargar_contactos.html`
- On first login (empty DB), `gmailSync_run()` auto-discovers leads from Gmail instead of seeding demo data

### Gmail Auto-Sync (gmailSync_*)

On every login, `gmailSync_run()` scans Gmail automatically:
1. Fetches SENT (50) + INBOX (30) via Gmail API using the OAuth token
2. Extracts unique contacts via `gmailSync_fetchContacts()` — filters noise (noreply, newsletters), groups by email, ranks by interaction count
3. Sends batch of up to 40 contacts to Edge Function `enrich-gmail-contacts` (Claude Haiku)
4. Edge Function returns lead objects (`empresa`, `lead`, `email`, `estado`, `prioridad`, `notas`)
5. `gmailSync_upsertLeads()` inserts new leads / updates existing ones if `estado` or `prioridad` changed

**First login** (`leads.length === 0`): awaited — blocks until pipeline is populated.  
**Subsequent logins**: fire-and-forget background sync, board re-renders when done.

### Home Dashboard — Gmail Integration

The Home view (`home_load()`) fetches Gmail inbox and runs `home_matchEmailsToLeads()` to cross-reference with existing CRM leads by email address. Only emails from known leads are shown and AI-classified via `classify-email-lead` Edge Function.

- `home_matchEmailsToLeads()` — strict email-to-lead join by `data.email` field
- `home_classifyOne()` — calls `classify-email-lead` Edge Function to AI-score and auto-move lead stage
- `gmail_fetchInbox()` — fetches `maxResults=30` from Gmail API (metadata only)

### Edge Functions

| Function | Purpose |
|---|---|
| `enrich-gmail-contacts` | Batch-classifies Gmail contacts as B2B leads using Claude Haiku |
| `classify-email-lead` | Classifies a single email against an existing lead's stage |
| `refresh-google-token` | Exchanges stored refresh_token for a new access_token |

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
