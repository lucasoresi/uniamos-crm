# Gmail Inbox Integration — Design Spec
**Date:** 2026-04-22  
**Status:** Approved

## Problem

The Google `provider_token` Supabase returns after OAuth login expires in ~1 hour and is not available on subsequent `getSession()` calls. The existing `gmail_loadForContact()` function silently breaks after the first session. The app needs a reliable, always-fresh Gmail token and a dedicated inbox view.

## Goal

Show the authenticated user's real Gmail inbox inside the CRM, persistent across sessions, without exposing any Google secret on the client.

---

## Architecture

### 1. Supabase table: `google_tokens`

Stores each user's Google refresh token. RLS ensures users only access their own row.

```sql
CREATE TABLE google_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner only" ON google_tokens
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 2. Supabase Edge Function: `refresh-google-token`

- Authenticated via Supabase JWT (Authorization header)
- Reads the user's `refresh_token` from `google_tokens`
- POSTs to `https://oauth2.googleapis.com/token` with `grant_type=refresh_token`
- Returns a fresh `access_token` to the caller
- Requires two Supabase secrets: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

### 3. Modified OAuth login (`login.html`)

Add `queryParams: { access_type: 'offline', prompt: 'consent' }` to `signInWithOAuth`. This forces Google to return a `refresh_token` alongside the `access_token`.

### 4. Token save on app load (`app.html` — `initSession`)

After session check, if `session.provider_refresh_token` is present, upsert it into `google_tokens`. Also save `session.provider_token` + expiry timestamp to `sessionStorage`.

### 5. Token getter helper (`getGoogleToken()`)

```
getGoogleToken():
  token = sessionStorage.gtoken
  expires = sessionStorage.gtoken_expires
  if token exists and not expired → return token
  else → call Edge Function /refresh-google-token → save result to sessionStorage → return token
```

### 6. New view: Gmail Inbox (`view-gmail` in `app.html`)

New sidebar item between PRM and Automatizaciones. Two-column layout:
- **Left column (40%):** scrollable email list
- **Right column (60%):** email preview panel

---

## UI Details

### Sidebar nav item
```
📧 Gmail  [🔴 N]   ← unread count badge, hidden if 0
```

### Email list item (left column)
- Circular avatar with sender initials (lime green background for unread, grey for read)
- **Bold** sender name + subject if unread; normal weight if read
- Snippet (1 line, truncated)
- Relative date (right-aligned)
- Small `●` dot indicator for unread (lime green)

### Preview panel (right column)
- Sender name + email address
- Subject (large, bold)
- Date
- Full snippet text (Gmail API `snippet` field — not full body, avoids heavy MIME parsing)
- "Abrir en Gmail ↗" button → deep link to `mail.google.com/mail/#inbox/{messageId}`

### States
| State | Display |
|---|---|
| Loading | Spinner, "Cargando inbox…" |
| Not connected (no Google login) | Card: "Ingresá con Google para ver tu inbox" + button |
| Token unrecoverable | Same card as above |
| Empty inbox | "No hay emails en el inbox" |
| Network error | "No se pudo cargar Gmail" + [Reintentar] button |

### Interactions
- Click email list item → load preview in right panel, mark visually as read (client-side only)
- Search bar → client-side filter on sender + subject + snippet (no extra API calls)
- "↻ Actualizar" button → clears sessionStorage token cache + reloads inbox
- Unread count badge on sidebar → derived from Gmail API `labelIds` containing `UNREAD`

---

## Gmail API calls

```
GET /gmail/v1/users/me/messages?labelIds=INBOX&maxResults=30
  → returns list of {id, threadId}

GET /gmail/v1/users/me/messages/{id}?format=metadata
    &metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date
  → returns headers + snippet + labelIds (for unread detection)
```

All 30 detail fetches run in parallel (`Promise.all`).

---

## Scope Boundaries (YAGNI)

**Included:** read inbox, preview snippet, open in Gmail, unread count badge, client-side search, token refresh.

**Excluded:** reply/compose, mark as read in Gmail, full email body parsing, thread grouping, pagination beyond 30 emails, attachment handling, labels management.

---

## Implementation Steps (high level)

1. Create `google_tokens` table via Supabase MCP migration
2. Add RLS policy
3. Deploy Edge Function `refresh-google-token` via Supabase MCP
4. Set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` secrets in Supabase  
   _(obtained from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID used by Supabase)_
5. Modify `login.html` OAuth call (add `access_type: offline`, `prompt: consent`)
6. Modify `initSession()` in `app.html` to save refresh token + token expiry
7. Add `getGoogleToken()` helper
8. Add `view-gmail` HTML structure + CSS to `app.html`
9. Add sidebar nav item + `switchView` wiring
10. Implement `gmail_loadInbox()` function
11. Implement unread badge update logic
