# Home Dashboard + Email Auto-Qualification — Design Spec
**Date:** 2026-04-30  
**Status:** Approved

---

## Problem

The Gmail inbox exists as a separate sidebar view but is invisible when the user is in the CRM pipeline. There is no AI analysis of email content, so leads never move automatically through the funnel based on what's happening in conversations. The default landing view (CRM kanban) gives no overview of what needs attention today.

## Goal

1. Replace the CRM kanban as the default landing view with a **Home Dashboard** that shows: pipeline stats, recent emails with AI-derived status, auto-movements of the day, and urgent follow-ups.
2. Add a **collapsible inbox drawer** on top of the CRM kanban that shows each email's current lead stage and whether it was auto-moved.
3. **Auto-qualify leads** fully automatically: when the Home view loads or the user clicks "↻ Actualizar", every inbox email that matches a known lead by email address is sent to Claude for analysis. Claude returns a suggested stage; the system updates the lead in Supabase silently.

---

## Architecture

### Data flow

```
TRIGGER: Home view loads OR user clicks ↻ Actualizar
  │
  ├─ ① gmail_loadInbox()          [existing] → 30 emails (subject + snippet)
  ├─ ② fetch all leads (Supabase) [existing] → email + current stage per lead
  │
  ├─ ③ match emails → leads by sender email address
  │     (parse "From" header, extract email, compare to lead.data.email)
  │
  ├─ ④ for each matched pair → call Edge Function classify-email-lead
  │     input:  { subject, snippet, current_stage, lead_name }
  │     output: { new_stage, signal, reason }
  │
  ├─ ⑤ for each lead where new_stage ≠ current_stage → upsert to Supabase
  │
  └─ ⑥ render Home Dashboard with results
         render CRM drawer with results (if CRM view is active)
```

### New: Supabase Edge Function — `classify-email-lead`

- **Auth**: Supabase JWT (Authorization header), same pattern as `refresh-google-token`
- **Input** (POST body, JSON):
  ```json
  { "subject": "...", "snippet": "...", "current_stage": "frio", "lead_name": "Juan Pérez" }
  ```
- **Logic**: calls Anthropic Claude API (`claude-haiku-4-5` for cost) with a structured prompt
- **Prompt design**:
  ```
  You are a CRM assistant. Based on this email, classify the lead's stage.
  
  Lead: {lead_name}
  Email subject: {subject}
  Email snippet: {snippet}
  Current stage: {current_stage}
  
  Available stages: cierre, propuesta, activa, ghost, frio, sininfo
  
  Respond in JSON only: { "new_stage": "...", "signal": "hot|warm|cold|neutral", "reason": "..." }
  Rules:
  - Only change stage if the email content clearly warrants it
  - "cierre": lead confirmed interest in closing/contracting
  - "propuesta": lead asked for a proposal or is evaluating one
  - "activa": active conversation, questions, engagement
  - "ghost": no response for 14+ days (use current_stage + date context)
  - "frio": explicit disinterest or long silence
  - "sininfo": not enough info
  - If uncertain, return current_stage unchanged
  ```
- **Output**: `{ new_stage, signal, reason }`
- **Secrets needed**: `ANTHROPIC_API_KEY` (new), already has `GOOGLE_CLIENT_ID/SECRET`

### Modified: `app.html`

**New function `gmail_fetchInbox()`**: extracts the raw fetch logic from `gmail_loadInbox()` — returns the array of message detail objects without touching the DOM. `gmail_loadInbox()` will call this internally.

**New function `home_load()`**:
1. Calls `gmail_fetchInbox()` and `supabase.from('leads').select()`
2. Matches emails to leads by sender email
3. Calls Edge Function for each matched pair (parallel with `Promise.allSettled`)
4. Upserts changed leads to Supabase
5. Renders Home Dashboard

**New function `home_classifyEmails(emails, leads)`**: pure function, returns array of `{ email, lead, new_stage, signal, reason }`

**New view `#view-home`**: added before `#view-crm` in the HTML

**Modified `switchView()`**: add `'home'` case; call `home_load()` on enter

**Modified initial load**: `switchView('home')` instead of `switchView('crm')`

**Modified CRM topbar**: add "📧 Emails (N nuevos) ▾" toggle button

**New `#crm-inbox-drawer`**: collapsible strip above kanban, rendered from last `home_classifyEmails()` result

---

## UI Specification

### Screen 1 — Home Dashboard (`#view-home`)

**Topbar**: `🏠 Inicio` | date | `↻ Actualizar` button (right)

**Stats row** (5 cards):
- Pipeline total (sum of `valor` field across all leads)
- Leads activos (count in stages: cierre + propuesta + activa)
- Emails nuevos (unread count from Gmail)
- Follow-ups urgentes (leads with `ultimoContacto` > 7 days ago)
- Movimientos hoy (count of auto-moves performed this session)

**Main body** (two columns):

Left column (58%): `📧 Emails recientes — Analizado por IA ✦`
- One card per email that matched a lead
- Border-left color: lime (#C4E538) = hot/cierre, blue (#0284C7) = warm/activa, grey (#333) = cold/frio
- Shows: sender initials avatar, name, subject (truncated), time, and AI tag:
  - `✦ Movido a [Stage] automáticamente` (if stage changed)
  - `[icon] [Stage] — sin cambio` (if unchanged)

Right column (42%): two stacked panels
- **✦ Movimientos automáticos de hoy**: list of `Lead Name | From → To | IA badge`
- **⚠ Follow-ups urgentes**: list of leads + days since last contact (red ≥14d, amber 7-13d)

**Loading state**: spinner + "Analizando emails con IA…" while Edge Function calls run

### Screen 2 — CRM with Drawer (`#view-crm`)

**Topbar addition**: `📧 Emails (N nuevos) ▾` button (right side of topbar)
- Click toggles drawer open/closed
- N = unread count; hidden if 0

**Inbox drawer** (above kanban, collapsible, default: open if N > 0):
- One compact card per matched email (max 5 visible, "› más" to expand)
- Each card: sender name, subject (truncated), stage change or "sin cambio"
- Auto-moved cards: highlighted border + `✦ AUTO` or `↑ AUTO` badge

**Kanban cards**: add small badge `↑ movido hoy por IA` on leads auto-moved during current session (cleared on next full load)

---

## Scope Boundaries (YAGNI)

**Included:**
- Home dashboard with 5 stats
- Email AI qualification via Edge Function
- Auto-move leads in Supabase (no confirmation)
- CRM inbox drawer (collapsible)
- Kanban "moved today" badge
- Loading/error states

**Excluded:**
- Persistent history of auto-moves (no new DB table)
- Undo / revert auto-move
- Notification system / push alerts
- PRM equivalent (only CRM leads)
- Email reply/compose from Home
- Qualification of emails that don't match a known lead

---

## Staging: what's new vs reused

| Component | Status |
|---|---|
| `gmail_loadInbox()` | Modified (extracts `gmail_fetchInbox()`) |
| `gmail_fetchInbox()` | **New** (raw fetch, no DOM) |
| `getGoogleToken()` | Reused as-is |
| `leads` Supabase table | Reused as-is |
| Edge Function `refresh-google-token` | Reused as-is |
| Edge Function `classify-email-lead` | **New** |
| `#view-home` HTML + CSS + JS | **New** |
| `#crm-inbox-drawer` HTML + CSS + JS | **New** |
| `switchView()` | Modified |
| CRM topbar | Modified |
| Kanban card render | Modified |

---

## Error handling

- If `getGoogleToken()` returns null → Home shows "Gmail no conectado" card, skips classification
- If Edge Function returns non-200 → skip that lead silently, show it as "sin cambio"
- If Supabase upsert fails → log to console, don't block UI
- If `Promise.allSettled` → always render what we have, never block on individual failures
